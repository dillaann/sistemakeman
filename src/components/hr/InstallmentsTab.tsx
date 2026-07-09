import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar, Banknote, Pencil, Trash2, Plus, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmt, localDateString, formatDateBR, parseLocalDate } from "@/lib/utils";

interface InstallmentsTabProps {
  installments: any[];
  employees: any[];
  accounts: any[];
  selectedMonth: string;
  canEdit: boolean;
  viewQuinzenaDate: string;
  setViewQuinzenaDate: (date: string) => void;
  getNextFriday: (date: Date) => string;
  getPreviousFriday: (dateStr: string) => string;
  onOpenPayInstallment: (inst: any) => void;
  openInputDialog: (cfg: any) => void;
  onBulkPay: (insts: any[]) => void;
}

const InstallmentsTab = ({
  installments,
  employees,
  accounts,
  selectedMonth,
  canEdit,
  viewQuinzenaDate,
  setViewQuinzenaDate,
  getNextFriday,
  getPreviousFriday,
  onOpenPayInstallment,
  openInputDialog,
  onBulkPay
}: InstallmentsTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const editInstMutation = useMutation({
    mutationFn: async ({ id, amount, period_start, period_end, expected_date, month_ref }: any) => {
      const payload: any = {};
      if (amount !== undefined) payload.amount = amount;
      if (period_start !== undefined) payload.period_start = period_start;
      if (period_end !== undefined) payload.period_end = period_end;
      if (expected_date !== undefined) payload.expected_date = expected_date;
      if (month_ref !== undefined) payload.month_ref = month_ref;
      
      const { error } = await supabase.from("salary_installments" as any).update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); toast({ title: "Quinzena atualizada!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteInstMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("salary_installments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); toast({ title: "Quinzena removida!" }); },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });

  const addInstMutation = useMutation({
    mutationFn: async ({ employeeId, monthRef, installmentNumber, expectedDate, periodStart, periodEnd }: any) => {
      const { data: instData, error: instError } = await supabase.from("salary_installments" as any).insert({
        employee_id: employeeId,
        month_ref: monthRef,
        installment_number: installmentNumber,
        amount: 0,
        status: "pendente",
        expected_date: expectedDate || localDateString(),
        period_start: periodStart,
        period_end: periodEnd,
      }).select("id").single();
      
      const inst = instData as any;
      if (instError || !inst) throw instError || new Error("Erro ao criar quinzena");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["salary-installments"] }); toast({ title: "Quinzena adicionada!" }); },
    onError: (e: any) => toast({ title: "Erro ao adicionar", description: e.message, variant: "destructive" }),
  });

  const filtered = installments.filter((i: any) => i.expected_date === viewQuinzenaDate && employees.find(e => e.id === i.employee_id)?.payment_type !== "semanal");
  const totalAmount = filtered.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-lg">Gestão de Quinzenas</CardTitle>
          <div className="text-sm font-medium text-primary">
            {(() => {
              const instsOnDate = installments.filter((i: any) => i.expected_date === viewQuinzenaDate);
              if (instsOnDate.length === 0) return "Nenhuma quinzena programada para esta data.";
              const start = instsOnDate[0].period_start ? formatDateBR(instsOnDate[0].period_start) : "?";
              const end = instsOnDate[0].period_end ? formatDateBR(instsOnDate[0].period_end) : "?";
              return `Período: ${start} a ${end}`;
            })()}
          </div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
            Fechamento: Sexta-feira {formatDateBR(viewQuinzenaDate)}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewQuinzenaDate(getPreviousFriday(viewQuinzenaDate))}>
            <Calendar className="h-4 w-4 mr-1" /> {"< Anterior"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setViewQuinzenaDate(getNextFriday(parseLocalDate(viewQuinzenaDate)!))}>
            {"Próxima >"} <Calendar className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Funcionário</TableHead>
                <TableHead className="hidden md:table-cell">Cargo</TableHead>
                <TableHead>Valor para essa quinzena</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma quinzena para esta data. Use o botão + Adicionar ou gere pelo Dashboard.</TableCell></TableRow> : filtered.map((inst: any) => {
                const isPaid = inst.status === "pago";
                const emp = employees.find(e => e.id === inst.employee_id);
                return (
                  <TableRow key={inst.id} className={isPaid ? "bg-green-500/5" : ""}>
                    <TableCell className="font-medium">{emp?.name || "Funcionário"}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{emp?.role || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 max-w-[150px]">
                        <span className="text-muted-foreground text-xs font-bold shrink-0">R$</span>
                        <Input
                          defaultValue={Number(inst.amount) || ""}
                          className="h-8 font-bold"
                          placeholder="0,00"
                          disabled={isPaid || editInstMutation.isPending}
                          onBlur={(e) => {
                            const raw = e.target.value.replace(",", ".");
                            const v = parseFloat(raw);
                            if (!isNaN(v) && v !== Number(inst.amount)) {
                              editInstMutation.mutate({ id: inst.id, amount: v });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const raw = (e.target as HTMLInputElement).value.replace(",", ".");
                              const v = parseFloat(raw);
                              if (!isNaN(v) && v !== Number(inst.amount)) {
                                editInstMutation.mutate({ id: inst.id, amount: v });
                              }
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      {isPaid ? <Badge variant="default">PAGO</Badge> : <Badge variant="outline">PENDENTE</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!isPaid && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => onOpenPayInstallment(inst)} title="Pagar Agora">
                            <Banknote className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" title="Editar Datas" onClick={() => {
                          openInputDialog({
                            title: `Editar Quinzena — ${emp?.name}`,
                            fields: [
                              { key: "start", label: "Início Período", type: "date", value: inst.period_start || "" },
                              { key: "end", label: "Fim Período", type: "date", value: inst.period_end || "" },
                              { key: "pay", label: "Data Fechamento", type: "date", value: inst.expected_date || "" },
                            ],
                            onSubmit: (vals: any) => editInstMutation.mutate({ id: inst.id, period_start: vals.start, period_end: vals.end, expected_date: vals.pay })
                          });
                        }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => {
                          if (window.confirm("Deseja remover esta quinzena?")) {
                            deleteInstMutation.mutate(inst.id);
                          }
                        }} title="Remover">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="text-lg font-bold flex items-center gap-2">
            <span className="text-muted-foreground text-sm uppercase">Total da Quinzena:</span>
            {fmt(totalAmount)}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              openInputDialog({
                title: "Adicionar Funcionário nesta Quinzena",
                description: "Escolha o funcionário para adicionar à data " + formatDateBR(viewQuinzenaDate),
                fields: [
                  { key: "emp_id", label: "Funcionário", type: "select", value: "", options: employees.map(e => ({ value: e.id, label: e.name })) }
                ],
                onSubmit: (vals: any) => {
                  const instsOnDate = installments.filter((i: any) => i.expected_date === viewQuinzenaDate);
                  const pStart = instsOnDate.length > 0 ? instsOnDate[0].period_start : null;
                  const pEnd = instsOnDate.length > 0 ? instsOnDate[0].period_end : null;
                  const empInstsForEmp = installments.filter((i: any) => i.employee_id === vals.emp_id);
                  const nextNum = empInstsForEmp.length > 0 ? Math.max(...empInstsForEmp.map((i: any) => i.installment_number || 0)) + 1 : 1;
                  addInstMutation.mutate({ 
                    employeeId: vals.emp_id, 
                    monthRef: selectedMonth, 
                    installmentNumber: nextNum,
                    expectedDate: viewQuinzenaDate,
                    periodStart: pStart,
                    periodEnd: pEnd
                  });
                }
              });
            }}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar Funcionário
            </Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => {
              const toPay = filtered.filter(i => i.status !== "pago");
              if (toPay.length === 0) {
                toast({ title: "Nada para pagar", description: "Todas as quinzenas desta data já estão pagas ou não existem." });
                return;
              }
              onBulkPay(toPay);
            }}>
              <CheckCircle className="h-4 w-4 mr-2" /> Confirmar Pagamento
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default InstallmentsTab;
