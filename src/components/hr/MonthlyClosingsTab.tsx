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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-closings"] });
      queryClient.invalidateQueries({ queryKey: ["salary-installments"] });
      toast({ title: "Fechamento atualizado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Fechamentos Mensais — {monthLabel(selectedMonth)}</CardTitle>
        {canEdit && (
          <Button size="sm" onClick={() => employees.filter(e => e.payment_type !== "semanal").forEach(e => closingMutation.mutate(e.id))} disabled={closingMutation.isPending}>
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
