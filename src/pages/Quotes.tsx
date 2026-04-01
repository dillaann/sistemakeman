import { addDaysToLocalDateString, localDateString } from "@/lib/utils";
import { useState, useMemo } from "react";
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
import MonthFilter, { getDateRange, isInRange, type PeriodMode } from "@/components/MonthFilter";

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
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const dateRange = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [form, setForm] = useState({ client_id: "", description: "", valid_until: "", seller_id: "", delivery_deadline: "", origem_venda: "" });
  const [items, setItems] = useState<ItemRow[]>([{ description: "", quantity: "1", unit_price: "" }]);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editQuote, setEditQuote] = useState<any>(null);
  const [editForm, setEditForm] = useState({ client_id: "", description: "", valid_until: "", seller_id: "", delivery_deadline: "", origem_venda: "" });
  const [editItems, setEditItems] = useState<ItemRow[]>([]);

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

  const addItem = () => setItems([...items, { description: "", quantity: "1", unit_price: "" }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof ItemRow, value: string) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: value };
    setItems(updated);
  };

  const addEditItem = () => setEditItems([...editItems, { description: "", quantity: "1", unit_price: "" }]);
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

      if (!form.origem_venda) throw new Error("Selecione a Origem da Venda");
      const { data: quote, error } = await supabase.from("quotes").insert({
        client_id: form.client_id,
        description: form.description,
        total: grandTotal,
        valid_until: form.valid_until || null,
        created_by: user?.id,
        seller_id: effectiveSellerId || null,
        delivery_deadline: form.delivery_deadline || null,
        origem_venda: form.origem_venda,
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
      setForm({ client_id: "", description: "", valid_until: "", seller_id: "", delivery_deadline: "", origem_venda: "" });
      setItems([{ description: "", quantity: "1", unit_price: "" }]);
      toast({ title: "Orçamento criado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // --- EDIT QUOTE ---
  const openEditDialog = (quote: any) => {
    setEditQuote(quote);
    setEditForm({
      client_id: quote.client_id,
      description: quote.description || "",
      valid_until: quote.valid_until || "",
      seller_id: (quote as any).seller_id || "",
      delivery_deadline: (quote as any).delivery_deadline || "",
      origem_venda: (quote as any).origem_venda || "",
    });
    const quoteItems = (quote.quote_items ?? []) as any[];
    setEditItems(
      quoteItems.length > 0
        ? quoteItems.map((it: any) => ({ description: it.description, quantity: String(it.quantity), unit_price: String(it.unit_price) }))
        : [{ description: "", quantity: "1", unit_price: "" }]
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

      const oldTotal = Number(editQuote.total);
      const newTotal = editGrandTotal;
      const quoteId = editQuote.id;
      const isApproved = editQuote.status === "aprovado";

      // Check if approved and OS already delivered
      if (isApproved) {
        const { data: wo } = await supabase.from("work_orders").select("id, status").eq("quote_id", quoteId).maybeSingle();
        if (wo && (wo.status === "concluido" || wo.status === "entregue")) {
          throw new Error("Não é possível editar: a OS vinculada já foi concluída/entregue.");
        }
      }

      // Update quote
      const { error: quoteError } = await supabase.from("quotes").update({
        client_id: editForm.client_id,
        description: editForm.description,
        total: newTotal,
        valid_until: editForm.valid_until || null,
        seller_id: editForm.seller_id || null,
        delivery_deadline: editForm.delivery_deadline || null,
        origem_venda: editForm.origem_venda,
      } as any).eq("id", quoteId);
      if (quoteError) throw quoteError;

      // Delete old items and insert new ones
      await supabase.from("quote_items").delete().eq("quote_id", quoteId);
      const itemsToInsert = validItems.map(it => ({
        quote_id: quoteId,
        description: it.description,
        quantity: parseFloat(it.quantity) || 1,
        unit_price: parseFloat(it.unit_price) || 0,
        total: calcItemTotal(it),
      }));
      const { error: itemsError } = await supabase.from("quote_items").insert(itemsToInsert);
      if (itemsError) throw itemsError;

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
              payment_status: paidAmount >= newTotal ? "pago_total" : (paidAmount > 0 ? "entrada_recebida" : "aguardando"),
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
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["billing-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-sales"] });
      setEditOpen(false);
      setEditQuote(null);
      const desc = syncMessages && syncMessages.length > 0
        ? `Atualizado: ${syncMessages.join(", ")}`
        : undefined;
      toast({ title: "Orçamento editado com sucesso!", description: desc });
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
      const dpAmount = paymentType === "entrada_restante" ? (parseFloat(downPayment) || 0) : 0;
      const remaining = paymentType === "entrada_restante" ? Math.max(total - dpAmount, 0) : 0;

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

      const { data: wo, error: woError } = await supabase.from("work_orders").insert({
        client_id: clientId,
        quote_id: quoteId,
        total,
        description: description || "OS gerada a partir de orçamento",
        status: "aguardando" as any,
        origem_venda: origemVenda,
      } as any).select().single();
      if (woError) throw woError;

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
            total: qi.total,
          }))
        );
      }

      if (total > 0) {
        const clientName = clients.find(c => c.id === clientId)?.name ?? "";
        if (dpAmount > 0) {
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
      queryClient.invalidateQueries({ queryKey: ["financial"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["financial-entradas"] });
      queryClient.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      queryClient.invalidateQueries({ queryKey: ["account-movements-list"] });
      queryClient.invalidateQueries({ queryKey: ["account-movements-all"] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["billing-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["billing-work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-sales"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      toast({ title: "Orçamento aprovado!", description: "OS, pagamento e lançamentos financeiros criados." });
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

  const registerQuotePayment = useMutation({
    mutationFn: async (quote: any) => {
      const amount = parseFloat(payRegForm.amount);
      if (!amount || amount <= 0) throw new Error("Valor inválido");

      const { data: wo } = await supabase.from("work_orders").select("id").eq("quote_id", quote.id).single();

      const clientName = clients.find(c => c.id === quote.client_id)?.name ?? "";
      await supabase.from("financial_transactions").insert({
        type: "a_receber" as any,
        description: `Recebimento - ${clientName} (Orçamento ${quote.id.slice(0, 8)})`,
        amount,
        due_date: payRegForm.date,
        paid_date: payRegForm.date,
        status: "pago" as any,
        category: `Faturamento - ${payRegForm.method}`,
        work_order_id: wo?.id || null,
        client_id: quote.client_id,
      });

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

  const handleGeneratePDF = async (quote: any) => {
    const client = quote.clients as any;
    const quoteItems = (quote.quote_items ?? []) as any[];
    const createdAt = new Date(quote.created_at);
    const dateStr = createdAt.toLocaleDateString("pt-BR");

    const pdfItems = quoteItems.length > 0
      ? quoteItems.map((it: any) => ({ description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price), total: Number(it.total) }))
      : [{ description: quote.description ?? "Serviço", quantity: 1, unit_price: Number(quote.total), total: Number(quote.total) }];

    await generateQuotePDF({
      date: dateStr,
      client: { name: client?.name ?? "—", phone: client?.phone, address: client?.address, city: client?.city, state: client?.state, cpf_cnpj: client?.cpf_cnpj },
      items: pdfItems,
      total: Number(quote.total),
      description: quote.description,
      valid_until: quote.valid_until,
      delivery_deadline: (quote as any).delivery_deadline,
    });
    toast({ title: "PDF gerado com sucesso!" });
  };

  const filtered = quotes.filter(q =>
    isInRange(q.created_at, dateRange) && (
    (q.clients as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
    (q.description ?? "").toLowerCase().includes(search.toLowerCase()))
  );

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
              <div><Label>Prazo de Entrega</Label><Input placeholder="Ex: 15 dias úteis" value={form.delivery_deadline} onChange={e => setForm({ ...form, delivery_deadline: e.target.value })} /></div>
              <div><Label>Válido até</Label><Input type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending || !form.client_id || !form.origem_venda}>Salvar Orçamento</Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar orçamentos..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {filtered.map(q => {
          const pStatus = (q as any).payment_status || "aguardando";
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
                {(q as any).seller_id && <span className="text-muted-foreground text-xs">{profilesMap[(q as any).seller_id] || "—"}</span>}
              </div>
              {q.status === "aprovado" && (
                <Badge className={`${paymentStatusColors[pStatus] || paymentStatusColors.aguardando} mb-2`}>
                  {paymentStatusLabels[pStatus] || "Aguardando"}
                </Badge>
              )}
              <div className="flex gap-1 flex-wrap">
                <Button variant="ghost" size="sm" onClick={() => handleGeneratePDF(q)}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
                {userRole === "admin" && (
                  <Button variant="ghost" size="sm" onClick={() => openEditDialog(q)}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
                )}
                {q.status === "pendente" && userRole === "admin" && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => handleApprove(q)}><Check className="h-4 w-4 mr-1 text-green-600" />Aprovar</Button>
                    <Button variant="ghost" size="sm" onClick={() => updateStatus.mutate({ id: q.id, status: "rejeitado" })}><X className="h-4 w-4 mr-1 text-red-600" />Rejeitar</Button>
                  </>
                )}
                {q.status === "aprovado" && pStatus !== "pago_total" && userRole === "admin" && (
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
              <TableHead>Vendedor</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead className="w-44">Ações</TableHead>
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
                  <TableCell><Badge variant="outline">{{ marketing: "Marketing", obras: "Obras", empresa: "Empresa" }[(q as any).origem_venda] || "—"}</Badge></TableCell>
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
                      {userRole === "admin" && (
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
                      {q.status === "aprovado" && pStatus !== "pago_total" && userRole === "admin" && (
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
            {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum orçamento encontrado.</TableCell></TableRow>}
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
            <div><Label>Cliente *</Label>
              <Select value={editForm.client_id} onValueChange={v => setEditForm({ ...editForm, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div><Label>Vendedor Responsável</Label>
              <Select value={editForm.seller_id} onValueChange={v => setEditForm({ ...editForm, seller_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar vendedor (opcional)" /></SelectTrigger>
                <SelectContent>
                  {sellers.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

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
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    {i === 0 && <Label className="text-xs">Descrição</Label>}
                    <Input placeholder="Descrição do item" value={item.description} onChange={e => updateEditItem(i, "description", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <Label className="text-xs">Qtd</Label>}
                    <Input type="number" min="1" value={item.quantity} onChange={e => updateEditItem(i, "quantity", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <Label className="text-xs">Preço Un.</Label>}
                    <Input type="number" step="0.01" placeholder="0,00" value={item.unit_price} onChange={e => updateEditItem(i, "unit_price", e.target.value)} />
                  </div>
                  <div className="col-span-2 text-right text-sm font-medium pt-2">{fmt(calcItemTotal(item))}</div>
                  <div className="col-span-1">
                    {editItems.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeEditItem(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="text-right font-bold text-lg border-t pt-2">Total: {fmt(editGrandTotal)}</div>
            </div>

            <div><Label>Observações</Label><Textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} /></div>
            <div><Label>Prazo de Entrega</Label><Input placeholder="Ex: 15 dias úteis" value={editForm.delivery_deadline} onChange={e => setEditForm({ ...editForm, delivery_deadline: e.target.value })} /></div>
            <div><Label>Válido até</Label><Input type="date" value={editForm.valid_until} onChange={e => setEditForm({ ...editForm, valid_until: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={editMutation.isPending || !editForm.client_id || !editForm.origem_venda}>
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
