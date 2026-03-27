import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";

type Client = {
  id: string; name: string; email: string | null; phone: string | null;
  cpf_cnpj: string | null; address: string | null; city: string | null;
  state: string | null; notes: string | null;
};

const Clients = () => {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", cpf_cnpj: "", address: "", city: "", state: "", notes: "" });

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (client: typeof form & { id?: string }) => {
      if (client.id) {
        const { error } = await supabase.from("clients").update(client).eq("id", client.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(client);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
      setEditing(null);
      toast({ title: editing ? "Cliente atualizado!" : "Cliente cadastrado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setDeleteTarget(null);
      toast({ title: "Cliente removido!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", cpf_cnpj: "", address: "", city: "", state: "", notes: "" });
    setOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", cpf_cnpj: c.cpf_cnpj ?? "", address: c.address ?? "", city: c.city ?? "", state: c.state ?? "", notes: c.notes ?? "" });
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(editing ? { ...form, id: editing.id } : form);
  };

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.cpf_cnpj ?? "").includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Clientes</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>CPF/CNPJ</Label><Input value={form.cpf_cnpj} onChange={e => setForm({ ...form, cpf_cnpj: e.target.value })} /></div>
                <div><Label>Cidade</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                <div><Label>Estado</Label><Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></div>
                <div><Label>Endereço</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
              </div>
              <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar clientes..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {filtered.map(c => (
          <Card key={c.id} className="p-3">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{c.name}</p>
                {c.phone && <p className="text-sm text-muted-foreground">{c.phone}</p>}
                {c.email && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
                {(c.city || c.state) && <p className="text-xs text-muted-foreground">{[c.city, c.state].filter(Boolean).join("/")}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                {userRole === "admin" && (
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum cliente encontrado.</p>}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.email}</TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>{[c.city, c.state].filter(Boolean).join("/")}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    {userRole === "admin" && (
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        isPending={deleteMutation.isPending}
        description="Tem certeza que deseja excluir este cliente? Todos os orçamentos, vendas, OS e transações relacionadas serão removidos."
      />
    </div>
  );
};

export default Clients;
