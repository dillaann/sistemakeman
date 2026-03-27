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
import { Plus, Search, Check, X, FileDown, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { generateQuotePDF } from "@/lib/generateQuotePDF";

const statusColors: Record<string, string> = {
  pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  aprovado: "bg-green-500/10 text-green-700 border-green-500/20",
  rejeitado: "bg-red-500/10 text-red-700 border-red-500/20",
};
const statusLabels: Record<string, string> = { pendente: "Pendente", aprovado: "Aprovado", rejeitado: "Rejeitado" };

interface ItemRow { description: string; quantity: string; unit_price: string; }

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const Quotes = () => {
  const { toast } = useToast();
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ client_id: "", description: "", valid_until: "", seller_id: "" });
  const [items, setItems] = useState<ItemRow[]>([{ description: "", quantity: "1", unit_price: "" }]);

  // Commission modal state
  const [commissionModal, setCommissionModal] = useState<{
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

  // Fetch sellers (users with vendedor role)
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

  // Get profiles for seller names
  const { data: profilesMap = {} } = useQuery({
    queryKey: ["profiles-map"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      const map: Record<string, string> = {};
      (data ?? []).forEach(p => { map[p.id] = p.full_name || "Sem nome"; });
      return map;
    },
  });

  // Get seller commission rates
  const { data: commissionRates = {} } = useQuery({
    queryKey: ["seller-commission-rates"],
    queryFn: async () => {
      const { data } = await supabase.from("seller_commission_rates").select("seller_id, percentage");
      const map: Record<string, number> = {};
      (data ?? []).forEach(r => { map[r.seller_id] = Number(r.percentage); });
      return map;
    },
  });

  // Auto-fill seller_id for vendedor role
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

  // Handle approve: if quote has seller, show commission modal; otherwise just approve
  const handleApprove = (quote: any) => {
    const sellerId = (quote as any).seller_id;
    if (sellerId && userRole === "admin") {
      const defaultPct = commissionRates[sellerId] ?? 5;
      setCommPercentage(defaultPct);
      setCommissionModal({
        open: true,
        quoteId: quote.id,
        clientId: quote.client_id,
        total: Number(quote.total),
        sellerId,
        sellerName: profilesMap[sellerId] || "Vendedor",
        description: quote.description || "",
        percentage: defaultPct,
      });
    } else {
      approveAndCreateOS(quote.id, quote.client_id, Number(quote.total), quote.description, sellerId, null);
    }
  };

  const approveAndCreateOS = async (
    quoteId: string, clientId: string, total: number, description: string,
    sellerId: string | null, commissionPct: number | null
  ) => {
    try {
      // Update quote status
      await supabase.from("quotes").update({ status: "aprovado" as any }).eq("id", quoteId);

      // Create work order
      const { data: wo, error: woError } = await supabase.from("work_orders").insert({
        client_id: clientId,
        quote_id: quoteId,
        total,
        description: description || "OS gerada a partir de orçamento",
        status: "aguardando" as any,
      }).select().single();
      if (woError) throw woError;

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
      toast({ title: "Orçamento aprovado!", description: "OS e venda criadas com sucesso." });
    } catch (e: any) {
      toast({ title: "Erro ao aprovar", description: e.message, variant: "destructive" });
    }
  };

  const handleCommissionConfirm = (withCommission: boolean) => {
    if (!commissionModal) return;
    const { quoteId, clientId, total, sellerId, description } = commissionModal;
    approveAndCreateOS(quoteId, clientId, total, description, sellerId, withCommission ? commPercentage : null);
    setCommissionModal(null);
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("quotes").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["quotes"] }); toast({ title: "Status atualizado!" }); },
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

  const commissionValue = commissionModal ? commissionModal.total * (commPercentage / 100) : 0;

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

              {/* Seller field */}
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

              {/* Items */}
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
              <TableHead className="w-32">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(q => (
              <TableRow key={q.id}>
                <TableCell className="font-medium">{(q.clients as any)?.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {(q as any).seller_id ? (profilesMap[(q as any).seller_id] || "—") : "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell max-w-[200px] truncate">{q.description}</TableCell>
                <TableCell>{fmt(Number(q.total))}</TableCell>
                <TableCell><Badge className={statusColors[q.status]}>{statusLabels[q.status]}</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleGeneratePDF(q)} title="Gerar PDF">
                      <FileDown className="h-4 w-4" />
                    </Button>
                    {q.status === "pendente" && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => handleApprove(q)} title="Aprovar"><Check className="h-4 w-4 text-green-600" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => updateStatus.mutate({ id: q.id, status: "rejeitado" })} title="Rejeitar"><X className="h-4 w-4 text-red-600" /></Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum orçamento encontrado.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Commission Modal */}
      <Dialog open={!!commissionModal?.open} onOpenChange={(o) => { if (!o) setCommissionModal(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Configurar Comissão da Venda</DialogTitle></DialogHeader>
          {commissionModal && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-sm">Vendedor</Label>
                  <p className="font-medium">{commissionModal.sellerName}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Valor do Orçamento</Label>
                  <p className="font-medium">{fmt(commissionModal.total)}</p>
                </div>
              </div>
              <div>
                <Label>Percentual de Comissão (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={commPercentage}
                  onChange={e => setCommPercentage(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="bg-muted p-3 rounded-lg">
                <Label className="text-muted-foreground text-sm">Valor da Comissão</Label>
                <p className="text-xl font-bold">{fmt(commissionValue)}</p>
              </div>
              <DialogFooter className="flex gap-2">
                <Button variant="outline" onClick={() => handleCommissionConfirm(false)}>
                  Pular (sem comissão)
                </Button>
                <Button onClick={() => handleCommissionConfirm(true)}>
                  Confirmar e Gerar OS
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Quotes;
