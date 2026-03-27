import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, TrendingDown, DollarSign, ShoppingCart, Award, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";

const paymentMethods: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "PIX", cartao: "Cartão", boleto: "Boleto", transferencia: "Transferência",
};
const paymentStatuses: Record<string, string> = {
  pago: "Pago", pendente: "Pendente", parcelado: "Parcelado",
};
const statusColors: Record<string, string> = {
  pago: "bg-green-500/10 text-green-700 border-green-500/20",
  pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  parcelado: "bg-blue-500/10 text-blue-700 border-blue-500/20",
};

const Purchases = () => {
  const { toast } = useToast();
  const { userRole, user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("painel");
  const [search, setSearch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Supplier dialog
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: "", cpf_cnpj: "", phone: "", email: "", products: "", notes: "" });
  const [editSupplierId, setEditSupplierId] = useState<string | null>(null);

  // Purchase dialog
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [pForm, setPForm] = useState({
    supplier_id: "", material: "", quantity: "1", unit: "un", unit_price: "0", original_price: "", purchase_date: new Date().toISOString().split("T")[0],
    invoice_number: "", payment_method: "pix", payment_status: "pendente", due_date: "", notes: "",
  });

  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string } | null>(null);

  // Queries
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("*").order("name");
      return data ?? [];
    },
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data } = await supabase.from("purchases").select("*, suppliers(name)").order("purchase_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: purchaseRequests = [] } = useQuery({
    queryKey: ["purchase-requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_requests")
        .select("*, work_orders(id, description, clients(name), material_status)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: requestMaterials = {} } = useQuery({
    queryKey: ["purchase-request-materials"],
    queryFn: async () => {
      const woIds = purchaseRequests.map((r: any) => r.work_order_id);
      if (!woIds.length) return {};
      const { data } = await supabase
        .from("work_order_materials")
        .select("*")
        .in("work_order_id", woIds);
      const map: Record<string, any[]> = {};
      (data ?? []).forEach((m: any) => {
        if (!map[m.work_order_id]) map[m.work_order_id] = [];
        map[m.work_order_id].push(m);
      });
      return map;
    },
    enabled: purchaseRequests.length > 0,
  });

  const confirmPurchaseRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const request = purchaseRequests.find((r: any) => r.id === requestId) as any;
      if (!request) throw new Error("Solicitação não encontrada");
      // Update request status
      const { error } = await supabase.from("purchase_requests")
        .update({ status: "confirmado", confirmed_at: new Date().toISOString(), confirmed_by: user?.id } as any)
        .eq("id", requestId);
      if (error) throw error;
      // Update work order material_status to comprado
      await supabase.from("work_orders")
        .update({ material_status: "comprado" } as any)
        .eq("id", request.work_order_id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-requests"] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Compra confirmada!" });
    },
  });

  // Mutations
  const saveSupplier = useMutation({
    mutationFn: async () => {
      if (editSupplierId) {
        const { error } = await supabase.from("suppliers").update(supplierForm).eq("id", editSupplierId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert(supplierForm);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setSupplierOpen(false);
      setEditSupplierId(null);
      setSupplierForm({ name: "", cpf_cnpj: "", phone: "", email: "", products: "", notes: "" });
      toast({ title: editSupplierId ? "Fornecedor atualizado!" : "Fornecedor cadastrado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const savePurchase = useMutation({
    mutationFn: async () => {
      const qty = parseFloat(pForm.quantity) || 0;
      const unitP = parseFloat(pForm.unit_price) || 0; // valor negociado unitário
      const originalP = parseFloat(pForm.original_price) || 0; // valor original unitário
      const total = qty * unitP; // total negociado
      const originalTotal = qty * originalP;
      const discountAmt = originalP > 0 ? originalTotal - total : 0;
      const discPct = originalTotal > 0 ? (discountAmt / originalTotal) * 100 : 0;

      const payload: any = {
        supplier_id: pForm.supplier_id || null,
        material: pForm.material,
        quantity: qty,
        unit: pForm.unit,
        unit_price: unitP,
        original_price: originalP > 0 ? originalP : null,
        total,
        purchase_date: pForm.purchase_date,
        invoice_number: pForm.invoice_number || null,
        payment_method: pForm.payment_method,
        payment_status: pForm.payment_status,
        due_date: pForm.due_date || null,
        discount_percentage: discPct,
        discount_amount: discountAmt > 0 ? discountAmt : 0,
        notes: pForm.notes || null,
      };

      const { data: purchaseData, error } = await supabase.from("purchases").insert(payload).select().single();
      if (error) throw error;

      // If pending or parcelado, create financial transaction (a_pagar)
      if (pForm.payment_status !== "pago") {
        const supplierName = suppliers.find(s => s.id === pForm.supplier_id)?.name ?? "Fornecedor";
        await supabase.from("financial_transactions").insert({
          type: "a_pagar" as any,
          description: `Compra: ${pForm.material} - ${supplierName}`,
          amount: total,
          due_date: pForm.due_date || pForm.purchase_date,
          category: "Compras",
          status: "pendente" as any,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      setPurchaseOpen(false);
      setPForm({
        supplier_id: "", material: "", quantity: "1", unit: "un", unit_price: "0", original_price: "", purchase_date: new Date().toISOString().split("T")[0],
        invoice_number: "", payment_method: "pix", payment_status: "pendente", due_date: "", notes: "",
      });
      toast({ title: "Compra registrada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      const { error } = await supabase.from(type as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      setDeleteTarget(null);
      toast({ title: "Removido com sucesso!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const markPurchasePaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchases").update({ payment_status: "pago" }).eq("id", id);
      if (error) throw error;
      // Also mark related financial transaction
      const purchase = purchases.find(p => p.id === id);
      if (purchase) {
        const supplierName = (purchase as any).suppliers?.name ?? "";
        await supabase.from("financial_transactions")
          .update({ status: "pago" as any, paid_date: new Date().toISOString().split("T")[0] })
          .ilike("description", `%${purchase.material}%`)
          .eq("category", "Compras")
          .eq("status", "pendente" as any);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      toast({ title: "Pagamento registrado!" });
    },
  });

  // Calculations
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthPurchases = purchases.filter(p => new Date(p.purchase_date) >= monthStart);
  const totalMonth = monthPurchases.reduce((s, p) => s + Number(p.total), 0);
  const totalDiscount = monthPurchases.reduce((s, p) => s + Number(p.discount_amount ?? 0), 0);
  const pendingPayment = purchases.filter(p => p.payment_status !== "pago");

  // Supplier discount ranking
  const supplierDiscounts = useMemo(() => {
    const map: Record<string, { name: string; totalOriginal: number; totalPaid: number; totalSaved: number; count: number }> = {};
    purchases.forEach(p => {
      const sid = p.supplier_id;
      if (!sid) return;
      const name = (p as any).suppliers?.name ?? "Sem nome";
      if (!map[sid]) map[sid] = { name, totalOriginal: 0, totalPaid: 0, totalSaved: 0, count: 0 };
      const origPrice = Number((p as any).original_price ?? 0);
      const qty = Number(p.quantity);
      const originalTotal = origPrice > 0 ? origPrice * qty : Number(p.total);
      map[sid].totalOriginal += originalTotal;
      map[sid].totalPaid += Number(p.total);
      map[sid].totalSaved += Number(p.discount_amount ?? 0);
      if (Number(p.discount_amount ?? 0) > 0) map[sid].count++;
    });
    return Object.values(map).sort((a, b) => b.totalSaved - a.totalSaved);
  }, [purchases]);

  const filteredPurchases = purchases.filter(p => {
    if (filterSupplier !== "all" && p.supplier_id !== filterSupplier) return false;
    if (filterStatus !== "all" && p.payment_status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = (p as any).suppliers?.name ?? "";
      return p.material.toLowerCase().includes(s) || name.toLowerCase().includes(s) || (p.invoice_number ?? "").toLowerCase().includes(s);
    }
    return true;
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const calcTotal = () => {
    const qty = parseFloat(pForm.quantity) || 0;
    const unitP = parseFloat(pForm.unit_price) || 0;
    return qty * unitP;
  };

  const calcSavings = () => {
    const qty = parseFloat(pForm.quantity) || 0;
    const unitP = parseFloat(pForm.unit_price) || 0;
    const origP = parseFloat(pForm.original_price) || 0;
    const savings = origP > 0 ? (qty * origP) - (qty * unitP) : 0;
    const pct = origP > 0 ? (savings / (qty * origP)) * 100 : 0;
    return { savings: Math.max(0, savings), pct: Math.max(0, pct) };
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl md:text-2xl font-bold">Compras</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="painel">Painel</TabsTrigger>
          <TabsTrigger value="solicitacoes">Solicitações</TabsTrigger>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
          <TabsTrigger value="descontos">Descontos</TabsTrigger>
        </TabsList>

        {/* PAINEL */}
        <TabsContent value="painel" className="space-y-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Gasto no Mês</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{fmt(totalMonth)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Economizado em Descontos</CardTitle>
                <TrendingDown className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold text-green-600">{fmt(totalDiscount)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Compras Pendentes</CardTitle>
                <DollarSign className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{pendingPayment.length}</div>
                <p className="text-xs text-muted-foreground">{fmt(pendingPayment.reduce((s, p) => s + Number(p.total), 0))}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Fornecedores</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{suppliers.length}</div></CardContent>
            </Card>
          </div>

          {/* Recent purchases */}
          <Card>
            <CardHeader><CardTitle className="text-base">Compras Recentes</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead className="hidden md:table-cell">Fornecedor</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.slice(0, 5).map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.material}</TableCell>
                        <TableCell className="hidden md:table-cell">{(p as any).suppliers?.name ?? "—"}</TableCell>
                        <TableCell>{fmt(Number(p.total))}</TableCell>
                        <TableCell><Badge className={statusColors[p.payment_status]}>{paymentStatuses[p.payment_status]}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {purchases.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma compra registrada.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* COMPRAS */}
        <TabsContent value="compras" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2 flex-wrap flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
              </div>
              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="parcelado">Parcelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Nova Compra</Button></DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Registrar Compra</DialogTitle></DialogHeader>
                <form onSubmit={e => { e.preventDefault(); savePurchase.mutate(); }} className="space-y-3">
                  <div>
                    <Label>Fornecedor</Label>
                    <Select value={pForm.supplier_id} onValueChange={v => setPForm({ ...pForm, supplier_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Material / Produto *</Label><Input value={pForm.material} onChange={e => setPForm({ ...pForm, material: e.target.value })} required /></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label>Quantidade *</Label><Input type="number" step="0.01" value={pForm.quantity} onChange={e => setPForm({ ...pForm, quantity: e.target.value })} required /></div>
                    <div>
                      <Label>Unidade</Label>
                      <Select value={pForm.unit} onValueChange={v => setPForm({ ...pForm, unit: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["un", "kg", "m", "m²", "m³", "litro", "peça", "pacote", "cx", "rolo"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Valor Negociado (R$) *</Label><Input type="number" step="0.01" value={pForm.unit_price} onChange={e => setPForm({ ...pForm, unit_price: e.target.value })} required /></div>
                  </div>
                  <div>
                    <Label>Valor Original do Fornecedor (R$)</Label>
                    <Input type="number" step="0.01" value={pForm.original_price} onChange={e => setPForm({ ...pForm, original_price: e.target.value })} placeholder="Deixe vazio se não houve desconto" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label>Total Negociado</Label>
                      <Input value={fmt(calcTotal())} readOnly className="bg-muted" />
                    </div>
                    <div>
                      <Label>Economizado</Label>
                      <Input value={fmt(calcSavings().savings)} readOnly className="bg-muted text-green-600" />
                    </div>
                    <div>
                      <Label>Desconto (%)</Label>
                      <Input value={`${calcSavings().pct.toFixed(1)}%`} readOnly className="bg-muted text-green-600" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Data da Compra *</Label><Input type="date" value={pForm.purchase_date} onChange={e => setPForm({ ...pForm, purchase_date: e.target.value })} required /></div>
                    <div><Label>Nº Nota/Pedido</Label><Input value={pForm.invoice_number} onChange={e => setPForm({ ...pForm, invoice_number: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Forma de Pagamento</Label>
                      <Select value={pForm.payment_method} onValueChange={v => setPForm({ ...pForm, payment_method: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(paymentMethods).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Status Pagamento</Label>
                      <Select value={pForm.payment_status} onValueChange={v => setPForm({ ...pForm, payment_status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(paymentStatuses).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {pForm.payment_status !== "pago" && (
                    <div><Label>Data de Vencimento</Label><Input type="date" value={pForm.due_date} onChange={e => setPForm({ ...pForm, due_date: e.target.value })} /></div>
                  )}
                  <div><Label>Observações</Label><Textarea value={pForm.notes} onChange={e => setPForm({ ...pForm, notes: e.target.value })} /></div>
                  <Button type="submit" className="w-full" disabled={savePurchase.isPending}>Registrar Compra</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="hidden md:table-cell">Fornecedor</TableHead>
                  <TableHead className="hidden md:table-cell">Qtd</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="hidden md:table-cell">Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPurchases.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.material}</TableCell>
                    <TableCell className="hidden md:table-cell">{(p as any).suppliers?.name ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{p.quantity} {p.unit}</TableCell>
                    <TableCell>{fmt(Number(p.total))}</TableCell>
                    <TableCell className="hidden md:table-cell">{new Date(p.purchase_date).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell><Badge className={statusColors[p.payment_status]}>{paymentStatuses[p.payment_status]}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {p.payment_status !== "pago" && <Button size="sm" variant="outline" onClick={() => markPurchasePaid.mutate(p.id)}>Pagar</Button>}
                        {userRole === "admin" && <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: "purchases", id: p.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPurchases.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma compra encontrada.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* FORNECEDORES */}
        <TabsContent value="fornecedores" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Fornecedores</h2>
            <Dialog open={supplierOpen} onOpenChange={(v) => { setSupplierOpen(v); if (!v) { setEditSupplierId(null); setSupplierForm({ name: "", cpf_cnpj: "", phone: "", email: "", products: "", notes: "" }); } }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Novo Fornecedor</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editSupplierId ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle></DialogHeader>
                <form onSubmit={e => { e.preventDefault(); saveSupplier.mutate(); }} className="space-y-3">
                  <div><Label>Nome *</Label><Input value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} required /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>CNPJ / CPF</Label><Input value={supplierForm.cpf_cnpj} onChange={e => setSupplierForm({ ...supplierForm, cpf_cnpj: e.target.value })} /></div>
                    <div><Label>Telefone</Label><Input value={supplierForm.phone} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></div>
                  </div>
                  <div><Label>E-mail</Label><Input type="email" value={supplierForm.email} onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })} /></div>
                  <div><Label>Produtos / Materiais</Label><Textarea value={supplierForm.products} onChange={e => setSupplierForm({ ...supplierForm, products: e.target.value })} /></div>
                  <div><Label>Observações</Label><Textarea value={supplierForm.notes} onChange={e => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></div>
                  <Button type="submit" className="w-full" disabled={saveSupplier.isPending}>Salvar</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="hidden md:table-cell">CNPJ/CPF</TableHead>
                  <TableHead className="hidden md:table-cell">Telefone</TableHead>
                  <TableHead className="hidden md:table-cell">Produtos</TableHead>
                  <TableHead className="w-24">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="hidden md:table-cell">{s.cpf_cnpj || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{s.phone || "—"}</TableCell>
                    <TableCell className="hidden md:table-cell max-w-[200px] truncate">{s.products || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditSupplierId(s.id);
                          setSupplierForm({ name: s.name, cpf_cnpj: s.cpf_cnpj ?? "", phone: s.phone ?? "", email: s.email ?? "", products: s.products ?? "", notes: s.notes ?? "" });
                          setSupplierOpen(true);
                        }}>Editar</Button>
                        {userRole === "admin" && <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: "suppliers", id: s.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {suppliers.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum fornecedor cadastrado.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* DESCONTOS */}
        <TabsContent value="descontos" className="space-y-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Economizado (Mês)</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-green-600">{fmt(totalDiscount)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Economizado (Geral)</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold text-green-600">{fmt(purchases.reduce((s, p) => s + Number(p.discount_amount ?? 0), 0))}</div></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Ranking de Fornecedores por Desconto</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Valor Original</TableHead>
                      <TableHead>Valor Pago</TableHead>
                      <TableHead>Economizado</TableHead>
                      <TableHead>Compras</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplierDiscounts.map((sd, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-bold">{i + 1}º</TableCell>
                        <TableCell className="font-medium">{sd.name}</TableCell>
                        <TableCell>{fmt(sd.totalOriginal)}</TableCell>
                        <TableCell>{fmt(sd.totalPaid)}</TableCell>
                        <TableCell className="text-green-600 font-medium">{fmt(sd.totalSaved)}</TableCell>
                        <TableCell>{sd.count}</TableCell>
                      </TableRow>
                    ))}
                    {supplierDiscounts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum desconto registrado.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
};

export default Purchases;
