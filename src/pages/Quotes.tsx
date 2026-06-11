import { addDaysToLocalDateString, localDateString, formatDateBR } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";
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
import { Plus, Search, Check, X, FileDown, Trash2, DollarSign, Pencil } from "lucide-react";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { Textarea } from "@/components/ui/textarea";
import { generateQuotePDF } from "@/lib/generateQuotePDF";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MonthFilter, { getDateRange, isInRange, isInRangeOrOpen, type PeriodMode } from "@/components/MonthFilter";

const statusColors: Record<string, string> = {
  pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  aprovado: "bg-green-500/10 text-green-700 border-green-500/20",
  rejeitado: "bg-red-500/10 text-red-700 border-red-500/20",
};
const statusLabels: Record<string, string> = { pendente: "Pendente", aprovado: "Aprovado", rejeitado: "Rejeitado" };

const paymentStatusColors: Record<string, string> = {
  aguardando: "bg-red-500/10 text-red-700 border-red-500/20",
  entrada_pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  entrada_recebida: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  pagamento_parcial: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  pago_total: "bg-green-500/10 text-green-700 border-green-500/20",
  concluido_pago: "bg-emerald-700/10 text-emerald-800 border-emerald-700/20",
};
const paymentStatusLabels: Record<string, string> = {
  aguardando: "Aguardando Pagamento",
  entrada_pendente: "Entrada Pendente",
  entrada_recebida: "Parcialmente Pago",
  pagamento_parcial: "Parcialmente Pago",
  pago_total: "Pago Total",
  concluido_pago: "Concluído e Pago",
};

interface ItemRow { description: string; quantity: string; unit_price: string; unit: string; }

const UNIT_OPTIONS = [
  { value: "un", label: "un" },
  { value: "m2", label: "m²" },
  { value: "m", label: "m" },
  { value: "ml", label: "ml" },
  { value: "kg", label: "kg" },
];

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const Quotes = () => {
  const { toast } = useToast();
  const { user, userRole } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [creatorFilter, setCreatorFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const dateRange = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState({ client_id: "", phone: "", description: "", valid_until: "", seller_id: "", delivery_deadline: "", origem_venda: "", issue_date: localDateString(), payment_method: "pix", collection_date: localDateString() });
  const [items, setItems] = useState<ItemRow[]>([{ description: "", quantity: "1", unit_price: "", unit: "un" }]);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editQuote, setEditQuote] = useState<any>(null);
  const [editForm, setEditForm] = useState({ client_id: "", phone: "", description: "", valid_until: "", seller_id: "", delivery_deadline: "", origem_venda: "", issue_date: "" });
  const [editItems, setEditItems] = useState<ItemRow[]>([]);
  const [editPayment, setEditPayment] = useState({ payment_type: "a_vista", down_payment: "", down_payment_date: "", payment_method: "pix", payment_status: "aguardando", payment_notes: "", collection_date: "" });

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
    origemVenda: string;
  } | null>(null);
  const [commPercentage, setCommPercentage] = useState(5);
  const [paymentType, setPaymentType] = useState<"a_vista" | "entrada_restante">("a_vista");
  const [downPayment, setDownPayment] = useState("");
  const [downPaymentDate, setDownPaymentDate] = useState(localDateString());
  const [paymentMethod, setPaymentMethod] = useState("pix");

  // Payment registration modal for approved quotes
  const [payRegDialog, setPayRegDialog] = useState<any>(null);
  const [payRegForm, setPayRegForm] = useState({ amount: "", method: "pix", date: localDateString() });

  const addItem = () => setItems([...items, { description: "", quantity: "1", unit_price: "", unit: "un" }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof ItemRow, value: string) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    setItems(updated);
  };

  const addEditItem = () => setEditItems([...editItems, { description: "", quantity: "1", unit_price: "", unit: "un" }]);
  const removeEditItem = (i: number) => setEditItems(editItems.filter((_, idx) => idx !== i));
  const updateEditItem = (i: number, field: keyof ItemRow, value: string) => {
    const updated = [...editItems];
    updated[i] = { ...updated[i], [field]: value };
    setEditItems(updated);
  };

  const calcItemTotal = (item: ItemRow) => (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
  const grandTotal = items.reduce((s, it) => s + calcItemTotal(it), 0);
  const editGrandTotal = editItems.reduce((s, it) => s + calcItemTotal(it), 0);

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
      const { data: profiles } = await supabase.rpc("get_team_display_names");
      return (profiles ?? []).filter(p => sellerIds.includes(p.id));
    },
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data } = await supabase.from("quotes").select("*, clients(*), quote_items(*)").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: profilesMap = {} } = useQuery({
    queryKey: ["profiles-map"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_team_display_names");
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

  // Fetch financial transactions for dynamic payment status
  const { data: allTransactions = [] } = useQuery({
    queryKey: ["quotes-financial-transactions"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_transactions").select("id, work_order_id, amount, status, type, paid_date, due_date").eq("type", "a_receber");
      return data ?? [];
    },
  });

  // Fetch work orders for OS status check
  const { data: allWorkOrders = [] } = useQuery({
    queryKey: ["quotes-work-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("work_orders").select("id, quote_id, status");
      return data ?? [];
    },
  });

  // Realtime subscriptions for auto-refresh
  useEffect(() => {
    const ftChannel = supabase
      .channel('quotes-ft-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_transactions' }, () => {
        queryClient.invalidateQueries({ queryKey: ["quotes-financial-transactions"] });
        queryClient.invalidateQueries({ queryKey: ["quotes"] });
      })
      .subscribe();

    const woChannel = supabase
      .channel('quotes-wo-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ["quotes-work-orders"] });
        queryClient.invalidateQueries({ queryKey: ["quotes"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ftChannel);
      supabase.removeChannel(woChannel);
    };
  }, [queryClient]);

  // Compute dynamic payment status for each approved quote
  const computedPaymentStatus = useMemo(() => {
    const statusMap: Record<string, string> = {};
    quotes.forEach((q: any) => {
      if (q.status !== "aprovado") return;
      const wo = allWorkOrders.find((w: any) => w.quote_id === q.id);
      const woId = wo?.id;
      const total = Number(q.total);
      if (!woId || total <= 0) {
        statusMap[q.id] = q.payment_status || "aguardando";
        return;
      }

      const txns = allTransactions.filter((t: any) => t.work_order_id === woId);
      const paidTotal = txns.filter((t: any) => t.status === "pago").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const hasFuturePending = txns.some((t: any) => t.status === "pendente" && t.due_date > localDateString());
      const osFinished = wo.status === "aguardando_instalacao" || wo.status === "entregue";

      if (paidTotal >= total && osFinished) {
        statusMap[q.id] = "concluido_pago";
      } else if (paidTotal >= total) {
        statusMap[q.id] = "pago_total";
      } else if (paidTotal > 0 && paidTotal < total) {
        statusMap[q.id] = "pagamento_parcial";
      } else if (hasFuturePending) {
        statusMap[q.id] = "entrada_pendente";
      } else {
        statusMap[q.id] = "aguardando";
      }
    });
    return statusMap;
  }, [quotes, allTransactions, allWorkOrders]);

  const effectiveSellerId = userRole === "vendedor" ? user?.id ?? "" : form.seller_id;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validItems = items.filter(it => it.description.trim());
      if (!validItems.length) throw new Error("Adicione pelo menos um item");

      if (!form.origem_venda) throw new Error("Selecione a Origem da Venda");
      if (!form.phone) throw new Error("O número de telefone é obrigatório");

      // Update client phone
      if (form.client_id && form.phone) {
        await supabase.from("clients").update({ phone: form.phone }).eq("id", form.client_id);
      }

      const { data: quote, error } = await supabase.from("quotes").insert({
        client_id: form.client_id,
        description: form.description,
        total: grandTotal,
        valid_until: form.valid_until || null,
        created_by: user?.id,
        seller_id: effectiveSellerId || null,
        delivery_deadline: form.delivery_deadline || null,
        origem_venda: form.origem_venda,
        issue_date: form.issue_date || localDateString(),
        payment_method: form.payment_method,
        collection_date: form.collection_date,
      } as any).select().single();
      if (error) throw error;

      const itemsToInsert = validItems.map(it => ({
        quote_id: quote.id,
        description: it.description,
        quantity: parseFloat(it.quantity) || 1,
        unit_price: parseFloat(it.unit_price) || 0,
        unit: it.unit || "un",
        total: calcItemTotal(it),
      } as any));
      const { error: itemsError } = await supabase.from("quote_items").insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // Sync with Production Spreadsheet
      await supabase.functions.invoke("sync-production-sheet");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      setOpen(false);
      setForm({ client_id: "", phone: "", description: "", valid_until: "", seller_id: "", delivery_deadline: "", origem_venda: "", issue_date: localDateString(), payment_method: "pix", collection_date: localDateString() });
      setItems([{ description: "", quantity: "1", unit_price: "", unit: "un" }]);
      toast({ 
        title: "Orçamento criado!",
        description: "Os dados foram salvos com sucesso."
      });
    },
    onError: (e: any) => {
      console.error("Erro ao salvar orçamento:", e);
      toast({ 
        title: "Erro ao salvar", 
        description: e.message || "Não foi possível persistir os dados. Verifique os campos e tente novamente.", 
        variant: "destructive" 
      });
    },
  });

  // --- EDIT QUOTE ---
  const openEditDialog = (quote: any) => {
    setEditQuote(quote);
    setEditForm({
      client_id: quote.client_id,
      phone: (quote.clients as any)?.phone || "",
      description: quote.description || "",
      valid_until: quote.valid_until || "",
      seller_id: (quote as any).seller_id || "",
      delivery_deadline: (quote as any).delivery_deadline || "",
      origem_venda: (quote as any).origem_venda || "",
      issue_date: (quote as any).issue_date || "",
    });
    setEditPayment({
      payment_type: (quote as any).payment_type || "a_vista",
      down_payment: String((quote as any).down_payment || ""),
      down_payment_date: (quote as any).down_payment_date || "",
      payment_method: (quote as any).payment_method || "pix",
      payment_status: (quote as any).payment_status || "aguardando",
      payment_notes: "",
      collection_date: (quote as any).collection_date || "",
    });
    const quoteItems = (quote.quote_items ?? []) as any[];
    setEditItems(
      quoteItems.length > 0
        ? quoteItems.map((it: any) => ({ description: it.description, quantity: String(it.quantity), unit_price: String(it.unit_price), unit: it.unit || "un" }))
        : [{ description: "", quantity: "1", unit_price: "", unit: "un" }]
    );
    setEditOpen(true);
  };

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editQuote) throw new Error("Nenhum orçamento selecionado");
      const validItems = editItems.filter(it => it.description.trim());
      if (!validItems.length) throw new Error("Adicione pelo menos um item");
      if (!editForm.client_id) throw new Error("Selecione um cliente");
      if (!editForm.origem_venda) throw new Error("Selecione a Origem da Venda");
      if (!editForm.phone) throw new Error("O número de telefone é obrigatório");

      // Update client phone
      if (editForm.client_id && editForm.phone) {
        await supabase.from("clients").update({ phone: editForm.phone }).eq("id", editForm.client_id);
      }

      const oldTotal = Number(editQuote.total);
      const newTotal = editGrandTotal;
      const quoteId = editQuote.id;
      const isApproved = editQuote.status === "aprovado";

      // Check if approved and OS already delivered
      if (isApproved) {
        const { data: wo } = await supabase.from("work_orders").select("id, status").eq("quote_id", quoteId).maybeSingle();
        if (wo && (wo.status === "aguardando_instalacao" || wo.status === "entregue")) {
          throw new Error("Não é possível editar: a OS vinculada já está aguardando instalação/entregue.");
        }
      }

      // Calculate payment info
      const today = localDateString();
      const dpAmount = editPayment.payment_type === "entrada_restante" ? (parseFloat(editPayment.down_payment) || 0) : (isApproved ? newTotal : 0);
      const dpDate = editPayment.down_payment_date || null;
      const isFuturePayment = dpAmount > 0 && dpDate && dpDate > today;
      const effectivePaidAmount = isFuturePayment ? 0 : dpAmount;

      // Validate
      if (dpAmount > newTotal) throw new Error("Valor da entrada não pode ser maior que o total");

      // Use the manually selected payment status from the form
      let paymentStatus = editPayment.payment_status || (editQuote as any).payment_status || "aguardando";

      // Update quote
      const { error: quoteError } = await supabase.from("quotes").update({
        client_id: editForm.client_id,
        description: editForm.description,
        total: newTotal,
        valid_until: editForm.valid_until || null,
        seller_id: editForm.seller_id || null,
        delivery_deadline: editForm.delivery_deadline || null,
        origem_venda: editForm.origem_venda,
        issue_date: editForm.issue_date || null,
        payment_method: editPayment.payment_method,
        collection_date: editPayment.collection_date || null,
        ...(isApproved ? {
          payment_type: editPayment.payment_type,
          down_payment: effectivePaidAmount,
          down_payment_date: dpDate,
          remaining_amount: Math.max(newTotal - effectivePaidAmount, 0),
          payment_status: paymentStatus === "entrada_recebida" ? "pagamento_parcial" : paymentStatus,
        } : {}),
      } as any).eq("id", quoteId);
      if (quoteError) throw quoteError;

      // Delete old items and insert new ones
      await supabase.from("quote_items").delete().eq("quote_id", quoteId);
      const itemsToInsert = validItems.map(it => ({
        quote_id: quoteId,
        description: it.description,
        quantity: parseFloat(it.quantity) || 1,
        unit_price: parseFloat(it.unit_price) || 0,
        unit: it.unit || "un",
        total: calcItemTotal(it),
      } as any));
      const { error: itemsError } = await supabase.from("quote_items").insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // Sync with Production Spreadsheet
      await supabase.functions.invoke("sync-production-sheet");

      const syncMessages: string[] = [];

      // Cascade sync if approved
      if (isApproved) {
        // Update work order
        const { data: wo } = await supabase.from("work_orders").select("id").eq("quote_id", quoteId).maybeSingle();
        if (wo) {
          await supabase.from("work_orders").update({
            total: newTotal,
            client_id: editForm.client_id,
            description: editForm.description || "OS gerada a partir de orçamento",
            origem_venda: editForm.origem_venda,
          } as any).eq("id", wo.id);
          syncMessages.push("OS atualizada");

          // Update financial transactions linked to the work order
          if (oldTotal !== newTotal) {
            const { data: txns } = await supabase.from("financial_transactions")
              .select("id, status, amount")
              .eq("work_order_id", wo.id)
              .eq("type", "a_receber");

            // Update pending transactions with new remaining amount
            const paidAmount = (txns ?? []).filter(t => t.status === "pago").reduce((s, t) => s + Number(t.amount), 0);
            const pendingTxns = (txns ?? []).filter(t => t.status === "pendente");
            const newRemaining = Math.max(newTotal - paidAmount, 0);

            if (pendingTxns.length > 0) {
              // Update the first pending transaction with new remaining
              await supabase.from("financial_transactions").update({
                amount: newRemaining,
              }).eq("id", pendingTxns[0].id);
              // Delete extra pending transactions if any
              for (let i = 1; i < pendingTxns.length; i++) {
                await supabase.from("financial_transactions").delete().eq("id", pendingTxns[i].id);
              }
            } else if (newRemaining > 0) {
              // Create new pending transaction for remaining
              const clientName = clients.find(c => c.id === editForm.client_id)?.name ?? "";
              await supabase.from("financial_transactions").insert({
                type: "a_receber" as any,
                description: `Saldo - ${clientName} (Orçamento ${quoteId.slice(0, 8)})`,
                amount: newRemaining,
                due_date: localDateString(),
                status: "pendente" as any,
                category: "Faturamento",
                work_order_id: wo.id,
                client_id: editForm.client_id,
              });
            }

            // Update quote payment info
            await supabase.from("quotes").update({
              remaining_amount: newRemaining,
              payment_status: paidAmount >= newTotal ? "pago_total" : (paidAmount > 0 ? "pagamento_parcial" : "aguardando"),
              down_payment: paidAmount,
            } as any).eq("id", quoteId);

            syncMessages.push("Financeiro atualizado");
          }

          // Update sale if exists
          const { data: sale } = await supabase.from("sales").select("id").eq("work_order_id", wo.id).maybeSingle();
          if (sale) {
            await supabase.from("sales").update({
              amount: newTotal,
              client_id: editForm.client_id,
              description: editForm.description || "Venda gerada por orçamento",
              origem_venda: editForm.origem_venda,
            } as any).eq("id", sale.id);
            syncMessages.push("Venda atualizada");

            // Recalculate commission if total changed
            if (oldTotal !== newTotal) {
              const { data: comm } = await supabase.from("sales_commissions").select("id, percentage").eq("sale_id", sale.id).maybeSingle();
              if (comm) {
                const newCommAmount = newTotal * (Number(comm.percentage) / 100);
                await supabase.from("sales_commissions").update({ amount: newCommAmount }).eq("id", comm.id);
                syncMessages.push("Comissão recalculada");
              }
            }
          }
        }
      }

      return syncMessages;
    },
    onSuccess: (syncMessages) => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["financial-entradas"] });
      queryClient.invalidateQueries({ queryKey: ["financial-contas-receber"] });
      queryClient.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      queryClient.invalidateQueries({ queryKey: ["account-movements-list"] });
      queryClient.invalidateQueries({ queryKey: ["account-movements-all"] });
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["billing-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["billing-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setEditOpen(false);
      setEditQuote(null);
      const desc = syncMessages && syncMessages.length > 0
        ? `Atualizado: ${syncMessages.join(", ")}`
        : undefined;
      toast({ title: "Orçamento editado com sucesso!", description: desc });
      // Sync with Production Spreadsheet
      supabase.functions.invoke("sync-production-sheet");
    },
    onError: (e: any) => toast({ title: "Erro ao editar", description: e.message, variant: "destructive" }),
  });

  const handleApprove = (quote: any) => {
    const sellerId = (quote as any).seller_id;
    const defaultPct = sellerId ? (commissionRates[sellerId] ?? 5) : 5;
    setCommPercentage(defaultPct);
    setPaymentType("a_vista");
    setDownPayment("");
    setDownPaymentDate(localDateString());
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
      origemVenda: (quote as any).origem_venda || "empresa",
    });
  };

  const approveAndCreateOS = async (
    quoteId: string, clientId: string, total: number, description: string,
    sellerId: string | null, commissionPct: number | null, origemVenda: string
  ) => {
    try {
      const now = new Date().toISOString();
      const today = localDateString();
      const dpAmount = paymentType === "entrada_restante" ? (parseFloat(downPayment) || 0) : 0;
      const remaining = paymentType === "entrada_restante" ? Math.max(total - dpAmount, 0) : 0;

      // Check if the down payment date is future
      const isFuturePayment = dpAmount > 0 && downPaymentDate > today;
      const effectivePaidAmount = isFuturePayment ? 0 : dpAmount;

      // Determine payment status
      let paymentStatus = "aguardando";
      if (dpAmount > 0) {
        if (isFuturePayment) {
          paymentStatus = "entrada_pendente";
        } else if (dpAmount >= total) {
          paymentStatus = "pago_total";
        } else {
          paymentStatus = "pagamento_parcial";
        }
      }

      await supabase.from("quotes").update({
        status: "aprovado" as any,
        approved_at: now,
        payment_type: paymentType,
        down_payment: effectivePaidAmount,
        down_payment_date: paymentType === "entrada_restante" && dpAmount > 0 ? downPaymentDate : null,
        remaining_amount: isFuturePayment ? total : remaining,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
      } as any).eq("id", quoteId);

      // Prevent duplicate work orders for the same quote
      const { data: existingWO } = await supabase.from("work_orders").select("id").eq("quote_id", quoteId).maybeSingle();
      let wo: any;
      if (existingWO) {
        wo = existingWO;
      } else {
        const { data: newWO, error: woError } = await supabase.from("work_orders").insert({
          client_id: clientId,
          quote_id: quoteId,
          total,
          description: description || "OS gerada a partir de orçamento",
          status: "aguardando" as any,
          status_producao: "aguardando",
          origem_venda: origemVenda,
        } as any).select().single();
        if (woError) throw woError;
        wo = newWO;
      }

      // Copy quote items to work_order_items
      const { data: quoteItems } = await supabase.from("quote_items").select("*").eq("quote_id", quoteId);
      if (quoteItems && quoteItems.length > 0) {
        await supabase.from("work_order_items" as any).insert(
          quoteItems.map((qi: any) => ({
            work_order_id: wo.id,
            quote_item_id: qi.id,
            description: qi.description,
            quantity: qi.quantity,
            unit_price: qi.unit_price,
            unit: qi.unit || "un",
            total: qi.total,
          }))
        );
      }

      if (total > 0) {
        const clientName = clients.find(c => c.id === clientId)?.name ?? "";
        if (dpAmount > 0) {
          if (isFuturePayment) {
            // Future payment: create as pending in Contas a Receber
            await supabase.from("financial_transactions").insert({
              type: "a_receber" as any,
              description: `Entrada - ${clientName} (Orçamento ${quoteId.slice(0, 8)})`,
              amount: dpAmount,
              due_date: downPaymentDate,
              paid_date: null,
              status: "pendente" as any,
              category: `Faturamento - ${paymentMethod}`,
              work_order_id: wo.id,
              client_id: clientId,
            });
          } else {
            // Past/today: create as paid
            await supabase.from("financial_transactions").insert({
              type: "a_receber" as any,
              description: `Entrada - ${clientName} (Orçamento ${quoteId.slice(0, 8)})`,
              amount: dpAmount,
              due_date: downPaymentDate,
              paid_date: downPaymentDate,
              status: "pago" as any,
              category: `Faturamento - ${paymentMethod}`,
              work_order_id: wo.id,
              client_id: clientId,
            });
          }
        }

        const pendingAmount = total - dpAmount;
        if (pendingAmount > 0) {
          await supabase.from("financial_transactions").insert({
            type: "a_receber" as any,
            description: `Saldo - ${clientName} (Orçamento ${quoteId.slice(0, 8)})`,
            amount: pendingAmount,
            due_date: localDateString(),
            status: "pendente" as any,
            category: "Faturamento",
            work_order_id: wo.id,
            client_id: clientId,
          });
        }
      }

      if (sellerId) {
        const { data: sale, error: saleError } = await supabase.from("sales").insert({
          seller_id: sellerId,
          client_id: clientId,
          work_order_id: wo.id,
          description: description || "Venda gerada por orçamento",
          amount: total,
          status: "aguardando",
          origem_venda: origemVenda,
        } as any).select().single();
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
      queryClient.invalidateQueries({ queryKey: ["quotes-financial-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["quotes-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["financial-entradas"] });
      queryClient.invalidateQueries({ queryKey: ["financial-contas-receber"] });
      queryClient.invalidateQueries({ queryKey: ["financial-contas-pagar"] });
      queryClient.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      queryClient.invalidateQueries({ queryKey: ["account-movements-list"] });
      queryClient.invalidateQueries({ queryKey: ["account-movements-all"] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["billing-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["billing-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["production"] });

      toast({ title: "Orçamento aprovado!", description: "OS criada e enviada para Produção." });
      
      // Sync with Production Spreadsheet after approval (as OS is created)
      await supabase.functions.invoke("sync-production-sheet");
    } catch (e: any) {
      toast({ title: "Erro ao aprovar", description: e.message, variant: "destructive" });
    }
  };

  const handleApprovalConfirm = (withCommission: boolean) => {
    if (!approvalModal) return;
    const { quoteId, clientId, total, sellerId, description, origemVenda } = approvalModal;
    approveAndCreateOS(
      quoteId, clientId, total, description,
      sellerId || null,
      sellerId && withCommission ? commPercentage : null,
      origemVenda
    );
    setApprovalModal(null);
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("quotes").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ["quotes"] }); 
      toast({ title: "Status atualizado!" });
      // Sync with Production Spreadsheet
      supabase.functions.invoke("sync-production-sheet");
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Cascade: delete related work orders, financial transactions, sales, commissions
      const { data: wo } = await supabase.from("work_orders").select("id").eq("quote_id", id);
      const woIds = (wo ?? []).map((w: any) => w.id);
      
      if (woIds.length > 0) {
        // Delete financial transactions linked to work orders
        for (const woId of woIds) {
          await supabase.from("financial_transactions").delete().eq("work_order_id", woId);
          await supabase.from("account_movements").delete().eq("work_order_id", woId);
        }
        // Delete sales and commissions
        const { data: sales } = await supabase.from("sales").select("id").in("work_order_id", woIds);
        if (sales && sales.length > 0) {
          const saleIds = sales.map((s: any) => s.id);
          await supabase.from("sales_commissions").delete().in("sale_id", saleIds);
          await supabase.from("sales").delete().in("id", saleIds);
        }
        // Delete production, work order items, work order materials, purchase requests
        for (const woId of woIds) {
          await supabase.from("production").delete().eq("os_id", woId);
          await supabase.from("work_order_items").delete().eq("work_order_id", woId);
          await supabase.from("work_order_materials").delete().eq("work_order_id", woId);
          await supabase.from("purchase_requests").delete().eq("work_order_id", woId);
        }
        // Delete work orders
        await supabase.from("work_orders").delete().in("id", woIds);
      }
      // Delete quote items
      await supabase.from("quote_items").delete().eq("quote_id", id);
      // Delete quote
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["billing-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["billing-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-entradas"] });
      queryClient.invalidateQueries({ queryKey: ["financial-contas-receber"] });
      queryClient.invalidateQueries({ queryKey: ["financial-contas-pagar"] });
      queryClient.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["production"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteTarget(null);
      toast({ title: "Orçamento e registros vinculados removidos!" });
      // Sync with Production Spreadsheet
      supabase.functions.invoke("sync-production-sheet");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const registerQuotePayment = useMutation({
    mutationFn: async (quote: any) => {
      const amount = parseFloat(payRegForm.amount);
      if (!amount || amount <= 0) throw new Error("Valor inválido");

      const today = localDateString();
      const isFuture = payRegForm.date > today;

      const { data: wo } = await supabase.from("work_orders").select("id").eq("quote_id", quote.id).single();
      const woId = wo?.id || null;

      const clientName = clients.find(c => c.id === quote.client_id)?.name ?? "";

      // Find existing pending "Saldo" transaction for this work order
      const { data: pendingSaldo } = await supabase.from("financial_transactions")
        .select("*")
        .eq("work_order_id", woId || "")
        .eq("status", "pendente")
        .eq("type", "a_receber")
        .order("created_at", { ascending: true })
        .limit(1);

      const saldoTx = pendingSaldo?.[0];

      if (!isFuture) {
        // Create paid transaction for the received amount
        await supabase.from("financial_transactions").insert({
          type: "a_receber" as any,
          description: `Recebimento - ${clientName} (Orçamento ${quote.id.slice(0, 8)})`,
          amount,
          due_date: payRegForm.date,
          paid_date: payRegForm.date,
          status: "pago" as any,
          category: `Faturamento - ${payRegForm.method}`,
          payment_method: payRegForm.method || null,
          work_order_id: woId,
          client_id: quote.client_id,
        });

        // Reduce or remove the pending Saldo transaction
        if (saldoTx) {
          const newSaldoAmount = Number(saldoTx.amount) - amount;
          if (newSaldoAmount <= 0.009) {
            // Fully paid — delete the pending Saldo placeholder so it doesn't pollute Financeiro
            await supabase.from("financial_transactions").delete().eq("id", saldoTx.id);
          } else {
            // Reduce the pending amount
            await supabase.from("financial_transactions").update({
              amount: newSaldoAmount,
              description: `Saldo - ${clientName} (Orçamento ${quote.id.slice(0, 8)})`,
            }).eq("id", saldoTx.id);
          }
        }
      } else {
        // Future payment — create as pending
        await supabase.from("financial_transactions").insert({
          type: "a_receber" as any,
          description: `Recebimento - ${clientName} (Orçamento ${quote.id.slice(0, 8)})`,
          amount,
          due_date: payRegForm.date,
          paid_date: null,
          status: "pendente" as any,
          category: `Faturamento - ${payRegForm.method}`,
          payment_method: payRegForm.method || null,
          work_order_id: woId,
          client_id: quote.client_id,
        });
      }

      const currentPaid = Number(quote.down_payment || 0);
      const effectiveNewPaid = isFuture ? 0 : amount;
      const totalPaidNow = currentPaid + effectiveNewPaid;
      const total = Number(quote.total);
      const newRemaining = Math.max(total - totalPaidNow, 0);

      let newStatus = "aguardando";
      if (totalPaidNow >= total) {
        newStatus = "pago_total";
      } else if (isFuture && currentPaid === 0) {
        newStatus = "entrada_pendente";
      } else if (totalPaidNow > 0 && totalPaidNow < total) {
        newStatus = "pagamento_parcial";
      } else if (totalPaidNow > 0) {
        newStatus = "entrada_recebida";
      }

      await supabase.from("quotes").update({
        down_payment: totalPaidNow,
        remaining_amount: newRemaining,
        payment_status: newStatus,
      } as any).eq("id", quote.id);

      // If fully paid, mark any remaining pending transactions as pago
      if (totalPaidNow >= total && woId) {
        const { data: remainingPending } = await supabase.from("financial_transactions")
          .select("id")
          .eq("work_order_id", woId)
          .eq("status", "pendente")
          .eq("type", "a_receber");
        for (const txn of remainingPending ?? []) {
          await supabase.from("financial_transactions").update({
            status: "pago" as any,
            paid_date: payRegForm.date,
          }).eq("id", txn.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quotes-financial-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["quotes-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["financial-entradas"] });
      queryClient.invalidateQueries({ queryKey: ["financial-contas-receber"] });
      queryClient.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      queryClient.invalidateQueries({ queryKey: ["account-movements-list"] });
      queryClient.invalidateQueries({ queryKey: ["account-movements-all"] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["billing-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["billing-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setPayRegDialog(null);
      toast({ title: "Pagamento registrado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleGeneratePDF = async (quote: any) => {
    const client = quote.clients as any;
    const quoteItems = (quote.quote_items ?? []) as any[];
    const issueDate = (quote as any).issue_date;
    const dateStr = issueDate ? formatDateBR(issueDate) : new Date(quote.created_at).toLocaleDateString("pt-BR");
    const validUntilStr = quote.valid_until ? formatDateBR(quote.valid_until) : null;

    const pdfItems = quoteItems.length > 0
      ? quoteItems.map((it: any) => ({ description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price), unit: it.unit || "un", total: Number(it.total) }))
      : [{ description: quote.description ?? "Serviço", quantity: 1, unit_price: Number(quote.total), unit: "un", total: Number(quote.total) }];

    const createdByName = (quote as any).created_by ? (profilesMap[(quote as any).created_by] || "Não identificado") : "Não identificado";
    const sellerName = (quote as any).seller_id ? (profilesMap[(quote as any).seller_id] || null) : null;

    await generateQuotePDF({
      date: dateStr,
      client: { 
        name: client?.name ?? "—", 
        phone: client?.phone, 
        address: client?.address, 
        city: client?.city, 
        state: client?.state, 
        cpf_cnpj: client?.cpf_cnpj,
        email: client?.email,
        cep: client?.cep,
        complement: client?.complement,
        neighborhood: client?.neighborhood,
        number: client?.number
      },
      items: pdfItems,
      total: Number(quote.total),
      description: quote.description,
      valid_until: validUntilStr,
      delivery_deadline: (quote as any).delivery_deadline,
      created_by_name: createdByName,
      seller_name: sellerName,
    });
    toast({ title: "PDF gerado com sucesso!" });
  };

  const filtered = quotes.filter(q => {
    if (!isInRange(q.issue_date, dateRange)) return false;
    if (creatorFilter !== "all") {
      const cb = (q as any).created_by || "__none__";
      if (creatorFilter === "__none__" ? cb !== "__none__" : cb !== creatorFilter) return false;
    }
    return (q.clients as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
      (q.description ?? "").toLowerCase().includes(search.toLowerCase());
  });

  // Unique creators present in current quote set, for filter dropdown
  const creatorsInUse = useMemo(() => {
    const ids = new Set<string>();
    let hasNone = false;
    quotes.forEach((q: any) => {
      if (q.created_by) ids.add(q.created_by);
      else hasNone = true;
    });
    return { ids: Array.from(ids), hasNone };
  }, [quotes]);

  const commissionValue = approvalModal ? approvalModal.total * (commPercentage / 100) : 0;
  const approvalDownPayment = parseFloat(downPayment) || 0;
  const approvalRemaining = approvalModal ? Math.max(approvalModal.total - approvalDownPayment, 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Orçamentos</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Orçamento</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo Orçamento</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Cliente *</Label>
                  <Select 
                    value={form.client_id} 
                    onValueChange={v => {
                      const client = clients.find(c => c.id === v);
                      setForm({ ...form, client_id: v, phone: client?.phone || "" });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Número de Telefone *</Label>
                  <Input 
                    placeholder="(00) 00000-0000" 
                    value={form.phone} 
                    onChange={e => setForm({ ...form, phone: e.target.value })} 
                    required
                  />
                </div>
              </div>

              <div><Label>Vendedor Responsável</Label>
                {userRole === "vendedor" ? (
                  <Input value={profilesMap[user?.id ?? ""] || "Você"} disabled />
                ) : (
                  <Select value={form.seller_id} onValueChange={v => setForm({ ...form, seller_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar vendedor (opcional)" /></SelectTrigger>
                    <SelectContent>
                      {sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name || "Sem nome"}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>

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
              {userRole === "admin" && (
                <div><Label>Data de Emissão</Label><Input type="date" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} /></div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Itens do Orçamento</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar Item
                  </Button>
                </div>
                {items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start border-b pb-3 md:pb-0 md:border-0 md:items-end">
                    <div className="col-span-12 md:col-span-4">
                      {i === 0 && <Label className="hidden md:block text-xs">Descrição</Label>}
                      <Label className="md:hidden text-xs mb-1 block">Descrição</Label>
                      <Textarea 
                        placeholder="Descrição do item" 
                        value={item.description} 
                        onChange={e => updateItem(i, "description", e.target.value)}
                        className="min-h-[80px] md:min-h-[40px] resize-y"
                      />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      {i === 0 && <Label className="hidden md:block text-xs">Qtd</Label>}
                      <Label className="md:hidden text-xs mb-1 block">Qtd</Label>
                      <Input type="number" step="any" min="0" value={item.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} />
                    </div>
                    <div className="col-span-3 md:col-span-1">
                      {i === 0 && <Label className="hidden md:block text-xs">Unid.</Label>}
                      <Label className="md:hidden text-xs mb-1 block">Unid.</Label>
                      <Select value={item.unit} onValueChange={(v) => updateItem(i, "unit", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {UNIT_OPTIONS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-5 md:col-span-2">
                      {i === 0 && <Label className="hidden md:block text-xs">Preço Un.</Label>}
                      <Label className="md:hidden text-xs mb-1 block">Preço Un.</Label>
                      <Input type="number" step="0.01" placeholder="0,00" value={item.unit_price} onChange={e => updateItem(i, "unit_price", e.target.value)} />
                    </div>
                    <div className="col-span-10 md:col-span-2 text-right text-sm font-medium pt-2 md:pt-0 self-center">
                      <Label className="md:hidden text-xs mb-1 block text-left">Total</Label>
                      {fmt(calcItemTotal(item))}
                    </div>
                    <div className="col-span-2 md:col-span-1 flex justify-end">
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)} className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="text-right font-bold text-lg border-t pt-2">Total: {fmt(grandTotal)}</div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <Label>Forma de Pagamento *</Label>
                  <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="50/50">50/50</SelectItem>
                      <SelectItem value="cartao">Cartão</SelectItem>
                      <SelectItem value="boleto">Boleto</SelectItem>
                      <SelectItem value="transferencia">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Data de Cobrança *</Label>
                  <Input type="date" value={form.collection_date} onChange={e => setForm({ ...form, collection_date: e.target.value })} required />
                </div>
              </div>

              <div><Label>Observações</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Prazo de Entrega</Label><Input placeholder="Ex: 15 dias úteis" value={form.delivery_deadline} onChange={e => setForm({ ...form, delivery_deadline: e.target.value })} /></div>
                <div><Label>Válido até</Label><Input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} /></div>
              </div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending || !form.client_id || !form.phone || !form.origem_venda || !form.payment_method || !form.collection_date}>Salvar Orçamento</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar orçamentos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        {userRole === "admin" && (creatorsInUse.ids.length > 0 || creatorsInUse.hasNone) && (
          <Select value={creatorFilter} onValueChange={setCreatorFilter}>
            <SelectTrigger className="md:w-64"><SelectValue placeholder="Filtrar por criador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os criadores</SelectItem>
              {creatorsInUse.ids.map(id => (
                <SelectItem key={id} value={id}>{profilesMap[id] || "Sem nome"}</SelectItem>
              ))}
              {creatorsInUse.hasNone && <SelectItem value="__none__">Não identificado</SelectItem>}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {filtered.map(q => {
          const pStatus = computedPaymentStatus[q.id] || (q as any).payment_status || "aguardando";
          const createdByName = (q as any).created_by ? (profilesMap[(q as any).created_by] || "Não identificado") : "Não identificado";
          const sellerName = (q as any).seller_id ? (profilesMap[(q as any).seller_id] || null) : null;
          const sameAuthorAsSeller = (q as any).created_by && (q as any).seller_id && (q as any).created_by === (q as any).seller_id;
          return (
            <Card key={q.id} className="p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold">{(q.clients as any)?.name}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">{q.description || "—"}</p>
                </div>
                <Badge className={statusColors[q.status]}>{statusLabels[q.status]}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-bold">{fmt(Number(q.total))}</span>
                <span className="text-muted-foreground text-xs">{(q as any).issue_date ? formatDateBR((q as any).issue_date) : formatDateBR(q.created_at)}</span>
              </div>
              <div className="text-xs text-muted-foreground mb-2 space-y-0.5">
                {sameAuthorAsSeller ? (
                  <p>Criado e responsável: <span className="font-medium text-foreground">{createdByName}</span></p>
                ) : (
                  <>
                    <p>Lançado por: <span className={createdByName === "Não identificado" ? "italic" : "font-medium text-foreground"}>{createdByName}</span></p>
                    {sellerName && <p>Vendedor: <span className="font-medium text-foreground">{sellerName}</span></p>}
                  </>
                )}
              </div>
              {q.status === "aprovado" && (
                <Badge className={`${paymentStatusColors[pStatus] || paymentStatusColors.aguardando} mb-2`}>
                  {paymentStatusLabels[pStatus] || "Aguardando"}
                </Badge>
              )}
              <div className="flex gap-1 flex-wrap">
                <Button variant="ghost" size="sm" onClick={() => handleGeneratePDF(q)}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
                {(userRole === "admin" || userRole === "financeiro" || (userRole === "vendedor" && (q as any).seller_id === user?.id)) && (
                  <Button variant="ghost" size="sm" onClick={() => openEditDialog(q)}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
                )}
                {q.status === "pendente" && userRole === "admin" && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => handleApprove(q)}><Check className="h-4 w-4 mr-1 text-green-600" />Aprovar</Button>
                    <Button variant="ghost" size="sm" onClick={() => updateStatus.mutate({ id: q.id, status: "rejeitado" })}><X className="h-4 w-4 mr-1 text-red-600" />Rejeitar</Button>
                  </>
                )}
                {q.status === "aprovado" && pStatus !== "pago_total" && pStatus !== "concluido_pago" && (userRole === "admin" || userRole === "financeiro") && (
                  <Button variant="ghost" size="sm" onClick={() => {
                    const rem = Number((q as any).remaining_amount || q.total);
                    setPayRegForm({ amount: String(rem), method: "pix", date: localDateString() });
                    setPayRegDialog(q);
                  }}><DollarSign className="h-4 w-4 mr-1 text-green-600" />Pagar</Button>
                )}
                {userRole === "admin" && (
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(q.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                )}
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum orçamento encontrado.</p>}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Lançado por</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Data Emissão</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="w-44">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(q => {
              const pStatus = computedPaymentStatus[q.id] || (q as any).payment_status || "aguardando";
              const createdByName = (q as any).created_by ? (profilesMap[(q as any).created_by] || "Não identificado") : "Não identificado";
              const sellerName = (q as any).seller_id ? (profilesMap[(q as any).seller_id] || "—") : "—";
              const sameAuthorAsSeller = (q as any).created_by && (q as any).seller_id && (q as any).created_by === (q as any).seller_id;
              return (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">{(q.clients as any)?.name}</TableCell>
                  <TableCell className="text-sm">
                    {sameAuthorAsSeller ? (
                      <span className="text-muted-foreground italic">= vendedor</span>
                    ) : (
                      <span className={createdByName === "Não identificado" ? "text-muted-foreground italic" : ""}>{createdByName}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{sellerName}</TableCell>
                  <TableCell><Badge variant="outline">{{ marketing: "Marketing", obras: "Obras", empresa: "Empresa" }[(q as any).origem_venda] || "—"}</Badge></TableCell>
                  <TableCell className="text-sm">{(q as any).issue_date ? formatDateBR((q as any).issue_date) : formatDateBR(q.created_at)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{q.description}</TableCell>
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
                      {(userRole === "admin" || userRole === "financeiro" || (userRole === "vendedor" && (q as any).seller_id === user?.id)) && (
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(q)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {q.status === "pendente" && userRole === "admin" && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleApprove(q)} title="Aprovar"><Check className="h-4 w-4 text-green-600" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => updateStatus.mutate({ id: q.id, status: "rejeitado" })} title="Rejeitar"><X className="h-4 w-4 text-red-600" /></Button>
                        </>
                      )}
                      {q.status === "aprovado" && pStatus !== "pago_total" && pStatus !== "concluido_pago" && (userRole === "admin" || userRole === "financeiro") && (
                        <Button variant="ghost" size="icon" onClick={() => {
                          const rem = Number((q as any).remaining_amount || q.total);
                          setPayRegForm({ amount: String(rem), method: "pix", date: localDateString() });
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
            {filtered.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhum orçamento encontrado.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {/* Edit Quote Modal */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) { setEditOpen(false); setEditQuote(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Orçamento</DialogTitle>
            {editQuote?.status === "aprovado" && (
              <p className="text-sm text-amber-600 font-medium mt-1">⚠️ Este orçamento já está aprovado. Alterações serão refletidas na OS, Faturamento e Financeiro.</p>
            )}
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); editMutation.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Cliente *</Label>
                <Select 
                  value={editForm.client_id} 
                  onValueChange={v => {
                    const client = clients.find(c => c.id === v);
                    setEditForm({ ...editForm, client_id: v, phone: client?.phone || "" });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Número de Telefone *</Label>
                <Input 
                  placeholder="(00) 00000-0000" 
                  value={editForm.phone} 
                  onChange={e => setEditForm({ ...editForm, phone: e.target.value })} 
                  required
                />
              </div>
            </div>

            {userRole === "admin" && (
              <div><Label>Vendedor Responsável</Label>
                <Select value={editForm.seller_id} onValueChange={v => setEditForm({ ...editForm, seller_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar vendedor (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name || "Sem nome"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div><Label>Origem da Venda *</Label>
              <Select value={editForm.origem_venda} onValueChange={v => setEditForm({ ...editForm, origem_venda: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="marketing">Marketing</SelectItem>
                  <SelectItem value="obras">Obras</SelectItem>
                  <SelectItem value="empresa">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Itens do Orçamento</Label>
                <Button type="button" variant="outline" size="sm" onClick={addEditItem}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar Item
                </Button>
              </div>
              {editItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start border-b pb-3 md:pb-0 md:border-0 md:items-end">
                  <div className="col-span-12 md:col-span-4">
                    {i === 0 && <Label className="hidden md:block text-xs">Descrição</Label>}
                    <Label className="md:hidden text-xs mb-1 block">Descrição</Label>
                    <Textarea 
                      placeholder="Descrição do item" 
                      value={item.description} 
                      onChange={e => updateEditItem(i, "description", e.target.value)}
                      className="min-h-[80px] md:min-h-[40px] resize-y"
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    {i === 0 && <Label className="hidden md:block text-xs">Qtd</Label>}
                    <Label className="md:hidden text-xs mb-1 block">Qtd</Label>
                    <Input type="number" step="any" min="0" value={item.quantity} onChange={e => updateEditItem(i, "quantity", e.target.value)} />
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    {i === 0 && <Label className="hidden md:block text-xs">Unid.</Label>}
                    <Label className="md:hidden text-xs mb-1 block">Unid.</Label>
                    <Select value={item.unit} onValueChange={(v) => updateEditItem(i, "unit", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNIT_OPTIONS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-5 md:col-span-2">
                    {i === 0 && <Label className="hidden md:block text-xs">Preço Un.</Label>}
                    <Label className="md:hidden text-xs mb-1 block">Preço Un.</Label>
                    <Input type="number" step="0.01" placeholder="0,00" value={item.unit_price} onChange={e => updateEditItem(i, "unit_price", e.target.value)} />
                  </div>
                  <div className="col-span-10 md:col-span-2 text-right text-sm font-medium pt-2 md:pt-0 self-center">
                    <Label className="md:hidden text-xs mb-1 block text-left">Total</Label>
                    {fmt(calcItemTotal(item))}
                  </div>
                  <div className="col-span-2 md:col-span-1 flex justify-end">
                    {editItems.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeEditItem(i)} className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="text-right font-bold text-lg border-t pt-2">Total: {fmt(editGrandTotal)}</div>
            </div>

            {/* Payment Section (for approved quotes - always editable) */}
            {editQuote?.status === "aprovado" && (
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Condições de Pagamento
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Tipo de Pagamento</Label>
                    <Select value={editPayment.payment_type} onValueChange={v => setEditPayment({ ...editPayment, payment_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="a_vista">Valor Total à Vista</SelectItem>
                        <SelectItem value="entrada_restante">Entrada + Restante</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {editPayment.payment_type === "entrada_restante" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Valor da Entrada (R$)</Label>
                          <Input type="number" step="0.01" min="0" max={editGrandTotal} value={editPayment.down_payment} onChange={e => setEditPayment({ ...editPayment, down_payment: e.target.value })} placeholder="0,00" />
                        </div>
                        <div>
                          <Label>Data de Pagamento da Entrada</Label>
                          <Input type="date" value={editPayment.down_payment_date} onChange={e => setEditPayment({ ...editPayment, down_payment_date: e.target.value })} />
                        </div>
                      </div>
                      {editPayment.down_payment_date && editPayment.down_payment_date > localDateString() && (
                        <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-2 rounded text-sm text-orange-700 dark:text-orange-400">
                          ⚠️ Data futura — entrada ficará como "Pendente" até a data informada.
                        </div>
                      )}
                      <div className="bg-muted p-2 rounded text-sm">
                        Saldo restante: <strong>{fmt(Math.max(editGrandTotal - (parseFloat(editPayment.down_payment) || 0), 0))}</strong>
                      </div>
                    </>
                  )}

                  <div>
                    <Label>Forma de Pagamento</Label>
                    <Select value={editPayment.payment_method} onValueChange={v => setEditPayment({ ...editPayment, payment_method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="50/50">50/50</SelectItem>
                        <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                        <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Data de Cobrança *</Label>
                    <Input type="date" value={editPayment.collection_date} onChange={e => setEditPayment({ ...editPayment, collection_date: e.target.value })} required />
                  </div>

                  <div>
                    <Label>Status do Pagamento</Label>
                    <Select value={editPayment.payment_status} onValueChange={v => setEditPayment({ ...editPayment, payment_status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aguardando">Aguardando Pagamento</SelectItem>
                        <SelectItem value="entrada_pendente">Entrada Pendente</SelectItem>
                        <SelectItem value="entrada_recebida">Entrada Recebida</SelectItem>
                        <SelectItem value="pagamento_parcial">Parcialmente Pago</SelectItem>
                        <SelectItem value="pago_total">Pago Total</SelectItem>
                        <SelectItem value="concluido_pago">Concluído e Pago</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Observações de Pagamento</Label>
                    <Textarea
                      placeholder="Anotações sobre o pagamento..."
                      value={editPayment.payment_notes}
                      onChange={e => setEditPayment({ ...editPayment, payment_notes: e.target.value })}
                      className="min-h-[60px]"
                    />
                  </div>

                  {/* Current payment summary */}
                  <div className="bg-muted/50 p-3 rounded space-y-1 text-sm">
                    <div className="flex justify-between"><span>Valor Total:</span><strong>{fmt(editGrandTotal)}</strong></div>
                    <div className="flex justify-between"><span>Entrada:</span><strong>{fmt(parseFloat(editPayment.down_payment) || 0)}</strong></div>
                    <div className="flex justify-between border-t pt-1"><span>Saldo a Pagar:</span><strong className="text-primary">{fmt(Math.max(editGrandTotal - (parseFloat(editPayment.down_payment) || 0), 0))}</strong></div>
                    <div className="flex justify-between"><span>Status:</span><Badge className={paymentStatusColors[editPayment.payment_status] || paymentStatusColors.aguardando}>{paymentStatusLabels[editPayment.payment_status] || "Aguardando"}</Badge></div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div><Label>Observações</Label><Textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} /></div>
            <div><Label>Data de Emissão</Label><Input type="date" value={editForm.issue_date} onChange={e => setEditForm({ ...editForm, issue_date: e.target.value })} /></div>
            <div><Label>Prazo de Entrega</Label><Input placeholder="Ex: 15 dias úteis" value={editForm.delivery_deadline} onChange={e => setEditForm({ ...editForm, delivery_deadline: e.target.value })} /></div>
            <div><Label>Válido até</Label><Input type="date" value={editForm.valid_until} onChange={e => setEditForm({ ...editForm, valid_until: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={editMutation.isPending || !editForm.client_id || !editForm.phone || !editForm.origem_venda}>
              {editMutation.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
                      {downPaymentDate && downPaymentDate > localDateString() && (
                        <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 p-2 rounded text-sm text-orange-700 dark:text-orange-400">
                          ⚠️ Data futura — entrada ficará como "Pendente" até a data informada.
                        </div>
                      )}
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
                        <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                        <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                        <SelectItem value="boleto">Boleto</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
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
                    <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                    <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
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
