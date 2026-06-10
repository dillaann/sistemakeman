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
import { AlertTriangle, ArrowRight, MessageSquare, ChevronDown, ChevronUp, Eye, EyeOff, Search, Info, Package, History, FileText, Factory, Clock, CheckCircle2, AlertCircle, LayoutGrid, List as ListIcon, User, Calendar, ChevronRight } from "lucide-react";
import WorkOrderMaterials from "@/components/WorkOrderMaterials";
import MonthFilter, { getDateRange, isInRangeOrOpen, type PeriodMode } from "@/components/MonthFilter";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateBR, cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const columns = [
  { key: "Fila de Produção", label: "Fila de Produção", color: "bg-amber-50/50 border-amber-200/60 text-amber-700", icon: Clock },
  { key: "Em Andamento", label: "Em Andamento", color: "bg-blue-50/50 border-blue-200/60 text-blue-700", icon: Clock },
  { key: "Aguardando Material", label: "Aguardando Material", color: "bg-orange-50/50 border-orange-200/60 text-orange-700", icon: Package },
  { key: "Aguardando Instalação", label: "Aguardando Instalação", color: "bg-cyan-50/50 border-cyan-200/60 text-cyan-700", icon: Clock },
  { key: "Concluído", label: "Concluído", color: "bg-emerald-50/50 border-emerald-200/60 text-emerald-700", icon: CheckCircle2 },
  { key: "Entregue", label: "Entregue", color: "bg-slate-50/50 border-slate-200/60 text-slate-700", icon: CheckCircle2 },
];

const statusMap: Record<string, string> = {
  'aguardando': 'Fila de Produção',
  'em_producao': 'Em Andamento',
  'aguardando_instalacao': 'Aguardando Instalação',
  'entregue': 'Entregue'
};

const Production = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const dateRange = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [priorityFilter, setPriorityFilter] = useState("todos");

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "kanban">("cards");

  const { data: productionItems = [], isLoading } = useQuery({
    queryKey: ["production"],
    queryFn: async () => {
      // 1. Get explicit production entries
      const { data: explicitProd, error: prodErr } = await supabase
        .from("production")
        .select(`
          *,
          work_orders(
            id, description, priority, internal_notes, material_status, total, client_id, assigned_to,
            clients(name),
            employees(name)
          ),
          production_occurrences(
            id, description, created_at, author_name
          )
        `)
        .order("created_at", { ascending: false });
      
      if (prodErr) throw prodErr;

      // 2. Get all work orders to find ones NOT in production table
      const prodOsIds = new Set(explicitProd?.map(p => p.os_id) || []);
      
      const { data: allWOs, error: woErr } = await supabase
        .from("work_orders")
        .select(`
          id, description, priority, internal_notes, material_status, total, client_id, assigned_to, status, created_at,
          clients(name),
          employees(name)
        `);
      
      if (woErr) throw woErr;

      // 4. Transform work orders not in production into virtual production items
      const virtualItems = (allWOs || [])
        .filter(wo => !prodOsIds.has(wo.id))
        .map(wo => ({
          id: `virtual-${wo.id}`,
          os_id: wo.id,
          status: statusMap[wo.status as string] || 'Fila de Produção',
          created_at: wo.created_at,
          priority: wo.priority,
          work_orders: wo,
          production_occurrences: [],
          is_virtual: true
        }));

      return [...(explicitProd || []), ...virtualItems];
    },
  });

  const filteredItems = useMemo(() => {
    return productionItems.filter((item: any) => {
      const wo = item.work_orders || {};
      const clientName = wo.clients?.name || "";
      const matchesSearch = 
        item.os_id.toLowerCase().includes(search.toLowerCase()) ||
        clientName.toLowerCase().includes(search.toLowerCase()) ||
        (wo.description || "").toLowerCase().includes(search.toLowerCase());
      
      const matchesStatus = statusFilter === "todos" || item.status === statusFilter;
      const matchesPriority = priorityFilter === "todos" || item.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [productionItems, search, statusFilter, priorityFilter]);

  const summary = useMemo(() => {
    const total = productionItems.length;
    const emProducao = productionItems.filter((p: any) => p.status === "Em Andamento").length;
    const atrasadas = productionItems.filter((p: any) => {
      const prazo = p.data_entrega || p.work_orders?.delivery_deadline;
      return prazo && new Date(prazo) < new Date() && !["Concluído", "Entregue"].includes(p.status);
    }).length;
    const concluidasMês = productionItems.filter((p: any) => {
      if (p.status !== "Concluído") return false;
      const dataConclusao = p.data_conclusao ? new Date(p.data_conclusao) : null;
      if (!dataConclusao) return false;
      const now = new Date();
      return dataConclusao.getMonth() === now.getMonth() && dataConclusao.getFullYear() === now.getFullYear();
    }).length;
    return { total, emProducao, atrasadas, concluidasMês };
  }, [productionItems]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('production')
        .update({ 
          status: newStatus,
          data_conclusao: newStatus === 'Concluído' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      
      if (error) throw error;

      // Log the change
      await supabase.from('production_logs').insert({
        production_id: id,
        new_status: newStatus,
        notes: `Status alterado para ${newStatus}`
      });

      queryClient.invalidateQueries({ queryKey: ["production"] });
      toast({ title: "Status atualizado!", description: `OS movida para ${newStatus}` });
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
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                    const isLate = (item.data_entrega || wo.delivery_deadline) && new Date(item.data_entrega || wo.delivery_deadline) < new Date() && !["Concluído", "Entregue"].includes(item.status);

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
                              {(item.data_entrega || wo.delivery_deadline) ? formatDateBR(item.data_entrega || wo.delivery_deadline) : "Sem prazo"}
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
            const isLate = (item.data_entrega || wo.delivery_deadline) && new Date(item.data_entrega || wo.delivery_deadline) < new Date() && !["Concluído", "Entregue"].includes(item.status);
            
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
                        OS-{item.os_id.slice(0, 8)}
                      </span>
                      <Badge variant="outline" className={cn("w-fit text-[10px] font-bold py-0 h-5", columns.find(c => c.key === item.status)?.color)}>
                        {item.status}
                      </Badge>
                    </div>
                    <div className="h-10 w-[1px] bg-slate-100 hidden md:block" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-lg text-slate-800">{wo.clients?.name || "Cliente não informado"}</p>
                        {item.priority === "urgente" && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">URGENTE</Badge>}
                      </div>
                      <p className="text-sm text-slate-500 line-clamp-1">{wo.description || "Sem descrição disponível para este serviço."}</p>
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
                        {(item.data_entrega || wo.delivery_deadline) ? formatDateBR(item.data_entrega || wo.delivery_deadline) : "—"}
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
                      <p className="font-semibold">{selectedItem.data_entrega ? formatDateBR(selectedItem.data_entrega) : "Não definido"}</p>
                    </div>
                  </div>
                  <div className="space-y-1 border-t pt-4">
                    <p className="text-sm text-muted-foreground uppercase font-bold text-[10px]">Descrição do Serviço</p>
                    <p className="text-sm leading-relaxed">{selectedItem.work_orders?.description || "Sem descrição disponível."}</p>
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
                      const table = selectedItem.is_virtual ? 'work_orders' : 'production';
                      const dbStatus = selectedItem.is_virtual ? 
                        Object.keys(statusMap).find(key => statusMap[key] === val) : val;

                      supabase.from(table).update(
                        selectedItem.is_virtual ? { status: dbStatus } : { status: val }
                      ).eq('id', selectedItem.os_id || selectedItem.id).then(() => {
                        queryClient.invalidateQueries({ queryKey: ["production"] });
                        toast({ title: "Status atualizado!" });
                      });
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
                  {selectedItem.status !== "Entregue" && selectedItem.status !== "Concluído" && (
                    <Button onClick={() => {
                      const table = selectedItem.is_virtual ? 'work_orders' : 'production';
                      const updates = selectedItem.is_virtual ? { status: 'concluido' } : { status: 'Concluído', data_conclusao: new Date().toISOString() };

                       supabase.from(table).update(updates).eq('id', selectedItem.os_id || selectedItem.id).then(() => {
                        queryClient.invalidateQueries({ queryKey: ["production"] });
                        setIsDetailOpen(false);
                        toast({ title: "OS marcada como concluída!" });
                      });
                    }}>
                      Concluir OS
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