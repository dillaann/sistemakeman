import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Send, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const units = ["un", "kg", "m", "m²", "m³", "litro", "peça", "pacote", "cx", "rolo"];

const materialStatusLabels: Record<string, string> = {
  nao_solicitado: "Materiais não solicitados",
  aguardando_compra: "Aguardando compra",
  comprado: "Materiais comprados",
};
const materialStatusColors: Record<string, string> = {
  nao_solicitado: "bg-gray-500/10 text-gray-700 border-gray-500/20",
  aguardando_compra: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  comprado: "bg-green-500/10 text-green-700 border-green-500/20",
};

interface Props {
  workOrderId: string;
  materialStatus?: string;
}

const WorkOrderMaterials = ({ workOrderId, materialStatus = "nao_solicitado" }: Props) => {
  const { toast } = useToast();
  const { userRole, user } = useAuth();
  const qc = useQueryClient();
  const [newItem, setNewItem] = useState({ material: "", quantity: "1", unit: "un", notes: "" });

  const canEdit = userRole === "admin" || userRole === "producao";
  const canView = canEdit || userRole === "compras";

  const { data: materials = [] } = useQuery({
    queryKey: ["wo-materials", workOrderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_order_materials")
        .select("*")
        .eq("work_order_id", workOrderId)
        .order("created_at");
      return data ?? [];
    },
    enabled: canView,
  });

  const addMaterial = useMutation({
    mutationFn: async () => {
      if (!newItem.material.trim()) throw new Error("Informe o material");
      const { error } = await supabase.from("work_order_materials").insert({
        work_order_id: workOrderId,
        material: newItem.material,
        quantity: parseFloat(newItem.quantity) || 1,
        unit: newItem.unit,
        notes: newItem.notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wo-materials", workOrderId] });
      setNewItem({ material: "", quantity: "1", unit: "un", notes: "" });
      toast({ title: "Material adicionado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const removeMaterial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("work_order_materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wo-materials", workOrderId] });
      toast({ title: "Material removido!" });
    },
  });

  const requestPurchase = useMutation({
    mutationFn: async () => {
      if (materials.length === 0) throw new Error("Adicione materiais primeiro");
      // Create purchase request
      const { error } = await supabase.from("purchase_requests").insert({
        work_order_id: workOrderId,
        requested_by: user?.id,
        status: "pendente",
      } as any);
      if (error) throw error;
      // Update work order material_status
      const { error: woErr } = await supabase.from("work_orders")
        .update({ material_status: "aguardando_compra" } as any)
        .eq("id", workOrderId);
      if (woErr) throw woErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wo-materials", workOrderId] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      qc.invalidateQueries({ queryKey: ["purchase-requests"] });
      toast({ title: "Solicitação de compra enviada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  if (!canView) return null;

  return (
    <div className="space-y-3 border-t pt-3 mt-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4" />
          <span className="font-semibold text-sm">Lista de Materiais</span>
        </div>
        <Badge className={materialStatusColors[materialStatus] || materialStatusColors.nao_solicitado}>
          {materialStatusLabels[materialStatus] || materialStatus}
        </Badge>
      </div>

      {/* Material list */}
      {materials.length > 0 && (
        <div className="space-y-1">
          {materials.map((m: any) => (
            <div key={m.id} className="flex items-center gap-2 text-xs bg-muted/50 rounded p-1.5">
              <span className="flex-1 font-medium">{m.material}</span>
              <span className="text-muted-foreground">{m.quantity} {m.unit}</span>
              {m.notes && <span className="text-muted-foreground italic">({m.notes})</span>}
              {canEdit && materialStatus !== "aguardando_compra" && (
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeMaterial.mutate(m.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {materials.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">Nenhum material adicionado</p>
      )}

      {/* Add material form - only for admin/producao when not yet requested */}
      {canEdit && materialStatus === "nao_solicitado" && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_60px_60px] gap-1">
            <Input
              placeholder="Material..."
              value={newItem.material}
              onChange={e => setNewItem({ ...newItem, material: e.target.value })}
              className="h-7 text-xs"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Qtd"
              value={newItem.quantity}
              onChange={e => setNewItem({ ...newItem, quantity: e.target.value })}
              className="h-7 text-xs"
            />
            <Select value={newItem.unit} onValueChange={v => setNewItem({ ...newItem, unit: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {units.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Input
            placeholder="Observações do material..."
            value={newItem.notes}
            onChange={e => setNewItem({ ...newItem, notes: e.target.value })}
            className="h-7 text-xs"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => addMaterial.mutate()}>
            <Plus className="h-3 w-3 mr-1" /> Adicionar Material
          </Button>
        </div>
      )}

      {/* Request purchase button */}
      {canEdit && materialStatus === "nao_solicitado" && materials.length > 0 && (
        <Button
          size="sm"
          className="w-full h-8 text-xs"
          onClick={() => requestPurchase.mutate()}
          disabled={requestPurchase.isPending}
        >
          <Send className="h-3 w-3 mr-1" /> Solicitar Compra
        </Button>
      )}
    </div>
  );
};

export default WorkOrderMaterials;
