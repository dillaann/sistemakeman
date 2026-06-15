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
import { AlertTriangle, ArrowRight, MessageSquare, ChevronDown, ChevronUp, Eye, EyeOff, Search, Info, Package, History, FileText, Factory, Clock, CheckCircle2, AlertCircle, LayoutGrid, List as ListIcon, User, Calendar, ChevronRight, FileSpreadsheet } from "lucide-react";
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
  { key: "aguardando", label: "Aguardando", color: "bg-amber-50/50 border-amber-200/60 text-amber-700", icon: Clock },
  { key: "em_producao", label: "Em Produção", color: "bg-blue-50/50 border-blue-200/60 text-blue-700", icon: Factory },
  { key: "aguardando_instalacao", label: "Aguardando Instalação", color: "bg-cyan-50/50 border-cyan-200/60 text-cyan-700", icon: AlertCircle },
  { key: "entregue", label: "Entregue", color: "bg-emerald-50/50 border-emerald-200/60 text-emerald-700", icon: CheckCircle2 },
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

  const { data: productionItems = [], isLoading } = useQuery({
    queryKey: ["production"],
    queryFn: async () => {
      // Fetch both Work Orders AND Approved Quotes to ensure everyone on the sheet is here
      const [woRes, quotesRes] = await Promise.all([
        supabase
          .from("work_orders")
          .select(`
            id, description, priority, internal_notes, material_status, total, client_id, assigned_to, status, created_at, status_producao, quote_id,
            clients(name)
          `)
          .order("created_at", { ascending: false }),
        supabase
          .from("quotes")
          .select(`
            id, status, payment_method, collection_date, created_at,
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
        status: wo.status_producao || 'aguardando',
        created_at: wo.created_at,
        priority: wo.priority,
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
    const emProducao = productionItems.filter((p: any) => p.status === "em_producao").length;
    
    // Total of late orders (regardless of the filter)
    const atrasadas = productionItems.filter((p: any) => {
      const wo = p.work_orders || {};
      const prazo = p.data_entrega || wo.delivery_deadline;
      const isFinished = p.status === "entregue";
      return prazo && new Date(prazo) < new Date() && !isFinished;
    }).length;

    // Completed in the currently viewed month
    const concluidasMês = productionItems.filter((p: any) => {
      const isFinished = p.status === "entregue";
      if (!isFinished) return false;
      const wo = p.work_orders || {};
      const dataConclusao = p.data_conclusao || wo.delivered_at || wo.completed_at;
      if (!dataConclusao) return false;
      return isInRange(dataConclusao, dateRange);
    }).length;

    // Total of pending services (items) on orders not yet delivered
    const servicosPendentes = productionItems
      .filter((p: any) => p.status !== "entregue")
      .reduce((acc: number, p: any) => acc + (p.items?.length || 0), 0);

    return { total, emProducao, atrasadas, concluidasMês, servicosPendentes };
  }, [productionItems, dateRange]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const updateStatus = async (id: string, newStatus: string, source?: string) => {
    try {
      if (source === 'quote') {
        toast({ title: "Aviso", description: "Crie uma Ordem de Serviço para este orçamento para gerenciar a produção.", variant: "default" });
        return;
      }

      const { error } = await supabase
        .from('work_orders')
        .update({ 
          status_producao: newStatus,
          completed_at: newStatus === 'entregue' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
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
    <div className="p-4 md:p-6 space-y-6 bg-slate-50/30 min-h-screen">
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
            className="h-9 gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
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

      {/* Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="shadow-sm border-slate-200/60 overflow-hidden group hover:border-indigo-500/30 transition-colors">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-indigo-500/80 text-xs font-bold uppercase tracking-wider">Serviços a Fazer</p>
              <p className="text-2xl font-bold text-indigo-700">{summary.servicosPendentes}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200/60 overflow-hidden group hover:border-primary/30 transition-colors">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-slate-100 text-slate-600 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Abertas</p>
              <p className="text-2xl font-bold">{summary.total}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200/60 overflow-hidden group hover:border-blue-500/30 transition-colors">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-blue-500/80 text-xs font-bold uppercase tracking-wider">Em Produção Hoje</p>
              <p className="text-2xl font-bold text-blue-700">{summary.emProducao}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200/60 border-l-4 border-l-red-500 overflow-hidden group hover:border-red-500/30 transition-colors">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-50 text-red-600">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-red-500/80 text-xs font-bold uppercase tracking-wider">Atrasadas</p>
              <p className="text-2xl font-bold text-red-700">{summary.atrasadas}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200/60 overflow-hidden group hover:border-green-500/30 transition-colors">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-50 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-green-500/80 text-xs font-bold uppercase tracking-wider">Concluídas Mês</p>
              <p className="text-2xl font-bold text-green-700">{summary.concluidasMês}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-slate-200/60">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Pesquisar por OS, cliente, serviço ou responsável..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="pl-9 bg-white border-slate-200 focus-visible:ring-primary/20" 
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] bg-white border-slate-200">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              {columns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px] bg-white border-slate-200">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" className="text-slate-500 hover:text-slate-900 px-3" onClick={() => { setSearch(""); setStatusFilter("todos"); setPriorityFilter("todos"); }}>
            Limpar
          </Button>
        </div>
      </div>

      {/* View Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-200/50 rounded-xl animate-pulse" />)}
        </div>
      ) : viewMode === "kanban" ? (
        <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-slate-200">
          {columns.map(col => {
            const colItems = filteredItems.filter((item: any) => item.status === col.key);
            const Icon = col.icon;
            
            return (
              <div key={col.key} className="flex-shrink-0 w-80 bg-slate-100/50 rounded-2xl p-4 flex flex-col gap-4 border border-slate-200/40">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-lg", col.color.split(' ')[0])}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="font-bold text-sm text-slate-700">{col.label}</h3>
                  </div>
                  <Badge variant="secondary" className="bg-white text-slate-500 border-slate-200">
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
                          "cursor-pointer group hover:ring-2 hover:ring-primary/20 transition-all border-slate-200/60 shadow-sm",
                          isLate && "border-red-200 bg-red-50/30"
                        )}
                        onClick={() => {
                          setSelectedItem(item);
                          setIsDetailOpen(true);
                        }}
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-xs font-bold text-slate-400 group-hover:text-primary transition-colors">
                              OS-{item.os_id.slice(0, 8)}
                            </span>
                            {item.priority === "urgente" && (
                              <Badge variant="destructive" className="h-5 px-1.5 text-[10px] animate-pulse">URGENTE</Badge>
                            )}
                          </div>
                          
                          <div>
                            <p className="font-bold text-sm line-clamp-1">{wo.clients?.name || "Cliente"}</p>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-1">{wo.description || "Sem descrição"}</p>
                            {item.items?.length > 0 && (
                              <Badge variant="secondary" className="mt-2 h-5 px-1.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border-indigo-200">
                                <Package className="h-3 w-3 mr-1" />{item.items.length} {item.items.length === 1 ? "serviço" : "serviços"}
                              </Badge>
                            )}
                          </div>


                          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <div className="flex -space-x-2">
                              <Avatar className="h-6 w-6 border-2 border-white">
                                <AvatarFallback className="text-[10px] bg-slate-100 text-slate-500">
                                  {wo.employees?.name?.slice(0, 2).toUpperCase() || "?"}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                            <div className={cn("text-[10px] font-medium flex items-center gap-1", isLate ? "text-red-600" : "text-slate-400")}>
                              <Calendar className="h-3 w-3" />
                              {wo.delivery_deadline ? formatDateBR(wo.delivery_deadline) : "Sem prazo"}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {colItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Vazio</p>
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
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border-2 border-dashed border-slate-200">
              <div className="p-4 rounded-full bg-slate-50 mb-4">
                <Search className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="font-bold text-slate-600">Nenhuma OS encontrada</h3>
              <p className="text-sm text-slate-400">Tente ajustar seus filtros de busca.</p>
            </div>
          )}
          {filteredItems.map((item: any) => {
            const wo = item.work_orders || {};
            const isLate = (wo.delivery_deadline) && new Date(wo.delivery_deadline) < new Date() && item.status !== "entregue";
            
            return (
              <Card 
                key={item.id} 
                className={cn(
                  "hover:shadow-md hover:border-primary/20 transition-all cursor-pointer border-slate-200/60 group",
                  isLate && "bg-red-50/30 border-red-100"
                )}
                onClick={() => {
                  setSelectedItem(item);
                  setIsDetailOpen(true);
                }}
              >
                <div className="flex flex-col md:flex-row md:items-center p-4 gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex flex-col gap-1 min-w-[120px]">
                      <span className="font-bold text-lg font-mono text-slate-400 group-hover:text-primary transition-colors">
                        {item.source === 'quote' ? `ORC-${item.os_id.slice(0, 8)}` : `OS-${item.os_id.slice(0, 8)}`}
                      </span>
                      <Badge variant="outline" className={cn("w-fit text-[10px] font-bold py-0 h-5", columns.find(c => c.key === item.status)?.color)}>
                        {columns.find(c => c.key === item.status)?.label || item.status}
                      </Badge>
                    </div>
                    <div className="h-10 w-[1px] bg-slate-100 hidden md:block" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-lg text-slate-800">{wo.clients?.name || "Cliente não informado"}</p>
                        {item.priority === "urgente" && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">URGENTE</Badge>}
                      </div>
                      <p className="text-sm text-slate-500 line-clamp-1">{wo.description || "Sem descrição disponível para este serviço."}</p>
                      {item.items?.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border-indigo-200">
                            <Package className="h-3 w-3 mr-1" />{item.items.length} {item.items.length === 1 ? "serviço" : "serviços"}
                          </Badge>
                          {item.items.slice(0, 3).map((it: any, idx: number) => (
                            <Badge key={idx} variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-slate-600 border-slate-200 max-w-[180px] truncate">
                              {it.quantity ? `${it.quantity}x ` : ""}{it.description}
                            </Badge>
                          ))}
                          {item.items.length > 3 && (
                            <span className="text-[10px] text-slate-400 font-medium">+{item.items.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>


                  <div className="flex items-center gap-6 justify-between md:justify-end">
                    <div className="flex flex-col items-end">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Responsável</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-medium text-slate-700">{wo.employees?.name || "Pendente"}</span>
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {wo.employees?.name?.slice(0, 2).toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </div>

                    <div className="flex flex-col items-end min-w-[100px]">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Prazo Final</p>
                      <div className={cn("flex items-center gap-1.5 mt-1 font-bold", isLate ? "text-red-500" : "text-slate-700")}>
                        <Clock className="h-3.5 w-3.5" />
                        {wo.delivery_deadline ? formatDateBR(wo.delivery_deadline) : "—"}
                      </div>
                    </div>
                    
                    <Button variant="ghost" size="icon" className="text-slate-300 group-hover:text-primary transition-colors">
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
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
                      {selectedItem.status}
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
                          <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                            <div className="flex items-center gap-3 min-w-0">
                              <Badge variant="secondary" className="h-6 px-2 text-xs font-bold bg-indigo-100 text-indigo-700 shrink-0">
                                {it.quantity || 1}x
                              </Badge>
                              <p className="text-sm font-medium text-slate-700 truncate">{it.description}</p>
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
                          <div key={occ.id} className="p-4 rounded border border-slate-200 bg-white shadow-sm">
                            <div className="flex items-center justify-between space-x-2 mb-1">
                              <div className="font-bold text-slate-900">{occ.author_name || "Sistema"}</div>
                              <time className="text-xs text-muted-foreground">{formatDateBR(occ.created_at)}</time>
                            </div>
                            <div className="text-slate-500 text-sm">{occ.description}</div>
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