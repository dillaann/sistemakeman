import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus } from "lucide-react";
import { localDateString } from "@/lib/utils";

const paymentMethods: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "PIX", cartao: "Cartão", boleto: "Boleto", transferencia: "Transferência",
};
const paymentStatuses: Record<string, string> = {
  pago: "Pago", pendente: "Pendente", parcelado: "Parcelado",
};

const fmt = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface ItemRow {
  material: string;
  quantity: string;
  unit: string;
  unit_price: string;
  client_id?: string;
  work_order_id?: string;
}

const emptyItem = (): ItemRow => ({ material: "", quantity: "1", unit: "un", unit_price: "0" });

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: any[];
  clients: any[];
  workOrders: any[];
  onSave: (payload: {
    order: {
      supplier_id: string | null;
      client_id: string | null;
      work_order_id: string | null;
      purchase_date: string;
      payment_method: string;
      payment_status: string;
      due_date: string | null;
      invoice_number: string | null;
      notes: string | null;
      total: number;
    };
    items: Array<{
      material: string;
      quantity: number;
      unit: string;
      unit_price: number;
      total: number;
      client_id: string | null;
      work_order_id: string | null;
    }>;
  }) => Promise<void> | void;
  isPending?: boolean;
}

export default function NewOrderDialog({ open, onOpenChange, suppliers, clients, workOrders, onSave, isPending }: Props) {
  const [orderForm, setOrderForm] = useState({
    supplier_id: "",
    client_id: "",
    work_order_id: "",
    purchase_date: localDateString(),
    payment_method: "pix",
    payment_status: "pendente",
    due_date: "",
    invoice_number: "",
    notes: "",
  });
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);

  const reset = () => {
    setOrderForm({
      supplier_id: "", client_id: "", work_order_id: "",
      purchase_date: localDateString(), payment_method: "pix", payment_status: "pendente",
      due_date: "", invoice_number: "", notes: "",
    });
    setItems([emptyItem()]);
  };

  const total = items.reduce((s, it) => {
    const q = parseFloat(it.quantity) || 0;
    const p = parseFloat(it.unit_price) || 0;
    return s + q * p;
  }, 0);

  const handleItemChange = (idx: number, field: keyof ItemRow, value: string) => {
    setItems(items.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (idx: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter(it => it.material.trim() !== "");
    if (validItems.length === 0) return;

    const itemsPayload = validItems.map(it => {
      const q = parseFloat(it.quantity) || 0;
      const p = parseFloat(it.unit_price) || 0;
      return {
        material: it.material.trim(),
        quantity: q,
        unit: it.unit,
        unit_price: p,
        total: q * p,
        client_id: it.client_id || orderForm.client_id || null,
        work_order_id: it.work_order_id || orderForm.work_order_id || null,
      };
    });

    await onSave({
      order: {
        supplier_id: orderForm.supplier_id || null,
        client_id: orderForm.client_id || null,
        work_order_id: orderForm.work_order_id || null,
        purchase_date: orderForm.purchase_date,
        payment_method: orderForm.payment_method,
        payment_status: orderForm.payment_status,
        due_date: orderForm.due_date || null,
        invoice_number: orderForm.invoice_number || null,
        notes: orderForm.notes || null,
        total: itemsPayload.reduce((s, i) => s + i.total, 0),
      },
      items: itemsPayload,
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo Pedido de Compra</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Order header */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Fornecedor</Label>
              <Select value={orderForm.supplier_id} onValueChange={v => setOrderForm({ ...orderForm, supplier_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Cliente / Obra (padrão do pedido)</Label>
              <Select
                value={orderForm.work_order_id || orderForm.client_id || "geral"}
                onValueChange={v => {
                  if (v === "geral") setOrderForm({ ...orderForm, client_id: "", work_order_id: "" });
                  else {
                    const wo = workOrders.find((w: any) => w.id === v);
                    if (wo) setOrderForm({ ...orderForm, work_order_id: v, client_id: wo.client_id });
                    else setOrderForm({ ...orderForm, client_id: v, work_order_id: "" });
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Uso Geral / Estoque" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Uso Geral / Estoque</SelectItem>
                  {workOrders.map((wo: any) => (
                    <SelectItem key={wo.id} value={wo.id}>
                      {wo.clients?.name || "Cliente"} — OS #{wo.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                  {clients.filter(c => !workOrders.some((wo: any) => wo.client_id === c.id)).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} (sem OS)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Data da Compra *</Label>
              <Input type="date" value={orderForm.purchase_date} onChange={e => setOrderForm({ ...orderForm, purchase_date: e.target.value })} required />
            </div>
            <div>
              <Label>Nº Nota / Pedido</Label>
              <Input value={orderForm.invoice_number} onChange={e => setOrderForm({ ...orderForm, invoice_number: e.target.value })} />
            </div>
            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={orderForm.payment_method} onValueChange={v => setOrderForm({ ...orderForm, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(paymentMethods).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status Pagamento</Label>
              <Select value={orderForm.payment_status} onValueChange={v => setOrderForm({ ...orderForm, payment_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(paymentStatuses).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {orderForm.payment_status !== "pago" && (
              <div className="md:col-span-2">
                <Label>Data de Vencimento</Label>
                <Input type="date" value={orderForm.due_date} onChange={e => setOrderForm({ ...orderForm, due_date: e.target.value })} />
              </div>
            )}
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base">Itens do Pedido</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
              </Button>
            </div>
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material *</TableHead>
                    <TableHead className="w-20">Qtd</TableHead>
                    <TableHead className="w-20">Un.</TableHead>
                    <TableHead className="w-28">Vlr Unit.</TableHead>
                    <TableHead className="w-28">Total</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it, idx) => {
                    const q = parseFloat(it.quantity) || 0;
                    const p = parseFloat(it.unit_price) || 0;
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <Input value={it.material} onChange={e => handleItemChange(idx, "material", e.target.value)} placeholder="Descrição" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" value={it.quantity} onChange={e => handleItemChange(idx, "quantity", e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Select value={it.unit} onValueChange={v => handleItemChange(idx, "unit", v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["un", "kg", "m", "m²", "m³", "litro", "peça", "pacote", "cx", "rolo"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" value={it.unit_price} onChange={e => handleItemChange(idx, "unit_price", e.target.value)} />
                        </TableCell>
                        <TableCell className="font-medium">{fmt(q * p)}</TableCell>
                        <TableCell>
                          <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end items-center gap-3 pt-2 border-t">
              <span className="text-sm text-muted-foreground">Total do Pedido:</span>
              <span className="text-xl font-bold">{fmt(total)}</span>
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea value={orderForm.notes} onChange={e => setOrderForm({ ...orderForm, notes: e.target.value })} />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Salvando..." : "Registrar Pedido"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
