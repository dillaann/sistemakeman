import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, DollarSign, Trash2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmt, monthLabel, formatDateBR } from "@/lib/utils";

interface WeeklyClosingsTabProps {
  weeklyClosings: any[];
  employees: any[];
  selectedMonth: string;
  canEdit: boolean;
  onDeleteWeek: (wc: any, employeeName: string) => void;
}

const WeeklyClosingsTab = ({ weeklyClosings, employees, selectedMonth, canEdit, onDeleteWeek }: WeeklyClosingsTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const payWeeklyClosingMutation = useMutation({
    mutationFn: async ({ wc, accountId }: { wc: any; accountId: string }) => {
      const emp = employees.find(e => e.id === wc.employee_id);
      const desc = `Salário Semanal — ${emp?.name} — Semana ${wc.week_number} — Referência ${monthLabel(wc.month_ref)}`;
      
      const { data: ft, error: ftErr } = await supabase.from("financial_transactions").insert({
        type: "a_pagar" as any,
        description: desc,
        amount: Number(wc.net_pay),
        due_date: wc.closing_date,
        paid_date: wc.closing_date,
        status: "pago" as any,
        category: "Folha de Pagamento",
        sync_origin: "payroll",
        account_id: accountId || null,
        payment_method: "pix",
      }).select("id").single();
      
      if (ftErr) throw ftErr;

      const { error } = await supabase.from("weekly_closings").update({
        status: "pago",
        paid_date: wc.closing_date,
        financial_transaction_id: ft!.id
      } as any).eq("id", wc.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-closings"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      toast({ title: "Semana paga e lançada no financeiro!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const weeklyEmployees = employees.filter(e => e.payment_type === "semanal");

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {weeklyEmployees.map(e => {
        const closings = weeklyClosings.filter(wc => wc.employee_id === e.id);
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
                      <span className="text-[10px] text-muted-foreground">{formatDateBR(wc.closing_date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{fmt(Number(wc.net_pay))}</span>
                      {wc.status === "pago" ? (
                        <Badge variant="default" className="h-5 px-1 bg-green-500 hover:bg-green-600">PAGO</Badge>
                      ) : (
                        <Button size="icon" variant="outline" className="h-6 w-6 text-green-600" onClick={() => {
                          const acc = prompt("ID da conta (opcional):");
                          payWeeklyClosingMutation.mutate({ wc, accountId: acc || "" });
                        }}>
                          <CheckCircle className="h-3 w-3" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => onDeleteWeek(wc, e.name)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
