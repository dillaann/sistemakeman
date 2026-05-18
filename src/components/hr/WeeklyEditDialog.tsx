import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { monthLabel } from "@/lib/utils";

type Mode = "edit" | "create";

interface Props {
  open: boolean;
  mode: Mode;
  wc: any | null;
  employee: any | null;
  monthRef: string;
  accounts: any[];
  onClose: () => void;
}

const num = (v: string) => parseFloat((v || "0").toString().replace(",", ".")) || 0;

const WeeklyEditDialog = ({ open, mode, wc, employee, monthRef, accounts, onClose }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<any>({});

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && wc) {
      setF({
        week_number: String(wc.week_number ?? 1),
        start_date: wc.start_date ?? "",
        end_date: wc.end_date ?? "",
        base_value: String(Number(wc.base_value) || 0),
        overtime_value: String(Number(wc.overtime_value) || 0),
        saturday_value: String(Number(wc.saturday_value) || 0),
        holiday_value: String(Number(wc.holiday_value) || 0),
        absence_value: String(Number(wc.absence_value) || 0),
        advances_value: String(Number(wc.advances_value) || 0),
        weeks_worked: String(Number(wc.weeks_worked) || 1),
        net_pay: String(Number(wc.net_pay) || 0),
        status: wc.status || "pendente",
        payment_date: wc.payment_date ?? "",
        payment_method: wc.payment_method ?? "pix",
        financial_account_id: wc.financial_account_id ?? "",
      });
    } else if (mode === "create" && employee) {
      const base = Number(employee.weekly_salary) || 0;
      setF({
        week_number: "1", start_date: "", end_date: "",
        base_value: String(base), overtime_value: "0", saturday_value: "0",
        holiday_value: "0", absence_value: "0", advances_value: "0",
        weeks_worked: "1", net_pay: String(base),
        status: "pendente", payment_date: "", payment_method: "pix", financial_account_id: "",
      });
    }
  }, [open, mode, wc, employee]);

  // Auto-recalc net_pay when components change (only if user didn't override)
  const recalcNet = () => {
    const calc = num(f.base_value) + num(f.overtime_value) + num(f.saturday_value) + num(f.holiday_value) - num(f.absence_value) - num(f.advances_value);
    setF((p: any) => ({ ...p, net_pay: String(calc.toFixed(2)) }));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const emp = employee || { name: "Funcionário", id: wc?.employee_id };
      const payload: any = {
        employee_id: emp.id,
        month_ref: monthRef,
        week_number: parseInt(f.week_number) || 1,
        start_date: f.start_date || null,
        end_date: f.end_date || null,
        base_value: num(f.base_value),
        overtime_value: num(f.overtime_value),
        saturday_value: num(f.saturday_value),
        holiday_value: num(f.holiday_value),
        absence_value: num(f.absence_value),
        advances_value: num(f.advances_value),
        weeks_worked: num(f.weeks_worked) || 1,
        net_pay: num(f.net_pay),
        status: f.status || "pendente",
        payment_date: f.payment_date || null,
        payment_method: f.payment_method || null,
        financial_account_id: f.financial_account_id || null,
      };

      if (mode === "create") {
        const { error } = await supabase.from("weekly_closings").insert(payload);
        if (error) throw error;
        return;
      }

      // EDIT
      if (!wc) throw new Error("Semana não encontrada");
      const oldDesc = `Salário Semanal — ${emp.name} — Semana ${wc.week_number} — Referência ${monthLabel(wc.month_ref)}`;
      const newDesc = `Salário Semanal — ${emp.name} — Semana ${payload.week_number} — Referência ${monthLabel(payload.month_ref)}`;

      const { error } = await supabase.from("weekly_closings").update(payload).eq("id", wc.id);
      if (error) throw error;

      // Sync Financeiro
      const payDate = payload.payment_date || wc.payment_date || new Date().toISOString().slice(0, 10);

      if (wc.status === "pago" && payload.status !== "pago") {
        // Was paid, now unpaid: remove FT
        await supabase.from("financial_transactions").delete().eq("description", oldDesc).eq("sync_origin", "payroll");
      } else if (payload.status === "pago") {
        // Try to update existing FT; if none exists, insert
        const { data: existing } = await supabase
          .from("financial_transactions")
          .select("id")
          .eq("description", oldDesc)
          .eq("sync_origin", "payroll")
          .limit(1);

        if (existing && existing.length > 0) {
          await supabase.from("financial_transactions").update({
            description: newDesc,
            amount: payload.net_pay,
            paid_date: payDate,
            due_date: payDate,
            payment_method: payload.payment_method || "pix",
            account_id: payload.financial_account_id || null,
            status: "pago" as any,
          }).eq("id", existing[0].id);
        } else {
          await supabase.from("financial_transactions").insert({
            type: "a_pagar" as any,
            description: newDesc,
            amount: payload.net_pay,
            due_date: payDate,
            paid_date: payDate,
            status: "pago" as any,
            category: "Folha de Pagamento",
            sync_origin: "payroll",
            account_id: payload.financial_account_id || null,
            payment_method: payload.payment_method || "pix",
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-closings"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      toast({ title: mode === "create" ? "Semana criada!" : "Semana atualizada!" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!open) return null;
  const empName = employee?.name || "Funcionário";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nova Semana" : `Editar Semana ${wc?.week_number}`} — {empName}</DialogTitle>
          <DialogDescription>Mês de referência: {monthLabel(monthRef)}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Nº da Semana</Label>
            <Input type="number" min="1" value={f.week_number || ""} onChange={e => setF({ ...f, week_number: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Semanas Trabalhadas</Label>
            <Input type="number" step="0.5" min="0" value={f.weeks_worked || ""} onChange={e => setF({ ...f, weeks_worked: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Início</Label>
            <Input type="date" value={f.start_date || ""} onChange={e => setF({ ...f, start_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Fim</Label>
            <Input type="date" value={f.end_date || ""} onChange={e => setF({ ...f, end_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Valor Base</Label>
            <Input type="number" step="0.01" value={f.base_value || ""} onChange={e => setF({ ...f, base_value: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Horas Extras (R$)</Label>
            <Input type="number" step="0.01" value={f.overtime_value || ""} onChange={e => setF({ ...f, overtime_value: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Sábados (R$)</Label>
            <Input type="number" step="0.01" value={f.saturday_value || ""} onChange={e => setF({ ...f, saturday_value: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Feriados (R$)</Label>
            <Input type="number" step="0.01" value={f.holiday_value || ""} onChange={e => setF({ ...f, holiday_value: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Faltas (R$)</Label>
            <Input type="number" step="0.01" value={f.absence_value || ""} onChange={e => setF({ ...f, absence_value: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Adiantamentos (R$)</Label>
            <Input type="number" step="0.01" value={f.advances_value || ""} onChange={e => setF({ ...f, advances_value: e.target.value })} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <div className="flex items-center justify-between">
              <Label>Líquido (R$)</Label>
              <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={recalcNet}>Recalcular</Button>
            </div>
            <Input type="number" step="0.01" value={f.net_pay || ""} onChange={e => setF({ ...f, net_pay: e.target.value })} className="font-bold" />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.status || "pendente"} onChange={e => setF({ ...f, status: e.target.value })}>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Data Pagamento</Label>
            <Input type="date" value={f.payment_date || ""} onChange={e => setF({ ...f, payment_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Método</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.payment_method || "pix"} onChange={e => setF({ ...f, payment_method: e.target.value })}>
              <option value="pix">PIX</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="transferencia">Transferência</option>
              <option value="cartao">Cartão</option>
              <option value="boleto">Boleto</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Conta Financeira</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.financial_account_id || ""} onChange={e => setF({ ...f, financial_account_id: e.target.value })}>
              <option value="">—</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        {wc?.status === "pago" && mode === "edit" && (
          <p className="text-xs text-amber-600 dark:text-amber-400">⚠️ Esta semana está paga. Alterações sincronizam automaticamente o lançamento no Financeiro.</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WeeklyEditDialog;
