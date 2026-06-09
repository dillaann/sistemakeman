import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Search, ArrowUpDown, AlertTriangle, Clock, CheckCircle2, Eye, Pencil, Trash2 } from "lucide-react";
import { formatDateBR, localDateString } from "@/lib/utils";
import { isInRange } from "@/components/MonthFilter";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialCategories } from "@/hooks/useFinancialCategories";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const paymentMethods = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "boleto", label: "Boleto" },
  { value: "cheque", label: "Cheque" },
  { value: "cartao_credito", label: "Cartão Crédito" },
  { value: "cartao_debito", label: "Cartão Débito" },
  { value: "transferencia", label: "Transferência Bancária" },
];

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getStatus(t: { status: string; due_date: string }): "pago" | "vencido" | "a_vencer" {
  if (t.status === "pago") return "pago";
  if (daysUntil(t.due_date) < 0) return "vencido";
  return "a_vencer";
}

const statusBadge: Record<string, { label: string; className: string }> = {
  pago: { label: "Pago", className: "bg-green-500/10 text-green-700 border-green-500/20" },
  vencido: { label: "Vencido", className: "bg-red-500/10 text-red-700 border-red-500/20" },
  a_vencer: { label: "A Vencer", className: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20" },
};

export default function ContasPagarTab({ dateRange }: { dateRange?: { start: Date; end: Date } }) {
  const isBeforeRange = (dateStr: string) => {
    if (!dateRange) return false;
    const d = new Date(dateStr + "T00:00:00");
    return d < dateRange.start;
  };
  const isInCurrentRange = (dateStr: string) => {
    if (!dateRange) return true;
    return isInRange(dateStr, dateRange);
  };
  const { toast } = useToast();
  const { userRole } = useAuth();
  const qc = useQueryClient();
  const { categories: catList } = useFinancialCategories("saida");
  const categorias = catList.map(c => c.name);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [sortField, setSortField] = useState<"due_date" | "amount">("due_date");
  const [sortAsc, setSortAsc] = useState(true);
  const [showAllPending, setShowAllPending] = useState(false);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    due_date: "", description: "", amount: "", category: "", status: "pendente", payment_method: "pix", account_id: "", notes: "",
  });

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const canEdit = userRole === "admin" || userRole === "financeiro";
  const canDelete = userRole === "admin";

  const { data: transactions = [] } = useQuery({
    queryKey: ["financial-contas-pagar"],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_transactions")
        .select("*")
        .eq("type", "a_pagar")
        .order("due_date", { ascending: true });
      return data ?? [];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_accounts").select("id, name");
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = transactions.map(t => ({ ...t, computedStatus: getStatus(t) }));
    if (dateRange && !showAllPending) {
      list = list.filter(t => isInRange(t.due_date, dateRange));
    }
    if (showAllPending) {
      list = list.filter(t => t.computedStatus !== "pago");
    }
    if (statusFilter !== "all") {
      list = list.filter(t => t.computedStatus === statusFilter);
    }
    if (catFilter !== "all") {
      list = list.filter(t => (t.category ?? "") === catFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(t => t.description.toLowerCase().includes(s) || (t.category ?? "").toLowerCase().includes(s));
    }
    list.sort((a, b) => {
      if (sortField === "amount") return sortAsc ? Number(a.amount) - Number(b.amount) : Number(b.amount) - Number(a.amount);
      return sortAsc ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date);
    });
    return list;
  }, [transactions, statusFilter, catFilter, search, sortField, sortAsc, dateRange, showAllPending]);

  const openItems = transactions.filter(t => t.status !== "pago" && t.status !== "cancelado");
  const totalAberto = openItems.reduce((s, t) => s + Number(t.amount), 0);
  const totalVencido = openItems.filter(t => daysUntil(t.due_date) < 0).reduce((s, t) => s + Number(t.amount), 0);
  const total7d = openItems.filter(t => { const d = daysUntil(t.due_date); return d >= 0 && d <= 7; }).reduce((s, t) => s + Number(t.amount), 0);
  const total30d = openItems.filter(t => { const d = daysUntil(t.due_date); return d >= 0 && d <= 30; }).reduce((s, t) => s + Number(t.amount), 0);

  const doMesPagar = openItems.filter(t => isInCurrentRange(t.due_date)).reduce((s, t) => s + Number(t.amount), 0);
  const acumuladoAnteriorPagar = openItems.filter(t => isBeforeRange(t.due_date)).reduce((s, t) => s + Number(t.amount), 0);
  const totalAPagarAcumulado = doMesPagar + acumuladoAnteriorPagar;

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const transaction = transactions.find(t => t.id === id);
      const paidDate = localDateString();
      
      const { error } = await supabase.from("financial_transactions")
        .update({ status: "pago" as any, paid_date: paidDate })
        .eq("id", id);
      if (error) throw error;

      // Sync back to purchases/orders if linked
      if (transaction?.purchase_id) {
        await supabase.from("purchases").update({ payment_status: "pago" }).eq("id", transaction.purchase_id);
      }
      if (transaction?.purchase_order_id) {
        await supabase.from("purchase_orders" as any).update({ payment_status: "pago" }).eq("id", transaction.purchase_order_id);
        await supabase.from("purchases").update({ payment_status: "pago" }).eq("order_id", transaction.purchase_order_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["financial-saidas"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Pagamento registrado!" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const transaction = transactions.find(t => t.id === editId);
      const amountNum = parseFloat(editForm.amount);
      const isPaid = editForm.status === "pago";
      
      const payload: any = {
        due_date: editForm.due_date,
        description: editForm.description,
        amount: amountNum,
        category: editForm.category || null,
        status: editForm.status as any,
        payment_method: editForm.payment_method || null,
        account_id: editForm.account_id || null,
        paid_date: isPaid ? (transaction?.paid_date || localDateString()) : null,
      };
      const { error } = await supabase.from("financial_transactions").update(payload).eq("id", editId!);
      if (error) throw error;

      // Sync back to purchases/orders if linked
      if (transaction?.purchase_id) {
        await supabase.from("purchases")
          .update({ 
            payment_status: editForm.status,
            total: amountNum,
            due_date: editForm.due_date,
            payment_method: editForm.payment_method
          } as any)
          .eq("id", transaction.purchase_id);
      }
      if (transaction?.purchase_order_id) {
        await supabase.from("purchase_orders" as any)
          .update({ 
            payment_status: editForm.status,
            total: amountNum,
            due_date: editForm.due_date,
            payment_method: editForm.payment_method
          } as any)
          .eq("id", transaction.purchase_order_id);
        
        if (isPaid) {
          await supabase.from("purchases")
            .update({ payment_status: "pago" })
            .eq("order_id", transaction.purchase_order_id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["financial-saidas"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      setEditOpen(false);
      setEditId(null);
      toast({ title: "Conta atualizada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["financial-saidas"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      setDeleteTarget(null);
      setDeleteReason("");
      toast({ title: "Registro excluído!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const openEdit = (t: any) => {
    setEditId(t.id);
    setEditForm({
      due_date: t.due_date,
      description: t.description,
      amount: String(t.amount),
      category: t.category ?? "",
      status: t.status,
      payment_method: t.payment_method ?? "pix",
      account_id: t.account_id ?? "",
      notes: "",
    });
    setEditOpen(true);
  };

  const toggleSort = (field: "due_date" | "amount") => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  return (
    <div className="space-y-4">
      {dateRange && (acumuladoAnteriorPagar > 0 || doMesPagar > 0) && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-orange-600 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Composição do Saldo a Pagar</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div><p className="text-xs text-muted-foreground">Do mês</p><p className="text-lg font-bold text-red-600">{fmt(doMesPagar)}</p></div>
              <div><p className="text-xs text-muted-foreground">Acumulado anterior</p><p className="text-lg font-bold text-orange-600">{fmt(acumuladoAnteriorPagar)}</p></div>
              <div><p className="text-xs text-muted-foreground">Total a pagar</p><p className="text-lg font-bold">{fmt(totalAPagarAcumulado)}</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> Total a Pagar</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalAberto)}</p></CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Vencido</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalVencido)}</p></CardContent>
        </Card>
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-yellow-600 flex items-center gap-2"><Clock className="h-4 w-4" /> Próximos 7 dias</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-yellow-600">{fmt(total7d)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> Próximos 30 dias</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmt(total30d)}</p></CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por descrição..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="a_vencer">A Vencer</SelectItem>
            <SelectItem value="vencido">Vencidos</SelectItem>
            <SelectItem value="pago">Pagos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={showAllPending ? "default" : "outline"} size="sm" onClick={() => setShowAllPending(!showAllPending)} className="flex items-center gap-1">
          <Eye className="h-4 w-4" />
          {showAllPending ? "Filtrar por mês" : "Ver todos pendentes"}
        </Button>
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("due_date")}>Vencimento <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("amount")}>Valor <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-36">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(t => {
              const days = daysUntil(t.due_date);
              const rowClass = t.computedStatus === "vencido"
                ? "bg-red-50 dark:bg-red-950/20"
                : (t.computedStatus === "a_vencer" && days <= 7 ? "bg-yellow-50 dark:bg-yellow-950/20" : "");
              const badge = statusBadge[t.computedStatus];
              return (
                <TableRow key={t.id} className={`${rowClass} ${t.computedStatus === "pago" ? "opacity-60" : ""}`}>
                  <TableCell>{formatDateBR(t.due_date)}</TableCell>
                  <TableCell className="font-medium max-w-[250px] truncate">{t.description}</TableCell>
                  <TableCell>{t.category ?? "—"}</TableCell>
                  <TableCell>{t.account_id ? (accounts.find(a => a.id === t.account_id)?.name ?? "—") : "—"}</TableCell>
                  <TableCell className="font-semibold">{fmt(Number(t.amount))}</TableCell>
                  <TableCell><Badge className={badge.className}>{badge.label}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {t.computedStatus !== "pago" && (
                        <Button size="sm" variant="outline" onClick={() => markPaid.mutate(t.id)} disabled={markPaid.isPending}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Pagar
                        </Button>
                      )}
                      {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(t.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma conta a pagar encontrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={v => { setEditOpen(v); if (!v) setEditId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Conta a Pagar</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); editMutation.mutate(); }} className="space-y-3">
            <div><Label>Descrição *</Label><Input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" min="0.01" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} required /></div>
              <div><Label>Vencimento *</Label><Input type="date" value={editForm.due_date} onChange={e => setEditForm({ ...editForm, due_date: e.target.value })} required /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Categoria</Label>
                <Select value={editForm.category || "__none__"} onValueChange={v => setEditForm({ ...editForm, category: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Forma de Pagamento</Label>
                <Select value={editForm.payment_method} onValueChange={v => setEditForm({ ...editForm, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{paymentMethods.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Conta</Label>
                <Select value={editForm.account_id || "__none__"} onValueChange={v => setEditForm({ ...editForm, account_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Observações</Label><Textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={editMutation.isPending}>Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) { setDeleteTarget(null); setDeleteReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-destructive">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este registro?</p>
          <div><Label>Motivo da Exclusão *</Label><Textarea value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="Informe o motivo..." /></div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteReason(""); }}>Cancelar</Button>
            <Button variant="destructive" disabled={!deleteReason.trim() || deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
