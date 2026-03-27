import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowRight, MessageSquare, Clock } from "lucide-react";

const columns = [
  { key: "aguardando", label: "Fila de Produção", color: "bg-yellow-500/10 border-yellow-500/30" },
  { key: "em_producao", label: "Em Andamento", color: "bg-blue-500/10 border-blue-500/30" },
  { key: "aguardando_material", label: "Aguardando Material", color: "bg-orange-500/10 border-orange-500/30" },
  { key: "concluido", label: "Finalizado", color: "bg-green-500/10 border-green-500/30" },
];

// Map production columns to actual DB statuses for moving
const nextColumnMap: Record<string, string[]> = {
  aguardando: ["em_producao", "aguardando_material"],
  em_producao: ["aguardando_material", "concluido"],
  aguardando_material: ["em_producao", "concluido"],
  concluido: ["entregue"],
};

const Production = () => {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [notesText, setNotesText] = useState("");

  const { data: orders = [] } = useQuery({
    queryKey: ["production-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_orders")
        .select("*, clients(name), employees:assigned_to(name)")
        .in("status", ["aguardando", "em_producao", "concluido"])
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // We'll use priority and internal_notes from the work_orders table
  // Since types.ts is auto-generated and may not have them yet, we cast

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from("work_orders").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Atualizado!" });
    },
  });

  const moveToStatus = (id: string, status: string) => {
    const updates: Record<string, any> = { status };
    if (status === "em_producao") updates.started_at = new Date().toISOString();
    if (status === "concluido") updates.completed_at = new Date().toISOString();
    if (status === "entregue") updates.delivered_at = new Date().toISOString();
    updateMutation.mutate({ id, updates });
  };

  const saveNotes = () => {
    if (!selectedOrder) return;
    updateMutation.mutate({ id: selectedOrder.id, updates: { internal_notes: notesText } });
    setSelectedOrder(null);
  };

  const togglePriority = (order: any) => {
    const newPriority = (order as any).priority === "urgente" ? "normal" : "urgente";
    updateMutation.mutate({ id: order.id, updates: { priority: newPriority } });
  };

  // Group orders by status. "aguardando_material" is stored as a status or we use internal_notes.
  // For now, map DB statuses to columns. We treat "aguardando" status orders that have 
  // internal_notes containing "aguardando material" could go there, but simpler: 
  // we just use the 3 real statuses and show aguardando_material as a subset based on internal_notes
  const getColumnOrders = (columnKey: string) => {
    if (columnKey === "aguardando_material") {
      // Show orders that have internal_notes indicating material wait
      return orders.filter(o => 
        (o as any).internal_notes?.toLowerCase().includes("aguardando material") ||
        (o as any).internal_notes?.toLowerCase().includes("falta material")
      );
    }
    if (columnKey === "aguardando") {
      return orders.filter(o => 
        o.status === "aguardando" && 
        !(o as any).internal_notes?.toLowerCase().includes("aguardando material") &&
        !(o as any).internal_notes?.toLowerCase().includes("falta material")
      );
    }
    if (columnKey === "em_producao") {
      return orders.filter(o => 
        o.status === "em_producao" &&
        !(o as any).internal_notes?.toLowerCase().includes("aguardando material") &&
        !(o as any).internal_notes?.toLowerCase().includes("falta material")
      );
    }
    return orders.filter(o => o.status === columnKey);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Produção</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {columns.map(col => {
          const colOrders = getColumnOrders(col.key);
          return (
            <div key={col.key} className="space-y-3">
              <div className={`rounded-lg border p-3 ${col.color}`}>
                <h3 className="font-semibold text-sm flex items-center justify-between">
                  {col.label}
                  <Badge variant="secondary">{colOrders.length}</Badge>
                </h3>
              </div>

              <div className="space-y-2 min-h-[200px]">
                {colOrders.map((order: any) => (
                  <Card key={order.id} className={`border ${order.priority === "urgente" ? "border-destructive/50 bg-destructive/5" : ""}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-mono">
                          OS #{order.id.slice(0, 8)}
                        </span>
                        <button
                          onClick={() => togglePriority(order)}
                          className="text-xs"
                          title="Alternar prioridade"
                        >
                          {order.priority === "urgente" ? (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              <AlertTriangle className="h-3 w-3 mr-1" /> URGENTE
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Normal</Badge>
                          )}
                        </button>
                      </div>

                      <p className="font-medium text-sm">{order.clients?.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{order.description}</p>

                      {order.employees?.name && (
                        <p className="text-xs text-muted-foreground">
                          👤 {order.employees.name}
                        </p>
                      )}

                      {order.internal_notes && (
                        <p className="text-xs italic text-muted-foreground bg-muted/50 rounded p-1.5">
                          📝 {order.internal_notes}
                        </p>
                      )}

                      <div className="flex items-center gap-1 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setSelectedOrder(order);
                            setNotesText(order.internal_notes || "");
                          }}
                        >
                          <MessageSquare className="h-3 w-3 mr-1" /> Notas
                        </Button>

                        {col.key !== "concluido" && (
                          <Select onValueChange={(status) => moveToStatus(order.id, status)}>
                            <SelectTrigger className="h-7 text-xs flex-1">
                              <SelectValue placeholder="Mover →" />
                            </SelectTrigger>
                            <SelectContent>
                              {(nextColumnMap[col.key] || []).map(s => (
                                <SelectItem key={s} value={s}>
                                  {columns.find(c => c.key === s)?.label || s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {col.key === "concluido" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs flex-1"
                            onClick={() => moveToStatus(order.id, "entregue")}
                          >
                            <ArrowRight className="h-3 w-3 mr-1" /> Entregar
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {colOrders.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">Nenhuma OS</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Observações Internas - OS #{selectedOrder?.id?.slice(0, 8)}</DialogTitle>
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
