import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, AlertTriangle, TrendingDown, TrendingUp, ArrowUpDown, Plus, Boxes, ClipboardList, Truck, Pencil } from "lucide-react";
import ItemDialog from "@/components/warehouse/ItemDialog";
import MovementDialog from "@/components/warehouse/MovementDialog";
import CountDialog from "@/components/warehouse/CountDialog";
import { formatDateBR, localDateString } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export default function Warehouse() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [itemOpen, setItemOpen] = useState(false);
  const [movOpen, setMovOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todas");

  const { data: items = [] } = useQuery({
    queryKey: ["inventory_items"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_items" as any).select("*").order("name");
      return (data as any[]) ?? [];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["inventory_movements"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_movements" as any)
        .select("*, inventory_items(name,code,unit), work_orders(os_number)")
        .order("movement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      return (data as any[]) ?? [];
    },
  });

  const { data: receipts = [] } = useQuery({
    queryKey: ["inventory_receipts"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_receipts" as any)
        .select("*, purchases(id,material,quantity,unit,supplier)")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data as any[]) ?? [];
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["inventory_requests"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_requests" as any)
        .select("*, work_orders(os_number,clients(name)), inventory_items(name,code,unit,current_qty)")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data as any[]) ?? [];
    },
  });

  const stats = useMemo(() => {
    const total = items.length;
    const low = items.filter((i) => Number(i.current_qty) > 0 && Number(i.current_qty) <= Number(i.min_qty)).length;
    const zero = items.filter((i) => Number(i.current_qty) <= 0).length;
    const today = localDateString();
    const movToday = movements.filter((m) => m.movement_date === today).length;
    const totalValue = items.reduce((s, i) => s + Number(i.current_qty) * Number(i.unit_price ?? 0), 0);
    return { total, low, zero, movToday, totalValue };
  }, [items, movements]);

  const filtered = items.filter((i) => {
    const okSearch = !search || `${i.name} ${i.code}`.toLowerCase().includes(search.toLowerCase());
    const okCat = catFilter === "todas" || i.category === catFilter;
    return okSearch && okCat;
  });

  const receiveNow = useMutation({
    mutationFn: async (r: any) => {
      // Create movement + upsert item + mark received
      let itemId = r.item_id;
      if (!itemId) {
        const { data: existing } = await supabase.from("inventory_items" as any).select("id").eq("name", r.material_name).maybeSingle();
        if ((existing as any)?.id) {
          itemId = (existing as any).id;
        } else {
          const { data: created, error } = await supabase.from("inventory_items" as any)
            .insert({ name: r.material_name, unit: r.unit ?? "un", unit_price: r.unit_price ?? 0, current_qty: 0 })
            .select().single();
          if (error) throw error;
          itemId = (created as any).id;
        }
      }
      const qty = Number(r.expected_qty);
      const { error: e1 } = await supabase.from("inventory_movements" as any).insert({
        item_id: itemId, type: "entrada", quantity: qty, reason: "Compra recebida",
        purchase_id: r.purchase_id, movement_date: localDateString(),
        notes: `Recebimento #${r.id}`,
      });
      if (e1) throw e1;
      if (r.unit_price && r.unit_price > 0) {
        await supabase.from("inventory_items" as any).update({ unit_price: r.unit_price }).eq("id", itemId);
      }
      const { error: e2 } = await supabase.from("inventory_receipts" as any).update({
        status: "recebido", received_qty: qty, received_at: new Date().toISOString(), item_id: itemId,
      }).eq("id", r.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_items"] });
      qc.invalidateQueries({ queryKey: ["inventory_movements"] });
      qc.invalidateQueries({ queryKey: ["inventory_receipts"] });
      toast({ title: "Recebimento confirmado" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const fulfillRequest = useMutation({
    mutationFn: async (r: any) => {
      if (!r.item_id) throw new Error("Solicitação sem item cadastrado — vincule um item primeiro");
      const qty = Number(r.requested_qty);
      const item = r.inventory_items;
      if (!item || Number(item.current_qty) < qty) throw new Error("Estoque insuficiente");
      const { error: e1 } = await supabase.from("inventory_movements" as any).insert({
        item_id: r.item_id, type: "saida", quantity: qty, reason: "Uso em OS",
        work_order_id: r.work_order_id, movement_date: localDateString(),
        notes: `Solicitação #${r.id}`,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("inventory_requests" as any).update({
        status: "atendido", delivered_qty: qty, fulfilled_at: new Date().toISOString(),
      }).eq("id", r.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_items"] });
      qc.invalidateQueries({ queryKey: ["inventory_requests"] });
      qc.invalidateQueries({ queryKey: ["inventory_movements"] });
      toast({ title: "Solicitação atendida" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const markMissing = useMutation({
    mutationFn: async (r: any) => {
      const { error } = await supabase.from("inventory_requests" as any).update({ status: "compra_solicitada" }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory_requests"] });
      toast({ title: "Marcado como compra solicitada" });
    },
  });

  const pendingReceipts = receipts.filter((r) => r.status !== "recebido").length;
  const pendingRequests = requests.filter((r) => r.status === "pendente").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6" /> Almoxarifado
        </h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setCountOpen(true)}><ClipboardList className="h-4 w-4 mr-1" /> Inventário</Button>
          <Button variant="outline" onClick={() => { setMovOpen(true); }}><ArrowUpDown className="h-4 w-4 mr-1" /> Movimentação</Button>
          <Button onClick={() => { setEditItem(null); setItemOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Novo Item</Button>
        </div>
      </div>

      {/* Panel */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-muted-foreground text-sm"><Boxes className="h-4 w-4" /> Itens</div><div className="text-2xl font-bold mt-1">{stats.total}</div></CardContent></Card>
        <Card className={stats.low ? "border-yellow-500/50" : ""}><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-400"><AlertTriangle className="h-4 w-4" /> Estoque baixo</div><div className="text-2xl font-bold mt-1">{stats.low}</div></CardContent></Card>
        <Card className={stats.zero ? "border-destructive/50" : ""}><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-destructive"><TrendingDown className="h-4 w-4" /> Zerados</div><div className="text-2xl font-bold mt-1">{stats.zero}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-muted-foreground text-sm"><TrendingUp className="h-4 w-4" /> Mov. hoje</div><div className="text-2xl font-bold mt-1">{stats.movToday}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-muted-foreground text-sm">Valor total</div><div className="text-2xl font-bold mt-1">{stats.totalValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div></CardContent></Card>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Itens</TabsTrigger>
          <TabsTrigger value="movements">Movimentações</TabsTrigger>
          <TabsTrigger value="receipts">
            Recebimentos {pendingReceipts > 0 && <Badge variant="destructive" className="ml-2">{pendingReceipts}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="requests">
            Solicitações {pendingRequests > 0 && <Badge variant="destructive" className="ml-2">{pendingRequests}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Input placeholder="Buscar por nome ou código..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas categorias</SelectItem>
                {["Ferro", "Tinta", "Parafuso", "Ferramenta", "EPI", "Consumível", "Outro"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Localização</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((i) => {
                    const qty = Number(i.current_qty);
                    const min = Number(i.min_qty);
                    const isZero = qty <= 0;
                    const isLow = qty > 0 && qty <= min;
                    return (
                      <TableRow key={i.id} className={isZero ? "bg-destructive/5" : isLow ? "bg-yellow-500/5" : ""}>
                        <TableCell className="font-mono text-xs">{i.code}</TableCell>
                        <TableCell className="font-medium">{i.name}</TableCell>
                        <TableCell><Badge variant="outline">{i.category}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-sm">{i.location ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono">{qty.toFixed(2)} {i.unit}</TableCell>
                        <TableCell className="text-right text-muted-foreground font-mono">{min.toFixed(2)}</TableCell>
                        <TableCell>
                          {isZero ? <Badge variant="destructive">Zerado</Badge>
                            : isLow ? <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">Baixo</Badge>
                            : <Badge variant="secondary">OK</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" onClick={() => { setEditItem(i); setItemOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum item cadastrado</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Responsável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{formatDateBR(m.movement_date)}</TableCell>
                    <TableCell>
                      <Badge variant={m.type === "entrada" ? "secondary" : m.type === "saida" ? "destructive" : "outline"}>
                        {m.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{m.inventory_items?.code} — {m.inventory_items?.name}</TableCell>
                    <TableCell className="text-right font-mono">{Number(m.quantity).toFixed(2)} {m.inventory_items?.unit}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{m.reason ?? "—"}</TableCell>
                    <TableCell>{m.work_orders?.os_number ?? "—"}</TableCell>
                    <TableCell>{m.responsible ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {movements.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma movimentação</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="receipts">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Recebimentos de Compras</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead className="text-right">Esperado</TableHead>
                    <TableHead className="text-right">Recebido</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.material_name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{r.purchases?.supplier ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{Number(r.expected_qty).toFixed(2)} {r.unit ?? ""}</TableCell>
                      <TableCell className="text-right font-mono">{Number(r.received_qty).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "recebido" ? "secondary" : r.status === "parcial" ? "outline" : "destructive"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status !== "recebido" && (
                          <Button size="sm" onClick={() => receiveNow.mutate(r)}>Confirmar recebimento</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {receipts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum recebimento pendente</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests">
          <Card>
            <CardHeader><CardTitle className="text-base">Solicitações da Produção</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Solicitado</TableHead>
                    <TableHead className="text-right">Em estoque</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDateBR(r.created_at)}</TableCell>
                      <TableCell>{r.work_orders?.os_number ?? "—"}<div className="text-xs text-muted-foreground">{r.work_orders?.clients?.name ?? ""}</div></TableCell>
                      <TableCell>{r.inventory_items?.name ?? r.material_name}</TableCell>
                      <TableCell className="text-right font-mono">{Number(r.requested_qty).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{r.inventory_items?.current_qty ? Number(r.inventory_items.current_qty).toFixed(2) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "atendido" ? "secondary" : r.status === "compra_solicitada" ? "outline" : "destructive"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {r.status === "pendente" && (
                          <>
                            <Button size="sm" onClick={() => fulfillRequest.mutate(r)}>Atender</Button>
                            <Button size="sm" variant="outline" onClick={() => markMissing.mutate(r)}>Solicitar compra</Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {requests.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma solicitação</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ItemDialog open={itemOpen} onOpenChange={setItemOpen} item={editItem} />
      <MovementDialog open={movOpen} onOpenChange={setMovOpen} />
      <CountDialog open={countOpen} onOpenChange={setCountOpen} />
    </div>
  );
}
