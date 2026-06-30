import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, TrendingDown } from "lucide-react";
import { localDateString } from "@/lib/utils";

const paymentMethods: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "PIX", cartao: "Cartão", boleto: "Boleto", transferencia: "Transferência", cheque: "Cheque",
};
const paymentStatuses: Record<string, string> = {
  pago: "Pago", pendente: "Pendente", parcelado: "Parcelado",
};

const fmt = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface ItemRow {
  material: string;
  quantity: string;
  unit: string;
  original_unit_price: string;
  final_unit_price: string;
  client_id?: string;
  work_order_id?: string;
}

const emptyItem = (): ItemRow => ({ material: "", quantity: "1", unit: "un", original_unit_price: "0", final_unit_price: "0" });

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suppliers: any[];
  clients: any[];
  workOrders: any[];
  onSave: (payload: {
    order: {
      id?: string;
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
      original_total?: number;
      discount_amount?: number;
    };
    items: Array<{
      material: string;
      quantity: number;
      unit: string;
      unit_price: number;
      original_price?: number;
      total: number;
      discount_amount?: number;
      client_id: string | null;
      work_order_id: string | null;
    }>;
  }) => Promise<void> | void;
  isPending?: boolean;
  editOrder?: any | null;
  editItems?: any[];
}

export default function NewOrderDialog({ open, onOpenChange, suppliers, clients, workOrders, onSave, isPending, editOrder, editItems }: Props) {
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
  const [originalTotalOverride, setOriginalTotalOverride] = useState<string>("");
  const [finalTotalOverride, setFinalTotalOverride] = useState<string>("");

  const isEditing = !!editOrder;

  useEffect(() => {
    if (open && editOrder) {
      setOrderForm({
        supplier_id: editOrder.supplier_id || "",
        client_id: editOrder.client_id || "",
        work_order_id: editOrder.work_order_id || "",
        purchase_date: editOrder.purchase_date || localDateString(),
        payment_method: editOrder.payment_method || "pix",
        payment_status: editOrder.payment_status || "pendente",
        due_date: editOrder.due_date || "",
        invoice_number: editOrder.invoice_number || "",
        notes: editOrder.notes || "",
      });
      setItems(
        editItems && editItems.length > 0
          ? editItems.map((it: any) => ({
              material: it.material || "",
              quantity: String(it.quantity ?? "1"),
              unit: it.unit || "un",
              original_unit_price: String(it.original_price ?? it.unit_price ?? "0"),
              final_unit_price: String(it.unit_price ?? "0"),
              client_id: it.client_id || undefined,
              work_order_id: it.work_order_id || undefined,
            }))
          : [emptyItem()]
      );
      setOriginalTotalOverride(editOrder.original_total != null ? String(editOrder.original_total) : "");
      setFinalTotalOverride(editOrder.total != null ? String(editOrder.total) : "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editOrder]);

  const reset = () => {
    setOrderForm({
      supplier_id: "", client_id: "", work_order_id: "",
      purchase_date: localDateString(), payment_method: "pix", payment_status: "pendente",
      due_date: "", invoice_number: "", notes: "",
    });
    setItems([emptyItem()]);
    setOriginalTotalOverride("");
    setFinalTotalOverride("");
  };

  const itemsOriginalTotal = items.reduce((s, it) => {
    const q = parseFloat(it.quantity) || 0;
    const p = parseFloat(it.original_unit_price) || 0;
    return s + q * p;
  }, 0);
  const itemsFinalTotal = items.reduce((s, it) => {
    const q = parseFloat(it.quantity) || 0;
    const p = parseFloat(it.final_unit_price) || 0;
    return s + q * p;
  }, 0);

  const originalTotal = originalTotalOverride !== "" ? (parseFloat(originalTotalOverride) || 0) : itemsOriginalTotal;
  const finalTotal = finalTotalOverride !== "" ? (parseFloat(finalTotalOverride) || 0) : itemsFinalTotal;
  const discount = Math.max(0, originalTotal - finalTotal);

  const handleItemChange = (idx: number, field: keyof ItemRow, value: string) => {
    setItems(items.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [field]: value };
      // when user types only final price, mirror to original (no discount by default)
      if (field === "final_unit_price" && (parseFloat(it.original_unit_price) || 0) === 0) {
        next.original_unit_price = value;
      }
      return next;
    }));
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

    // Use override totals if provided, otherwise fall back to items sum
    const confirmedFinal = Number(finalTotal.toFixed(2));
    const confirmedOriginal = Number(Math.max(originalTotal, confirmedFinal).toFixed(2));
    const totalDiscount = Math.max(0, confirmedOriginal - confirmedFinal);

    const finalFactor = itemsFinalTotal > 0 ? confirmedFinal / itemsFinalTotal : 1;
    const originalFactor = itemsOriginalTotal > 0 ? confirmedOriginal / itemsOriginalTotal : 1;

    const itemsPayload = validItems.map((it, idx) => {
      const q = parseFloat(it.quantity) || 0;
      const finalUnit = parseFloat(it.final_unit_price) || 0;
      const originalUnit = parseFloat(it.original_unit_price) || finalUnit;

      const itemOriginal = q * originalUnit * originalFactor;
      const previousFinals = validItems.slice(0, idx).reduce((s, prev) => {
        const pq = parseFloat(prev.quantity) || 0;
        const pf = parseFloat(prev.final_unit_price) || 0;
        return s + Number((pq * pf * finalFactor).toFixed(2));
      }, 0);
      const itemFinal = idx === validItems.length - 1
        ? Number((confirmedFinal - previousFinals).toFixed(2))
        : Number((q * finalUnit * finalFactor).toFixed(2));

      const itemDiscount = Math.max(0, itemOriginal - itemFinal);

      return {
        material: it.material.trim(),
        quantity: q,
        unit: it.unit,
        unit_price: q > 0 ? itemFinal / q : finalUnit,
        original_price: q > 0 ? itemOriginal / q : originalUnit,
        total: itemFinal,
        discount_amount: itemDiscount,
        client_id: it.client_id || orderForm.client_id || null,
        work_order_id: it.work_order_id || orderForm.work_order_id || null,
      };
    });

    await onSave({
      order: {
        id: editOrder?.id,
        supplier_id: orderForm.supplier_id || null,
        client_id: orderForm.client_id || null,
        work_order_id: orderForm.work_order_id || null,
        purchase_date: orderForm.purchase_date,
        payment_method: orderForm.payment_method,
        payment_status: orderForm.payment_status,
        due_date: orderForm.due_date || null,
        invoice_number: orderForm.invoice_number || null,
        notes: orderForm.notes || null,
        total: confirmedFinal,
        original_total: confirmedOriginal,
        discount_amount: totalDiscount,
      },
      items: itemsPayload,
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEditing ? "Editar Pedido de Compra" : "Novo Pedido de Compra"}</DialogTitle></DialogHeader>
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
            <p className="text-[11px] text-muted-foreground">
              Preencha o <strong>Valor Original</strong> (antes da negociação) e o <strong>Valor Pago</strong> de cada item. A diferença vira economia.
            </p>
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material *</TableHead>
                    <TableHead className="w-16">Qtd</TableHead>
                    <TableHead className="w-16">Un.</TableHead>
                    <TableHead className="w-24">R$ Original</TableHead>
                    <TableHead className="w-24">R$ Pago</TableHead>
                    <TableHead className="w-24">Total Pago</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it, idx) => {
                    const q = parseFloat(it.quantity) || 0;
                    const fp = parseFloat(it.final_unit_price) || 0;
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
                              {["un", "kg", "m", "m²", "m³", "ml", "litro", "peça", "pacote", "cx", "rolo"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" className="bg-orange-50/50" value={it.original_unit_price} onChange={e => handleItemChange(idx, "original_unit_price", e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="0.01" className="bg-green-50/50" value={it.final_unit_price} onChange={e => handleItemChange(idx, "final_unit_price", e.target.value)} />
                        </TableCell>
                        <TableCell className="font-medium text-green-700">{fmt(q * fp)}</TableCell>
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

            {/* Totals summary */}
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valor Original</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input
                      type="number" step="0.01"
                      className="pl-9 bg-background"
                      value={originalTotalOverride !== "" ? originalTotalOverride : String(itemsOriginalTotal.toFixed(2))}
                      onChange={e => setOriginalTotalOverride(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-green-700">Valor Pago (Final)</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-700 font-bold text-sm">R$</span>
                    <Input
                      type="number" step="0.01"
                      className="pl-9 bg-background border-green-200 focus-visible:ring-green-500 font-bold text-green-700"
                      value={finalTotalOverride !== "" ? finalTotalOverride : String(itemsFinalTotal.toFixed(2))}
                      onChange={e => setFinalTotalOverride(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between py-2 px-3 bg-green-500/10 rounded-lg border border-green-500/20">
                  <div className="flex items-center gap-2 text-green-700">
                    <TrendingDown className="h-4 w-4" />
                    <span className="text-sm font-medium">Economia Realizada:</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-700">{fmt(discount)}</p>
                    {originalTotal > 0 && (
                      <p className="text-[10px] text-green-600 font-medium">
                        ({((discount / originalTotal) * 100).toFixed(1)}% de desconto)
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea value={orderForm.notes} onChange={e => setOrderForm({ ...orderForm, notes: e.target.value })} />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Salvando..." : isEditing ? "Salvar Alterações" : "Registrar Pedido"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
