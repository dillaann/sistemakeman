import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, CheckCircle, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmt, parseLocalDate, localDateString, formatDateBR } from "@/lib/utils";

interface ThirteenthTabProps {
  thirteenths: any[];
  employees: any[];
  selectedYear: number;
  canEdit: boolean;
  onEdit: (ctx: any) => void;
  onDelete: (table: string, id: string, label: string) => void;
}

const ThirteenthTab = ({ thirteenths, employees, selectedYear, canEdit, onEdit, onDelete }: ThirteenthTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const thirteenthMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const emp = employees.find(e => e.id === employeeId);
      const salary = Number(emp?.salary) || 0;
      const hireDate = parseLocalDate(emp?.hire_date);
      const targetYear = selectedYear;
      let monthsWorked = 12;
      
      if (hireDate && hireDate.getFullYear() === targetYear) {
        const admissionMonthCounts = hireDate.getDate() <= 15;
        const startMonth = admissionMonthCounts ? hireDate.getMonth() : hireDate.getMonth() + 1;
        monthsWorked = 12 - startMonth;
        if (monthsWorked < 0) monthsWorked = 0;
      } else if (hireDate && hireDate.getFullYear() > targetYear) {
        monthsWorked = 0;
      }
      
      const provision = salary / 12;
      const total = provision * monthsWorked;
      const firstInstallment = Math.round((total / 2) * 100) / 100;
      const secondInstallment = Math.round((total - firstInstallment) * 100) / 100;

      const { error } = await supabase.from("thirteenth_salary").upsert({
        employee_id: employeeId, 
        year: selectedYear, 
        monthly_provision: Math.round(provision * 100) / 100,
        first_installment: firstInstallment, 
        second_installment: secondInstallment,
      }, { onConflict: "employee_id,year" });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["thirteenth-salary"] }); toast({ title: "13º calculado!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const pay13thInstallmentMutation = useMutation({
    mutationFn: async ({ id, installment }: { id: string; installment: 1 | 2 }) => {
      const update = installment === 1
        ? { first_installment_paid: true, first_installment_date: localDateString() }
        : { second_installment_paid: true, second_installment_date: localDateString() };
      const { error } = await supabase.from("thirteenth_salary").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["thirteenth-salary"] }); toast({ title: "Parcela paga!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>13º Salário ({selectedYear})</CardTitle>
        {canEdit && (
          <Button size="sm" onClick={() => employees.forEach(e => thirteenthMutation.mutate(e.id))} disabled={thirteenthMutation.isPending}>
            <Gift className="h-4 w-4 mr-2" /> Recalcular Tudo
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead>Provisão Mensal</TableHead>
              <TableHead>1ª Parcela</TableHead>
              <TableHead>2ª Parcela</TableHead>
              {canEdit && <TableHead className="w-10 text-right">Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {thirteenths.length === 0 ? <TableRow><TableCell colSpan={canEdit ? 5 : 4} className="text-center py-4 text-muted-foreground">Clique em Recalcular para gerar a provisão do ano.</TableCell></TableRow> : thirteenths.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.employees?.name}</TableCell>
                <TableCell>{fmt(Number(t.monthly_provision))}</TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-bold">{fmt(Number(t.first_installment))}</div>
                    {t.first_installment_paid ? <Badge variant="default" className="text-[10px]">PAGO {formatDateBR(t.first_installment_date)}</Badge> : <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => pay13thInstallmentMutation.mutate({ id: t.id, installment: 1 })}>PAGAR</Button>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-bold">{fmt(Number(t.second_installment))}</div>
                    {t.second_installment_paid ? <Badge variant="default" className="text-[10px]">PAGO {formatDateBR(t.second_installment_date)}</Badge> : <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => pay13thInstallmentMutation.mutate({ id: t.id, installment: 2 })}>PAGAR</Button>}
                  </div>
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete("thirteenth_salary", t.id, `13º de ${t.employees?.name}`)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default ThirteenthTab;
