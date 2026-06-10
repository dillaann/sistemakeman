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
import { AlertTriangle, ArrowRight, MessageSquare, ChevronDown, ChevronUp, Eye, EyeOff, Search, Info, Package, History, FileText, Factory, Clock, CheckCircle2, AlertCircle, LayoutGrid, List as ListIcon, User, Calendar } from "lucide-react";
import WorkOrderMaterials from "@/components/WorkOrderMaterials";
import MonthFilter, { getDateRange, isInRangeOrOpen, type PeriodMode } from "@/components/MonthFilter";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateBR, cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const columns = [
  { key: "Fila de Produção", label: "Fila de Produção", color: "bg-yellow-500/10 border-yellow-500/30 text-yellow-700" },
  { key: "Em Andamento", label: "Em Andamento", color: "bg-blue-500/10 border-blue-500/30 text-blue-700" },
  { key: "Aguardando Material", label: "Aguardando Material", color: "bg-orange-500/10 border-orange-500/30 text-orange-700" },
  { key: "Aguardando Instalação", label: "Aguardando Instalação", color: "bg-green-500/10 border-green-500/30 text-green-700" },
  { key: "Concluído", label: "Concluído", color: "bg-purple-500/10 border-purple-500/30 text-purple-700" },
  { key: "Entregue", label: "Entregue", color: "bg-slate-500/10 border-slate-500/30 text-slate-700" },
];

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
      const { data, error } = await supabase
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
      if (error) throw error;
      return data ?? [];
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
    const atrasadas = productionItems.filter((p: any) => p.data_entrega && new Date(p.data_entrega) < new Date()).length;
    const concluidas = productionItems.filter((p: any) => p.status === "Concluído").length;
    return { total, emProducao, atrasadas, concluidas };
  }, [productionItems]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Produção</h1>
        <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-white/50 border-none shadow-sm">
          <p className="text-muted-foreground text-xs font-bold uppercase">Total Abertas</p>
          <p className="text-3xl font-bold">{summary.total}</p>
        </Card>
        <Card className="p-4 bg-white/50 border-none shadow-sm">
          <p className="text-muted-foreground text-xs font-bold uppercase">Em Produção Hoje</p>
          <p className="text-3xl font-bold text-blue-600">{summary.emProducao}</p>
        </Card>
        <Card className="p-4 bg-white/50 border-none shadow-sm border-l-4 border-l-red-500">
          <p className="text-red-500 text-xs font-bold uppercase">Atrasadas</p>
          <p className="text-3xl font-bold text-red-600">{summary.atrasadas}</p>
        </Card>
        <Card className="p-4 bg-white/50 border-none shadow-sm">
          <p className="text-muted-foreground text-xs font-bold uppercase">Concluídas Mês</p>
          <p className="text-3xl font-bold text-green-600">{summary.concluidas}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white p-4 rounded-xl shadow-sm border">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar OS, cliente ou serviço..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Status</SelectItem>
            {columns.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" onClick={() => { setSearch(""); setStatusFilter("todos"); setPriorityFilter("todos"); }}>Limpar</Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.length === 0 && <div className="text-center py-20 text-muted-foreground">Nenhuma OS encontrada.</div>}
          {filteredItems.map((item: any) => {
            const wo = item.work_orders || {};
            const isLate = item.data_entrega && new Date(item.data_entrega) < new Date() && item.status !== "Entregue" && item.status !== "Concluído";
            
            return (
              <Card key={item.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-lg font-mono">OS-{item.os_id.slice(0, 8)}</span>
                      <Badge variant="outline" className={columns.find(c => c.key === item.status)?.color}>{item.status}</Badge>
                    </div>
                    <div>
                      <p className="font-semibold text-lg">{wo.clients?.name || "Cliente"}</p>
                      <p className="text-sm text-muted-foreground">{wo.description || "Sem descrição"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Prazo</p>
                      <p className={`font-semibold ${isLate ? "text-red-500" : ""}`}>
                        {item.data_entrega ? new Date(item.data_entrega).toLocaleDateString("pt-BR") : "—"}
                      </p>
                    </div>
                    {item.priority === "urgente" && <Badge variant="destructive">URGENTE</Badge>}
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSelectedItem(item);
                        setIsDetailOpen(true);
                      }}
                    >
                      Ver Detalhes
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
                      supabase.from('production').update({ status: val }).eq('id', selectedItem.id).then(() => {
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
                       supabase.from('production').update({ status: 'Concluído', data_conclusao: new Date().toISOString() }).eq('id', selectedItem.id).then(() => {
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