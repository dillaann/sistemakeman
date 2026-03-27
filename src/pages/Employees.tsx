import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil } from "lucide-react";

const Employees = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "", salary: "", hire_date: "", active: true, saturday_value: "", overtime_hourly_rate: "", payment_notes: "" });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => { const { data } = await supabase.from("employees").select("*").order("name"); return data ?? []; },
  });

  const { data: commissions = [] } = useQuery({
    queryKey: ["commissions"],
    queryFn: async () => { const { data } = await supabase.from("commissions").select("*, employees(name)").order("created_at", { ascending: false }); return data ?? []; },
  });

  const saveMutation = useMutation({
    mutationFn: async (emp: any) => {
      const payload = { name: emp.name, email: emp.email || null, phone: emp.phone || null, role: emp.role || null, salary: parseFloat(emp.salary) || null, hire_date: emp.hire_date || null, active: emp.active, saturday_value: parseFloat(emp.saturday_value) || 0, overtime_hourly_rate: parseFloat(emp.overtime_hourly_rate) || 0, payment_notes: emp.payment_notes || null };
      if (emp.id) { const { error } = await supabase.from("employees").update(payload).eq("id", emp.id); if (error) throw error; }
      else { const { error } = await supabase.from("employees").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["employees"] }); setOpen(false); setEditing(null); toast({ title: "Funcionário salvo!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const [commOpen, setCommOpen] = useState(false);
  const [commForm, setCommForm] = useState({ employee_id: "", amount: "", percentage: "" });

  const commMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("commissions").insert({
        employee_id: commForm.employee_id, amount: parseFloat(commForm.amount),
        percentage: parseFloat(commForm.percentage) || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["commissions"] }); setCommOpen(false); toast({ title: "Comissão registrada!" }); },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const openNew = () => { setEditing(null); setForm({ name: "", email: "", phone: "", role: "", salary: "", hire_date: "", active: true, saturday_value: "", overtime_hourly_rate: "", payment_notes: "" }); setOpen(true); };
  const openEdit = (e: any) => { setEditing(e); setForm({ name: e.name, email: e.email ?? "", phone: e.phone ?? "", role: e.role ?? "", salary: e.salary ? String(e.salary) : "", hire_date: e.hire_date ?? "", active: e.active, saturday_value: e.saturday_value ? String(e.saturday_value) : "", overtime_hourly_rate: e.overtime_hourly_rate ? String(e.overtime_hourly_rate) : "", payment_notes: e.payment_notes ?? "" }); setOpen(true); };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const filtered = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Funcionários</h1>
        <div className="flex gap-2">
          <Dialog open={commOpen} onOpenChange={setCommOpen}>
            <DialogTrigger asChild><Button variant="outline">Nova Comissão</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Comissão</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); commMutation.mutate(); }} className="space-y-3">
                <div><Label>Funcionário *</Label>
                  <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={commForm.employee_id} onChange={e => setCommForm({ ...commForm, employee_id: e.target.value })} required>
                    <option value="">Selecione</option>
                    {employees.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Valor (R$) *</Label><Input type="number" step="0.01" value={commForm.amount} onChange={e => setCommForm({ ...commForm, amount: e.target.value })} required /></div>
                  <div><Label>Percentual (%)</Label><Input type="number" step="0.01" value={commForm.percentage} onChange={e => setCommForm({ ...commForm, percentage: e.target.value })} /></div>
                </div>
                <Button type="submit" className="w-full" disabled={commMutation.isPending}>Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Funcionário</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(editing ? { ...form, id: editing.id } : form); }} className="space-y-3">
                <div><Label>Nome *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Telefone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Função</Label><Input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></div>
                  <div><Label>Salário (R$)</Label><Input type="number" step="0.01" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Valor Sábado (R$)</Label><Input type="number" step="0.01" value={form.saturday_value} onChange={e => setForm({ ...form, saturday_value: e.target.value })} /></div>
                  <div><Label>Valor Hora Extra (R$)</Label><Input type="number" step="0.01" value={form.overtime_hourly_rate} onChange={e => setForm({ ...form, overtime_hourly_rate: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div><Label>Data Admissão</Label><Input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} /></div>
                  <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} /><Label>Ativo</Label></div>
                </div>
                <div><Label>Obs. Pagamento</Label><Input value={form.payment_notes} onChange={e => setForm({ ...form, payment_notes: e.target.value })} placeholder="Ex: 50% cada quinzena" /></div>
                <Button type="submit" className="w-full" disabled={saveMutation.isPending}>Salvar</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar funcionários..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden md:table-cell">Função</TableHead>
              <TableHead className="hidden md:table-cell">Salário</TableHead>
              <TableHead className="hidden lg:table-cell">Vlr Sábado</TableHead>
              <TableHead className="hidden lg:table-cell">Vlr H.Extra</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16">Editar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(e => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.name}</TableCell>
                <TableCell className="hidden md:table-cell">{e.role}</TableCell>
                <TableCell className="hidden md:table-cell">{e.salary ? fmt(Number(e.salary)) : "-"}</TableCell>
                <TableCell className="hidden lg:table-cell">{fmt(Number((e as any).saturday_value) || 0)}</TableCell>
                <TableCell className="hidden lg:table-cell">{fmt(Number((e as any).overtime_hourly_rate) || 0)}/h</TableCell>
                <TableCell><Badge variant={e.active ? "default" : "secondary"}>{e.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum funcionário encontrado.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {commissions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Últimas Comissões</h2>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>%</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.slice(0, 10).map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{(c.employees as any)?.name}</TableCell>
                    <TableCell>{fmt(Number(c.amount))}</TableCell>
                    <TableCell>{c.percentage ? `${c.percentage}%` : "-"}</TableCell>
                    <TableCell><Badge variant={c.paid ? "default" : "secondary"}>{c.paid ? "Pago" : "Pendente"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Employees;
