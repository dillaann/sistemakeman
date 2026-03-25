import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, AlertTriangle } from "lucide-react";

const Materials = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", unit: "un", quantity: "", min_quantity: "", unit_cost: "", supplier: "" });

  const { data: materials = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: async () => { const { data } = await supabase.from("materials").select("*").order("name"); return data ?? []; },
  });

  const saveMutation = useMutation({
    mutationFn: async (m: any) => {
      const payload = { name: m.name, description: m.description || null, unit: m.unit, quantity: parseFloat(m.quantity) || 0, min_quantity: parseFloat(m.min_quantity) || 0, unit_cost: parseFloat(m.unit_cost) || 0, supplier: m.supplier || null };
      if (m.id) { const { error } = await supabase.from("materials").update(payload).eq("id", m.id); if (error) throw error; }
      else { const { error } = await supabase.from("materials").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["materials"] }); setOpen(false); setEditing(null); toast({ title: "Material salvo!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("materials").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["materials"] }); toast({ title: "Material removido!" }); },
  });

  const openNew = () => { setEditing(null); setForm({ name: "", description: "", unit: "un", quantity: "", min_quantity: "", unit_cost: "", supplier: "" }); setOpen(true); };
  const openEdit = (m: any) => { setEditing(m); setForm({ name: m.name, description: m.description ?? "", unit: m.unit, quantity: String(m.quantity), min_quantity: String(m.min_quantity), unit_cost: String(m.unit_cost), supplier: m.supplier ?? "" }); setOpen(true); };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const filtered = materials.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || (m.supplier ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Estoque de Materiais</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Material</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar Material" : "Novo Material"}</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(editing ? { ...form, id: editing.id } : form); }} className="space-y-3">
              <div><Label>Nome *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
              <div><Label>Descrição</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Unidade</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></div>
                <div><Label>Qtd Atual</Label><Input type="number" step="0.01" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
                <div><Label>Qtd Mín.</Label><Input type="number" step="0.01" value={form.min_quantity} onChange={e => setForm({ ...form, min_quantity: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Custo Unit. (R$)</Label><Input type="number" step="0.01" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} /></div>
                <div><Label>Fornecedor</Label><Input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></div>
              </div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar materiais..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Qtd</TableHead>
              <TableHead className="hidden md:table-cell">Custo Un.</TableHead>
              <TableHead className="hidden md:table-cell">Fornecedor</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(m => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {m.quantity <= m.min_quantity && <AlertTriangle className="h-4 w-4 text-orange-500" />}
                    {m.name}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={m.quantity <= m.min_quantity ? "destructive" : "secondary"}>
                    {m.quantity} {m.unit}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">{fmt(Number(m.unit_cost))}</TableCell>
                <TableCell className="hidden md:table-cell">{m.supplier}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum material encontrado.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Materials;
