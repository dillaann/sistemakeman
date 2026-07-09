import { compareDateStrings, formatDateBR, localDateString } from "@/lib/utils";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Pencil, ArrowUpDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

import { isInRange } from "@/components/MonthFilter";
import FinancialReportDialog from "./FinancialReportDialog";
import { useFinancialCategories } from "@/hooks/useFinancialCategories";

interface SaidasTabProps {
  dateRange?: { start: Date; end: Date };
}

const statusColors: Record<string, string> = {
  pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  pago: "bg-green-500/10 text-green-700 border-green-500/20",
  atrasado: "bg-red-500/10 text-red-700 border-red-500/20",
  cancelado: "bg-muted text-muted-foreground border-muted",
};
const statusLabels: Record<string, string> = { pendente: "Pendente", pago: "Pago", atrasado: "Atrasado", cancelado: "Cancelado" };

const paymentMethods = [
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "boleto", label: "Boleto" },
  { value: "cheque", label: "Cheque" },
  { value: "cartao_credito", label: "Cartão Crédito" },
  { value: "cartao_debito", label: "Cartão Débito" },
  { value: "transferencia", label: "Transferência Bancária" },
];
const paymentMethodLabel = (v: string | null) => paymentMethods.find(p => p.value === v)?.label ?? "—";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function SaidasTab({ dateRange }: SaidasTabProps) {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const qc = useQueryClient();
  const { categories: catList } = useFinancialCategories("saida");
  const categorias = catList.map(c => c.name);
  const [search, setSearch] = useState("");
  
  const [catFilter, setCatFilter] = useState("all");
  const [pmFilter, setPmFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<"due_date" | "amount">("due_date");
  const [sortAsc, setSortAsc] = useState(false);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [form, setForm] = useState({ description: "", amount: "", due_date: "", category: "Material", status: "pendente", notes: "", payment_method: "pix", account_id: "" });

  const resetForm = () => setForm({ description: "", amount: "", due_date: "", category: "Material", status: "pendente", notes: "", payment_method: "pix", account_id: "" });

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts-active"],
    queryFn: async () => { const { data } = await supabase.from("financial_accounts").select("id, name").eq("active", true).order("name"); return data ?? []; },
  });

  const rangeStart = dateRange ? localDateString(dateRange.start) : null;
  const rangeEnd = dateRange ? localDateString(dateRange.end) : null;

  const { data: transactions = [] } = useQuery({
    queryKey: ["financial-saidas", rangeStart, rangeEnd],
    queryFn: async () => {
      const rangeFilter = rangeStart && rangeEnd
        ? `and(paid_date.gte.${rangeStart},paid_date.lte.${rangeEnd}),and(paid_date.is.null,due_date.gte.${rangeStart},due_date.lte.${rangeEnd})`
        : null;
      // Paginate past the 1000-row response cap so totals reflect ALL records.
      const data = await fetchAllRows<any>(() => {
        let q = supabase.from("financial_transactions").select("*").eq("type", "a_pagar");
        if (rangeFilter) q = q.or(rangeFilter);
        return q.order("due_date", { ascending: false });
      });
      return data;
    },
  });

  const filtered = useMemo(() => {
    let list = transactions.filter(t => {
      // Saídas = regime de caixa: só entram saídas REALMENTE pagas.
      // Pendentes/atrasadas ficam na aba "A Pagar" até serem quitadas.
      if (t.status !== "pago") return false;
      // prioritize paid_date if available, otherwise fallback to due_date
      const refDate = t.paid_date || t.due_date;
      if (dateRange && !isInRange(refDate, dateRange)) return false;
      if (catFilter !== "all" && (t.category ?? "") !== catFilter) return false;
      if (pmFilter !== "all" && ((t as any).payment_method ?? "") !== pmFilter) return false;
      if (dateFrom && refDate < dateFrom) return false;
      if (dateTo && refDate > dateTo) return false;
      const text = search.toLowerCase();
      if (text && !t.description.toLowerCase().includes(text) && !(t.category ?? "").toLowerCase().includes(text)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sortField === "amount") {
        const amountDiff = Number(a.amount) - Number(b.amount);
        return sortAsc ? amountDiff : -amountDiff;
      }
      const dateA = a.paid_date ?? a.due_date;
      const dateB = b.paid_date ?? b.due_date;
      const dateDiff = compareDateStrings(dateA, dateB);
      return sortAsc ? dateDiff : -dateDiff;
    });
    return list;
  }, [transactions, catFilter, pmFilter, dateFrom, dateTo, search, sortField, sortAsc, dateRange]);

  const total = filtered.filter(t => t.status === "pago").reduce((s, t) => s + Number(t.amount), 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        type: "a_pagar" as const,
        description: form.description,
        amount: parseFloat(form.amount),
        due_date: form.due_date,
        category: form.category || null,
        status: form.status as any,
        paid_date: form.status === "pago" ? form.due_date : null,
        payment_method: form.payment_method || null,
        account_id: form.account_id || null,
      };
      if (editId) {
        const { error } = await supabase.from("financial_transactions").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financial_transactions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-saidas"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      setOpen(false); setEditId(null);
      resetForm();
      toast({ 
        title: editId ? "Saída atualizada!" : "Saída criada!",
        description: "Transação financeira registrada com sucesso."
      });
    },
    onError: (e: any) => {
      console.error("Erro ao salvar saída:", e);
      toast({ 
        title: "Erro", 
        description: e.message || "Falha ao persistir a saída financeira.", 
        variant: "destructive" 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["financial-saidas"] }); qc.invalidateQueries({ queryKey: ["financial"] }); setDeleteTarget(null); setDeleteReason(""); toast({ title: "Transação removida!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const openEdit = (t: any) => {
    setEditId(t.id);
    setForm({ description: t.description, amount: String(t.amount), due_date: t.due_date, category: t.category ?? "Outros", status: t.status, notes: "", payment_method: t.payment_method ?? "pix", account_id: t.account_id ?? "" });
    setOpen(true);
  };

  const toggleSort = (field: "due_date" | "amount") => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="rounded-lg border p-4 flex-1 min-w-[200px]">
          <p className="text-sm text-muted-foreground">Total Pago no Período</p>
          <p className="text-2xl font-bold text-red-600">{fmt(total)}</p>
        </div>
        <div className="flex gap-2">
          <FinancialReportDialog
            type="saidas"
            transactions={filtered.map(t => ({ date: t.paid_date ?? t.due_date, description: t.description, category: t.category ?? "", amount: Number(t.amount), status: t.status }))}
            categories={categorias}
            periodLabel={dateRange ? `${dateRange.start.toLocaleDateString("pt-BR")} a ${dateRange.end.toLocaleDateString("pt-BR")}` : "Todos"}
          />
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); resetForm(); } }}>
          <DialogTrigger asChild><Button variant="outline"><Plus className="h-4 w-4 mr-2" />Nova Saída</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Editar Saída" : "Nova Saída"}</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
              <div><Label>Descrição *</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required maxLength={255} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
                <div><Label>Data *</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Categoria *</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Forma de Pagamento</Label>
                  <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{paymentMethods.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Conta</Label>
                  <Select value={form.account_id} onValueChange={v => setForm({ ...form, account_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                    <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} maxLength={500} className="min-h-[100px] resize-y" /></div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={pmFilter} onValueChange={setPmFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Forma Pgto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {paymentMethods.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[150px]" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[150px]" />
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("due_date")}>Data <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("amount")}>Valor <ArrowUpDown className="inline h-3 w-3" /></TableHead>
              <TableHead>Forma Pgto</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="w-28">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(t => (
              <TableRow key={t.id} className={`${statusColors[t.status] || ""} ${t.status === "cancelado" ? "opacity-50" : ""}`}>
                <TableCell>{formatDateBR(t.paid_date ?? t.due_date)}</TableCell>
                <TableCell className="font-medium max-w-[250px] truncate">{t.description}</TableCell>
                <TableCell>{t.category ?? "—"}</TableCell>
                <TableCell className="font-semibold">{fmt(Number(t.amount))}</TableCell>
                <TableCell>{paymentMethodLabel((t as any).payment_method)}</TableCell>
                <TableCell>{t.work_order_id ? `OS vinculada` : "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {(userRole === "admin" || userRole === "financeiro") && <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>}
                    {userRole === "admin" && <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma saída encontrada.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) { setDeleteTarget(null); setDeleteReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-destructive">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta transação?</p>
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
