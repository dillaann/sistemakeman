import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowRight, MessageSquare } from "lucide-react";
import WorkOrderMaterials from "@/components/WorkOrderMaterials";

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
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [notesText, setNotesText] = useState("");

  // Fetch production records joined with work_orders and clients
  const { data: productionItems = [] } = useQuery({
    queryKey: ["production"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production")
        .select("*, work_orders!inner(id, description, priority, internal_notes, material_status, clients(name), employees:assigned_to(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
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
  });

  const moveToStatus = (id: string, status: string) => {
    const updates: Record<string, any> = { status };
    // Also update the work_order status for sync
    const item = productionItems.find((p: any) => p.id === id);
    if (item) {
      let woStatus = "aguardando";
      if (status === "Em Andamento") woStatus = "em_producao";
      if (status === "Finalizado") woStatus = "concluido";
      if (status === "Entregue") woStatus = "entregue";
      supabase.from("work_orders").update({ status: woStatus }).eq("id", item.os_id).then(() => {
        queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      });
    }
    updateMutation.mutate({ id, updates });
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
    return productionItems.filter((p: any) => p.status === columnKey);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Produção</h1>

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

                        <p className="font-medium text-sm">{wo?.clients?.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{wo?.description}</p>

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
