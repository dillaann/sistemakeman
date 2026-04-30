import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: any | null;
  items: any[];
  supplierName?: string;
  getClientLabel?: (item: any) => string;
}

const fmt = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const paymentMethods: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "PIX", cartao: "Cartão", boleto: "Boleto", transferencia: "Transferência",
};
const paymentStatuses: Record<string, string> = {
  pago: "Pago", pendente: "Pendente", parcelado: "Parcelado",
};
const statusColors: Record<string, string> = {
  pago: "bg-green-500/10 text-green-700 border-green-500/20",
  pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  parcelado: "bg-blue-500/10 text-blue-700 border-blue-500/20",
};

export default function OrderDetailsDialog({ open, onOpenChange, order, items, supplierName, getClientLabel }: Props) {
  if (!order) return null;
  const totalSum = items.reduce((s, i) => s + Number(i.total || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pedido {order.order_number}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Fornecedor</p>
            <p className="font-medium">{supplierName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Data</p>
            <p className="font-medium">{formatDateBR(order.purchase_date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Forma de Pagamento</p>
            <p className="font-medium">{paymentMethods[order.payment_method] ?? order.payment_method ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className={statusColors[order.payment_status] ?? statusColors.pendente}>
              {paymentStatuses[order.payment_status] ?? order.payment_status}
            </Badge>
          </div>
          {order.invoice_number && (
            <div>
              <p className="text-xs text-muted-foreground">Nº Nota</p>
              <p className="font-medium">{order.invoice_number}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Itens</p>
            <p className="font-medium">{items.length}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Valor Total do Pedido</p>
            <p className="font-bold text-lg">{fmt(totalSum)}</p>
          </div>
          {order.notes && (
            <div className="col-span-full">
              <p className="text-xs text-muted-foreground">Observações</p>
              <p className="text-sm">{order.notes}</p>
            </div>
          )}
        </div>

        <div className="border rounded-lg overflow-auto mt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Qtd</TableHead>
                <TableHead>Vlr Unit.</TableHead>
                <TableHead>Total</TableHead>
                {getClientLabel && <TableHead>Cliente / Obra</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.material}</TableCell>
                  <TableCell>{it.quantity} {it.unit}</TableCell>
                  <TableCell>{fmt(Number(it.unit_price))}</TableCell>
                  <TableCell className="font-medium">{fmt(Number(it.total))}</TableCell>
                  {getClientLabel && <TableCell className="text-xs">{getClientLabel(it)}</TableCell>}
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={getClientLabel ? 5 : 4} className="text-center text-muted-foreground py-6">
                    Nenhum item neste pedido.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
