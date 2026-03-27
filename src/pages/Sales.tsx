import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trophy, DollarSign, Target, TrendingUp, Check, ShoppingBag, Trash2 } from "lucide-react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";

const statusColors: Record<string, string> = {
  aguardando: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  em_producao: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  concluido: "bg-green-500/10 text-green-700 border-green-500/20",
  entregue: "bg-purple-500/10 text-purple-700 border-purple-500/20",
};
const statusLabels: Record<string, string> = { aguardando: "Aguardando", em_producao: "Em Produção", concluido: "Concluído", entregue: "Entregue" };
const commStatusLabels: Record<string, string> = { pendente: "Pendente", aprovada: "Aprovada", paga: "Paga" };
const commStatusColors: Record<string, string> = {
  pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  aprovada: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  paga: "bg-green-500/10 text-green-700 border-green-500/20",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const Sales = () => {
  const { userRole } = useAuth();
  return userRole === "admin" ? <AdminSalesView /> : <SellerSalesView />;
};

// ─── SELLER VIEW ───
const SellerSalesView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [form, setForm] = useState({ client_id: "", description: "", amount: "", delivery_deadline: "", notes: "" });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => { const { data } = await supabase.from("clients").select("id, name").order("name"); return data ?? []; },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["my-sales"],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("*, clients(name)").eq("seller_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: myGoal } = useQuery({
    queryKey: ["my-goal"],
    queryFn: async () => {
      const n = new Date();
      const monthKey = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
      const { data } = await supabase.from("sales_goals").select("goal_amount").eq("seller_id", user!.id).eq("month_ref", monthKey).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: myCommissions = [] } = useQuery({
    queryKey: ["my-commissions"],
    queryFn: async () => {
      const { data } = await supabase.from("sales_commissions").select("amount, percentage, status, sales(description, clients(name))").eq("seller_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlySales = sales.filter(s => new Date(s.created_at) >= monthStart);
  const monthlyTotal = monthlySales.reduce((s, sale) => s + Number(sale.amount), 0);
  const monthlyCommissions = myCommissions.reduce((s, c) => s + Number(c.amount), 0);
  const goalAmount = myGoal?.goal_amount ? Number(myGoal.goal_amount) : 0;
  const goalProgress = goalAmount > 0 ? Math.min((monthlyTotal / goalAmount) * 100, 100) : 0;

  const createClientMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("clients").insert({ name: newClientName, phone: newClientPhone || null }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setForm({ ...form, client_id: data.id });
      setNewClientOpen(false);
      setNewClientName("");
      setNewClientPhone("");
      toast({ title: "Cliente cadastrado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(form.amount) || 0;
      // Create work order
      const { data: wo, error: woErr } = await supabase.from("work_orders").insert({
        client_id: form.client_id,
        description: form.description,
        total: amount,
        status: "aguardando" as any,
        priority: "normal",
      }).select("id").single();
      if (woErr) throw woErr;

      // Create sale (commission will be created by admin)
      const { error: saleErr } = await supabase.from("sales").insert({
        seller_id: user!.id,
        client_id: form.client_id,
        work_order_id: wo.id,
        description: form.description,
        amount,
        delivery_deadline: form.delivery_deadline || null,
        notes: form.notes || null,
        status: "aguardando",
      });
      if (saleErr) throw saleErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-sales"] });
      queryClient.invalidateQueries({ queryKey: ["my-commissions"] });
      setOpen(false);
      setForm({ client_id: "", description: "", amount: "", delivery_deadline: "", notes: "" });
      toast({ title: "Venda registrada com sucesso!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Minhas Vendas</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Nova Venda</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Registrar Nova Venda</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
              <div>
                <Label>Cliente *</Label>
                <div className="flex gap-2">
                  <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
                    <DialogTrigger asChild><Button type="button" variant="outline" size="icon"><Plus className="h-4 w-4" /></Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <div><Label>Nome *</Label><Input value={newClientName} onChange={e => setNewClientName(e.target.value)} required /></div>
                        <div><Label>Telefone</Label><Input value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} /></div>
                        <Button onClick={() => createClientMutation.mutate()} disabled={!newClientName} className="w-full">Cadastrar</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              <div><Label>Descrição do serviço/produto *</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required /></div>
              <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
              <div><Label>Prazo de entrega</Label><Input type="date" value={form.delivery_deadline} onChange={e => setForm({ ...form, delivery_deadline: e.target.value })} /></div>
              <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending || !form.client_id || !form.description}>
                {saveMutation.isPending ? "Salvando..." : "Registrar Venda"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vendas no Mês</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(monthlyTotal)}</div>
            <p className="text-xs text-muted-foreground">{monthlySales.length} vendas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Comissões a Receber</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{fmt(monthlyCommissions)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Meta do Mês</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {goalAmount > 0 ? (
              <>
                <div className="text-2xl font-bold">{goalProgress.toFixed(0)}%</div>
                <Progress value={goalProgress} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">{fmt(monthlyTotal)} / {fmt(goalAmount)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma meta definida</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sales list */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="hidden md:table-cell">Descrição</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{(s.clients as any)?.name}</TableCell>
                <TableCell className="hidden md:table-cell max-w-[200px] truncate">{s.description}</TableCell>
                <TableCell>{fmt(Number(s.amount))}</TableCell>
                <TableCell><Badge className={statusColors[s.status] || ""}>{statusLabels[s.status] || s.status}</Badge></TableCell>
                <TableCell className="hidden md:table-cell">{new Date(s.created_at).toLocaleDateString("pt-BR")}</TableCell>
              </TableRow>
            ))}
            {sales.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma venda registrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Read-only commissions list */}
      <h2 className="text-lg font-semibold mt-6">Minhas Comissões</h2>
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Venda</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Percentual</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {myCommissions.map((c: any, i: number) => (
              <TableRow key={i}>
                <TableCell className="max-w-[150px] truncate">{c.sales?.description || "—"}</TableCell>
                <TableCell>{c.sales?.clients?.name || "—"}</TableCell>
                <TableCell>{Number(c.percentage)}%</TableCell>
                <TableCell className="font-medium">{fmt(Number(c.amount))}</TableCell>
                <TableCell>
                  <Badge className={commStatusColors[c.status] || ""}>{commStatusLabels[c.status] || c.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {myCommissions.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma comissão atribuída.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// ─── ADMIN VIEW ───
const AdminSalesView = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tab, setTab] = useState<"sales" | "commissions" | "goals">("sales");
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string } | null>(null);

  // Commission rate dialog
  const [rateOpen, setRateOpen] = useState(false);
  const [rateSellerId, setRateSellerId] = useState("");
  const [rateValue, setRateValue] = useState("");

  // Goal dialog
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalSellerId, setGoalSellerId] = useState("");
  const [goalMonth, setGoalMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [goalValue, setGoalValue] = useState("");

  const { data: sellers = [] } = useQuery({
    queryKey: ["sellers"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const sellerIds = (roles ?? []).filter(r => r.role === "vendedor").map(r => r.user_id);
      if (sellerIds.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", sellerIds);
      return profiles ?? [];
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["all-sales"],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("*, clients(name)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: commissions = [] } = useQuery({
    queryKey: ["all-commissions"],
    queryFn: async () => {
      const { data } = await supabase.from("sales_commissions").select("*, sales(description, clients(name))").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: rates = [] } = useQuery({
    queryKey: ["commission-rates"],
    queryFn: async () => {
      const { data } = await supabase.from("seller_commission_rates").select("*");
      return data ?? [];
    },
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["all-goals"],
    queryFn: async () => {
      const { data } = await supabase.from("sales_goals").select("*");
      return data ?? [];
    },
  });

  const saveRateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("seller_commission_rates").upsert({
        seller_id: rateSellerId,
        percentage: parseFloat(rateValue) || 5,
      }, { onConflict: "seller_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commission-rates"] });
      setRateOpen(false);
      toast({ title: "Percentual atualizado!" });
    },
  });

  const saveGoalMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sales_goals").upsert({
        seller_id: goalSellerId,
        month_ref: goalMonth,
        goal_amount: parseFloat(goalValue) || 0,
      }, { onConflict: "seller_id,month_ref" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-goals"] });
      setGoalOpen(false);
      toast({ title: "Meta salva!" });
    },
  });

  const updateCommissionStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "paga") updates.paid_date = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from("sales_commissions").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-commissions"] });
      toast({ title: "Status atualizado!" });
    },
  });

  const deleteSaleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-sales"] });
      queryClient.invalidateQueries({ queryKey: ["all-commissions"] });
      setDeleteTarget(null);
      toast({ title: "Venda removida!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteCommissionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_commissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-commissions"] });
      setDeleteTarget(null);
      toast({ title: "Comissão removida!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const sellerName = (id: string) => sellers.find(s => s.id === id)?.full_name || "—";

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlySales = sales.filter(s => new Date(s.created_at) >= monthStart);
  const monthlyTotal = monthlySales.reduce((s, sale) => s + Number(sale.amount), 0);
  const totalCommPending = commissions.filter(c => c.status !== "paga").reduce((s, c) => s + Number(c.amount), 0);
  const totalCommPaid = commissions.filter(c => c.status === "paga").reduce((s, c) => s + Number(c.amount), 0);
  const ticketMedio = monthlySales.length > 0 ? monthlyTotal / monthlySales.length : 0;

  const filtered = sales.filter(s => {
    if (sellerFilter !== "all" && s.seller_id !== sellerFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return ((s.clients as any)?.name?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q));
    }
    return true;
  });

  // Ranking
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ranking = sellers.map(seller => {
    const sellerSales = monthlySales.filter(s => s.seller_id === seller.id);
    const total = sellerSales.reduce((acc, s) => acc + Number(s.amount), 0);
    const goal = goals.find(g => g.seller_id === seller.id && g.month_ref === monthKey);
    const goalAmt = goal ? Number(goal.goal_amount) : 0;
    return { ...seller, total, goalAmt, pct: goalAmt > 0 ? (total / goalAmt) * 100 : 0 };
  }).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-bold">Vendas — Painel Administrativo</h1>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vendido no Mês</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(monthlyTotal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Comissões Provisionadas</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{fmt(totalCommPending)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Comissões Pagas</CardTitle>
            <Check className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{fmt(totalCommPaid)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(ticketMedio)}</div></CardContent>
        </Card>
      </div>

      {/* Ranking */}
      {ranking.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4" /> Ranking de Vendedores do Mês</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ranking.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="font-bold text-lg w-6">{i + 1}º</span>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{r.full_name}</span>
                      <span className="text-sm font-bold">{fmt(r.total)}</span>
                    </div>
                    {r.goalAmt > 0 && (
                      <>
                        <Progress value={Math.min(r.pct, 100)} className="mt-1 h-2" />
                        <p className="text-xs text-muted-foreground">{r.pct.toFixed(0)}% da meta ({fmt(r.goalAmt)})</p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        <Button variant={tab === "sales" ? "default" : "outline"} size="sm" onClick={() => setTab("sales")}>Vendas</Button>
        <Button variant={tab === "commissions" ? "default" : "outline"} size="sm" onClick={() => setTab("commissions")}>Comissões</Button>
        <Button variant={tab === "goals" ? "default" : "outline"} size="sm" onClick={() => setTab("goals")}>Metas</Button>
      </div>

      {tab === "sales" && (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar vendas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <div className="flex gap-2">
              <Select value={sellerFilter} onValueChange={setSellerFilter}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos vendedores</SelectItem>
                  {sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                 <TableRow>
                   <TableHead>Vendedor</TableHead>
                   <TableHead>Cliente</TableHead>
                   <TableHead className="hidden md:table-cell">Descrição</TableHead>
                   <TableHead>Valor</TableHead>
                   <TableHead>Data</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead className="w-16">Ação</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {filtered.map(s => (
                   <TableRow key={s.id}>
                     <TableCell>{sellerName(s.seller_id)}</TableCell>
                     <TableCell className="font-medium">{(s.clients as any)?.name}</TableCell>
                     <TableCell className="hidden md:table-cell max-w-[200px] truncate">{s.description}</TableCell>
                     <TableCell>{fmt(Number(s.amount))}</TableCell>
                     <TableCell>{new Date(s.created_at).toLocaleDateString("pt-BR")}</TableCell>
                     <TableCell><Badge className={statusColors[s.status] || ""}>{statusLabels[s.status] || s.status}</Badge></TableCell>
                     <TableCell>
                       <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: "sale", id: s.id })}>
                         <Trash2 className="h-4 w-4 text-destructive" />
                       </Button>
                     </TableCell>
                   </TableRow>
                 ))}
                 {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma venda encontrada.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {tab === "commissions" && (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead>Venda</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>%</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.map(c => (
                <TableRow key={c.id}>
                  <TableCell>{sellerName(c.seller_id)}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{(c.sales as any)?.description}</TableCell>
                  <TableCell>{(c.sales as any)?.clients?.name}</TableCell>
                  <TableCell>{Number(c.percentage)}%</TableCell>
                  <TableCell className="font-medium">{fmt(Number(c.amount))}</TableCell>
                  <TableCell><Badge className={commStatusColors[c.status] || ""}>{commStatusLabels[c.status] || c.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {c.status === "pendente" && (
                        <Button size="sm" variant="outline" onClick={() => updateCommissionStatus.mutate({ id: c.id, status: "aprovada" })}>Aprovar</Button>
                      )}
                      {c.status === "aprovada" && (
                        <Button size="sm" variant="outline" onClick={() => updateCommissionStatus.mutate({ id: c.id, status: "paga" })}>Pagar</Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: "commission", id: c.id })}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {commissions.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma comissão.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === "goals" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Dialog open={rateOpen} onOpenChange={setRateOpen}>
              <DialogTrigger asChild><Button variant="outline">Definir Percentual de Comissão</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Percentual de Comissão</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Vendedor</Label>
                    <Select value={rateSellerId} onValueChange={v => {
                      setRateSellerId(v);
                      const existing = rates.find(r => r.seller_id === v);
                      setRateValue(existing ? String(existing.percentage) : "5");
                    }}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Percentual (%)</Label><Input type="number" step="0.1" value={rateValue} onChange={e => setRateValue(e.target.value)} /></div>
                  <Button onClick={() => saveRateMutation.mutate()} className="w-full" disabled={!rateSellerId}>Salvar</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
              <DialogTrigger asChild><Button variant="outline">Definir Meta Mensal</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Meta Mensal</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Vendedor</Label>
                    <Select value={goalSellerId} onValueChange={setGoalSellerId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Mês</Label><Input type="month" value={goalMonth} onChange={e => setGoalMonth(e.target.value)} /></div>
                  <div><Label>Meta (R$)</Label><Input type="number" step="0.01" value={goalValue} onChange={e => setGoalValue(e.target.value)} /></div>
                  <Button onClick={() => saveGoalMutation.mutate()} className="w-full" disabled={!goalSellerId}>Salvar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Rates table */}
          <Card>
            <CardHeader><CardTitle className="text-base">Taxas de Comissão por Vendedor</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sellers.map(s => {
                  const rate = rates.find(r => r.seller_id === s.id);
                  return (
                    <div key={s.id} className="flex items-center justify-between p-2 border rounded">
                      <span>{s.full_name}</span>
                      <Badge variant="secondary">{rate ? `${Number(rate.percentage)}%` : "5% (padrão)"}</Badge>
                    </div>
                  );
                })}
                {sellers.length === 0 && <p className="text-sm text-muted-foreground">Nenhum vendedor cadastrado.</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.type === "sale") deleteSaleMutation.mutate(deleteTarget.id);
          else deleteCommissionMutation.mutate(deleteTarget.id);
        }}
        isPending={deleteSaleMutation.isPending || deleteCommissionMutation.isPending}
      />
    </div>
  );
};

export default Sales;
