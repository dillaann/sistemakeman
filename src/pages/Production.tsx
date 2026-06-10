import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowRight, MessageSquare, ChevronDown, ChevronUp, Eye, EyeOff, Search } from "lucide-react";
import WorkOrderMaterials from "@/components/WorkOrderMaterials";
import MonthFilter, { getDateRange, isInRangeOrOpen, type PeriodMode } from "@/components/MonthFilter";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";

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
            employees(name),
            work_order_items(id, description, quantity)
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
    const emProducao = productionItems.filter((p: any) => p.status === "Em Produção").length;
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
                      <Badge className={columns.find(c => c.key === item.status)?.color}>{item.status}</Badge>
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
                    <Button variant="outline">Ver Detalhes</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Production;