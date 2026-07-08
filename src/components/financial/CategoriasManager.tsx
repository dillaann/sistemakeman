import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { useFinancialCategories, type FinancialCategory } from "@/hooks/useFinancialCategories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";

const typeLabels: Record<string, string> = { entrada: "Entrada", saida: "Saída", ambos: "Ambos" };
const typeColors: Record<string, string> = {
  entrada: "bg-green-500/10 text-green-700 border-green-500/20",
  saida: "bg-red-500/10 text-red-700 border-red-500/20",
  ambos: "bg-blue-500/10 text-blue-700 border-blue-500/20",
};

export default function CategoriasManager() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { allCategories: categories } = useFinancialCategories();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", type: "ambos" });

  // Check which categories are in use
  const { data: usedCategories = [] } = useQuery({
    queryKey: ["used-categories"],
    queryFn: async () => {
      const data = await fetchAllRows<{ category: string | null }>(() =>
        supabase
          .from("financial_transactions")
          .select("category")
      );
      const unique = new Set(data.map(d => d.category).filter(Boolean));
      return [...unique] as string[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await supabase.from("financial_categories").update({ name: form.name, type: form.type }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("financial_categories").insert({ name: form.name, type: form.type });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-categories"] });
      setOpen(false);
      setEditId(null);
      setForm({ name: "", type: "ambos" });
      toast({ title: editId ? "Categoria atualizada!" : "Categoria criada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const cat = categories.find(c => c.id === id);
      if (cat && usedCategories.includes(cat.name)) {
        throw new Error("Categoria em uso — não pode ser excluída.");
      }
      const { error } = await supabase.from("financial_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-categories"] });
      toast({ title: "Categoria removida!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const openEdit = (cat: FinancialCategory) => {
    setEditId(cat.id);
    setForm({ name: cat.name, type: cat.type });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          <h3 className="font-semibold text-lg">Categorias Financeiras</h3>
        </div>
        <Button size="sm" onClick={() => { setEditId(null); setForm({ name: "", type: "ambos" }); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova Categoria
        </Button>
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Padrão</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map(cat => {
              const inUse = usedCategories.includes(cat.name);
              return (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell><Badge variant="outline" className={typeColors[cat.type]}>{typeLabels[cat.type]}</Badge></TableCell>
                  <TableCell>{cat.is_default ? <Badge variant="secondary">Padrão</Badge> : "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}><Pencil className="h-4 w-4" /></Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={inUse}
                        title={inUse ? "Categoria em uso" : "Excluir"}
                        onClick={() => deleteMutation.mutate(cat.id)}
                      >
                        <Trash2 className={`h-4 w-4 ${inUse ? "text-muted-foreground" : "text-destructive"}`} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {categories.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma categoria cadastrada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditId(null); setForm({ name: "", type: "ambos" }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar Categoria" : "Nova Categoria"}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div>
              <Label>Nome da Categoria *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required maxLength={100} />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={saveMutation.isPending}>Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
