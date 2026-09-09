import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Forecast } from "./types";

export interface SettleValues {
  date: string;
  amount: string;
  payment_method: string;
  account_id: string;
  notes: string;
}

export const PAYMENT_METHODS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "cartao_credito", label: "Cartão" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forecast: Forecast | null;
  isPending?: boolean;
  onConfirm: (values: SettleValues) => void | Promise<void>;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function SettleForecastDialog({ open, onOpenChange, forecast, isPending, onConfirm }: Props) {
  const [values, setValues] = useState<SettleValues>({
    date: todayIso(),
    amount: "",
    payment_method: "pix",
    account_id: "",
    notes: "",
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open || !forecast) return;
    setValues({
      date: todayIso(),
      amount: String(forecast.amount),
      payment_method: "pix",
      account_id: "",
      notes: forecast.notes ?? "",
    });
  }, [open, forecast]);

  const isEntrada = forecast?.type === "entrada";
  const amountValid = Number(values.amount) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dar baixa na previsão</DialogTitle>
          <DialogDescription>
            {forecast?.description} — será lançado em {isEntrada ? "Entradas" : "Saídas"} do Financeiro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Data real do {isEntrada ? "recebimento" : "pagamento"}</Label>
            <Input type="date" value={values.date} onChange={(e) => setValues({ ...values, date: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Valor real</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={values.amount}
              onChange={(e) => setValues({ ...values, amount: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>Forma de pagamento</Label>
            <Select value={values.payment_method} onValueChange={(v) => setValues({ ...values, payment_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Conta {isEntrada ? "de destino" : "de origem"}</Label>
            <Select value={values.account_id} onValueChange={(v) => setValues({ ...values, account_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Observações</Label>
            <Textarea
              rows={2}
              value={values.notes}
              onChange={(e) => setValues({ ...values, notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!amountValid || !values.date || isPending} onClick={() => void onConfirm(values)}>
            Confirmar baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
