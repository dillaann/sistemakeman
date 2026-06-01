import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface HREditSalaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: any;
  setForm: (form: any) => void;
  onConfirm: () => void;
  isPending: boolean;
}

const HREditSalaryDialog = ({ open, onOpenChange, form, setForm, onConfirm, isPending }: HREditSalaryDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar Salário — {form.name}</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); onConfirm(); }} className="space-y-3">
          <div><Label>Salário Base (R$)</Label><Input type="number" step="0.01" min="0" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} required /></div>
          <div><Label>Valor Sábado (R$)</Label><Input type="number" step="0.01" min="0" value={form.saturday_value} onChange={e => setForm({ ...form, saturday_value: e.target.value })} /></div>
          <div><Label>Valor Hora Extra (R$)</Label><Input type="number" step="0.01" min="0" value={form.overtime_hourly_rate} onChange={e => setForm({ ...form, overtime_hourly_rate: e.target.value })} /></div>
          <div><Label>Data Mudança Tipo Pgto (Vigência)</Label><Input type="date" value={form.payment_type_change_date} onChange={e => setForm({ ...form, payment_type_change_date: e.target.value })} /></div>
          <Button type="submit" className="w-full" disabled={isPending}>Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default HREditSalaryDialog;
