import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowRight, MessageSquare, ChevronDown, ChevronUp, Eye, EyeOff, Search, Info, Package, History, FileText, Factory, Clock, CheckCircle2, AlertCircle, LayoutGrid, List as ListIcon, User, Calendar, ChevronRight, FileSpreadsheet, Printer } from "lucide-react";
import WorkOrderMaterials from "@/components/WorkOrderMaterials";
import MonthFilter, { getDateRange, isInRange, isInRangeOrOpen, type PeriodMode } from "@/components/MonthFilter";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateBR, cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const PRODUCTION_SHEET_URL = "https://docs.google.com/spreadsheets/d/1_IKiOkNRyy6P-PG5WKL5RYjFCr14pAmca2mhhHs2Cg4/edit";


const columns = [
  { key: "aguardando", label: "Aguardando", color: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400", icon: Clock },
  { key: "em_producao", label: "Em Produção", color: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400", icon: Factory },
  { key: "aguardando_instalacao", label: "Aguardando Instalação", color: "bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400", icon: AlertCircle },
  { key: "entregue", label: "Entregue", color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
];


const Production = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const dateRange = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);
  const isViewingCurrent = useMemo(() => {
    const now = new Date();
    return now >= dateRange.start && now <= dateRange.end;
  }, [dateRange]);
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [priorityFilter, setPriorityFilter] = useState("todos");

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "kanban">("cards");
  const [mainTab, setMainTab] = useState<"producao" | "aprovacoes">("producao");

  const { data: productionItems = [], isLoading } = useQuery({
    queryKey: ["production"],
    queryFn: async () => {
      // Fetch both Work Orders AND Approved Quotes to ensure everyone on the sheet is here
      const [woRes, quotesRes] = await Promise.all([
        supabase
          .from("work_orders")
          .select(`
            id, description, priority, internal_notes, material_status, total, client_id, assigned_to, status, created_at, status_producao, quote_id,
            clients(name),
            quotes(seller_id, approved_by, created_by)
          `)
          .order("created_at", { ascending: false }),
        supabase
          .from("quotes")
          .select(`
            id, status, payment_method, collection_date, created_at, seller_id, approved_by, created_by,
            clients(name)
          `)
          .eq("status", "aprovado")
          .order("created_at", { ascending: false })
      ]);
      
      if (woRes.error) throw woRes.error;
      if (quotesRes.error) throw quotesRes.error;

      const workOrders = woRes.data || [];
      const approvedQuotes = quotesRes.data || [];

      // Fetch the individual services (items) of each work order
      const woIds = workOrders.map((wo: any) => wo.id);
      const itemsMap = new Map<string, any[]>();
      if (woIds.length > 0) {
        const { data: items } = await supabase
          .from("work_order_items" as any)
          .select("work_order_id, description, quantity, unit_price, total")
          .in("work_order_id", woIds);
        (items || []).forEach((item: any) => {
          const list = itemsMap.get(item.work_order_id) || [];
          list.push(item);
          itemsMap.set(item.work_order_id, list);
        });
      }

      // Map Work Orders
      const productionItems = workOrders.map(wo => ({
        id: wo.id,
        os_id: wo.id,
        status: wo.status || 'aguardando',
        created_at: wo.created_at,
        priority: wo.priority,
        seller_id: (wo as any).quotes?.seller_id || (wo as any).quotes?.approved_by || (wo as any).quotes?.created_by || null,
        work_orders: wo,
        items: itemsMap.get(wo.id) || [],
        production_occurrences: [],
        source: 'work_order'
      }));

      // Find approved quotes that DON'T have a matching work order yet
      const quotesWithoutWO = approvedQuotes.filter(quote => 
        !workOrders.some(wo => wo.quote_id === quote.id)
      );

      // Add them as production items
      const quoteItems = quotesWithoutWO.map(quote => ({
        id: quote.id,
        os_id: quote.id,
        status: 'aguardando', // Default status for approved quotes without WO
        created_at: quote.created_at,
        priority: 'normal',
        seller_id: (quote as any).seller_id || (quote as any).approved_by || (quote as any).created_by || null,
        work_orders: {
          id: quote.id,
          description: "Orçamento Aprovado (Aguardando OS)",
          clients: quote.clients,
          created_at: quote.created_at,
          status_producao: 'aguardando'
        },
        items: [],
        production_occurrences: [],
        source: 'quote'
      }));

      return [...productionItems, ...quoteItems].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });

  // Paint sheet status per work_order_id for Kanban badges
  const { data: paintByWO = {} } = useQuery({
    queryKey: ["production-paint-sheets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paint_sheets")
        .select("work_order_id, status, sheet_date")
        .not("work_order_id", "is", null);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => {
        const cur = map[p.work_order_id];
        // priority: em_pintura > aguardando > finalizado
        const rank = (s: string) => (s === "em_pintura" ? 3 : s === "aguardando" ? 2 : 1);
        if (!cur || rank(p.status) > rank(cur)) map[p.work_order_id] = p.status;
      });
      return map;
    },
  });

  // Log of approved quotes: date approved, who approved, client name
  const { data: approvalLog = [] } = useQuery({
    queryKey: ["production-approval-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, total, approved_at, approved_by, seller_id, created_by, created_at, production_cleared_at, clients(name), work_orders(status)")
        .eq("status", "aprovado")
        .is("production_cleared_at", null)
        .order("approved_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      // Only quotes whose work order is NOT completed (delivered) in the OS
      return (data || []).filter((q: any) => {
        const wos = q.work_orders || [];
        if (!wos.length) return true;
        return !wos.every((wo: any) => wo.status === "entregue");
      });
    },
  });

  // Clear (archive) an approved quote from the production approval list
  const clearApprovalMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await supabase
        .from("quotes")
        .update({ production_cleared_at: new Date().toISOString() })
        .eq("id", quoteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-approval-log"] });
      toast({ title: "Orçamento organizado", description: "Removido da lista de orçamentos aprovados." });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  // Apply the month/period filter to the approval log (by approval date)
  const filteredApprovalLog = useMemo(() => {
    return approvalLog.filter((q: any) =>
      isInRange(q.approved_at || q.created_at, dateRange)
    );
  }, [approvalLog, dateRange]);





  const { data: profilesMap = {} } = useQuery({
    queryKey: ["profiles-map-production"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_team_display_names");
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.id] = p.full_name; });
      return map;
    },
  });

  // Print the approved-quotes history
  const handlePrintApprovalLog = useCallback(() => {
    const rows = filteredApprovalLog
      .map((q: any, i: number) => {
        const date = q.approved_at
          ? new Date(q.approved_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "—";
        const sellerId = q.seller_id || q.approved_by || q.created_by;
        const approver = sellerId ? (profilesMap[sellerId] || "Não identificado") : "Não identificado";
        const client = q.clients?.name || "Cliente não informado";
        const total = Number(q.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        return `<tr><td class="num">${i + 1}</td><td>${client}</td><td>${approver}</td><td>${date}</td><td class="value">${total}</td></tr>`;
      })
      .join("");
    const totalSum = filteredApprovalLog
      .reduce((s: number, q: any) => s + Number(q.total || 0), 0)
      .toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Histórico de Orçamentos Aprovados</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#0f172a}
        h1{font-size:22px;margin:0 0 4px}
        p{color:#64748b;font-size:13px;margin:0 0 18px}
        table{width:100%;border-collapse:collapse;font-size:14px;border:2px solid #000}
        th,td{padding:10px 12px;border:1px solid #000;text-align:left}
        th{text-transform:uppercase;font-size:11px;letter-spacing:.05em;color:#000;background:#e2e8f0}
        td.num{color:#000;width:36px}
        td.value{text-align:right;font-weight:bold;white-space:nowrap}
        tr{page-break-inside:avoid}
        tbody tr:nth-child(even){background:#f1f5f9}
        tfoot td{font-weight:bold;font-size:15px;border:2px solid #000;padding-top:12px}

      </style></head><body>
      <h1>Histórico de Orçamentos Aprovados</h1>
      <p>Gerado em ${new Date().toLocaleString("pt-BR")} — ${filteredApprovalLog.length} registro(s)</p>
      <table>
        <thead><tr><th>#</th><th>Cliente</th><th>Aprovado por</th><th>Data</th><th style="text-align:right">Valor</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4">Total Geral</td><td class="value">${totalSum}</td></tr></tfoot>
      </table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }, [filteredApprovalLog, profilesMap]);



  const filteredItems = useMemo(() => {
    return productionItems.filter((item: any) => {
      const wo = item.work_orders || {};
      const clientName = wo.clients?.name || "";
      const description = wo.description || "";
      const employeeName = wo.employees?.name || "";
      
      // For list view, we keep everything unless it's delivered and outside date range
      // But if it's NOT delivered, it should ALWAYS show regardless of date range
      const isFinished = item.status === "entregue";
      if (isFinished) {
        const completionDate = wo.delivered_at || wo.completed_at;
        if (completionDate && !isInRangeOrOpen(item.created_at, dateRange, false, completionDate)) {
           return false;
        }
      }

      const searchTerms = search.toLowerCase();
      const matchesSearch = 
        item.os_id.toLowerCase().includes(searchTerms) ||
        clientName.toLowerCase().includes(searchTerms) ||
        description.toLowerCase().includes(searchTerms) ||
        employeeName.toLowerCase().includes(searchTerms);
      
      const matchesStatus = statusFilter === "todos" || item.status === statusFilter;
      const matchesPriority = priorityFilter === "todos" || 
        (item.priority || wo.priority || "").toLowerCase() === priorityFilter.toLowerCase();

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [productionItems, search, statusFilter, priorityFilter, dateRange]);

  const summary = useMemo(() => {
    const total = productionItems.length;
    const counts: Record<string, number> = {};
    columns.forEach(c => { counts[c.key] = 0; });
    productionItems.forEach((p: any) => {
      if (counts[p.status] !== undefined) counts[p.status]++;
    });
    return { total, counts };
  }, [productionItems]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const updateStatus = async (id: string, newStatus: string, source?: string) => {
    try {
      if (source === 'quote') {
        toast({ title: "Aviso", description: "Crie uma Ordem de Serviço para este orçamento para gerenciar a produção.", variant: "default" });
        return;
      }

      const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === 'em_producao') updates.started_at = new Date().toISOString();
      if (newStatus === 'aguardando_instalacao') updates.completed_at = new Date().toISOString();
      if (newStatus === 'entregue') updates.delivered_at = new Date().toISOString();

      const { error } = await supabase
        .from('work_orders')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
      
      // Invoke sync function
      supabase.functions.invoke("sync-production-sheet");

      queryClient.invalidateQueries({ queryKey: ["production"] });
      toast({ title: "Status atualizado!", description: `OS movida para ${columns.find(c => c.key === newStatus)?.label}` });
    } catch (error: any) {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-background min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Módulo de Produção</h1>
          <p className="text-muted-foreground">Gerencie o fluxo de trabalho da serralheria em tempo real.</p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
            <TabsList className="h-9">
              <TabsTrigger value="cards" className="text-xs"><ListIcon className="h-3.5 w-3.5 mr-1.5" /> Lista</TabsTrigger>
              <TabsTrigger value="kanban" className="text-xs"><LayoutGrid className="h-3.5 w-3.5 mr-1.5" /> Kanban</TabsTrigger>
            </TabsList>
          </Tabs>
          <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
          <Button
            variant="outline"
            className="h-9 gap-2 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
            onClick={async () => {
              window.open(PRODUCTION_SHEET_URL, "_blank");
              try {
                await supabase.functions.invoke("sync-production-sheet");
                toast({ title: "Planilha atualizada!", description: "Os dados mais recentes foram enviados ao Google Sheets." });
              } catch (e: any) {
                toast({ title: "Aviso", description: "A planilha foi aberta, mas a atualização automática falhou.", variant: "destructive" });
              }
            }}
          >
            <FileSpreadsheet className="h-4 w-4" /> Planilha Google
          </Button>
        </div>
      </div>

      {/* Main tabs: Production workflow vs Approved-quotes log */}
      <Tabs value={mainTab} onValueChange={(v: any) => setMainTab(v)}>
        <TabsList className="h-10">
          <TabsTrigger value="producao"><Factory className="h-4 w-4 mr-2" /> Produção</TabsTrigger>
          <TabsTrigger value="aprovacoes"><CheckCircle2 className="h-4 w-4 mr-2" /> Orçamentos Aprovados</TabsTrigger>
        </TabsList>
      </Tabs>

      {mainTab === "aprovacoes" ? (
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="text-lg font-bold">Histórico de Orçamentos Aprovados</h2>
                </div>
                <p className="text-sm text-muted-foreground">Orçamentos aprovados que ainda não foram concluídos (entregues) na ordem de serviço.</p>
              </div>
              <div className="flex items-center gap-2">
                <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
                <Button variant="outline" size="sm" onClick={handlePrintApprovalLog} disabled={filteredApprovalLog.length === 0}>
                  <Printer className="h-4 w-4 mr-2" /> Imprimir
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredApprovalLog.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">Nenhum orçamento aprovado neste período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-3 pr-4 font-bold">Data da Aprovação</th>
                      <th className="py-3 pr-4 font-bold">Aprovado por</th>
                      <th className="py-3 pr-4 font-bold">Cliente</th>
                      <th className="py-3 pr-4 font-bold text-right">Valor</th>
                      <th className="py-3 pr-4 font-bold text-center">Concluir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApprovalLog.map((q: any) => (
                      <tr key={q.id} className="border-b border-border/50 hover:bg-muted/40">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {q.approved_at ? new Date(q.approved_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {(() => { const sid = q.seller_id || q.approved_by || q.created_by; return (sid ? (profilesMap[sid] || "?") : "?").slice(0, 2).toUpperCase(); })()}
                              </AvatarFallback>
                            </Avatar>
                            <span>{(() => { const sid = q.seller_id || q.approved_by || q.created_by; return sid ? (profilesMap[sid] || "Não identificado") : "Não identificado"; })()}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 font-medium">{q.clients?.name || "Cliente não informado"}</td>
                        <td className="py-3 pr-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {Number(q.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                            title="Marcar como organizado e remover da lista"
                            disabled={clearApprovalMutation.isPending}
                            onClick={() => clearApprovalMutation.mutate(q.id)}
                          >
                            <CheckCircle2 className="h-5 w-5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
      <>
      {/* Summary Bar — same statuses as the OS, click to filter */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <button type="button" onClick={() => setStatusFilter("todos")} className="text-left">
          <Card className={cn(
            "shadow-sm border-border/60 overflow-hidden transition-all hover:shadow-md",
            statusFilter === "todos" ? "ring-2 ring-primary border-primary/40" : "hover:border-primary/30"
          )}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-muted text-foreground">
                <Factory className="h-5 w-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider">Total</p>
                <p className="text-2xl font-bold">{summary.total}</p>
              </div>
            </CardContent>
          </Card>
        </button>

        {columns.map(col => {
          const Icon = col.icon;
          const active = statusFilter === col.key;
          return (
            <button key={col.key} type="button" onClick={() => setStatusFilter(col.key)} className="text-left">
              <Card className={cn(
                "shadow-sm border-border/60 overflow-hidden transition-all hover:shadow-md",
                active ? "ring-2 ring-primary border-primary/40" : "hover:border-primary/30"
              )}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={cn("p-3 rounded-xl", col.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider">{col.label}</p>
                    <p className="text-2xl font-bold">{summary.counts[col.key] || 0}</p>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>


      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-card/80 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-border/60">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Pesquisar por OS, cliente, serviço ou responsável..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="pl-9 bg-card border-border focus-visible:ring-primary/20" 
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-card border-border">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              {columns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px] bg-card border-border">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" className="text-muted-foreground hover:text-foreground px-3" onClick={() => { setSearch(""); setStatusFilter("todos"); setPriorityFilter("todos"); }}>
            Limpar
          </Button>
        </div>
      </div>

      {/* View Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : viewMode === "kanban" ? (
        <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-muted">
          {columns.map(col => {
            const colItems = filteredItems.filter((item: any) => item.status === col.key);
            const Icon = col.icon;
            
            return (
              <div key={col.key} className="flex-shrink-0 w-80 bg-muted/40 rounded-2xl p-4 flex flex-col gap-4 border border-border/40">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg", col.color.split(' ')[0])}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="font-bold text-sm text-foreground">{col.label}</h3>
                  </div>
                  <Badge variant="secondary" className="bg-card text-muted-foreground border-border">
                    {colItems.length}
                  </Badge>
                </div>

                <div className="flex flex-col gap-3 min-h-[200px]">
                  {colItems.map((item: any) => {
                    const wo = item.work_orders || {};
                    const isLate = (wo.delivery_deadline) && new Date(wo.delivery_deadline) < new Date() && item.status !== "entregue";

                    return (
                      <Card 
                        key={item.id} 
                        className={cn(
                          "cursor-pointer group hover:ring-2 hover:ring-primary/20 transition-all border-border/60 shadow-sm",
                          isLate && "border-red-500/30 bg-red-500/5"
                        )}
                        onClick={() => {
                          setSelectedItem(item);
                          setIsDetailOpen(true);
                        }}
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-muted-foreground group-hover:text-primary transition-colors">
                              OS-{item.os_id.slice(0, 8)}
                            </span>
                            {item.priority === "urgente" && (
                              <Badge variant="destructive" className="h-5 px-1.5 text-[10px] animate-pulse">URGENTE</Badge>
                            )}
                          </div>
                          
                          <div>
                            <p className="font-bold text-sm line-clamp-1">{wo.clients?.name || "Cliente"}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{wo.description || "Sem descrição"}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">Vendedor: <span className="font-medium text-foreground">{item.seller_id ? (profilesMap[item.seller_id] || "Não identificado") : "Não identificado"}</span></p>
                            {item.items?.length > 0 && (
                              <Badge variant="secondary" className="mt-2 h-5 px-1.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border-indigo-200">
                                <Package className="h-3 w-3 mr-1" />{item.items.length} {item.items.length === 1 ? "serviço" : "serviços"}
                              </Badge>
                            )}
                          </div>


                          <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            <div className="flex -space-x-2">
                              <Avatar className="h-6 w-6 border-2 border-white">
                                <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                                  {wo.employees?.name?.slice(0, 2).toUpperCase() || "?"}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                            <div className={cn("text-[10px] font-medium flex items-center gap-1", isLate ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                              <Calendar className="h-3 w-3" />
                              {wo.delivery_deadline ? formatDateBR(wo.delivery_deadline) : "Sem prazo"}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {colItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border rounded-xl bg-muted/30">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Vazio</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl border-2 border-dashed border-border">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <Search className="h-8 w-8 text-muted-foreground/60" />
              </div>
              <h3 className="font-bold text-foreground">Nenhuma OS encontrada</h3>
              <p className="text-sm text-muted-foreground">Tente ajustar seus filtros de busca.</p>
            </div>
          )}
          {filteredItems.map((item: any) => {
            const wo = item.work_orders || {};
            const isLate = (wo.delivery_deadline) && new Date(wo.delivery_deadline) < new Date() && item.status !== "entregue";
            
            return (
              <Card 
                key={item.id} 
                className={cn(
                  "hover:shadow-md hover:border-primary/20 transition-all cursor-pointer border-border/60 group",
                  isLate && "bg-red-500/5 border-red-500/20"
                )}
                onClick={() => {
                  setSelectedItem(item);
                  setIsDetailOpen(true);
                }}
              >
                <div className="flex flex-col md:flex-row md:items-center p-4 gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex flex-col gap-1 min-w-[120px]">
                      <span className="font-bold text-lg font-mono text-muted-foreground group-hover:text-primary transition-colors">
                        {item.source === 'quote' ? `ORC-${item.os_id.slice(0, 8)}` : `OS-${item.os_id.slice(0, 8)}`}
                      </span>
                      <Badge variant="outline" className={cn("w-fit text-[10px] font-bold py-0 h-5", columns.find(c => c.key === item.status)?.color)}>
                        {columns.find(c => c.key === item.status)?.label || item.status}
                      </Badge>
                    </div>
                    <div className="h-10 w-[1px] bg-muted hidden md:block" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-lg text-foreground">{wo.clients?.name || "Cliente não informado"}</p>
                        {item.priority === "urgente" && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">URGENTE</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">{wo.description || "Sem descrição disponível para este serviço."}</p>
                      <p className="text-xs text-muted-foreground mt-1">Vendedor: <span className="font-medium text-foreground">{item.seller_id ? (profilesMap[item.seller_id] || "Não identificado") : "Não identificado"}</span></p>
                      {item.items?.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border-indigo-200">
                            <Package className="h-3 w-3 mr-1" />{item.items.length} {item.items.length === 1 ? "serviço" : "serviços"}
                          </Badge>
                          {item.items.slice(0, 3).map((it: any, idx: number) => (
                            <Badge key={idx} variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-foreground border-border max-w-[180px] truncate">
                              {it.quantity ? `${it.quantity}x ` : ""}{it.description}
                            </Badge>
                          ))}
                          {item.items.length > 3 && (
                            <span className="text-[10px] text-muted-foreground font-medium">+{item.items.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>


                  <div className="flex items-center gap-6 justify-between md:justify-end">
                    <div className="flex flex-col items-end">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Responsável</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-medium text-foreground">{wo.employees?.name || "Pendente"}</span>
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {wo.employees?.name?.slice(0, 2).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </div>

                    <div className="flex flex-col items-end min-w-[100px]">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Prazo Final</p>
                      <div className={cn("flex items-center gap-1.5 mt-1 font-bold", isLate ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                        <Clock className="h-3.5 w-3.5" />
                        {wo.delivery_deadline ? formatDateBR(wo.delivery_deadline) : "—"}
                      </div>
                    </div>
                    
                    <Button variant="ghost" size="icon" className="text-muted-foreground/60 group-hover:text-primary transition-colors">
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      </>
      )}



      {/* OS Detail Drawer/Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-4">
                  <DialogTitle className="text-2xl font-bold font-mono">
                    OS-{selectedItem.os_id.slice(0, 8)}
                  </DialogTitle>
                  <div className="flex gap-2">
                    <Badge variant="outline" className={columns.find(c => c.key === selectedItem.status)?.color}>
                      {columns.find(c => c.key === selectedItem.status)?.label || selectedItem.status}
                    </Badge>
                    {selectedItem.priority === "urgente" && (
                      <Badge variant="destructive">URGENTE</Badge>
                    )}
                  </div>
                </div>
              </DialogHeader>

              <Tabs defaultValue="info" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="info"><Info className="h-4 w-4 mr-2" /> Informações</TabsTrigger>
                  <TabsTrigger value="materials"><Package className="h-4 w-4 mr-2" /> Materiais</TabsTrigger>
                  <TabsTrigger value="occurrences"><History className="h-4 w-4 mr-2" /> Ocorrências</TabsTrigger>
                  <TabsTrigger value="budget"><FileText className="h-4 w-4 mr-2" /> Orçamento</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground uppercase font-bold text-[10px]">Cliente</p>
                      <p className="font-semibold text-lg">{selectedItem.work_orders?.clients?.name || "Não informado"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground uppercase font-bold text-[10px]">Vendedor</p>
                      <p className="font-semibold">{selectedItem.seller_id ? (profilesMap[selectedItem.seller_id] || "Não identificado") : "Não identificado"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground uppercase font-bold text-[10px]">Responsável</p>
                      <p className="font-semibold">{selectedItem.work_orders?.employees?.name || "Não atribuído"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground uppercase font-bold text-[10px]">Data de Entrada</p>
                      <p className="font-semibold">{formatDateBR(selectedItem.created_at)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground uppercase font-bold text-[10px]">Prazo de Entrega</p>
                      <p className="font-semibold">{selectedItem.work_orders?.delivery_deadline ? formatDateBR(selectedItem.work_orders.delivery_deadline) : "Não definido"}</p>
                    </div>
                  </div>
                  <div className="space-y-1 border-t pt-4">
                    <p className="text-sm text-muted-foreground uppercase font-bold text-[10px]">Descrição do Serviço</p>
                    <p className="text-sm leading-relaxed">{selectedItem.work_orders?.description || "Sem descrição disponível."}</p>
                  </div>
                  <div className="space-y-2 border-t pt-4">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-indigo-600" />
                      <p className="text-sm text-muted-foreground uppercase font-bold text-[10px]">
                        Serviços a Fazer ({selectedItem.items?.length || 0})
                      </p>
                    </div>
                    {selectedItem.items?.length > 0 ? (
                      <div className="space-y-2">
                        {selectedItem.items.map((it: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/30">
                            <div className="flex items-center gap-3 min-w-0">
                              <Badge variant="secondary" className="h-6 px-2 text-xs font-bold bg-indigo-100 text-indigo-700 shrink-0">
                                {it.quantity || 1}x
                              </Badge>
                              <p className="text-sm font-medium text-foreground truncate">{it.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhum serviço detalhado nesta OS.</p>
                    )}
                  </div>

                </TabsContent>

                <TabsContent value="materials" className="pt-4">
                  <WorkOrderMaterials 
                    workOrderId={selectedItem.os_id} 
                    materialStatus={selectedItem.work_orders?.material_status} 
                  />
                </TabsContent>

                <TabsContent value="occurrences" className="pt-4 space-y-4">
                  <div className="space-y-4">
                    {selectedItem.production_occurrences?.length > 0 ? (
                      <div className="space-y-3">
                        {selectedItem.production_occurrences.map((occ: any) => (
                          <div key={occ.id} className="p-4 rounded border border-border bg-card shadow-sm">
                            <div className="flex items-center justify-between space-x-2 mb-1">
                              <div className="font-bold text-foreground">{occ.author_name || "Sistema"}</div>
                              <time className="text-xs text-muted-foreground">{formatDateBR(occ.created_at)}</time>
                            </div>
                            <div className="text-muted-foreground text-sm">{occ.description}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 text-muted-foreground">
                        Nenhuma ocorrência registrada.
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="budget" className="pt-4">
                  <div className="bg-muted p-4 rounded-lg">
                    <p className="text-sm font-medium mb-2">Valor total vinculado:</p>
                    <p className="text-2xl font-bold text-primary">{fmt(Number(selectedItem.work_orders?.total || 0))}</p>
                    <Button variant="link" className="p-0 mt-2 h-auto text-primary" onClick={() => window.open(`/orcamentos?id=${selectedItem.work_orders?.quote_id}`, '_blank')}>
                      Ver orçamento original →
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex justify-between items-center mt-6 pt-6 border-t">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Status:</p>
                  <Select 
                    value={selectedItem.status} 
                    onValueChange={(val) => {
                      updateStatus(selectedItem.id, val);
                      setSelectedItem({...selectedItem, status: val});
                    }}
                  >
                    <SelectTrigger className="w-[180px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Fechar</Button>
                  {selectedItem.status !== "entregue" && (
                    <Button onClick={async () => {
                      await updateStatus(selectedItem.id, 'entregue');
                      setIsDetailOpen(false);
                    }}>
                      Marcar como Entregue
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Production;