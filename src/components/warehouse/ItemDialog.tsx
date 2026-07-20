import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = ["Ferro", "Tinta", "Parafuso", "Ferramenta", "EPI", "Consumível", "Outro"];
const UNITS = ["un", "kg", "g", "m", "cm", "m²", "litro", "ml", "rolo", "caixa", "peça"];

type Item = any;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: Item | null;
}

export default function ItemDialog({ open, onOpenChange, item }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    code: "",
    category: "Outro",
    unit: "un",
    current_qty: 0,
    min_qty: 0,
    location: "",
    unit_price: 0,
    notes: "",
  });

  useEffect(() => {
    if (item) {
      setForm({
        name: item.name ?? "",
        code: item.code ?? "",
        category: item.category ?? "Outro",
        unit: item.unit ?? "un",
        current_qty: Number(item.current_qty ?? 0),
        min_qty: Number(item.min_qty ?? 0),
        location: item.location ?? "",
        unit_price: Number(item.unit_price ?? 0),
        notes: item.notes ?? "",
      });
    } else {
      setForm({ name: "", code: "", category: "Outro", unit: "un", current_qty: 0, min_qty: 0, location: "", unit_price: 0, notes: "" });
    }
  }, [item, open]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = { ...form };
      if (!payload.code) delete payload.code;
      if (item?.id) {
        const { error } = await supabase.from("inventory_items" as any).update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inventory_items" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_items"] });
      toast({ title: item ? "Item atualizado" : "Item cadastrado" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{item ? "Editar Item" : "Novo Item"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Código (auto se vazio)</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ALM-2026-0001" />
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Unidade</Label>
            <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Localização</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Prateleira A / Setor 2" />
          </div>
          <div className="space-y-2">
            <Label>Qtd atual</Label>
            <Input type="number" step="0.01" value={form.current_qty} onChange={(e) => setForm({ ...form, current_qty: Number(e.target.value) })} disabled={!!item} />
            {item && <p className="text-xs text-muted-foreground">Use movimentações para alterar</p>}
          </div>
          <div className="space-y-2">
            <Label>Qtd mínima</Label>
            <Input type="number" step="0.01" value={form.min_qty} onChange={(e) => setForm({ ...form, min_qty: Number(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Preço unitário (R$)</Label>
            <Input type="number" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
