import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowRight, MessageSquare } from "lucide-react";
import WorkOrderMaterials from "@/components/WorkOrderMaterials";
import MonthFilter, { getDateRange, isInRangeOrOpen, type PeriodMode } from "@/components/MonthFilter";

const columns = [
  { key: "Fila de Produção", label: "Fila de Produção", color: "bg-yellow-500/10 border-yellow-500/30" },
  { key: "Em Andamento", label: "Em Andamento", color: "bg-blue-500/10 border-blue-500/30" },
  { key: "Aguardando Material", label: "Aguardando Material", color: "bg-orange-500/10 border-orange-500/30" },
  { key: "Finalizado", label: "Finalizado", color: "bg-green-500/10 border-green-500/30" },
];

const nextColumnMap: Record<string, string[]> = {
  "Fila de Produção": ["Em Andamento", "Aguardando Material"],
  "Em Andamento": ["Aguardando Material", "Finalizado"],
  "Aguardando Material": ["Em Andamento", "Finalizado"],
  "Finalizado": ["Entregue"],
};

const Production = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [notesText, setNotesText] = useState("");
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const dateRange = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);

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
        .select("id, description, priority, internal_notes, material_status, total, client_id, assigned_to, clients!work_orders_client_id_fkey(name)")
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

      // Fetch work_order_items for all OS
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
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from("production").update(updates).eq("id", id);
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

  const moveToStatus = (id: string, status: string) => {
    // Also sync the work_order status
    const item = productionItems.find((p: any) => p.id === id);
    if (item) {
      let woStatus: "aguardando" | "em_producao" | "concluido" | "entregue" = "aguardando";
      if (status === "Em Andamento") woStatus = "em_producao";
      if (status === "Aguardando Material") woStatus = "em_producao";
      if (status === "Finalizado") woStatus = "concluido";
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
    return productionItems.filter((p: any) => p.status === columnKey && isInRange(p.created_at, dateRange));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Produção</h1>
        <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {columns.map(col => {
            const colItems = getColumnItems(col.key);
            return (
              <div key={col.key} className="space-y-3">
                <div className={`rounded-lg border p-3 ${col.color}`}>
                  <h3 className="font-semibold text-sm flex items-center justify-between">
                    {col.label}
                    <Badge variant="secondary">{colItems.length}</Badge>
                  </h3>
                </div>

                <div className="space-y-2 min-h-[200px]">
                  {colItems.map((item: any) => {
                    const wo = item.work_orders;
                    return (
                      <Card key={item.id} className={`border ${item.priority === "urgente" ? "border-destructive/50 bg-destructive/5" : ""}`}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground font-mono">
                              OS #{item.os_id?.slice(0, 8)}
                            </span>
                            <button onClick={() => togglePriority(item)} className="text-xs" title="Alternar prioridade">
                              {item.priority === "urgente" ? (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                  <AlertTriangle className="h-3 w-3 mr-1" /> URGENTE
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Normal</Badge>
                              )}
                            </button>
                          </div>

                          <p className="font-medium text-sm">{wo?.clients?.name || "Cliente não encontrado"}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{wo?.description || "Sem descrição"}</p>

                          {wo?.items && wo.items.length > 0 && (
                            <div className="text-xs space-y-0.5 bg-muted/40 rounded p-1.5">
                              <p className="font-medium text-muted-foreground">Serviços:</p>
                              {wo.items.map((item: any, idx: number) => (
                                <p key={idx} className="text-muted-foreground">• {item.description} — {Number(item.quantity)} un</p>
                              ))}
                            </div>
                          )}

                          {wo?.employees?.name && (
                            <p className="text-xs text-muted-foreground">👤 {wo.employees.name}</p>
                          )}

                          {item.observacoes && (
                            <p className="text-xs italic text-muted-foreground bg-muted/50 rounded p-1.5">
                              📝 {item.observacoes}
                            </p>
                          )}

                          <WorkOrderMaterials
                            workOrderId={item.os_id}
                            materialStatus={wo?.material_status || "nao_solicitado"}
                          />

                          <div className="flex items-center gap-1 pt-1">
                            <Button
                              size="sm" variant="ghost" className="h-7 px-2 text-xs"
                              onClick={() => { setSelectedItem(item); setNotesText(item.observacoes || ""); }}
                            >
                              <MessageSquare className="h-3 w-3 mr-1" /> Notas
                            </Button>

                            {col.key !== "Finalizado" && (
                              <Select onValueChange={(status) => moveToStatus(item.id, status)}>
                                <SelectTrigger className="h-7 text-xs flex-1">
                                  <SelectValue placeholder="Mover →" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(nextColumnMap[col.key] || []).map(s => (
                                    <SelectItem key={s} value={s}>
                                      {s}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}

                            {col.key === "Finalizado" && (
                              <Button
                                size="sm" variant="outline" className="h-7 px-2 text-xs flex-1"
                                onClick={() => moveToStatus(item.id, "Entregue")}
                              >
                                <ArrowRight className="h-3 w-3 mr-1" /> Entregar
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}

                  {colItems.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">Nenhuma OS</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Observações - OS #{selectedItem?.os_id?.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesText}
            onChange={e => setNotesText(e.target.value)}
            placeholder="Ex: aguardando tinta, falta solda..."
            rows={4}
          />
          <Button onClick={saveNotes} className="w-full">Salvar Observações</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Production;
