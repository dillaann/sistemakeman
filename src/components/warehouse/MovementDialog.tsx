import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { localDateString } from "@/lib/utils";

const REASONS: Record<string, string[]> = {
  entrada: ["Compra recebida", "Devolução de obra", "Ajuste de inventário"],
  saida: ["Uso em OS", "Entrega para obra", "Perda ou descarte"],
  devolucao: ["Devolução ao fornecedor", "Sobra de obra"],
  ajuste: ["Correção de saldo", "Inventário", "Outro"],
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultItemId?: string;
  defaultType?: "entrada" | "saida" | "devolucao" | "ajuste";
}

export default function MovementDialog({ open, onOpenChange, defaultItemId, defaultType = "entrada" }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    item_id: defaultItemId ?? "",
    type: defaultType,
    quantity: 0,
    movement_date: localDateString(),
    reason: "",
    work_order_id: "",
    client_name: "",
    responsible: "",
    notes: "",
  });

  const { data: items = [] } = useQuery({
    queryKey: ["inventory_items_all"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_items" as any).select("id,name,code,unit,current_qty").order("name");
      return (data as any[]) ?? [];
    },
    enabled: open,
  });

  const { data: workOrders = [] } = useQuery({
    queryKey: ["wo_open_for_mov"],
    queryFn: async () => {
      const { data } = await supabase.from("work_orders").select("id,os_number,client_id,clients(name)").order("os_number", { ascending: false }).limit(200);
      return (data as any[]) ?? [];
    },
    enabled: open,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (!payload.work_order_id) payload.work_order_id = null;
      const { error } = await supabase.from("inventory_movements" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_items"] });
      qc.invalidateQueries({ queryKey: ["inventory_movements"] });
      toast({ title: "Movimentação registrada" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const selectedItem = items.find((i) => i.id === form.item_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Nova Movimentação</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Item *</Label>
            <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o item" /></SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.code} — {i.name} ({Number(i.current_qty).toFixed(2)} {i.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v, reason: "" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saída</SelectItem>
                <SelectItem value="devolucao">Devolução</SelectItem>
                <SelectItem value="ajuste">Ajuste</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantidade {form.type === "ajuste" && "(use negativo para reduzir)"}</Label>
            <Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            {selectedItem && form.type === "saida" && form.quantity > Number(selectedItem.current_qty) && (
              <p className="text-xs text-destructive">Estoque insuficiente ({selectedItem.current_qty})</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Data</Label>
            <Input type="date" value={form.movement_date} onChange={(e) => setForm({ ...form, movement_date: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(REASONS[form.type] ?? []).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(form.type === "saida" || form.type === "devolucao") && (
            <div className="col-span-2 space-y-2">
              <Label>OS vinculada</Label>
              <Select value={form.work_order_id} onValueChange={(v) => setForm({ ...form, work_order_id: v })}>
                <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  {workOrders.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.os_number} — {w.clients?.name ?? ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Cliente / Obra</Label>
            <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Responsável</Label>
            <Input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={!form.item_id || !form.quantity || save.isPending}>Registrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
