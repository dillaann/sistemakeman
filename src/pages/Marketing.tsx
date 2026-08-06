import { formatDateBR, localDateString } from "@/lib/utils";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, TrendingUp, DollarSign, Users, Target, BarChart3, Trash2, Edit, AlertTriangle } from "lucide-react";
import MonthFilter, { getDateRange, isInRange, type PeriodMode } from "@/components/MonthFilter";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const PLATFORMS = [
  { value: "google_ads", label: "Google Ads" },
  { value: "meta_ads", label: "Meta Ads (Facebook/Instagram)" },
  { value: "tiktok_ads", label: "TikTok Ads" },
  { value: "youtube", label: "YouTube" },
  { value: "outro", label: "Outro" },
];

const OBJECTIVES = [
  { value: "leads", label: "Geração de Leads" },
  { value: "brand", label: "Reconhecimento de Marca" },
  { value: "conversion", label: "Conversão" },
  { value: "outro", label: "Outro" },
];

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const Marketing = () => {
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any>(null);
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const dateRange = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);
  const [form, setForm] = useState({
    name: "", platform: "meta_ads", amount_invested: "", start_date: "", end_date: "",
    objective: "leads", notes: "", leads_generated: "", clicks: "", impressions: "",
  });

  // Realtime subscription for sales updates
  useEffect(() => {
    const channel = supabase
      .channel('marketing-sales-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, () => {
        queryClient.invalidateQueries({ queryKey: ["marketing-sales"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const resetForm = () => {
    setForm({ name: "", platform: "meta_ads", amount_invested: "", start_date: "", end_date: "", objective: "leads", notes: "", leads_generated: "", clicks: "", impressions: "" });
    setEditingCampaign(null);
  };

  // Queries
  const { data: campaigns = [] } = useQuery({
    queryKey: ["marketing-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("marketing_campaigns").select("*").order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fonte única de verdade (idêntica à aba Vendas): orçamentos APROVADOS
  // com origem_venda = "marketing", datados por approved_at (fallback issue_date/created_at).
  const { data: marketingSales = [] } = useQuery({
    queryKey: ["marketing-sales"],
    queryFn: async () => {
      const { data: quotesData, error: quotesError } = await supabase
        .from("quotes")
        .select("*, clients(name)")
        .eq("status", "aprovado")
        .eq("origem_venda", "marketing")
        .order("approved_at", { ascending: false });

      if (quotesError) throw quotesError;
      if (!quotesData?.length) return [];

      const sellerIds = Array.from(new Set(quotesData.map((q: any) => q.seller_id).filter(Boolean)));
      const profilesResult = sellerIds.length
        ? await supabase.rpc("get_team_display_names").then((r: any) => ({
            data: (r.data ?? []).filter((p: any) => sellerIds.includes(p.id)),
            error: r.error,
          }))
        : { data: [], error: null };

      if (profilesResult.error) throw profilesResult.error;
      const profilesMap = new Map((profilesResult.data ?? []).map((p: any) => [p.id, p.full_name]));

      return quotesData.map((q: any) => ({
        id: q.id,
        amount: Number(q.total ?? 0),
        status: "aprovado",
        client_id: q.client_id,
        seller_id: q.seller_id,
        created_at: q.issue_date || q.approved_at || q.created_at,
        client_name: q.clients?.name ?? "—",
        seller_name: q.seller_id ? profilesMap.get(q.seller_id) ?? "—" : "—",
      }));
    },
  });


  const { data: settings } = useQuery({
    queryKey: ["marketing-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("marketing_settings").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingCampaign) {
        const { error } = await supabase.from("marketing_campaigns").update(payload).eq("id", editingCampaign.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("marketing_campaigns").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      toast.success(editingCampaign ? "Campanha atualizada!" : "Campanha registrada!", {
        description: "Os dados da campanha foram salvos com sucesso."
      });
      setOpenDialog(false);
      resetForm();
    },
    onError: (e: any) => {
      console.error("Erro ao salvar campanha:", e);
      toast.error(e.message || "Erro ao tentar salvar a campanha de marketing.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      toast.success("Campanha excluída!");
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (cacLimit: number) => {
      if (settings?.id) {
        await supabase.from("marketing_settings").update({ cac_limit: cacLimit }).eq("id", settings.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-settings"] });
      toast.success("Limite de CAC atualizado!");
    },
  });

  const handleSave = () => {
    if (!form.name || !form.start_date || !form.amount_invested) {
      toast.error("Preencha nome, data início e valor investido");
      return;
    }
    saveMutation.mutate({
      name: form.name,
      platform: form.platform,
      amount_invested: Number(form.amount_invested),
      start_date: form.start_date,
      end_date: form.end_date || null,
      objective: form.objective,
      notes: form.notes || null,
      leads_generated: Number(form.leads_generated) || 0,
      clicks: Number(form.clicks) || 0,
      impressions: Number(form.impressions) || 0,
    });
  };

  const handleEdit = (c: any) => {
    setEditingCampaign(c);
    setForm({
      name: c.name, platform: c.platform, amount_invested: String(c.amount_invested),
      start_date: c.start_date, end_date: c.end_date || "", objective: c.objective || "leads",
      notes: c.notes || "", leads_generated: String(c.leads_generated || 0),
      clicks: String(c.clicks || 0), impressions: String(c.impressions || 0),
    });
    setOpenDialog(true);
  };

  // Calculations
  // Campaign overlaps the selected period if its date range intersects
  const monthCampaigns = campaigns.filter((c: any) => {
    const rangeStart = localDateString(dateRange.start);
    const rangeEnd = localDateString(dateRange.end);
    const cStart = c.start_date;
    const cEnd = c.end_date || c.start_date;
    return cStart <= rangeEnd && cEnd >= rangeStart;
  });
  const totalInvestedMonth = monthCampaigns.reduce((s: number, c: any) => s + Number(c.amount_invested), 0);
  const totalLeadsMonth = monthCampaigns.reduce((s: number, c: any) => s + (c.leads_generated || 0), 0);

  const monthSales = marketingSales.filter((s: any) => isInRange(s.created_at ? String(s.created_at).substring(0, 10) : null, dateRange));
  const totalSalesRevenue = monthSales.reduce((s: number, sale: any) => s + Number(sale.amount), 0);
  const roi = totalInvestedMonth > 0 ? ((totalSalesRevenue - totalInvestedMonth) / totalInvestedMonth) * 100 : 0;
  const cac = monthSales.length > 0 ? totalInvestedMonth / monthSales.length : 0;
  const ticketMedio = monthSales.length > 0 ? totalSalesRevenue / monthSales.length : 0;

  // Platform breakdown for pie chart
  const platformTotals = PLATFORMS.map(p => ({
    name: p.label,
    value: monthCampaigns.filter((c: any) => c.platform === p.value).reduce((s: number, c: any) => s + Number(c.amount_invested), 0),
  })).filter(p => p.value > 0);

  // Monthly ROI evolution (last 6 months)
  const roiEvolution = Array.from({ length: 6 }, (_, i) => {
    const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth() - (5 - i), 1);
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const rangeStart = localDateString(d);
    const rangeEnd = localDateString(mEnd);
    const mCampaigns = campaigns.filter((c: any) => {
      const campaignEnd = c.end_date || c.start_date;
      return c.start_date <= rangeEnd && campaignEnd >= rangeStart;
    });
    const mSales = marketingSales.filter((s: any) => { const sd = String(s.created_at ?? '').substring(0, 10); return sd >= localDateString(d) && sd <= localDateString(mEnd); });
    const inv = mCampaigns.reduce((s: number, c: any) => s + Number(c.amount_invested), 0);
    const rev = mSales.reduce((s: number, sale: any) => s + Number(sale.amount), 0);
    const mRoi = inv > 0 ? ((rev - inv) / inv) * 100 : 0;
    return { month: d.toLocaleDateString("pt-BR", { month: "short" }), roi: Number(mRoi.toFixed(1)) };
  });

  // Sales comparison: marketing vs others
  const salesComparisonData = [
    { name: "Marketing", value: totalSalesRevenue },
    { name: "Outros Canais", value: 0 }, // will be filled
  ];

  // Best platform by ROI
  const bestPlatform = PLATFORMS.reduce((best, p) => {
    const pCampaigns = monthCampaigns.filter((c: any) => c.platform === p.value);
    const inv = pCampaigns.reduce((s: number, c: any) => s + Number(c.amount_invested), 0);
    if (inv === 0) return best;
    // Approximate: attribute sales proportionally (simplified)
    const pRoi = inv > 0 ? ((totalSalesRevenue * (inv / totalInvestedMonth || 0) - inv) / inv) * 100 : 0;
    return pRoi > (best.roi || 0) ? { label: p.label, roi: pRoi } : best;
  }, { label: "-", roi: 0 } as { label: string; roi: number });

  const cacWarning = settings?.cac_limit && cac > Number(settings.cac_limit);

  const platformLabel = (v: string) => PLATFORMS.find(p => p.value === v)?.label || v;
  const objectiveLabel = (v: string) => OBJECTIVES.find(o => o.value === v)?.label || v;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Marketing</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
        <Dialog open={openDialog} onOpenChange={(o) => { setOpenDialog(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Nova Campanha</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCampaign ? "Editar Campanha" : "Nova Campanha"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome da Campanha *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Plataforma</Label>
                  <Select value={form.platform} onValueChange={v => setForm({ ...form, platform: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Valor Investido (R$) *</Label><Input type="number" value={form.amount_invested} onChange={e => setForm({ ...form, amount_invested: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data Início *</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>Data Fim</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
              </div>
              <div>
                <Label>Objetivo</Label>
                <Select value={form.objective} onValueChange={v => setForm({ ...form, objective: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <h4 className="font-semibold pt-2">Resultados da Campanha</h4>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Leads</Label><Input type="number" value={form.leads_generated} onChange={e => setForm({ ...form, leads_generated: e.target.value })} /></div>
                <div><Label>Cliques</Label><Input type="number" value={form.clicks} onChange={e => setForm({ ...form, clicks: e.target.value })} /></div>
                <div><Label>Impressões</Label><Input type="number" value={form.impressions} onChange={e => setForm({ ...form, impressions: e.target.value })} /></div>
              </div>
              <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={handleSave} className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : editingCampaign ? "Atualizar" : "Registrar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Tabs defaultValue="performance">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
          <TabsTrigger value="sales">Vendas Marketing</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          {userRole === "admin" && <TabsTrigger value="settings">Configurações</TabsTrigger>}
        </TabsList>

        {/* PERFORMANCE TAB */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Investido no Mês</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{fmt(totalInvestedMonth)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Vendas pelo Marketing</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{fmt(totalSalesRevenue)}</div>
                <p className="text-xs text-muted-foreground">{monthSales.length} vendas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">ROI</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${roi >= 0 ? "text-green-600" : "text-red-600"}`}>{roi.toFixed(1)}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">CAC</CardTitle>
                {cacWarning && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${cacWarning ? "text-yellow-500" : ""}`}>{fmt(cac)}</div>
                {cacWarning && <p className="text-xs text-yellow-500">Acima do limite ({fmt(Number(settings?.cac_limit))})</p>}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Evolução ROI (6 meses)</CardTitle></CardHeader>
              <CardContent className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={roiEvolution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Line type="monotone" dataKey="roi" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Investimento por Plataforma</CardTitle></CardHeader>
              <CardContent className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={platformTotals} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {platformTotals.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Ticket Médio Marketing</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{fmt(ticketMedio)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Leads no Mês</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{totalLeadsMonth}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Custo por Lead</CardTitle></CardHeader>
              <CardContent><div className="text-xl font-bold">{totalLeadsMonth > 0 ? fmt(totalInvestedMonth / totalLeadsMonth) : "N/A"}</div></CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* CAMPAIGNS TAB */}
        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Histórico de Campanhas</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Plataforma</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Investido</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead>CPL</TableHead>
                      <TableHead>Objetivo</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell><Badge variant="outline">{platformLabel(c.platform)}</Badge></TableCell>
                        <TableCell className="text-sm">
                          {formatDateBR(c.start_date)}
                          {c.end_date && ` — ${formatDateBR(c.end_date)}`}
                        </TableCell>
                        <TableCell>{fmt(Number(c.amount_invested))}</TableCell>
                        <TableCell>{c.leads_generated || 0}</TableCell>
                        <TableCell>{c.leads_generated > 0 ? fmt(Number(c.amount_invested) / c.leads_generated) : "-"}</TableCell>
                        <TableCell>{objectiveLabel(c.objective)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => handleEdit(c)}><Edit className="h-4 w-4" /></Button>
                            {userRole === "admin" && (
                              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {campaigns.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhuma campanha registrada</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Monthly totals by platform */}
          <Card>
            <CardHeader><CardTitle>Total Investido por Plataforma (Mês Atual)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {PLATFORMS.map(p => {
                  const total = monthCampaigns.filter((c: any) => c.platform === p.value).reduce((s: number, c: any) => s + Number(c.amount_invested), 0);
                  if (total === 0) return null;
                  return (
                    <div key={p.value} className="flex items-center justify-between p-3 rounded-lg border">
                      <span className="text-sm font-medium">{p.label}</span>
                      <span className="font-bold">{fmt(total)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SALES TAB */}
        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Vendas Originadas pelo Marketing</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthSales.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.client_name || "—"}</TableCell>
                        <TableCell>{s.seller_name || "—"}</TableCell>
                        <TableCell className="font-medium">{fmt(Number(s.amount))}</TableCell>
                        <TableCell>{new Date(s.created_at).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell><Badge variant={s.status === "concluida" ? "default" : "secondary"}>{s.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {monthSales.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma venda de marketing encontrada</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Total Receita Marketing</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-green-600">{fmt(totalSalesRevenue)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Nº Clientes Convertidos</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{monthSales.length}</div></CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* METRICS TAB */}
        <TabsContent value="metrics" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Melhor Plataforma (ROI)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{bestPlatform.label}</div>
                <p className="text-sm text-muted-foreground">ROI: {bestPlatform.roi.toFixed(1)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Taxa de Conversão</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xl font-bold">
                  {totalLeadsMonth > 0 ? ((monthSales.length / totalLeadsMonth) * 100).toFixed(1) : "0"}%
                </div>
                <p className="text-sm text-muted-foreground">Lead → Venda</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">CPC Médio</CardTitle></CardHeader>
              <CardContent>
                <div className="text-xl font-bold">
                  {(() => {
                    const totalClicks = monthCampaigns.reduce((s: number, c: any) => s + (c.clicks || 0), 0);
                    return totalClicks > 0 ? fmt(totalInvestedMonth / totalClicks) : "N/A";
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Investimento vs Retorno (6 meses)</CardTitle></CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={roiEvolution.map((item, i) => {
                  const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth() - (5 - i), 1);
                  const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
                  const rangeStart = localDateString(d);
                  const rangeEnd = localDateString(mEnd);
                  const inv = campaigns.filter((c: any) => {
                    const campaignEnd = c.end_date || c.start_date;
                    return c.start_date <= rangeEnd && campaignEnd >= rangeStart;
                  }).reduce((s: number, c: any) => s + Number(c.amount_invested), 0);
                  const rev = marketingSales.filter((s: any) => { const sd = String(s.created_at ?? '').substring(0, 10); return sd >= localDateString(d) && sd <= localDateString(mEnd); }).reduce((s: number, sale: any) => s + Number(sale.amount), 0);
                  return { ...item, investido: inv, retorno: rev };
                })}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="investido" name="Investido" stroke="hsl(var(--destructive))" strokeWidth={2} />
                  <Line type="monotone" dataKey="retorno" name="Retorno" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SETTINGS TAB (admin only) */}
        {userRole === "admin" && (
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Configurações de Marketing</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-sm">
                  <Label>Limite de CAC (alerta quando ultrapassar)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      defaultValue={settings?.cac_limit || 500}
                      id="cac-limit-input"
                    />
                    <Button onClick={() => {
                      const val = Number((document.getElementById("cac-limit-input") as HTMLInputElement)?.value);
                      if (val > 0) updateSettingsMutation.mutate(val);
                    }}>Salvar</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Marketing;
