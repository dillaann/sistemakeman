import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmt, localDateString } from "@/lib/utils";

interface BulkPayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  form: any;
  setForm: (form: any) => void;
  accounts: any[];
  onConfirm: () => void;
  isPending: boolean;
}

export const BulkPayDialog = ({ open, onOpenChange, count, form, setForm, accounts, onConfirm, isPending }: BulkPayDialogProps) => {
  const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar Pagamento em Lote — {count} Funcionários</DialogTitle>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); onConfirm(); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data Real do Pagamento *</Label><Input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} required /></div>
            <div><Label>Forma de Pagamento *</Label>
              <select className={selectClass} value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                <option value="pix">PIX</option><option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option><option value="outro">Outro</option>
              </select>
            </div>
          </div>
          <div><Label>Conta de Origem</Label>
            <select className={selectClass} value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
              <option value="">Selecione (opcional)</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><Label>Observações</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={isPending}>Confirmar Pagamentos</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface PayInstallmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  form: any;
  setForm: (form: any) => void;
  accounts: any[];
  onConfirm: () => void;
  isPending: boolean;
}

export const PayInstallmentDialog = ({ open, onOpenChange, employeeName, form, setForm, accounts, onConfirm, isPending }: PayInstallmentDialogProps) => {
  const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Pagar Quinzena — {employeeName}</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); onConfirm(); }} className="space-y-3">
          <div><Label>Valor do Pagamento (R$)</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data do Pagamento</Label><Input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} required /></div>
            <div><Label>Forma</Label>
              <select className={selectClass} value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}>
                <option value="pix">PIX</option><option value="transferencia">Transferência</option><option value="dinheiro">Dinheiro</option><option value="outro">Outro</option>
              </select>
            </div>
          </div>
          <div><Label>Conta de Saída</Label>
            <select className={selectClass} value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
              <option value="">Selecione a conta</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div><Label>Observações</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={isPending}>Confirmar Pagamento</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
