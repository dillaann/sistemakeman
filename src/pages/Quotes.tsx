import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Check, X, FileDown, Trash2, DollarSign } from "lucide-react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { Textarea } from "@/components/ui/textarea";
import { generateQuotePDF } from "@/lib/generateQuotePDF";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const statusColors: Record<string, string> = {
  pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  aprovado: "bg-green-500/10 text-green-700 border-green-500/20",
  rejeitado: "bg-red-500/10 text-red-700 border-red-500/20",
};
const statusLabels: Record<string, string> = { pendente: "Pendente", aprovado: "Aprovado", rejeitado: "Rejeitado" };

const paymentStatusColors: Record<string, string> = {
  aguardando: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  entrada_recebida: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  pago_total: "bg-green-500/10 text-green-700 border-green-500/20",
};
const paymentStatusLabels: Record<string, string> = {
  aguardando: "Aguardando",
  entrada_recebida: "Entrada Recebida",
  pago_total: "Pago Total",
};

interface ItemRow { description: string; quantity: string; unit_price: string; }

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const Quotes = () => {
  const { toast } = useToast();
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState({ client_id: "", description: "", valid_until: "", seller_id: "" });
  const [items, setItems] = useState<ItemRow[]>([{ description: "", quantity: "1", unit_price: "" }]);

  // Approval modal state (commission + payment)
  const [approvalModal, setApprovalModal] = useState<{
    open: boolean;
    quoteId: string;
    clientId: string;
    total: number;
    sellerId: string;
    sellerName: string;
    description: string;
    percentage: number;
  } | null>(null);
  const [commPercentage, setCommPercentage] = useState(5);
  const [paymentType, setPaymentType] = useState<"a_vista" | "entrada_restante">("a_vista");
  const [downPayment, setDownPayment] = useState("");
  const [downPaymentDate, setDownPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("pix");

  // Payment registration modal for approved quotes
  const [payRegDialog, setPayRegDialog] = useState<any>(null);
  const [payRegForm, setPayRegForm] = useState({ amount: "", method: "pix", date: new Date().toISOString().split("T")[0] });

  const addItem = () => setItems([...items, { description: "", quantity: "1", unit_price: "" }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof ItemRow, value: string) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    setItems(updated);
  };

  const calcItemTotal = (item: ItemRow) => (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
  const grandTotal = items.reduce((s, it) => s + calcItemTotal(it), 0);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => { const { data } = await supabase.from("clients").select("*").order("name"); return data ?? []; },
  });

  const { data: sellers = [] } = useQuery({
    queryKey: ["sellers-list"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "vendedor");
      if (!roles?.length) return [];
      const sellerIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
      return (profiles ?? []).filter(p => sellerIds.includes(p.id));
    },
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data } = await supabase.from("quotes").select("*, clients(name, phone, address, city, state), quote_items(*)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: profilesMap = {} } = useQuery({
    queryKey: ["profiles-map"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      const map: Record<string, string> = {};
      (data ?? []).forEach(p => { map[p.id] = p.full_name || "Sem nome"; });
      return map;
    },
  });

  const { data: commissionRates = {} } = useQuery({
    queryKey: ["seller-commission-rates"],
    queryFn: async () => {
      const { data } = await supabase.from("seller_commission_rates").select("seller_id, percentage");
      const map: Record<string, number> = {};
      (data ?? []).forEach(r => { map[r.seller_id] = Number(r.percentage); });
      return map;
    },
  });

  const effectiveSellerId = userRole === "vendedor" ? user?.id ?? "" : form.seller_id;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validItems = items.filter(it => it.description.trim());
      if (!validItems.length) throw new Error("Adicione pelo menos um item");

      const { data: quote, error } = await supabase.from("quotes").insert({
        client_id: form.client_id,
        description: form.description,
        total: grandTotal,
        valid_until: form.valid_until || null,
        created_by: user?.id,
        seller_id: effectiveSellerId || null,
      } as any).select().single();
      if (error) throw error;

      const itemsToInsert = validItems.map(it => ({
        quote_id: quote.id,
        description: it.description,
        quantity: parseFloat(it.quantity) || 1,
        unit_price: parseFloat(it.unit_price) || 0,
        total: calcItemTotal(it),
      }));
      const { error: itemsError } = await supabase.from("quote_items").insert(itemsToInsert);
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      setOpen(false);
      setForm({ client_id: "", description: "", valid_until: "", seller_id: "" });
      setItems([{ description: "", quantity: "1", unit_price: "" }]);
      toast({ title: "Orçamento criado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleApprove = (quote: any) => {
    const sellerId = (quote as any).seller_id;
    const defaultPct = sellerId ? (commissionRates[sellerId] ?? 5) : 5;
    setCommPercentage(defaultPct);
    setPaymentType("a_vista");
    setDownPayment("");
    setDownPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("pix");
    setApprovalModal({
      open: true,
      quoteId: quote.id,
      clientId: quote.client_id,
      total: Number(quote.total),
      sellerId: sellerId || "",
      sellerName: sellerId ? (profilesMap[sellerId] || "Vendedor") : "",
      description: quote.description || "",
      percentage: defaultPct,
    });
  };

  const approveAndCreateOS = async (
    quoteId: string, clientId: string, total: number, description: string,
    sellerId: string | null, commissionPct: number | null
  ) => {
    try {
      const now = new Date().toISOString();
      const dpAmount = paymentType === "entrada_restante" ? (parseFloat(downPayment) || 0) : 0;
      const remaining = paymentType === "entrada_restante" ? Math.max(total - dpAmount, 0) : 0;
      const pStatus = paymentType === "a_vista" ? "aguardando" : (dpAmount > 0 ? "aguardando" : "aguardando");

      // Update quote with approval info and payment config
      await supabase.from("quotes").update({
        status: "aprovado" as any,
        approved_at: now,
        payment_type: paymentType,
        down_payment: dpAmount,
        down_payment_date: paymentType === "entrada_restante" && dpAmount > 0 ? downPaymentDate : null,
        remaining_amount: remaining,
        payment_method: paymentMethod,
        payment_status: dpAmount >= total ? "pago_total" : (dpAmount > 0 ? "entrada_recebida" : "aguardando"),
      } as any).eq("id", quoteId);

      // Create work order
      const { data: wo, error: woError } = await supabase.from("work_orders").insert({
        client_id: clientId,
        quote_id: quoteId,
        total,
        description: description || "OS gerada a partir de orçamento",
        status: "aguardando" as any,
      }).select().single();
      if (woError) throw woError;

      // Create financial transaction (a_receber) for the full amount
      if (total > 0) {
        // If there's a down payment received, create a paid transaction for it
        if (dpAmount > 0) {
          await supabase.from("financial_transactions").insert({
            type: "a_receber" as any,
            description: `Entrada - Orçamento ${quoteId.slice(0, 8)}`,
            amount: dpAmount,
            due_date: downPaymentDate,
            paid_date: downPaymentDate,
            status: "pago" as any,
            category: `Faturamento - ${paymentMethod}`,
            work_order_id: wo.id,
            client_id: clientId,
          });
        }

        // Create pending transaction for the remaining amount
        const pendingAmount = total - dpAmount;
        if (pendingAmount > 0) {
          await supabase.from("financial_transactions").insert({
            type: "a_receber" as any,
            description: `Saldo - Orçamento ${quoteId.slice(0, 8)}`,
            amount: pendingAmount,
            due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            status: "pendente" as any,
            category: "Faturamento",
            work_order_id: wo.id,
            client_id: clientId,
          });
        }
      }

      // Create sale + commission if seller exists
      if (sellerId) {
        const { data: sale, error: saleError } = await supabase.from("sales").insert({
          seller_id: sellerId,
          client_id: clientId,
          work_order_id: wo.id,
          description: description || "Venda gerada por orçamento",
          amount: total,
          status: "aguardando",
        }).select().single();
        if (saleError) throw saleError;

        if (commissionPct !== null && commissionPct > 0) {
          const commAmount = total * (commissionPct / 100);
          await supabase.from("sales_commissions").insert({
            sale_id: sale.id,
            seller_id: sellerId,
            percentage: commissionPct,
            amount: commAmount,
            status: "pendente",
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["billing-work-orders"] });
      toast({ title: "Orçamento aprovado!", description: "OS, pagamento e lançamentos financeiros criados." });
    } catch (e: any) {
      toast({ title: "Erro ao aprovar", description: e.message, variant: "destructive" });
    }
  };

  const handleApprovalConfirm = (withCommission: boolean) => {
    if (!approvalModal) return;
    const { quoteId, clientId, total, sellerId, description } = approvalModal;
    approveAndCreateOS(
      quoteId, clientId, total, description,
      sellerId || null,
      sellerId && withCommission ? commPercentage : null
    );
    setApprovalModal(null);
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("quotes").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["quotes"] }); toast({ title: "Status atualizado!" }); },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["billing-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      setDeleteTarget(null);
      toast({ title: "Orçamento removido!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Register payment on approved quote
  const registerQuotePayment = useMutation({
    mutationFn: async (quote: any) => {
      const amount = parseFloat(payRegForm.amount);
      if (!amount || amount <= 0) throw new Error("Valor inválido");

      // Find the work order linked to this quote
      const { data: wo } = await supabase.from("work_orders").select("id").eq("quote_id", quote.id).single();

      // Create paid financial transaction
      await supabase.from("financial_transactions").insert({
        type: "a_receber" as any,
        description: `Recebimento - Orçamento ${quote.id.slice(0, 8)}`,
        amount,
        due_date: payRegForm.date,
        paid_date: payRegForm.date,
        status: "pago" as any,
        category: `Faturamento - ${payRegForm.method}`,
        work_order_id: wo?.id || null,
        client_id: quote.client_id,
      });

      // Update quote payment status
      const currentPaid = Number(quote.down_payment || 0);
      const totalPaidNow = currentPaid + amount;
      const total = Number(quote.total);
      const newRemaining = Math.max(total - totalPaidNow, 0);
      const newStatus = totalPaidNow >= total ? "pago_total" : "entrada_recebida";

      await supabase.from("quotes").update({
        down_payment: totalPaidNow,
        remaining_amount: newRemaining,
        payment_status: newStatus,
      } as any).eq("id", quote.id);

      // If fully paid, also update any pending financial transaction to paid
      if (totalPaidNow >= total) {
        const { data: pendingTxns } = await supabase.from("financial_transactions")
          .select("id")
          .eq("work_order_id", wo?.id || "")
          .eq("status", "pendente")
          .eq("type", "a_receber");
        for (const txn of pendingTxns ?? []) {
          await supabase.from("financial_transactions").update({
            status: "pago" as any,
            paid_date: payRegForm.date,
          }).eq("id", txn.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      setPayRegDialog(null);
      toast({ title: "Pagamento registrado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleGeneratePDF = (quote: any) => {
    const client = quote.clients as any;
    const quoteItems = (quote.quote_items ?? []) as any[];
    const createdAt = new Date(quote.created_at);
    const dateStr = createdAt.toLocaleDateString("pt-BR");

    const pdfItems = quoteItems.length > 0
      ? quoteItems.map((it: any) => ({ description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price), total: Number(it.total) }))
      : [{ description: quote.description ?? "Serviço", quantity: 1, unit_price: Number(quote.total), total: Number(quote.total) }];

    generateQuotePDF({
      date: dateStr,
      client: { name: client?.name ?? "—", phone: client?.phone, address: client?.address, city: client?.city, state: client?.state },
      items: pdfItems,
      total: Number(quote.total),
      description: quote.description,
      valid_until: quote.valid_until,
    });
    toast({ title: "PDF gerado com sucesso!" });
  };

  const filtered = quotes.filter(q =>
    (q.clients as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
    (q.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const commissionValue = approvalModal ? approvalModal.total * (commPercentage / 100) : 0;
  const approvalDownPayment = parseFloat(downPayment) || 0;
  const approvalRemaining = approvalModal ? Math.max(approvalModal.total - approvalDownPayment, 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orçamentos</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Orçamento</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo Orçamento</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
              <div><Label>Cliente *</Label>
                <Select value={form.client_id} onValueChange={v => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div><Label>Vendedor Responsável</Label>
                {userRole === "vendedor" ? (
                  <Input value={profilesMap[user?.id ?? ""] || "Você"} disabled />
                ) : (
                  <Select value={form.seller_id} onValueChange={v => setForm({ ...form, seller_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar vendedor (opcional)" /></SelectTrigger>
                    <SelectContent>
                      {sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Itens do Orçamento</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar Item
                  </Button>
                </div>
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      {i === 0 && <Label className="text-xs">Descrição</Label>}
                      <Input placeholder="Descrição do item" value={item.description} onChange={e => updateItem(i, "description", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <Label className="text-xs">Qtd</Label>}
                      <Input type="number" min="1" value={item.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <Label className="text-xs">Preço Un.</Label>}
                      <Input type="number" step="0.01" placeholder="0,00" value={item.unit_price} onChange={e => updateItem(i, "unit_price", e.target.value)} />
                    </div>
                    <div className="col-span-2 text-right text-sm font-medium pt-2">{fmt(calcItemTotal(item))}</div>
                    <div className="col-span-1">
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="text-right font-bold text-lg border-t pt-2">Total: {fmt(grandTotal)}</div>
              </div>

              <div><Label>Observações</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Válido até</Label><Input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>Salvar Orçamento</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar orçamentos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead className="hidden md:table-cell">Descrição</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="w-36">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(q => {
              const pStatus = (q as any).payment_status || "aguardando";
              return (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">{(q.clients as any)?.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(q as any).seller_id ? (profilesMap[(q as any).seller_id] || "—") : "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell max-w-[200px] truncate">{q.description}</TableCell>
                  <TableCell>{fmt(Number(q.total))}</TableCell>
                  <TableCell><Badge className={statusColors[q.status]}>{statusLabels[q.status]}</Badge></TableCell>
                  <TableCell>
                    {q.status === "aprovado" ? (
                      <Badge className={paymentStatusColors[pStatus] || paymentStatusColors.aguardando}>
                        {paymentStatusLabels[pStatus] || "Aguardando"}
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleGeneratePDF(q)} title="Gerar PDF">
                        <FileDown className="h-4 w-4" />
                      </Button>
                      {q.status === "pendente" && userRole === "admin" && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleApprove(q)} title="Aprovar"><Check className="h-4 w-4 text-green-600" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => updateStatus.mutate({ id: q.id, status: "rejeitado" })} title="Rejeitar"><X className="h-4 w-4 text-red-600" /></Button>
                        </>
                      )}
                      {q.status === "aprovado" && pStatus !== "pago_total" && userRole === "admin" && (
                        <Button variant="ghost" size="icon" onClick={() => {
                          const rem = Number((q as any).remaining_amount || q.total);
                          setPayRegForm({ amount: String(rem), method: "pix", date: new Date().toISOString().split("T")[0] });
                          setPayRegDialog(q);
                        }} title="Registrar Pagamento">
                          <DollarSign className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      {userRole === "admin" && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(q.id)} title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum orçamento encontrado.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Approval Modal (Payment + Commission) */}
      <Dialog open={!!approvalModal?.open} onOpenChange={(o) => { if (!o) setApprovalModal(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Aprovar Orçamento — Configurar Pagamento</DialogTitle></DialogHeader>
          {approvalModal && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-sm">Valor Total</Label>
                  <p className="text-xl font-bold">{fmt(approvalModal.total)}</p>
                </div>
                {approvalModal.sellerName && (
                  <div>
                    <Label className="text-muted-foreground text-sm">Vendedor</Label>
                    <p className="font-medium">{approvalModal.sellerName}</p>
                  </div>
                )}
              </div>

              {/* Payment Configuration */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Configuração de Pagamento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Tipo de Pagamento</Label>
                    <Select value={paymentType} onValueChange={(v: any) => setPaymentType(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="a_vista">Valor Total à Vista</SelectItem>
                        <SelectItem value="entrada_restante">Entrada + Restante</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {paymentType === "entrada_restante" && (
                    <>
                      <div>
                        <Label>Valor da Entrada (R$)</Label>
                        <Input type="number" step="0.01" value={downPayment} onChange={e => setDownPayment(e.target.value)} placeholder="0,00" />
                      </div>
                      <div>
                        <Label>Data do Pagamento da Entrada</Label>
                        <Input type="date" value={downPaymentDate} onChange={e => setDownPaymentDate(e.target.value)} />
                      </div>
                      <div className="bg-muted p-2 rounded text-sm">
                        Restante a receber: <strong>{fmt(approvalRemaining)}</strong>
                      </div>
                    </>
                  )}

                  <div>
                    <Label>Forma de Pagamento</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="cartao">Cartão</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Commission (only if seller) */}
              {approvalModal.sellerId && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Comissão do Vendedor</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>Percentual de Comissão (%)</Label>
                      <Input type="number" step="0.5" min="0" max="100" value={commPercentage} onChange={e => setCommPercentage(parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="bg-muted p-2 rounded text-sm">
                      Valor da comissão: <strong>{fmt(commissionValue)}</strong>
                    </div>
                  </CardContent>
                </Card>
              )}

              <DialogFooter className="flex gap-2">
                {approvalModal.sellerId ? (
                  <>
                    <Button variant="outline" onClick={() => handleApprovalConfirm(false)}>Aprovar sem Comissão</Button>
                    <Button onClick={() => handleApprovalConfirm(true)}>Aprovar com Comissão</Button>
                  </>
                ) : (
                  <Button onClick={() => handleApprovalConfirm(false)} className="w-full">Aprovar Orçamento</Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Registration Modal */}
      <Dialog open={!!payRegDialog} onOpenChange={(v) => { if (!v) setPayRegDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
          {payRegDialog && (
            <form onSubmit={(e) => { e.preventDefault(); registerQuotePayment.mutate(payRegDialog); }} className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Orçamento: {payRegDialog.id.slice(0, 8)} — {(payRegDialog.clients as any)?.name}<br />
                Valor total: {fmt(Number(payRegDialog.total))} | Já recebido: {fmt(Number((payRegDialog as any).down_payment || 0))} | Saldo: {fmt(Number((payRegDialog as any).remaining_amount || payRegDialog.total))}
              </div>
              <div><Label>Valor a receber (R$) *</Label>
                <Input type="number" step="0.01" value={payRegForm.amount} onChange={(e) => setPayRegForm({ ...payRegForm, amount: e.target.value })} required />
              </div>
              <div><Label>Forma de Pagamento</Label>
                <Select value={payRegForm.method} onValueChange={(v) => setPayRegForm({ ...payRegForm, method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Data do Recebimento *</Label>
                <Input type="date" value={payRegForm.date} onChange={(e) => setPayRegForm({ ...payRegForm, date: e.target.value })} required />
              </div>
              <Button type="submit" className="w-full" disabled={registerQuotePayment.isPending}>Registrar Pagamento</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteQuoteMutation.mutate(deleteTarget)}
        isPending={deleteQuoteMutation.isPending}
        description="Tem certeza que deseja excluir este orçamento? Todos os dados relacionados (itens, OS, vendas, comissões, transações financeiras) serão removidos."
      />
    </div>
  );
};

export default Quotes;
