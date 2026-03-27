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
import { useToast } from "@/hooks/use-toast";
import { Search, DollarSign, Receipt, AlertCircle } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, startOfYear, endOfYear } from "date-fns";

type PeriodFilter = "week" | "month" | "quarter" | "year";

const Billing = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [payDialog, setPayDialog] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "pix", date: new Date().toISOString().split("T")[0] });

  // Fetch completed/delivered work orders with client info
  const { data: workOrders = [] } = useQuery({
    queryKey: ["billing-work-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_orders")
        .select("*, clients(name)")
        .in("status", ["concluido", "entregue"])
        .order("completed_at", { ascending: false });
      return data ?? [];
    },
  });

  // Fetch related financial transactions for these work orders
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

  const { data: clients = [] } = useQuery({
    queryKey: ["billing-clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return data ?? [];
    },
  });

  // Calculate payment status per work order
  const enrichedOrders = useMemo(() => {
    return workOrders.map((wo: any) => {
      const woTransactions = transactions.filter((t) => t.work_order_id === wo.id);
      const totalPaid = woTransactions
        .filter((t) => t.status === "pago")
        .reduce((s, t) => s + Number(t.amount), 0);
      const totalPending = woTransactions
        .filter((t) => t.status === "pendente")
        .reduce((s, t) => s + Number(t.amount), 0);
      const woTotal = Number(wo.total);

      let paymentStatus: "pago" | "pendente" | "parcial" = "pendente";
      if (totalPaid >= woTotal && woTotal > 0) paymentStatus = "pago";
      else if (totalPaid > 0) paymentStatus = "parcial";

      return {
        ...wo,
        clientName: wo.clients?.name ?? "—",
        totalPaid,
        totalPending,
        remaining: Math.max(woTotal - totalPaid, 0),
        paymentStatus,
      };
    });
  }, [workOrders, transactions]);

  // Period filter
  const periodRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "week": return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case "month": return { start: startOfMonth(now), end: endOfMonth(now) };
      case "quarter": return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
      case "year": return { start: startOfYear(now), end: endOfYear(now) };
    }
  }, [period]);

  const filtered = useMemo(() => {
    return enrichedOrders.filter((o) => {
      const completedDate = o.completed_at ? new Date(o.completed_at) : null;
      const inPeriod = completedDate ? completedDate >= periodRange.start && completedDate <= periodRange.end : true;
      const matchSearch = (o.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
        o.clientName.toLowerCase().includes(search.toLowerCase()) ||
        o.id.toLowerCase().includes(search.toLowerCase());
      const matchClient = clientFilter === "all" || o.client_id === clientFilter;
      const matchStatus = statusFilter === "all" || o.paymentStatus === statusFilter;
      return inPeriod && matchSearch && matchClient && matchStatus;
    });
  }, [enrichedOrders, periodRange, search, clientFilter, statusFilter]);

  const totalBilled = filtered.reduce((s, o) => s + Number(o.total), 0);
  const totalReceived = filtered.reduce((s, o) => s + o.totalPaid, 0);
  const totalOpen = filtered.reduce((s, o) => s + o.remaining, 0);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const paymentStatusColors: Record<string, string> = {
    pago: "bg-green-500/10 text-green-700 border-green-500/20",
    pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
    parcial: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  };
  const paymentStatusLabels: Record<string, string> = { pago: "Pago", pendente: "Pendente", parcial: "Parcial" };

  const registerPayment = useMutation({
    mutationFn: async (woId: string) => {
      const wo = enrichedOrders.find((o) => o.id === woId);
      if (!wo) throw new Error("OS não encontrada");
      const amount = parseFloat(payForm.amount);
      if (!amount || amount <= 0) throw new Error("Valor inválido");

      const { error } = await supabase.from("financial_transactions").insert({
        type: "a_receber" as any,
        description: `Recebimento OS ${wo.id.slice(0, 8)} - ${wo.clientName}`,
        amount,
        due_date: payForm.date,
        paid_date: payForm.date,
        status: "pago" as any,
        category: `Faturamento - ${payForm.method}`,
        work_order_id: wo.id,
        client_id: wo.client_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      setPayDialog(null);
      setPayForm({ amount: "", method: "pix", date: new Date().toISOString().split("T")[0] });
      toast({ title: "Recebimento registrado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const openPayDialog = (woId: string) => {
    const wo = enrichedOrders.find((o) => o.id === woId);
    setPayForm({ amount: String(wo?.remaining ?? 0), method: "pix", date: new Date().toISOString().split("T")[0] });
    setPayDialog(woId);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Faturamento</h1>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
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
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="month">Mês</SelectItem>
            <SelectItem value="quarter">Trimestre</SelectItem>
            <SelectItem value="year">Ano</SelectItem>
          </SelectContent>
        </Select>
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
          <Input placeholder="Buscar OS, cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OS</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="hidden md:table-cell">Descrição</TableHead>
              <TableHead className="hidden md:table-cell">Conclusão</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Recebido</TableHead>
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
                  {o.completed_at ? format(new Date(o.completed_at), "dd/MM/yyyy") : "—"}
                </TableCell>
                <TableCell>{fmt(Number(o.total))}</TableCell>
                <TableCell>{fmt(o.totalPaid)}</TableCell>
                <TableCell>
                  <Badge className={paymentStatusColors[o.paymentStatus]}>
                    {paymentStatusLabels[o.paymentStatus]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {o.paymentStatus !== "pago" && (
                    <Button size="sm" variant="outline" onClick={() => openPayDialog(o.id)}>
                      Receber
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhuma OS faturada encontrada.
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
            const wo = enrichedOrders.find((o) => o.id === payDialog);
            return (
              <form onSubmit={(e) => { e.preventDefault(); registerPayment.mutate(payDialog); }} className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  OS: {payDialog.slice(0, 8)} — {wo?.clientName}<br />
                  Valor total: {fmt(Number(wo?.total ?? 0))} | Já recebido: {fmt(wo?.totalPaid ?? 0)} | Saldo: {fmt(wo?.remaining ?? 0)}
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
    </div>
  );
};

export default Billing;
