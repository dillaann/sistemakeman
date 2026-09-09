import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  generateOccurrences,
  MONTH_NAMES,
  RECURRENCE_LABELS,
  type ForecastRecurrence,
} from "@/lib/forecast-recurrence";
import type { Forecast, ForecastFormValues } from "./types";

interface ForecastDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Previsão em edição; ausente = criação. */
  forecast?: Forecast | null;
  onSubmit: (values: ForecastFormValues, dates: string[]) => void | Promise<void>;
  isPending?: boolean;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyValues = (): ForecastFormValues => ({
  description: "",
  type: "saida",
  amount: "",
  forecast_date: todayIso(),
  recurrence: "none",
  end_date: "",
  months: [],
  category: "",
  notes: "",
});

export function ForecastDialog({ open, onOpenChange, forecast, onSubmit, isPending }: ForecastDialogProps) {
  const [values, setValues] = useState<ForecastFormValues>(emptyValues());
  const isEditing = Boolean(forecast);

  useEffect(() => {
    if (!open) return;
    if (forecast) {
      setValues({
        description: forecast.description,
        type: forecast.type,
        amount: String(forecast.amount),
        forecast_date: forecast.forecast_date,
        recurrence: "none",
        end_date: "",
        months: [],
        category: forecast.category ?? "",
        notes: forecast.notes ?? "",
      });
    } else {
      setValues(emptyValues());
    }
  }, [open, forecast]);

  const set = <K extends keyof ForecastFormValues>(key: K, value: ForecastFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const toggleMonth = (month: number) =>
    setValues((prev) => ({
      ...prev,
      months: prev.months.includes(month)
        ? prev.months.filter((m) => m !== month)
        : [...prev.months, month],
    }));

  const previewDates = isEditing
    ? [values.forecast_date]
    : generateOccurrences({
        recurrence: values.recurrence,
        startDate: values.forecast_date,
        endDate: values.end_date || null,
        months: values.months,
      });

  const handleSubmit = () => {
    if (!values.description.trim()) return;
    const amount = Number(String(values.amount).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return;
    void onSubmit({ ...values, amount: String(amount) }, previewDates);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Previsão" : "Nova Previsão"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Ex: Conta de Luz"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={values.type} onValueChange={(v) => set("type", v as "entrada" | "saida")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada prevista</SelectItem>
                  <SelectItem value="saida">Saída prevista</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={values.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{isEditing ? "Data prevista" : "Data prevista (início)"}</Label>
              <Input
                type="date"
                value={values.forecast_date}
                onChange={(e) => set("forecast_date", e.target.value)}
              />
            </div>
            {!isEditing && (
              <div className="space-y-1.5">
                <Label>Recorrência</Label>
                <Select value={values.recurrence} onValueChange={(v) => set("recurrence", v as ForecastRecurrence)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(RECURRENCE_LABELS) as ForecastRecurrence[]).map((r) => (
                      <SelectItem key={r} value={r}>{RECURRENCE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {!isEditing && values.recurrence !== "none" && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="space-y-1.5">
                <Label>Data de término (opcional)</Label>
                <Input type="date" value={values.end_date} onChange={(e) => set("end_date", e.target.value)} />
                <p className="text-xs text-muted-foreground">Sem data de término: gera 12 meses a partir do início.</p>
              </div>

              {values.recurrence === "custom_months" && (
                <div className="space-y-2">
                  <Label>Meses de ocorrência</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {MONTH_NAMES.map((name, idx) => (
                      <label key={name} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={values.months.includes(idx + 1)}
                          onCheckedChange={() => toggleMonth(idx + 1)}
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Serão geradas <strong>{previewDates.length}</strong> ocorrência(s).
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input
                value={values.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Ex: Fixas, Pessoal..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
