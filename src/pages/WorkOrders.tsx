import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import MonthFilter, { getDateRange, isInRangeOrOpen, type PeriodMode } from "@/components/MonthFilter";

const statusColors: Record<string, string> = {
  aguardando: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  em_producao: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  aguardando_instalacao: "bg-green-500/10 text-green-700 border-green-500/20",
  entregue: "bg-purple-500/10 text-purple-700 border-purple-500/20",
};
const statusLabels: Record<string, string> = { aguardando: "Aguardando", em_producao: "Em Produção", aguardando_instalacao: "Aguardando Instalação", entregue: "Entregue" };

const WorkOrders = () => {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const dateRange = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState({ client_id: "", description: "", total: "", status: "aguardando" as string, origem_venda: "" });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => { const { data } = await supabase.from("clients").select("id, name").order("name"); return data ?? []; },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["work-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("work_orders").select("*, clients(name)").order("created_at", { ascending: false });
      const woIds = (data ?? []).map((o: any) => o.id);
      let itemsMap = new Map<string, any[]>();
      if (woIds.length > 0) {
        const { data: items } = await supabase.from("work_order_items" as any).select("work_order_id, description, quantity, unit_price, total").in("work_order_id", woIds);
        (items ?? []).forEach((item: any) => {
          const list = itemsMap.get(item.work_order_id) || [];
          list.push(item);
          itemsMap.set(item.work_order_id, list);
        });
      }
      return (data ?? []).map((o: any) => ({ ...o, items: itemsMap.get(o.id) || [] }));
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.origem_venda) throw new Error("Selecione a Origem da Venda");
      const { error } = await supabase.from("work_orders").insert({
        client_id: form.client_id, description: form.description,
        total: parseFloat(form.total) || 0, status: form.status as any,
        origem_venda: form.origem_venda,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ["work-orders"] }); 
      setOpen(false); 
      toast({ 
        title: "OS criada!",
        description: "Ordem de serviço registrada com sucesso."
      }); 
    },
    onError: (e: any) => {
      console.error("Erro ao salvar OS:", e);
      toast({ 
        title: "Erro", 
        description: e.message || "Erro ao tentar salvar a Ordem de Serviço.", 
        variant: "destructive" 
      });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "em_producao") updates.started_at = new Date().toISOString();
      if (status === "aguardando_instalacao") updates.completed_at = new Date().toISOString();
      if (status === "entregue") updates.delivered_at = new Date().toISOString();
      const { error } = await supabase.from("work_orders").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["work-orders"] }); toast({ title: "Status atualizado!" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Cascade: delete related records
      await supabase.from("financial_transactions").delete().eq("work_order_id", id);
      await supabase.from("account_movements").delete().eq("work_order_id", id);
      const { data: sales } = await supabase.from("sales").select("id").eq("work_order_id", id);
      if (sales && sales.length > 0) {
        const saleIds = sales.map((s: any) => s.id);
        await supabase.from("sales_commissions").delete().in("sale_id", saleIds);
        await supabase.from("sales").delete().in("id", saleIds);
      }
      await supabase.from("production").delete().eq("os_id", id);
      await supabase.from("work_order_items").delete().eq("work_order_id", id);
      await supabase.from("work_order_materials").delete().eq("work_order_id", id);
      await supabase.from("purchase_requests").delete().eq("work_order_id", id);
      const { error } = await supabase.from("work_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-entradas"] });
      queryClient.invalidateQueries({ queryKey: ["financial-contas-receber"] });
      queryClient.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["billing-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["production"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteTarget(null);
      toast({ title: "OS e registros vinculados removidos!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const nextStatus: Record<string, string> = { aguardando: "em_producao", em_producao: "aguardando_instalacao", aguardando_instalacao: "entregue" };

  const getItemSummary = (o: any) => {
    const items = o.items || [];
    if (items.length === 0) return o.description || "Sem descrição";
    const first = items[0].description;
    return items.length > 1 ? `${first} + ${items.length - 1} itens` : first;
  };

  const filtered = orders.filter(o => {
    const isOpen = ["aguardando", "em_producao", "aguardando_instalacao"].includes(o.status);
    const completionDate = o.completed_at || o.delivered_at;
    if (!isInRangeOrOpen(o.created_at, dateRange, isOpen, completionDate)) return false;
    if (statusFilter !== "todos" && o.status !== statusFilter) return false;
    return (o.clients as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
      (o.description ?? "").toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Ordens de Serviço</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" />Nova OS</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova Ordem de Serviço</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
              <div><Label>Cliente *</Label>
                <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Descrição</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="min-h-[100px] resize-y" /></div>
              <div><Label>Origem da Venda *</Label>
                <Select value={form.origem_venda} onValueChange={v => setForm({ ...form, origem_venda: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="obras">Obras</SelectItem>
                    <SelectItem value="empresa">Empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {userRole !== "producao" && <div><Label>Valor Total (R$)</Label><Input type="number" step="0.01" value={form.total} onChange={e => setForm({ ...form, total: e.target.value })} required /></div>}
              <Button type="submit" className="w-full" disabled={saveMutation.isPending || !form.client_id || !form.origem_venda}>Salvar</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar ordens..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Filtrar por status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="aguardando">Aguardando</SelectItem>
            <SelectItem value="em_producao">Em Produção</SelectItem>
            <SelectItem value="aguardando_instalacao">Aguardando Instalação</SelectItem>
            <SelectItem value="entregue">Entregue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {filtered.map(o => (
          <Card key={o.id} className="p-3">
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{(o.clients as any)?.name}</p>
                {<p className="text-xs text-muted-foreground truncate">{getItemSummary(o)}</p>}
              </div>
              <Badge className={statusColors[o.status]}>{statusLabels[o.status]}</Badge>
            </div>
            <div className="flex items-center justify-between">
              {userRole !== "producao" && <span className="font-bold text-sm">{fmt(Number(o.total))}</span>}
              <div className="flex gap-1">
                {nextStatus[o.status] && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: o.id, status: nextStatus[o.status] })}>
                    → {statusLabels[nextStatus[o.status]]}
                  </Button>
                )}
                {userRole === "admin" && (
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(o.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhuma OS encontrada.</p>}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Descrição</TableHead>
              {userRole !== "producao" && <TableHead>Valor</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="w-32">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(o => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{(o.clients as any)?.name}</TableCell>
                <TableCell className="max-w-[200px] truncate">{getItemSummary(o)}</TableCell>
                {userRole !== "producao" && <TableCell>{fmt(Number(o.total))}</TableCell>}
                <TableCell><Badge className={statusColors[o.status]}>{statusLabels[o.status]}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {nextStatus[o.status] && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: o.id, status: nextStatus[o.status] })}>
                        → {statusLabels[nextStatus[o.status]]}
                      </Button>
                    )}
                    {userRole === "admin" && (
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(o.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={userRole === "producao" ? 4 : 5} className="text-center text-muted-foreground py-8">Nenhuma OS encontrada.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        isPending={deleteMutation.isPending}
        description="Tem certeza que deseja excluir esta OS? Todos os dados relacionados (vendas, comissões, transações) serão removidos."
      />
    </div>
  );
};

export default WorkOrders;
