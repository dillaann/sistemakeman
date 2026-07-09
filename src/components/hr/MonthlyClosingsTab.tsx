import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmt, monthLabel } from "@/lib/utils";

interface MonthlyClosingsTabProps {
  closings: any[];
  employees: any[];
  employeeSummary: any[];
  selectedMonth: string;
  canEdit: boolean;
  onEdit: (ctx: any) => void;
  onEditMonth: (closing: any) => void;
}

const MonthlyClosingsTab = ({ closings, employees, employeeSummary, selectedMonth, canEdit, onEdit, onEditMonth }: MonthlyClosingsTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const closingMutation = useMutation({
    mutationFn: async (employeeId: string) => {
      const summary = employeeSummary.find(e => e.id === employeeId);
      if (!summary) throw new Error("Resumo não encontrado");

      const { error } = await supabase.from("monthly_closings").upsert({ 
        employee_id: employeeId, 
        month_ref: selectedMonth, 
        base_salary: summary.baseSalary, 
        total_advances: summary.empAdvances, 
        total_expenses: summary.empExpenses, 
        total_overtime: summary.empOvertime, 
        total_saturdays: summary.empSaturdays, 
        total_holidays: summary.empHolidays, 
        total_absences: summary.empAbsences, 
        net_pay: summary.netPay 
      } as any, { onConflict: "employee_id,month_ref" });
      if (error) throw error;

      // ── Lançar a saída no Financeiro (fonte única = fechamento do mês) ──
      // Regra: cada mensalista fechado gera UMA única saída paga = líquido do mês.
      // Removemos lançamentos antigos de folha (quinzenas/mensal) desse funcionário
      // no mês para não duplicar. Pagamentos semanais NÃO são tocados.
      const empName = summary.name;
      const netPay = Number(summary.netPay) || 0;
      const monthStart = `${selectedMonth}-01`;
      const [yy, mm] = selectedMonth.split("-").map(Number);
      const monthEnd = `${new Date(yy, mm, 1).toISOString().slice(0, 8)}01`; // 1º dia do mês seguinte
      const lastDay = new Date(yy, mm, 0).getDate();
      const todayStr = new Date().toISOString().slice(0, 10);
      let payDate = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;
      if (payDate > todayStr) payDate = todayStr;
      const desc = `Salário Mensal — ${empName} — Referência ${monthLabel(selectedMonth)}`;

      // Lançamentos de folha existentes desse funcionário no mês (exceto semanais)
      const { data: existing } = await supabase.from("financial_transactions")
        .select("id, description, account_id")
        .eq("sync_origin", "payroll")
        .eq("category", "Folha de Pagamento")
        .gte("due_date", monthStart).lt("due_date", monthEnd)
        .ilike("description", `%${empName}%`);

      const monthly = (existing || []).filter(
        (t: any) => !/semanal/i.test(t.description || "")
      );

      if (netPay > 0) {
        if (monthly.length > 0) {
          // Reaproveita o primeiro registro como a saída oficial e remove os demais
          await supabase.from("financial_transactions").update({
            amount: netPay, description: desc, due_date: payDate, paid_date: payDate, status: "pago" as any,
          }).eq("id", monthly[0].id);
          for (const dup of monthly.slice(1)) {
            await supabase.from("financial_transactions").delete().eq("id", dup.id);
          }
        } else {
          await supabase.from("financial_transactions").insert({
            type: "a_pagar" as any, description: desc, amount: netPay,
            due_date: payDate, paid_date: payDate, status: "pago" as any,
            category: "Folha de Pagamento", sync_origin: "payroll", payment_method: "pix",
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] });
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      toast({ title: "Fechamento atualizado e lançado no Financeiro!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Fechamentos Mensais — {monthLabel(selectedMonth)}</CardTitle>
        {canEdit && (
          <Button size="sm" onClick={() => employees.filter(e => {
            const isWeekly = (() => {
              if (!e.payment_type_change_date) return e.payment_type === "semanal";
              const [selYear, selMonth] = selectedMonth.split("-").map(Number);
              const [transYear, transMonth] = e.payment_type_change_date.split("-").map(Number);
              if (selYear < transYear) return true;
              if (selYear > transYear) return e.payment_type === "semanal";
              if (selMonth < transMonth) return true;
              return e.payment_type === "semanal";
            })();
            return !isWeekly;
          }).forEach(e => closingMutation.mutate(e.id))} disabled={closingMutation.isPending}>
            <CheckCircle className="h-4 w-4 mr-2" /> Fechar Todos do Mês
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead>Líquido do Mês</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead className="w-20 text-right">Ação</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employeeSummary.filter(e => !e.isWeekly).map(e => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell className="font-bold">{fmt(e.netPay)}</TableCell>
                <TableCell>
                  {e.closing ? <Badge variant="default">FECHADO</Badge> : <Badge variant="outline">PENDENTE</Badge>}
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => closingMutation.mutate(e.id)} title="Recalcular/Fechar">
                        <CheckCircle className="h-3.5 w-3.5" />
                      </Button>
                      {e.closing && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEditMonth(e.closing)} title="Alterar Mês Ref.">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
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

export default MonthlyClosingsTab;
