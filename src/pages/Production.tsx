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
import { AlertTriangle, ArrowRight, MessageSquare, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import WorkOrderMaterials from "@/components/WorkOrderMaterials";
import MonthFilter, { getDateRange, isInRangeOrOpen, type PeriodMode } from "@/components/MonthFilter";
import { useIsMobile } from "@/hooks/use-mobile";

const columns = [
  { key: "Fila de Produção", label: "Fila de Produção", color: "bg-yellow-500/10 border-yellow-500/30" },
  { key: "Em Andamento", label: "Em Andamento", color: "bg-blue-500/10 border-blue-500/30" },
  { key: "Aguardando Material", label: "Aguardando Material", color: "bg-orange-500/10 border-orange-500/30" },
  { key: "Aguardando Instalação", label: "Aguardando Instalação", color: "bg-green-500/10 border-green-500/30" },
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
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [notesText, setNotesText] = useState("");
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
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
      const { error } = await supabase.from("production").update(updates as any).eq("id", id);
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
    return productionItems.filter((p: any) => {
      if (p.status !== columnKey) return false;
      const isOpen = p.status !== "Aguardando Instalação";
      return isInRangeOrOpen(p.created_at, dateRange, isOpen, p.data_conclusao);
    });
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
            const isColCollapsed = !!collapsedCols[col.key];
            return (
              <div key={col.key} className="space-y-3">
                <div className={`rounded-lg border p-3 ${col.color}`}>
                  <h3 className="font-semibold text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {col.label}
                      <Badge variant="secondary">{colItems.length}</Badge>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={() => toggleColumn(col.key)}
                    >
                      {isColCollapsed
                        ? <><Eye className="h-3 w-3" /> Mostrar</>
                        : <><EyeOff className="h-3 w-3" /> Ocultar</>
                      }
                    </Button>
                  </h3>
                </div>

                {/* HIDDEN MODE: compact numbered list */}
                {isColCollapsed && (
                  <div className="space-y-0.5 min-h-[60px]">
                    {colItems.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mb-1">{colItems.length} pedido{colItems.length !== 1 ? "s" : ""} oculto{colItems.length !== 1 ? "s" : ""}</p>
                    )}
                    {colItems.map((item: any, idx: number) => {
                      const wo = item.work_orders;
                      const clientName = wo?.clients?.name || "—";
                      return (
                        <button
                          key={item.id}
                          onClick={() => { setSelectedItem(item); setNotesText(item.observacoes || ""); }}
                          className={`w-full text-left flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/60 transition-colors ${
                            item.priority === "urgente" ? "text-destructive" : "text-foreground"
                          }`}
                        >
                          <span className="text-muted-foreground shrink-0 w-4 text-right">{idx + 1}.</span>
                          <span className="font-mono shrink-0">OS-{item.os_id?.slice(0, 6)}</span>
                          <span className="truncate">{clientName}</span>
                          {item.priority === "urgente" && <AlertTriangle className="h-3 w-3 shrink-0" />}
                        </button>
                      );
                    })}
                    {colItems.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhuma OS</p>
                    )}
                  </div>
                )}

                {/* VISIBLE MODE: full cards */}
                {!isColCollapsed && (
                  <div className="space-y-2 min-h-[100px]">
                    {colItems.map((item: any) => {
                      const wo = item.work_orders;
                      const expanded = isCardExpanded(item.id, col.key);
                      const clientName = wo?.clients?.name || "Cliente não encontrado";

                      return (
                        <Card
                          key={item.id}
                          className={`border transition-all duration-200 ${item.priority === "urgente" ? "border-destructive/50 bg-destructive/5" : ""}`}
                        >
                          <CardContent className="p-3 space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-xs text-muted-foreground font-mono shrink-0">
                                  OS #{item.os_id?.slice(0, 8)}
                                </span>
                                <span className="text-sm font-medium truncate">
                                  {expanded ? clientName : clientName.slice(0, 15) + (clientName.length > 15 ? "…" : "")}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {wo?.total && (
                                  <span className="text-xs font-semibold text-primary">{fmt(Number(wo.total))}</span>
                                )}
                                <button
                                  onClick={() => toggleCard(item.id)}
                                  className="p-0.5 rounded hover:bg-muted transition-colors"
                                >
                                  {expanded
                                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                  }
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
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

                            {expanded && (
                              <div className="space-y-2 pt-1 animate-fade-in">
                                <p className="text-xs text-muted-foreground line-clamp-2">{wo?.description || "Sem descrição"}</p>

                                {wo?.items && wo.items.length > 0 && (
                                  <div className="text-xs space-y-0.5 bg-muted/40 rounded p-1.5">
                                    <p className="font-medium text-muted-foreground">Serviços:</p>
                                    {wo.items.map((svc: any, idx: number) => (
                                      <p key={idx} className="text-muted-foreground">• {svc.description} — {Number(svc.quantity)} un</p>
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

                                  {col.key !== "Aguardando Instalação" && (
                                    <Select onValueChange={(status) => moveToStatus(item.id, status)}>
                                      <SelectTrigger className="h-7 text-xs flex-1">
                                        <SelectValue placeholder="Mover →" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(nextColumnMap[col.key] || []).map(s => (
                                          <SelectItem key={s} value={s}>{s}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}

                                  {col.key === "Aguardando Instalação" && (
                                    <Button
                                      size="sm" variant="outline" className="h-7 px-2 text-xs flex-1"
                                      onClick={() => moveToStatus(item.id, "Entregue")}
                                    >
                                      <ArrowRight className="h-3 w-3 mr-1" /> Entregar
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}

                            {!expanded && (
                              <div className="flex items-center gap-1 pt-0.5">
                                {col.key !== "Aguardando Instalação" && (
                                  <Select onValueChange={(status) => moveToStatus(item.id, status)}>
                                    <SelectTrigger className="h-6 text-[10px] flex-1">
                                      <SelectValue placeholder="Mover →" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(nextColumnMap[col.key] || []).map(s => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                                {col.key === "Aguardando Instalação" && (
                                  <Button
                                    size="sm" variant="outline" className="h-6 px-2 text-[10px] flex-1"
                                    onClick={() => moveToStatus(item.id, "Entregue")}
                                  >
                                    Entregar
                                  </Button>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}

                    {colItems.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">Nenhuma OS</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
