import { localDateString } from "@/lib/utils";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, DollarSign, Receipt, AlertCircle, Trash2, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import MonthFilter, { getDateRange, type PeriodMode } from "@/components/MonthFilter";

const Billing = () => {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [payDialog, setPayDialog] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "pix", date: localDateString() });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Fetch approved quotes with client info (primary billing source)
  const { data: approvedQuotes = [] } = useQuery({
    queryKey: ["billing-quotes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("*, clients(name)")
        .eq("status", "aprovado")
        .order("approved_at", { ascending: false });
      return data ?? [];
    },
  });

  // Fetch financial transactions linked to work orders from approved quotes
  const { data: transactions = [] } = useQuery({
    queryKey: ["billing-transactions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_transactions")
        .select("*")
        .eq("type", "a_receber");
      return data ?? [];
    },
  });

  // Fetch work orders to map quote_id -> wo_id for transaction matching
  const { data: workOrders = [] } = useQuery({
    queryKey: ["billing-work-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("work_orders").select("id, quote_id, client_id");
      return data ?? [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["billing-clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return data ?? [];
    },
  });

  // Enrich quotes with payment data from financial transactions
  const enrichedQuotes = useMemo(() => {
    return approvedQuotes.map((q: any) => {
      const wo = workOrders.find((w: any) => w.quote_id === q.id);
      const woId = wo?.id;

      // Sum paid transactions for this work order
      const paidTransactions = transactions.filter(
        (t) => t.work_order_id === woId && t.status === "pago"
      );
      const totalPaid = paidTransactions.reduce((s, t) => s + Number(t.amount), 0);
      const quoteTotal = Number(q.total);
      const remaining = Math.max(quoteTotal - totalPaid, 0);

      let paymentStatus: "pago" | "pendente" | "parcial" = "pendente";
      if (totalPaid >= quoteTotal && quoteTotal > 0) paymentStatus = "pago";
      else if (totalPaid > 0) paymentStatus = "parcial";

      // Get the latest paid_date for period filtering
      const latestPayDate = paidTransactions.length > 0
        ? paidTransactions.reduce((latest, t) => {
            const d = t.paid_date ? new Date(t.paid_date) : new Date(0);
            return d > latest ? d : latest;
          }, new Date(0))
        : null;

      return {
        ...q,
        woId,
        clientName: q.clients?.name ?? "—",
        totalPaid,
        remaining,
        paymentStatus,
        approvedDate: q.approved_at ? new Date(q.approved_at) : null,
        latestPayDate,
      };
    });
  }, [approvedQuotes, transactions, workOrders]);

  const periodRange = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);

  const filtered = useMemo(() => {
    return enrichedQuotes.filter((o) => {
      // Use approved_at for period filtering
      const refDate = o.approvedDate;
      const inPeriod = refDate ? refDate >= periodRange.start && refDate <= periodRange.end : true;
      const matchSearch = (o.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
        o.clientName.toLowerCase().includes(search.toLowerCase()) ||
        o.id.toLowerCase().includes(search.toLowerCase());
      const matchClient = clientFilter === "all" || o.client_id === clientFilter;
      const matchStatus = statusFilter === "all" || o.paymentStatus === statusFilter;
      return inPeriod && matchSearch && matchClient && matchStatus;
    });
  }, [enrichedQuotes, periodRange, search, clientFilter, statusFilter]);

  const totalBilled = filtered.reduce((s, o) => s + Number(o.total), 0);
  const totalReceived = filtered.reduce((s, o) => s + o.totalPaid, 0);
  const totalOpen = filtered.reduce((s, o) => s + o.remaining, 0);
  const count = filtered.length;
  const ticketMedio = count > 0 ? totalBilled / count : 0;
  const maxBilling = count > 0 ? Math.max(...filtered.map(o => Number(o.total))) : 0;
  const minBilling = count > 0 ? Math.min(...filtered.map(o => Number(o.total))) : 0;

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const paymentStatusColors: Record<string, string> = {
    pago: "bg-green-500/10 text-green-700 border-green-500/20",
    pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
    parcial: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  };
  const paymentStatusLabels: Record<string, string> = { pago: "Pago", pendente: "Pendente", parcial: "Parcial" };

  const registerPayment = useMutation({
    mutationFn: async (quoteId: string) => {
      const q = enrichedQuotes.find((o) => o.id === quoteId);
      if (!q) throw new Error("Orçamento não encontrado");
      const amount = parseFloat(payForm.amount);
      if (!amount || amount <= 0) throw new Error("Valor inválido");

      // Create paid financial transaction
      const { error } = await supabase.from("financial_transactions").insert({
        type: "a_receber" as any,
        description: `Recebimento - ${q.clientName} (Orçamento ${q.id.slice(0, 8)})`,
        amount,
        due_date: payForm.date,
        paid_date: payForm.date,
        status: "pago" as any,
        category: `Faturamento - ${payForm.method}`,
        work_order_id: q.woId || null,
        client_id: q.client_id,
      });
      if (error) throw error;

      // Update quote payment status
      const totalPaidNow = q.totalPaid + amount;
      const quoteTotal = Number(q.total);
      const newRemaining = Math.max(quoteTotal - totalPaidNow, 0);
      const newStatus = totalPaidNow >= quoteTotal ? "pago_total" : "entrada_recebida";

      await supabase.from("quotes").update({
        down_payment: totalPaidNow,
        remaining_amount: newRemaining,
        payment_status: newStatus,
      } as any).eq("id", q.id);

      // If fully paid, mark pending financial transactions as paid
      if (totalPaidNow >= quoteTotal && q.woId) {
        const { data: pendingTxns } = await supabase.from("financial_transactions")
          .select("id")
          .eq("work_order_id", q.woId)
          .eq("status", "pendente")
          .eq("type", "a_receber");
        for (const txn of pendingTxns ?? []) {
          await supabase.from("financial_transactions").update({
            status: "pago" as any,
            paid_date: payForm.date,
          }).eq("id", txn.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["billing-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["financial-entradas"] });
      queryClient.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      queryClient.invalidateQueries({ queryKey: ["account-movements-list"] });
      queryClient.invalidateQueries({ queryKey: ["account-movements-all"] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      setPayDialog(null);
      setPayForm({ amount: "", method: "pix", date: localDateString() });
      toast({ title: "Recebimento registrado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      setDeleteTarget(null);
      toast({ title: "Registro removido!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const openPayDialog = (quoteId: string) => {
    const q = enrichedQuotes.find((o) => o.id === quoteId);
    setPayForm({ amount: String(q?.remaining ?? 0), method: "pix", date: localDateString() });
    setPayDialog(quoteId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Faturamento</h1>
        <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Faturado</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(totalBilled)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Recebido</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{fmt(totalReceived)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Em Aberto</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{fmt(totalOpen)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Qtd. OSs</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{count}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Maior</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(maxBilling)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(ticketMedio)}</div></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Cliente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pago">Pago</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="parcial">Parcial</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar orçamento, cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Orçamento/OS</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="hidden md:table-cell">Descrição</TableHead>
              <TableHead className="hidden md:table-cell">Aprovação</TableHead>
              <TableHead>Valor Total</TableHead>
              <TableHead>Recebido</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}</TableCell>
                <TableCell className="font-medium">{o.clientName}</TableCell>
                <TableCell className="hidden md:table-cell max-w-[200px] truncate">{o.description ?? "—"}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {o.approvedDate ? format(o.approvedDate, "dd/MM/yyyy") : "—"}
                </TableCell>
                <TableCell>{fmt(Number(o.total))}</TableCell>
                <TableCell className="text-green-600">{fmt(o.totalPaid)}</TableCell>
                <TableCell className="text-yellow-600">{fmt(o.remaining)}</TableCell>
                <TableCell>
                  <Badge className={paymentStatusColors[o.paymentStatus]}>
                    {paymentStatusLabels[o.paymentStatus]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {o.paymentStatus !== "pago" && (
                      <Button size="sm" variant="outline" onClick={() => openPayDialog(o.id)}>
                        Receber
                      </Button>
                    )}
                    {userRole === "admin" && (
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(o.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Nenhum orçamento faturado encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Payment Dialog */}
      <Dialog open={!!payDialog} onOpenChange={(v) => !v && setPayDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Recebimento</DialogTitle></DialogHeader>
          {payDialog && (() => {
            const q = enrichedQuotes.find((o) => o.id === payDialog);
            return (
              <form onSubmit={(e) => { e.preventDefault(); registerPayment.mutate(payDialog); }} className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  Orçamento: {payDialog.slice(0, 8)} — {q?.clientName}<br />
                  Valor total: {fmt(Number(q?.total ?? 0))} | Já recebido: {fmt(q?.totalPaid ?? 0)} | Saldo: {fmt(q?.remaining ?? 0)}
                </div>
                <div><Label>Valor a receber (R$) *</Label>
                  <Input type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} required />
                </div>
                <div><Label>Forma de Pagamento</Label>
                  <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Data do Recebimento *</Label>
                  <Input type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} required />
                </div>
                <Button type="submit" className="w-full" disabled={registerPayment.isPending}>Registrar Recebimento</Button>
              </form>
            );
          })()}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        isPending={deleteMutation.isPending}
        description="Tem certeza que deseja excluir este registro de faturamento? O orçamento e todos os dados relacionados (OS, transações financeiras, comissões) serão removidos."
      />
    </div>
  );
};

export default Billing;
