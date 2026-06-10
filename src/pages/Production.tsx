import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  AlertTriangle, 
  ArrowRight, 
  MessageSquare, 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  EyeOff, 
  DollarSign, 
  Calendar, 
  ExternalLink,
  Clock,
  CheckCircle2,
  Package,
  Truck,
  ArrowRightCircle,
  MoreVertical,
  History
} from "lucide-react";
import WorkOrderMaterials from "@/components/WorkOrderMaterials";
import MonthFilter, { getDateRange, isInRangeOrOpen, type PeriodMode } from "@/components/MonthFilter";
import { localDateString, formatDateBR } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const columns = [
  { key: "Fila de Produção", label: "Fila", icon: Clock, color: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400" },
  { key: "Em Andamento", label: "Andamento", icon: CheckCircle2, color: "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400" },
  { key: "Aguardando Material", label: "Materiais", icon: Package, color: "bg-orange-500/10 border-orange-500/20 text-orange-700 dark:text-orange-400" },
  { key: "Aguardando Instalação", label: "Entrega", icon: Truck, color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" },
];

const nextColumnMap: Record<string, string[]> = {
  "Fila de Produção": ["Em Andamento", "Aguardando Material"],
  "Em Andamento": ["Aguardando Material", "Aguardando Instalação"],
  "Aguardando Material": ["Em Andamento", "Aguardando Instalação"],
  "Aguardando Instalação": ["Entregue"],
};

const STORAGE_KEY = "production-collapsed-columns";

function loadCollapsedState(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}

function saveCollapsedState(state: Record<string, boolean>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

const EXPANDED_CARDS_KEY = "production-expanded-cards";

function loadExpandedCards(): Set<string> {
  try {
    const saved = localStorage.getItem(EXPANDED_CARDS_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch { return new Set(); }
}

function saveExpandedCards(cards: Set<string>) {
  try { localStorage.setItem(EXPANDED_CARDS_KEY, JSON.stringify([...cards])); } catch {}
}

const Production = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [notesText, setNotesText] = useState("");
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [financialFilter, setFinancialFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("novos");
  const dateRange = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);

  // Column-level collapse (minimize all cards in column)
  const [collapsedCols, setCollapsedCols] = useState<Record<string, boolean>>(() => {
    const saved = loadCollapsedState();
    // On mobile, default to collapsed
    if (window.innerWidth < 768) {
      const defaults: Record<string, boolean> = {};
      columns.forEach(c => { defaults[c.key] = true; });
      return { ...defaults, ...saved };
    }
    return saved;
  });

  // Individual card expansion (overrides column collapse)
  const [expandedCards, setExpandedCards] = useState<Set<string>>(() => loadExpandedCards());

  const toggleColumn = useCallback((colKey: string) => {
    setCollapsedCols(prev => {
      const next = { ...prev, [colKey]: !prev[colKey] };
      saveCollapsedState(next);
      return next;
    });
    // Reset individual card overrides for this column
    setExpandedCards(prev => {
      const next = new Set(prev);
      // Clear overrides when toggling column
      productionItems
        .filter((p: any) => p.status === colKey)
        .forEach((p: any) => next.delete(p.id));
      saveExpandedCards(next);
      return next;
    });
  }, []);

  const toggleCard = useCallback((cardId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      saveExpandedCards(next);
      return next;
    });
  }, []);

  const isCardExpanded = useCallback((cardId: string, colKey: string) => {
    if (expandedCards.has(cardId)) return true;
    return !collapsedCols[colKey];
  }, [expandedCards, collapsedCols]);

  const { data: productionItems = [], isLoading } = useQuery({
    queryKey: ["production"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const osIds = (data ?? []).map((p: any) => p.os_id).filter(Boolean);
      if (osIds.length === 0) return [];

      const { data: workOrders, error: woError } = await supabase
        .from("work_orders")
        .select("id, description, priority, internal_notes, material_status, total, client_id, assigned_to, billing_date, financial_status, remaining_amount, is_legacy, clients!work_orders_client_id_fkey(name)")
        .in("id", osIds);

      if (woError) throw woError;
      
      const woList = workOrders ?? [];
      const missingClientIds = [...new Set(woList
        .filter((wo: any) => !wo.clients?.name && wo.client_id)
        .map((wo: any) => wo.client_id))];
      
      let clientMap = new Map<string, string>();
      if (missingClientIds.length > 0) {
        const { data: clients } = await supabase
          .from("clients")
          .select("id, name")
          .in("id", missingClientIds);
        clientMap = new Map((clients ?? []).map((c: any) => [c.id, c.name]));
      }

      const assignedIds = [...new Set(woList
        .filter((wo: any) => wo.assigned_to)
        .map((wo: any) => wo.assigned_to))];

      let employeeMap = new Map<string, string>();
      if (assignedIds.length > 0) {
        const { data: employees, error: employeeError } = await supabase
          .from("employees")
          .select("id, name")
          .in("id", assignedIds);

        if (employeeError) {
          console.error("Error fetching employees for production:", employeeError);
        } else {
          employeeMap = new Map((employees ?? []).map((employee: any) => [employee.id, employee.name]));
        }
      }

      const { data: woItems } = await supabase
        .from("work_order_items" as any)
        .select("work_order_id, description, quantity")
        .in("work_order_id", osIds);
      
      const woItemsMap = new Map<string, any[]>();
      (woItems ?? []).forEach((item: any) => {
        const list = woItemsMap.get(item.work_order_id) || [];
        list.push(item);
        woItemsMap.set(item.work_order_id, list);
      });

      const woMap = new Map(woList.map((wo: any) => {
        if (!wo.clients?.name && wo.client_id && clientMap.has(wo.client_id)) {
          wo.clients = { name: clientMap.get(wo.client_id) };
        }
        if (!wo.employees?.name && wo.assigned_to && employeeMap.has(wo.assigned_to)) {
          wo.employees = { name: employeeMap.get(wo.assigned_to) };
        }
        wo.items = woItemsMap.get(wo.id) || [];
        return [wo.id, wo];
      }));

      return (data ?? []).map((p: any) => ({
        ...p,
        work_orders: woMap.get(p.os_id) || null,
      }));
    },
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("production-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "production" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["production"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates, table = "production" }: { id: string; updates: Record<string, any>; table?: string }) => {
      const { error } = await supabase.from(table as any).update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production"] });
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Atualizado!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    },
  });

  const markAsPaid = (woId: string) => {
    updateMutation.mutate({ id: woId, updates: { financial_status: "Pago", remaining_amount: 0 }, table: "work_orders" });
  };

  const rescheduleBilling = (woId: string, newDate: string) => {
    updateMutation.mutate({ id: woId, updates: { billing_date: newDate }, table: "work_orders" });
  };

  const moveToStatus = (id: string, status: string) => {
    const item = productionItems.find((p: any) => p.id === id);
    if (item) {
      let woStatus: "aguardando" | "em_producao" | "aguardando_instalacao" | "entregue" = "aguardando";
      if (status === "Em Andamento") woStatus = "em_producao";
      if (status === "Aguardando Material") woStatus = "em_producao";
      if (status === "Aguardando Instalação") woStatus = "aguardando_instalacao";
      if (status === "Entregue") woStatus = "entregue";
      supabase.from("work_orders").update({ status: woStatus }).eq("id", item.os_id).then(() => {
        queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      });
    }
    updateMutation.mutate({ id, updates: { status } });
  };

  const saveNotes = () => {
    if (!selectedItem) return;
    updateMutation.mutate({ id: selectedItem.id, updates: { observacoes: notesText } });
    setSelectedItem(null);
  };

  const togglePriority = (item: any) => {
    const newPriority = item.priority === "urgente" ? "normal" : "urgente";
    updateMutation.mutate({ id: item.id, updates: { priority: newPriority } });
  };

  const getColumnItems = (columnKey: string) => {
    const today = localDateString();
    return productionItems.filter((p: any) => {
      if (p.status !== columnKey) return false;
      
      const wo = p.work_orders;
      
      // Filter by tab
      const isLegacy = !!wo?.is_legacy;
      if (activeTab === "novos" && isLegacy) return false;
      if (activeTab === "antigos" && !isLegacy) return false;

      if (financialFilter !== "all") {
        if (financialFilter === "pagos" && wo?.financial_status !== "Pago") return false;
        if (financialFilter === "atraso") {
          const isAtrasado = wo?.billing_date && wo.billing_date < today && wo.financial_status !== "Pago";
          if (!isAtrasado) return false;
        }
        if (financialFilter === "cobrar_hoje") {
          const isCobrarHoje = wo?.billing_date === today && wo.financial_status !== "Pago";
          if (!isCobrarHoje) return false;
        }
        if (financialFilter === "esta_semana") {
          const startOfWeek = new Date();
          startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          const sDate = localDateString(startOfWeek);
          const eDate = localDateString(endOfWeek);
          const isThisWeek = wo?.billing_date && wo.billing_date >= sDate && wo.billing_date <= eDate;
          if (!isThisWeek) return false;
        }
      }

      const isOpen = p.status !== "Entregue";
      return isInRangeOrOpen(p.created_at, dateRange, isOpen, p.data_conclusao);
    });
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4 rounded-xl border shadow-sm sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fluxo de Produção</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas ordens de serviço e prazos</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={financialFilter} onValueChange={setFinancialFilter}>
            <SelectTrigger className="w-[160px] h-10 shadow-sm">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <SelectValue placeholder="Financeiro" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="cobrar_hoje">Cobrar hoje</SelectItem>
              <SelectItem value="atraso">Em atraso</SelectItem>
              <SelectItem value="esta_semana">Esta semana</SelectItem>
              <SelectItem value="pagos">Pagos</SelectItem>
            </SelectContent>
          </Select>
          <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6 bg-muted/50 p-1.5 h-12 rounded-xl border-2">
            <TabsTrigger value="novos" className="rounded-lg font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm px-6">
              <Package className="h-4 w-4 mr-2" /> Produção Atual
            </TabsTrigger>
            <TabsTrigger value="antigos" className="rounded-lg font-bold data-[state=active]:bg-background data-[state=active]:shadow-sm px-6">
              <History className="h-4 w-4 mr-2" /> Pedidos Antigos
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {columns.map(col => {
                const colItems = getColumnItems(col.key);
                const isColCollapsed = !!collapsedCols[col.key];
                return (
                  <div key={col.key} className="space-y-4">
                    <div className={`rounded-xl border p-4 shadow-sm transition-all duration-300 ${col.color}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-background/50 backdrop-blur-sm">
                            <col.icon className="h-4 w-4" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm tracking-tight">{col.label}</h3>
                            <p className="text-[10px] opacity-70 leading-none">{colItems.length} OS Ativas</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-black/5 rounded-full"
                          onClick={() => toggleColumn(col.key)}
                        >
                          {isColCollapsed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    {/* HIDDEN MODE: compact numbered list */}
                    {isColCollapsed && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        {colItems.map((item: any, idx: number) => {
                          const wo = item.work_orders;
                          return (
                            <div
                              key={item.id}
                              onClick={() => { setSelectedItem(item); setNotesText(item.observacoes || ""); }}
                              className="group bg-card border rounded-lg p-3 text-xs flex items-center gap-3 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer"
                            >
                              <span className="text-muted-foreground font-medium">{idx + 1}.</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold truncate">{wo?.clients?.name || "—"}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">OS-{item.os_id?.slice(0, 6).toUpperCase()}</p>
                              </div>
                              {item.priority === "urgente" && <AlertTriangle className="h-3.5 w-3.5 text-destructive animate-pulse" />}
                            </div>
                          );
                        })}
                        {colItems.length === 0 && (
                          <div className="text-center py-6 bg-muted/20 rounded-xl border border-dashed">
                            <p className="text-xs text-muted-foreground">Vazio</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* VISIBLE MODE: full cards */}
                    {!isColCollapsed && (
                      <div className="space-y-3 min-h-[100px] animate-in fade-in zoom-in-95 duration-300">
                    {colItems.map((item: any) => {
                      const wo = item.work_orders;
                      const expanded = isCardExpanded(item.id, col.key);
                      const clientName = wo?.clients?.name || "Cliente não encontrado";

                      return (
                        <Card
                          key={item.id}
                          className={`group overflow-hidden border-2 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                            item.priority === "urgente" 
                              ? "border-destructive/30 bg-destructive/5 shadow-destructive/10" 
                              : "border-border/50 bg-card"
                          }`}
                        >
                          <div className={`h-1.5 w-full ${item.priority === "urgente" ? "bg-destructive animate-pulse" : "bg-primary/20"}`} />
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="font-mono text-[10px] px-1.5 h-5 bg-background/50">
                                    OS #{item.os_id?.slice(0, 8).toUpperCase()}
                                  </Badge>
                                  {item.priority === "urgente" && (
                                    <Badge variant="destructive" className="text-[10px] h-5 px-1.5 font-bold uppercase tracking-wider">
                                      Urgente
                                    </Badge>
                                  )}
                                </div>
                                <h4 className="font-bold text-base leading-tight truncate group-hover:text-primary transition-colors">
                                  {clientName}
                                </h4>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-sm font-black text-primary tracking-tight">
                                  {fmt(Number(wo?.total || 0))}
                                </span>
                                <button
                                  onClick={() => toggleCard(item.id)}
                                  className="p-1.5 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                                >
                                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                              </div>
                            </div>

                             {/* Quick Actions Row */}
                            <div className="flex items-center justify-between pt-1">
                              <div className="flex -space-x-2">
                                {wo?.employees?.name && (
                                  <div 
                                    className="h-7 w-7 rounded-full bg-primary/10 border-2 border-background flex items-center justify-center text-[10px] font-bold text-primary cursor-help"
                                    title={`Responsável: ${wo.employees.name}`}
                                  >
                                    {wo.employees.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="h-7 w-7 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {!expanded && (
                                  <Badge variant="outline" className="text-[10px] bg-muted/30">
                                    Pendente: {fmt(Number(wo?.remaining_amount || 0))}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {expanded && (
                              <div className="space-y-4 pt-3 border-t animate-in fade-in slide-in-from-top-2 duration-500">
                                <div className="space-y-1">
                                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Descrição</p>
                                  <p className="text-xs text-foreground/80 leading-relaxed bg-muted/30 p-2 rounded-lg border border-dashed">
                                    {wo?.description || "Sem descrição"}
                                  </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-2 bg-primary/5 p-3 rounded-xl border border-primary/10">
                                    <div className="flex items-center gap-2 text-primary">
                                      <DollarSign className="h-3.5 w-3.5" />
                                      <span className="text-[10px] font-bold uppercase">Financeiro</span>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-muted-foreground">Pendente</p>
                                      <p className="text-xs font-black">{fmt(Number(wo?.remaining_amount || 0))}</p>
                                    </div>
                                    <Button 
                                      size="sm" 
                                      className="h-7 w-full text-[10px] font-bold bg-primary hover:bg-primary/90 shadow-sm"
                                      onClick={() => markAsPaid(item.os_id)}
                                      disabled={wo?.financial_status === "Pago"}
                                    >
                                      {wo?.financial_status === "Pago" ? "Pago ✓" : "Quitar"}
                                    </Button>
                                  </div>

                                  <div className="space-y-2 bg-muted/30 p-3 rounded-xl border border-border/50">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                      <Calendar className="h-3.5 w-3.5" />
                                      <span className="text-[10px] font-bold uppercase">Cobrança</span>
                                    </div>
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-muted-foreground">Próxima Data</p>
                                      <p className="text-xs font-bold">{wo?.billing_date ? formatDateBR(wo.billing_date) : "—"}</p>
                                    </div>
                                    <Input 
                                      type="date" 
                                      className="h-7 text-[10px] p-1 h-7 border-muted-foreground/20 focus:border-primary/50" 
                                      onChange={(e) => rescheduleBilling(item.os_id, e.target.value)}
                                    />
                                  </div>
                                </div>

                                {wo?.items && wo.items.length > 0 && (
                                  <div className="space-y-2">
                                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Serviços</p>
                                    <div className="grid grid-cols-1 gap-1">
                                      {wo.items.map((svc: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between text-[11px] bg-muted/20 p-2 rounded-lg border border-border/30">
                                          <span className="flex-1 truncate pr-2">{svc.description}</span>
                                          <Badge variant="secondary" className="h-5 text-[9px] font-bold">{Number(svc.quantity)} UN</Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="space-y-3 pt-2">
                                  {item.observacoes && (
                                    <div className="bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-400 p-3 rounded-r-lg">
                                      <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase flex items-center gap-1">
                                        <MessageSquare className="h-3 w-3" /> Observações
                                      </p>
                                      <p className="text-xs text-amber-800 dark:text-amber-300/80 italic mt-1 leading-relaxed">
                                        {item.observacoes}
                                      </p>
                                    </div>
                                  )}

                                  <WorkOrderMaterials
                                    workOrderId={item.os_id}
                                    materialStatus={wo?.material_status || "nao_solicitado"}
                                  />

                                  <div className="grid grid-cols-2 gap-2 pt-2">
                                    <Button
                                      size="sm" variant="outline" 
                                      className="h-9 text-[11px] font-bold border-2 hover:bg-muted"
                                      onClick={() => { setSelectedItem(item); setNotesText(item.observacoes || ""); }}
                                    >
                                      <MessageSquare className="h-3.5 w-3.5 mr-2" /> Notas
                                    </Button>

                                    <Button
                                      size="sm" variant="outline" 
                                      className="h-9 text-[11px] font-bold border-2 hover:bg-primary/5 hover:text-primary hover:border-primary/30"
                                      onClick={() => navigate(`/work-orders?id=${item.os_id}`)}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5 mr-2" /> Abrir OS
                                    </Button>
                                  </div>

                                  <div className="pt-2">
                                    {col.key === "Aguardando Instalação" ? (
                                      <Button
                                        className="w-full h-10 font-black uppercase tracking-widest text-[11px] bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20"
                                        onClick={() => moveToStatus(item.id, "Entregue")}
                                      >
                                        <ArrowRightCircle className="h-4 w-4 mr-2" /> Finalizar Entrega
                                      </Button>
                                    ) : (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button className="w-full h-10 font-black uppercase tracking-widest text-[11px] bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 shadow-xl">
                                            Mover de Etapa <MoreVertical className="ml-2 h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-[200px]">
                                          {(nextColumnMap[col.key] || []).map(s => (
                                            <DropdownMenuItem key={s} onClick={() => moveToStatus(item.id, s)} className="font-bold text-xs p-3">
                                              Mover para: {s}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {!expanded && (
                              <div className="flex flex-col gap-2 pt-2 animate-in fade-in duration-300">
                                <div className="flex items-center justify-between text-[10px] bg-muted/40 p-2 rounded-lg border border-border/30">
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    <span>{wo?.billing_date ? formatDateBR(wo.billing_date) : "Sem data"}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-primary font-bold">
                                    <DollarSign className="h-3 w-3" />
                                    <span>{fmt(Number(wo?.remaining_amount || 0))}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    className="h-8 text-[10px] font-bold flex-1 border-2"
                                    onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setNotesText(item.observacoes || ""); }}
                                  >
                                    <MessageSquare className="h-3 w-3 mr-1" /> Notas
                                  </Button>
                                  
                                  {col.key === "Aguardando Instalação" ? (
                                    <Button
                                      className="h-8 text-[10px] font-black uppercase flex-1 bg-emerald-600 hover:bg-emerald-700"
                                      onClick={(e) => { e.stopPropagation(); moveToStatus(item.id, "Entregue"); }}
                                    >
                                      Finalizar
                                    </Button>
                                  ) : (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button className="h-8 text-[10px] font-black uppercase flex-1 bg-slate-800 hover:bg-slate-900 shadow-sm" onClick={(e) => e.stopPropagation()}>
                                          Próxima Etapa
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-[180px]">
                                        {(nextColumnMap[col.key] || []).map(s => (
                                          <DropdownMenuItem key={s} onClick={() => moveToStatus(item.id, s)} className="font-bold text-xs p-3">
                                            {s}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}

                    {colItems.length === 0 && (
                      <div className="text-center py-12 bg-muted/20 rounded-2xl border-2 border-dashed border-border/50">
                        <Package className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Nenhuma OS nesta etapa</p>
                      </div>
                    )}
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
      )}

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>OS #{selectedItem?.os_id?.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          {selectedItem && (() => {
            const wo = selectedItem.work_orders;
            const clientName = wo?.clients?.name || "—";
            return (
              <div className="space-y-3">
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Cliente:</span> <strong>{clientName}</strong></p>
                  {wo?.total && <p><span className="text-muted-foreground">Valor:</span> <strong>{fmt(Number(wo.total))}</strong></p>}
                  {wo?.description && <p><span className="text-muted-foreground">Descrição:</span> {wo.description}</p>}
                  {wo?.employees?.name && <p><span className="text-muted-foreground">Responsável:</span> {wo.employees.name}</p>}
                  <p><span className="text-muted-foreground">Status:</span> {selectedItem.status}</p>
                  <p><span className="text-muted-foreground">Prioridade:</span> {selectedItem.priority === "urgente" ? "🔴 Urgente" : "Normal"}</p>
                </div>

                {wo?.items && wo.items.length > 0 && (
                  <div className="text-xs space-y-0.5 bg-muted/40 rounded p-2">
                    <p className="font-medium text-muted-foreground text-sm">Serviços:</p>
                    {wo.items.map((svc: any, idx: number) => (
                      <p key={idx} className="text-muted-foreground">• {svc.description} — {Number(svc.quantity)} un</p>
                    ))}
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium mb-1">Observações</p>
                  <Textarea
                    value={notesText}
                    onChange={e => setNotesText(e.target.value)}
                    placeholder="Ex: aguardando tinta, falta solda..."
                    rows={3}
                  />
                </div>
                <Button onClick={saveNotes} className="w-full">Salvar Observações</Button>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Production;
