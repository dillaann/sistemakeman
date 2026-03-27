import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

interface ItemRow {
  description: string;
  quantity: string;
  unit_price: string;
}

const Quotes = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ client_id: "", description: "", valid_until: "" });
  const [items, setItems] = useState<ItemRow[]>([{ description: "", quantity: "1", unit_price: "" }]);

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

  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data } = await supabase.from("quotes").select("*, clients(name, phone, address, city, state), quote_items(*)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

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
      }).select().single();
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
      setForm({ client_id: "", description: "", valid_until: "" });
      setItems([{ description: "", quantity: "1", unit_price: "" }]);
      toast({ title: "Orçamento criado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

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
      ? quoteItems.map((it: any) => ({
          description: it.description,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          total: Number(it.total),
        }))
      : [{
          description: quote.description ?? "Serviço",
          quantity: 1,
          unit_price: Number(quote.total),
          total: Number(quote.total),
        }];

    generateQuotePDF({
      date: dateStr,
      client: {
        name: client?.name ?? "—",
        phone: client?.phone,
        address: client?.address,
        city: client?.city,
        state: client?.state,
      },
      items: pdfItems,
      total: Number(quote.total),
      description: quote.description,
      valid_until: quote.valid_until,
    });

    toast({ title: "PDF gerado com sucesso!" });
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const filtered = quotes.filter(q =>
    (q.clients as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
    (q.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

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
                    <div className="col-span-2 text-right text-sm font-medium pt-2">
                      {fmt(calcItemTotal(item))}
                    </div>
                    <div className="col-span-1">
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="text-right font-bold text-lg border-t pt-2">
                  Total: {fmt(grandTotal)}
                </div>
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
                        <Button variant="ghost" size="icon" onClick={() => updateStatus.mutate({ id: q.id, status: "aprovado" })} title="Aprovar"><Check className="h-4 w-4 text-green-600" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => updateStatus.mutate({ id: q.id, status: "rejeitado" })} title="Rejeitar"><X className="h-4 w-4 text-red-600" /></Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum orçamento encontrado.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Quotes;
