import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, ArrowRightLeft, TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isInRange } from "@/components/MonthFilter";

interface MovimentacoesTabProps {
  dateRange?: { start: Date; end: Date };
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const categorias = [
  "Pagamento de fornecedor",
  "Recebimento de cliente",
  "Transferência entre contas",
  "Despesa administrativa",
  "Folha de pagamento",
  "Comissão",
  "Outros",
];

const typeLabels: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  transferencia_entrada: "Transf. Entrada",
  transferencia_saida: "Transf. Saída",
};

type FormType = "entrada" | "saida" | "transferencia";

export default function MovimentacoesTab({ dateRange }: MovimentacoesTabProps) {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [formType, setFormType] = useState<FormType>("entrada");
  const [form, setForm] = useState({
    account_id: "",
    dest_account_id: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    category: "Outros",
    description: "",
    notes: "",
  });
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_accounts").select("*").eq("active", true).order("name");
      return data ?? [];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["account-movements-list"],
    queryFn: async () => {
      const { data } = await supabase.from("account_movements").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return movements.filter(m => {
      if (dateRange && !isInRange(m.date, dateRange)) return false;
      if (filterAccount !== "all" && m.account_id !== filterAccount) return false;
      if (filterType === "entrada" && m.type !== "entrada" && m.type !== "transferencia_entrada") return false;
      if (filterType === "saida" && m.type !== "saida" && m.type !== "transferencia_saida") return false;
      if (dateFrom && m.date < dateFrom) return false;
      if (dateTo && m.date > dateTo) return false;
      return true;
    });
  }, [movements, filterAccount, filterType, dateFrom, dateTo]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(form.amount);
      if (!amount || amount <= 0) throw new Error("Valor inválido");

      if (formType === "transferencia") {
        if (!form.account_id || !form.dest_account_id) throw new Error("Selecione as contas");
        if (form.account_id === form.dest_account_id) throw new Error("As contas devem ser diferentes");

        const { error: e1 } = await supabase.from("account_movements").insert({
          account_id: form.account_id,
          type: "transferencia_saida",
          amount,
          date: form.date,
          category: "Transferência entre contas",
          description: `Transferência para ${accounts.find(a => a.id === form.dest_account_id)?.name ?? "conta"}`,
          related_account_id: form.dest_account_id,
          notes: form.notes || null,
        });
        if (e1) throw e1;

        const { error: e2 } = await supabase.from("account_movements").insert({
          account_id: form.dest_account_id,
          type: "transferencia_entrada",
          amount,
          date: form.date,
          category: "Transferência entre contas",
          description: `Transferência de ${accounts.find(a => a.id === form.account_id)?.name ?? "conta"}`,
          related_account_id: form.account_id,
          notes: form.notes || null,
        });
        if (e2) throw e2;
        return;
      }

      if (!form.account_id) throw new Error("Selecione a conta");
      const txType = formType === "entrada" ? "a_receber" : "a_pagar";
      const { error } = await supabase.from("financial_transactions").insert({
        type: txType as any,
        status: "pago" as any,
        description: form.description,
        amount,
        due_date: form.date,
        paid_date: form.date,
        category: form.category || null,
        account_id: form.account_id,
        sync_origin: "manual_financial",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account-movements-list"] });
      qc.invalidateQueries({ queryKey: ["account-movements-all"] });
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
      qc.invalidateQueries({ queryKey: ["financial-entradas"] });
      qc.invalidateQueries({ queryKey: ["financial-saidas"] });
      qc.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      setOpen(false);
      setForm({ account_id: "", dest_account_id: "", amount: "", date: new Date().toISOString().split("T")[0], category: "Outros", description: "", notes: "" });
      toast({ title: "Movimentação registrada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const movement = movements.find(m => m.id === id);
      // Delete linked financial_transaction if exists
      if (movement?.financial_transaction_id) {
        await supabase.from("financial_transactions").delete().eq("id", movement.financial_transaction_id);
      }
      const { error } = await supabase.from("account_movements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account-movements-list"] });
      qc.invalidateQueries({ queryKey: ["account-movements-all"] });
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
      qc.invalidateQueries({ queryKey: ["financial-entradas"] });
      qc.invalidateQueries({ queryKey: ["financial-saidas"] });
      qc.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      setDeleteTarget(null);
      setDeleteReason("");
      toast({ title: "Movimentação excluída!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const getAccountName = (id: string | null) => {
    if (!id) return "—";
    return accounts.find(a => a.id === id)?.name ?? "—";
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-semibold text-lg">Movimentações</h3>
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setForm({ account_id: "", dest_account_id: "", amount: "", date: new Date().toISOString().split("T")[0], category: "Outros", description: "", notes: "" }); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nova Movimentação</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Movimentação</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
              {/* Type selector */}
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={formType === "entrada" ? "default" : "outline"} onClick={() => setFormType("entrada")} className="flex-1">
                  <TrendingUp className="h-4 w-4 mr-1" />Entrada
                </Button>
                <Button type="button" size="sm" variant={formType === "saida" ? "default" : "outline"} onClick={() => setFormType("saida")} className="flex-1">
                  <TrendingDown className="h-4 w-4 mr-1" />Saída
                </Button>
                <Button type="button" size="sm" variant={formType === "transferencia" ? "default" : "outline"} onClick={() => setFormType("transferencia")} className="flex-1">
                  <ArrowRightLeft className="h-4 w-4 mr-1" />Transferência
                </Button>
              </div>

              {formType === "transferencia" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Conta Origem *</Label>
                    <Select value={form.account_id} onValueChange={v => setForm({ ...form, account_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Conta Destino *</Label>
                    <Select value={form.dest_account_id} onValueChange={v => setForm({ ...form, dest_account_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{accounts.filter(a => a.id !== form.account_id).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div>
                  <Label>Conta *</Label>
                  <Select value={form.account_id} onValueChange={v => setForm({ ...form, account_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
                <div><Label>Data *</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required /></div>
              </div>

              {formType !== "transferencia" && (
                <>
                  <div><Label>Descrição *</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required /></div>
                  <div>
                    <Label>Categoria</Label>
                    <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>Registrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={filterAccount} onValueChange={setFilterAccount}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Conta" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as contas</SelectItem>
            {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="entrada">Entradas</SelectItem>
            <SelectItem value="saida">Saídas</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[150px]" />
        <span className="flex items-center text-muted-foreground">a</span>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[150px]" />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto max-h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              {userRole === "admin" && <TableHead className="w-12">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(m => {
              const isCredit = m.type === "entrada" || m.type === "transferencia_entrada";
              return (
                <TableRow key={m.id}>
                  <TableCell>{new Date(m.date).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{getAccountName(m.account_id)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={isCredit ? "text-green-700 border-green-500/30" : "text-red-700 border-red-500/30"}>
                      {typeLabels[m.type] ?? m.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[250px] truncate">{m.description}</TableCell>
                  <TableCell>{m.category ?? "—"}</TableCell>
                  <TableCell className={`text-right font-medium ${isCredit ? "text-green-700" : "text-red-700"}`}>
                    {isCredit ? "+" : "-"}{fmt(Number(m.amount))}
                  </TableCell>
                  {userRole === "admin" && (
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(m.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={userRole === "admin" ? 7 : 6} className="text-center text-muted-foreground py-8">Nenhuma movimentação encontrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) { setDeleteTarget(null); setDeleteReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-destructive">Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta movimentação? A transação financeira vinculada também será removida.</p>
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
