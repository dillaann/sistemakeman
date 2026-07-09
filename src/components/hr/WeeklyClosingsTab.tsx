import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Trash2, Pencil, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmt, monthLabel, formatDateBR } from "@/lib/utils";

interface WeeklyClosingsTabProps {
  weeklyClosings: any[];
  employees: any[];
  selectedMonth: string;
  canEdit: boolean;
  onDeleteWeek: (wc: any, employeeName: string) => void;
  onEditWeek: (wc: any, employee: any) => void;
  onAddWeek: (employee: any) => void;
}

const WeeklyClosingsTab = ({ weeklyClosings, employees, selectedMonth, canEdit, onDeleteWeek, onEditWeek, onAddWeek }: WeeklyClosingsTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const payWeeklyClosingMutation = useMutation({
    mutationFn: async ({ wc }: { wc: any; accountId?: string }) => {
      // Fechamento é INDEPENDENTE do Financeiro: marcar como pago apenas atualiza
      // o registro do fechamento. A saída da folha é lançada manualmente no
      // Financeiro (uma única saída com o total da folha).
      const payDate = wc.payment_date || wc.end_date || new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("weekly_closings").update({
        status: "pago",
        payment_date: payDate,
      } as any).eq("id", wc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-closings"] });
      toast({ title: "Semana marcada como paga!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });


  const isWeeklyForMonth = (emp: any) => {
    if (!emp.payment_type_change_date) return emp.payment_type === "semanal";
    
    const [selYear, selMonth] = selectedMonth.split("-").map(Number);
    const [transYear, transMonth] = emp.payment_type_change_date.split("-").map(Number);
    
    if (selYear < transYear) return true;
    if (selYear > transYear) return emp.payment_type === "semanal";
    if (selMonth < transMonth) return true;
    return emp.payment_type === "semanal";
  };

  const weeklyEmployees = employees.filter(isWeeklyForMonth);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {weeklyEmployees.map(e => {
        const closings = weeklyClosings.filter(wc => wc.employee_id === e.id).sort((a, b) => a.week_number - b.week_number);
        const totalNet = closings.reduce((s, wc) => s + Number(wc.net_pay), 0);
        const totalPaid = closings.filter(wc => wc.status === "pago").reduce((s, wc) => s + Number(wc.net_pay), 0);

        return (
          <Card key={e.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex justify-between items-center">
                {e.name}
                <Badge variant="outline">{fmt(totalNet)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {closings.map(wc => (
                  <div key={wc.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium">Semana {wc.week_number}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {wc.start_date ? formatDateBR(wc.start_date) : "—"} → {wc.end_date ? formatDateBR(wc.end_date) : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-bold mr-1">{fmt(Number(wc.net_pay))}</span>
                      {wc.status === "pago" ? (
                        <Badge variant="default" className="h-5 px-1 bg-green-500 hover:bg-green-600">PAGO</Badge>
                      ) : (
                        <Button size="icon" variant="outline" className="h-6 w-6 text-green-600" title="Marcar como pago" onClick={() => {
                          payWeeklyClosingMutation.mutate({ wc, accountId: "" });
                        }}>
                          <CheckCircle className="h-3 w-3" />
                        </Button>
                      )}
                      {canEdit && (
                        <>
                          <Button size="icon" variant="ghost" className="h-6 w-6" title="Editar" onClick={() => onEditWeek(wc, e)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" title="Excluir" onClick={() => onDeleteWeek(wc, e.name)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {closings.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nenhuma semana registrada</p>
                )}
              </div>
              {canEdit && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => onAddWeek(e)}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar Semana
                </Button>
              )}
              <div className="pt-2 border-t flex justify-between text-xs font-bold">
                <span>TOTAL PAGO:</span>
                <span className="text-green-600">{fmt(totalPaid)}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default WeeklyClosingsTab;
