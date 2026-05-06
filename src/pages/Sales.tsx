import { localDateString, parseLocalDate } from "@/lib/utils";
import { useState, useMemo, Fragment } from "react";
import MonthFilter, { type PeriodMode, getDateRange, isInRange } from "@/components/MonthFilter";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trophy, DollarSign, Target, TrendingUp, Check, ShoppingBag, Trash2, Megaphone, Building2, HardHat, ChevronDown, ChevronRight, User } from "lucide-react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const statusColors: Record<string, string> = {
  aguardando: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  em_producao: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  aguardando_instalacao: "bg-green-500/10 text-green-700 border-green-500/20",
  entregue: "bg-purple-500/10 text-purple-700 border-purple-500/20",
};
const statusLabels: Record<string, string> = { aguardando: "Aguardando", em_producao: "Em Produção", aguardando_instalacao: "Aguardando Instalação", entregue: "Entregue" };
const commStatusLabels: Record<string, string> = { pendente: "Pendente", aprovada: "Aprovada", paga: "Paga" };
const commStatusColors: Record<string, string> = {
  pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  aprovada: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  paga: "bg-green-500/10 text-green-700 border-green-500/20",
};

const origemLabels: Record<string, string> = { marketing: "Marketing", obras: "Obras", empresa: "Empresa" };
const ORIGIN_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--secondary))"];

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
  const [form, setForm] = useState({ client_id: "", description: "", amount: "", delivery_deadline: "", notes: "", origem_venda: "" });

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

  // Per-origin totals
  const originTotals = ["marketing", "obras", "empresa"].map(o => ({
    key: o,
    label: origemLabels[o],
    total: monthlySales.filter(s => (s as any).origem_venda === o).reduce((a, s) => a + Number(s.amount), 0),
  }));
  const pieData = originTotals.filter(o => o.total > 0).map(o => ({ name: o.label, value: o.total }));

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
      if (!form.origem_venda) throw new Error("Selecione a Origem da Venda");
      const amount = parseFloat(form.amount) || 0;
      const { data: wo, error: woErr } = await supabase.from("work_orders").insert({
        client_id: form.client_id,
        description: form.description,
        total: amount,
        status: "aguardando" as any,
        priority: "normal",
        origem_venda: form.origem_venda,
      } as any).select("id").single();
      if (woErr) throw woErr;

      const { error: saleErr } = await supabase.from("sales").insert({
        seller_id: user!.id,
        client_id: form.client_id,
        work_order_id: wo.id,
        description: form.description,
        amount,
        delivery_deadline: form.delivery_deadline || null,
        notes: form.notes || null,
        status: "aguardando",
        origem_venda: form.origem_venda,
      } as any);
      if (saleErr) throw saleErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-sales"] });
      queryClient.invalidateQueries({ queryKey: ["my-commissions"] });
      setOpen(false);
      setForm({ client_id: "", description: "", amount: "", delivery_deadline: "", notes: "", origem_venda: "" });
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
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
              <div><Label>Origem da Venda *</Label>
                <Select value={form.origem_venda} onValueChange={v => setForm({ ...form, origem_venda: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="obras">Obras</SelectItem>
                    <SelectItem value="empresa">Empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Descrição do serviço/produto *</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required /></div>
              <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
              <div><Label>Prazo de entrega</Label><Input type="date" value={form.delivery_deadline} onChange={e => setForm({ ...form, delivery_deadline: e.target.value })} /></div>
              <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending || !form.client_id || !form.description || !form.origem_venda}>
                {saveMutation.isPending ? "Salvando..." : "Registrar Venda"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* Per-origin cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {originTotals.map(o => (
          <Card key={o.key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Vendas {o.label}</CardTitle>
              {o.key === "marketing" ? <Megaphone className="h-4 w-4 text-muted-foreground" /> :
               o.key === "obras" ? <HardHat className="h-4 w-4 text-muted-foreground" /> :
               <Building2 className="h-4 w-4 text-muted-foreground" />}
            </CardHeader>
            <CardContent><div className="text-xl font-bold">{fmt(o.total)}</div></CardContent>
          </Card>
        ))}
      </div>

      {/* Pie chart */}
      {pieData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Distribuição por Origem</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((_, i) => <Cell key={i} fill={ORIGIN_COLORS[i % ORIGIN_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Sales tabs by origin */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
          <TabsTrigger value="obras">Obras</TabsTrigger>
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
        </TabsList>
        {["all", "marketing", "obras", "empresa"].map(origin => (
          <TabsContent key={origin} value={origin}>
            <SalesTable
              sales={origin === "all" ? sales : sales.filter(s => (s as any).origem_venda === origin)}
              showSeller={false}
            />
          </TabsContent>
        ))}
      </Tabs>

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

// ─── Shared Sales Table ───
const SalesTable = ({ sales, showSeller = true, sellerName }: { sales: any[]; showSeller?: boolean; sellerName?: (id: string) => string }) => (
  <div className="border rounded-lg overflow-auto">
    <Table>
      <TableHeader>
        <TableRow>
          {showSeller && <TableHead>Vendedor</TableHead>}
          <TableHead>Cliente</TableHead>
          <TableHead className="hidden md:table-cell">Descrição</TableHead>
          <TableHead>Valor</TableHead>
          <TableHead>Origem</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden md:table-cell">Data</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sales.map(s => (
          <TableRow key={s.id}>
            {showSeller && <TableCell>{sellerName ? sellerName(s.seller_id) : "—"}</TableCell>}
            <TableCell className="font-medium">{(s.clients as any)?.name}</TableCell>
            <TableCell className="hidden md:table-cell max-w-[200px] truncate">{s.description}</TableCell>
            <TableCell>{fmt(Number(s.amount))}</TableCell>
            <TableCell><Badge variant="outline">{origemLabels[(s as any).origem_venda] || "—"}</Badge></TableCell>
            <TableCell><Badge className={statusColors[s.status] || ""}>{statusLabels[s.status] || s.status}</Badge></TableCell>
            <TableCell className="hidden md:table-cell">{new Date(s.created_at).toLocaleDateString("pt-BR")}</TableCell>
          </TableRow>
        ))}
        {sales.length === 0 && (
          <TableRow><TableCell colSpan={showSeller ? 7 : 6} className="text-center text-muted-foreground py-8">Nenhuma venda encontrada.</TableCell></TableRow>
        )}
      </TableBody>
    </Table>
  </div>
);

// ─── ADMIN VIEW ───
const AdminSalesView = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sellerFilter, setSellerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tab, setTab] = useState<"vendas" | "commissions" | "goals">("vendas");
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string } | null>(null);

  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const dateRange = getDateRange(refDate, periodMode);

  const [rateOpen, setRateOpen] = useState(false);
  const [rateSellerId, setRateSellerId] = useState("");
  const [rateValue, setRateValue] = useState("");

  const [goalOpen, setGoalOpen] = useState(false);
  const [goalSellerId, setGoalSellerId] = useState("");
  const [goalMonth, setGoalMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [goalValue, setGoalValue] = useState("");
  const [rankingOrigin, setRankingOrigin] = useState("all");

  // Payment dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payCommissionId, setPayCommissionId] = useState("");
  const [payAccountId, setPayAccountId] = useState("");

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

  // ── Single source of truth: approved quotes (same as Billing) ──
  const { data: approvedQuotes = [] } = useQuery({
    queryKey: ["approved-quotes-for-sales"],
    queryFn: async () => {
      const { data } = await supabase.from("quotes").select("*, clients(name)").eq("status", "aprovado").order("approved_at", { ascending: false });
      return data ?? [];
    },
  });

  // Map approved quotes to a unified "sale" shape
  const sales = useMemo(() => {
    return approvedQuotes.map(q => ({
      id: q.id,
      seller_id: q.seller_id || null,
      client_id: q.client_id,
      description: q.description || "Orçamento aprovado",
      amount: q.total,
      status: "aprovado",
      origem_venda: q.origem_venda || "empresa",
      created_at: q.approved_at || q.issue_date || q.created_at,
      clients: q.clients,
      _isFromQuote: true,
    }));
  }, [approvedQuotes]);

  const { data: commissions = [] } = useQuery({
    queryKey: ["all-commissions"],
    queryFn: async () => {
      const { data } = await supabase.from("sales_commissions").select("*, sales(description, amount, clients(name))").order("created_at", { ascending: false });
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

  const { data: financialAccounts = [] } = useQuery({
    queryKey: ["financial-accounts-for-commissions"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_accounts").select("id, name, type").eq("active", true).order("name");
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
    mutationFn: async ({ id, status, accountId }: { id: string; status: string; accountId?: string }) => {
      const commission = commissions.find(c => c.id === id);
      if (!commission) throw new Error("Comissão não encontrada");

      const sellerProfile = sellers.find(s => s.id === commission.seller_id);
      const sellerDisplayName = sellerProfile?.full_name || "Vendedor";
      const today = localDateString();
      const monthRef = today.substring(0, 7); // YYYY-MM

      const updates: any = { status };
      if (status === "paga") updates.paid_date = today;
      const { error } = await supabase.from("sales_commissions").update(updates).eq("id", id);
      if (error) throw error;

      if (status === "aprovada") {
        // Create pending "a_pagar" financial transaction
        const { error: ftError } = await supabase.from("financial_transactions").insert({
          type: "a_pagar" as any,
          status: "pendente" as any,
          description: `Comissão — ${sellerDisplayName} — ${monthRef}`,
          amount: Number(commission.amount),
          due_date: today,
          category: "Comissões de Vendedores",
        });
        if (ftError) throw ftError;
      }

      if (status === "paga") {
        // Check if there's already a pending financial transaction for this commission
        const descPattern = `Comissão — ${sellerDisplayName}`;
        const { data: existingFt } = await supabase.from("financial_transactions")
          .select("id")
          .eq("type", "a_pagar")
          .eq("status", "pendente")
          .eq("amount", Number(commission.amount))
          .ilike("description", `${descPattern}%`)
          .limit(1);

        if (existingFt && existingFt.length > 0) {
          // Update existing transaction to paid
          const { error: updateError } = await supabase.from("financial_transactions").update({
            status: "pago" as any,
            paid_date: today,
            account_id: accountId || null,
          }).eq("id", existingFt[0].id);
          if (updateError) throw updateError;
        } else {
          // Create paid financial transaction directly
          const { error: ftError } = await supabase.from("financial_transactions").insert({
            type: "a_pagar" as any,
            status: "pago" as any,
            description: `Comissão — ${sellerDisplayName} — ${monthRef}`,
            amount: Number(commission.amount),
            due_date: today,
            paid_date: today,
            category: "Comissões de Vendedores",
            account_id: accountId || null,
          });
          if (ftError) throw ftError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-commissions"] });
      queryClient.invalidateQueries({ queryKey: ["financial-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["account-movements"] });
      setPayDialogOpen(false);
      setPayCommissionId("");
      setPayAccountId("");
      toast({ title: "Status atualizado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteSaleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approved-quotes-for-sales"] });
      queryClient.invalidateQueries({ queryKey: ["all-commissions"] });
      queryClient.invalidateQueries({ queryKey: ["billing-quotes"] });
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

  const updateCommissionPercentageMutation = useMutation({
    mutationFn: async ({ id, percentage }: { id: string; percentage: number }) => {
      const c = commissions.find((x: any) => x.id === id);
      if (!c) throw new Error("Comissão não encontrada");
      const saleAmount = Number((c.sales as any)?.amount ?? 0);
      const newAmount = Math.round(saleAmount * (percentage / 100) * 100) / 100;
      const { error } = await supabase.from("sales_commissions")
        .update({ percentage, amount: newAmount }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-commissions"] });
      toast({ title: "Comissão recalculada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const [vendedorTypeFilter, setVendedorTypeFilter] = useState("all"); // all | com_vendedor | sem_vendedor

  const sellerName = (id: string | null) => {
    if (!id) return "Direto / Administrador";
    return sellers.find(s => s.id === id)?.full_name || "Direto / Administrador";
  };

  const monthlySales = sales.filter(s => {
    const dateStr = s.created_at ? s.created_at.substring(0, 10) : null;
    return isInRange(dateStr, dateRange);
  });
  const monthlyTotal = monthlySales.reduce((s, sale) => s + Number(sale.amount), 0);
  const totalCommPending = commissions.filter(c => c.status !== "paga").reduce((s, c) => s + Number(c.amount), 0);
  const totalCommPaid = commissions.filter(c => c.status === "paga").reduce((s, c) => s + Number(c.amount), 0);
  const ticketMedio = monthlySales.length > 0 ? monthlyTotal / monthlySales.length : 0;

  const originTotals = ["marketing", "obras", "empresa"].map(o => ({
    key: o,
    label: origemLabels[o],
    total: monthlySales.filter(s => (s as any).origem_venda === o).reduce((a, s) => a + Number(s.amount), 0),
    count: monthlySales.filter(s => (s as any).origem_venda === o).length,
  }));

  const filtered = monthlySales.filter(s => {
    if (vendedorTypeFilter === "com_vendedor" && !s.seller_id) return false;
    if (vendedorTypeFilter === "sem_vendedor" && s.seller_id) return false;
    if (sellerFilter !== "all" && s.seller_id !== sellerFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return ((s.clients as any)?.name?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q));
    }
    return true;
  });

  // Ranking per origin
  const monthKey = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}`;
  const ranking = sellers.map(seller => {
    const sellerMonthly = monthlySales.filter(s => s.seller_id === seller.id);
    const filteredSales = rankingOrigin === "all" ? sellerMonthly : sellerMonthly.filter(s => (s as any).origem_venda === rankingOrigin);
    const total = filteredSales.reduce((acc, s) => acc + Number(s.amount), 0);
    const goal = goals.find(g => g.seller_id === seller.id && g.month_ref === monthKey);
    const goalAmt = goal ? Number(goal.goal_amount) : 0;

    // Per-origin breakdown
    const mkt = sellerMonthly.filter(s => (s as any).origem_venda === "marketing").reduce((a, s) => a + Number(s.amount), 0);
    const obras = sellerMonthly.filter(s => (s as any).origem_venda === "obras").reduce((a, s) => a + Number(s.amount), 0);
    const empresa = sellerMonthly.filter(s => (s as any).origem_venda === "empresa").reduce((a, s) => a + Number(s.amount), 0);
    const allTotal = sellerMonthly.reduce((a, s) => a + Number(s.amount), 0);

    return { ...seller, total, goalAmt, pct: goalAmt > 0 ? (total / goalAmt) * 100 : 0, mkt, obras, empresa, allTotal };
  }).sort((a, b) => b.total - a.total);

  // Chart data: bar chart per seller per origin
  const barChartData = sellers.map(s => {
    const ss = monthlySales.filter(sale => sale.seller_id === s.id);
    return {
      name: s.full_name?.split(" ")[0] || "—",
      Marketing: ss.filter(sale => (sale as any).origem_venda === "marketing").reduce((a, sale) => a + Number(sale.amount), 0),
      Obras: ss.filter(sale => (sale as any).origem_venda === "obras").reduce((a, sale) => a + Number(sale.amount), 0),
      Empresa: ss.filter(sale => (sale as any).origem_venda === "empresa").reduce((a, sale) => a + Number(sale.amount), 0),
    };
  }).filter(d => d.Marketing + d.Obras + d.Empresa > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-xl md:text-2xl font-bold">Vendas — Painel Administrativo</h1>
        <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
      </div>

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

      {/* Origin cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {originTotals.map(o => (
          <Card key={o.key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Vendas {o.label}</CardTitle>
              {o.key === "marketing" ? <Megaphone className="h-4 w-4 text-muted-foreground" /> :
               o.key === "obras" ? <HardHat className="h-4 w-4 text-muted-foreground" /> :
               <Building2 className="h-4 w-4 text-muted-foreground" />}
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{fmt(o.total)}</div>
              <p className="text-xs text-muted-foreground">{o.count} vendas</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bar chart vendas por vendedor por origem */}
      {barChartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Vendas por Vendedor × Origem (Mês Atual)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} className="text-xs" />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="Marketing" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Obras" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Empresa" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Ranking with origin filter */}
      {ranking.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4" /> Ranking de Vendedores</CardTitle>
              <Select value={rankingOrigin} onValueChange={setRankingOrigin}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Total</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="obras">Obras</SelectItem>
                  <SelectItem value="empresa">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
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
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>Mkt: {fmt(r.mkt)}</span>
                      <span>Obras: {fmt(r.obras)}</span>
                      <span>Empresa: {fmt(r.empresa)}</span>
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

      {/* Main tabs */}
      <div className="flex gap-2 overflow-x-auto">
        <Button variant={tab === "vendas" ? "default" : "outline"} size="sm" onClick={() => setTab("vendas")}>Vendas</Button>
        <Button variant={tab === "commissions" ? "default" : "outline"} size="sm" onClick={() => setTab("commissions")}>Comissões</Button>
        <Button variant={tab === "goals" ? "default" : "outline"} size="sm" onClick={() => setTab("goals")}>Metas</Button>
      </div>

      {tab === "vendas" && (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar vendas..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={vendedorTypeFilter} onValueChange={setVendedorTypeFilter}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="com_vendedor">Com vendedor</SelectItem>
                  <SelectItem value="sem_vendedor">Sem vendedor</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sellerFilter} onValueChange={setSellerFilter}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos vendedores</SelectItem>
                  {sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Origin sub-tabs */}
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="marketing">Marketing</TabsTrigger>
              <TabsTrigger value="obras">Obras</TabsTrigger>
              <TabsTrigger value="empresa">Empresa</TabsTrigger>
            </TabsList>
            {["all", "marketing", "obras", "empresa"].map(origin => {
              const originFiltered = origin === "all" ? filtered : filtered.filter(s => (s as any).origem_venda === origin);
              const originTotal = originFiltered.reduce((a, s) => a + Number(s.amount), 0);
              return (
                <TabsContent key={origin} value={origin}>
                  <div className="flex gap-4 mb-4">
                    <Card className="flex-1">
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Quantidade</p>
                        <p className="text-lg font-bold">{originFiltered.length}</p>
                      </CardContent>
                    </Card>
                    <Card className="flex-1">
                      <CardContent className="p-3">
                        <p className="text-xs text-muted-foreground">Valor Total</p>
                        <p className="text-lg font-bold">{fmt(originTotal)}</p>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="border rounded-lg overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendedor</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead className="hidden md:table-cell">Descrição</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Origem</TableHead>
                          <TableHead>Data Aprovação</TableHead>
                          <TableHead className="w-16">Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {originFiltered.map(s => (
                          <TableRow key={s.id}>
                            <TableCell>{sellerName(s.seller_id)}</TableCell>
                            <TableCell className="font-medium">{(s.clients as any)?.name}</TableCell>
                            <TableCell className="hidden md:table-cell max-w-[200px] truncate">{s.description}</TableCell>
                            <TableCell>{fmt(Number(s.amount))}</TableCell>
                            <TableCell><Badge variant="outline">{origemLabels[(s as any).origem_venda] || "—"}</Badge></TableCell>
                            <TableCell>{new Date(s.created_at).toLocaleDateString("pt-BR")}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: "sale", id: s.id })}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {originFiltered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma venda encontrada.</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </>
      )}

      {tab === "commissions" && (
          <CommissionsPerSeller
            sellers={sellers}
            commissions={commissions}
            rates={rates}
            sellerName={sellerName}
            updateCommissionStatus={updateCommissionStatus}
            updateCommissionPercentage={updateCommissionPercentageMutation}
            setDeleteTarget={setDeleteTarget}
            financialAccounts={financialAccounts}
            payDialogOpen={payDialogOpen}
            setPayDialogOpen={setPayDialogOpen}
            payCommissionId={payCommissionId}
            setPayCommissionId={setPayCommissionId}
            payAccountId={payAccountId}
            setPayAccountId={setPayAccountId}
          />
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

// ─── COMMISSIONS PER SELLER ───
const CommissionsPerSeller = ({
  sellers,
  commissions,
  rates,
  sellerName,
  updateCommissionStatus,
  setDeleteTarget,
  financialAccounts,
  payDialogOpen,
  setPayDialogOpen,
  payCommissionId,
  setPayCommissionId,
  payAccountId,
  setPayAccountId,
}: {
  sellers: any[];
  commissions: any[];
  rates: any[];
  sellerName: (id: string | null) => string;
  updateCommissionStatus: any;
  setDeleteTarget: (t: { type: string; id: string } | null) => void;
  financialAccounts: any[];
  sellers,
  commissions,
  rates,
  sellerName,
  updateCommissionStatus,
  updateCommissionPercentage,
  setDeleteTarget,
  financialAccounts,
  payDialogOpen,
  setPayDialogOpen,
  payCommissionId,
  setPayCommissionId,
  payAccountId,
  setPayAccountId,
}: {
  sellers: any[];
  commissions: any[];
  rates: any[];
  sellerName: (id: string | null) => string;
  updateCommissionStatus: any;
  updateCommissionPercentage: any;
  setDeleteTarget: (t: { type: string; id: string } | null) => void;
  financialAccounts: any[];
  payDialogOpen: boolean;
  setPayDialogOpen: (v: boolean) => void;
  payCommissionId: string;
  setPayCommissionId: (v: string) => void;
  payAccountId: string;
  setPayAccountId: (v: string) => void;
}) => {
  const [expandedSeller, setExpandedSeller] = useState<string | null>(null);

  const totalAll = commissions.reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = commissions.filter(c => c.status === "paga").reduce((s, c) => s + Number(c.amount), 0);
  const totalPending = commissions.filter(c => c.status !== "paga").reduce((s, c) => s + Number(c.amount), 0);

  // Group commissions by seller
  const sellerCommissions = useMemo(() => {
    const sellerIds = new Set<string>();
    commissions.forEach(c => { if (c.seller_id) sellerIds.add(c.seller_id); });

    return Array.from(sellerIds).map(sellerId => {
      const sellerComms = commissions.filter(c => c.seller_id === sellerId);
      const seller = sellers.find(s => s.id === sellerId);
      const rate = rates.find(r => r.seller_id === sellerId);
      const total = sellerComms.reduce((s, c) => s + Number(c.amount), 0);
      const paid = sellerComms.filter(c => c.status === "paga").reduce((s, c) => s + Number(c.amount), 0);
      const pending = sellerComms.filter(c => c.status !== "paga").reduce((s, c) => s + Number(c.amount), 0);
      const salesTotal = sellerComms.reduce((s, c) => {
        const saleAmount = (c.sales as any)?.amount;
        return s + (saleAmount ? Number(saleAmount) : (Number(c.percentage) > 0 ? Number(c.amount) / (Number(c.percentage) / 100) : 0));
      }, 0);

      return {
        sellerId,
        name: seller?.full_name || sellerName(sellerId),
        percentage: rate ? Number(rate.percentage) : 5,
        total,
        paid,
        pending,
        salesTotal,
        commissions: sellerComms,
      };
    }).sort((a, b) => b.total - a.total);
  }, [commissions, sellers, rates, sellerName]);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Comissões</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(totalAll)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pagas</CardTitle>
            <Check className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{fmt(totalPaid)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-600">{fmt(totalPending)}</div></CardContent>
        </Card>
      </div>

      {/* Per-seller cards */}
      <div className="space-y-3">
        {sellerCommissions.map(sc => {
          const isExpanded = expandedSeller === sc.sellerId;
          return (
            <Card key={sc.sellerId}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setExpandedSeller(isExpanded ? null : sc.sellerId)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{sc.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{sc.commissions.length} comissões · {sc.percentage}%</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-bold">{fmt(sc.total)}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="text-green-600">{fmt(sc.paid)} pago</span> · <span className="text-yellow-600">{fmt(sc.pending)} pendente</span>
                        </p>
                      </div>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </CardHeader>
              </button>

              {isExpanded && (
                <CardContent className="pt-0">
                  <div className="border rounded-lg overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Venda</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>%</TableHead>
                          <TableHead>Comissão</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sc.commissions.map(c => (
                          <TableRow key={c.id}>
                            <TableCell className="max-w-[150px] truncate">{(c.sales as any)?.description || "—"}</TableCell>
                            <TableCell>{(c.sales as any)?.clients?.name || "—"}</TableCell>
                            <TableCell>{Number(c.percentage)}%</TableCell>
                            <TableCell className="font-medium">{fmt(Number(c.amount))}</TableCell>
                            <TableCell>
                              <Badge className={commStatusColors[c.status] || ""}>{commStatusLabels[c.status] || c.status}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {c.status === "pendente" && (
                                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateCommissionStatus.mutate({ id: c.id, status: "aprovada" }); }}>Aprovar</Button>
                                )}
                                {c.status === "aprovada" && (
                                  <Button size="sm" variant="outline" onClick={(e) => {
                                    e.stopPropagation();
                                    setPayCommissionId(c.id);
                                    setPayAccountId("");
                                    setPayDialogOpen(true);
                                  }}>Pagar</Button>
                                )}
                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "commission", id: c.id }); }}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
        {sellerCommissions.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">Nenhuma comissão registrada.</CardContent>
          </Card>
        )}
      </div>

      {/* Payment account dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar Pagamento de Comissão</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {payCommissionId && (() => {
              const comm = commissions.find(c => c.id === payCommissionId);
              return comm ? (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm"><strong>Vendedor:</strong> {sellerName(comm.seller_id)}</p>
                  <p className="text-sm"><strong>Valor:</strong> {fmt(Number(comm.amount))}</p>
                  <p className="text-sm"><strong>Venda:</strong> {(comm.sales as any)?.description || "—"}</p>
                </div>
              ) : null;
            })()}
            <div>
              <Label>Conta de saída {financialAccounts.length > 0 ? "*" : "(opcional)"}</Label>
              <Select value={payAccountId} onValueChange={setPayAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {financialAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {financialAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Nenhuma conta cadastrada. O lançamento será criado sem conta vinculada.</p>
              )}
            </div>
            <Button
              className="w-full"
              disabled={updateCommissionStatus.isPending || (financialAccounts.length > 0 && !payAccountId)}
              onClick={() => {
                updateCommissionStatus.mutate({
                  id: payCommissionId,
                  status: "paga",
                  accountId: payAccountId || undefined,
                });
              }}
            >
              {updateCommissionStatus.isPending ? "Processando..." : "Confirmar Pagamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
