import { formatDateBR, localDateString } from "@/lib/utils";
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
import { Plus, Search, Trash2, TrendingDown, DollarSign, ShoppingCart, Award, CheckCircle, Camera, Users, Package, Pencil, AlertCircle } from "lucide-react";
import MaterialsTab from "@/components/purchases/MaterialsTab";
import { useAuth } from "@/contexts/AuthContext";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import PhotoPurchaseDialog from "@/components/PhotoPurchaseDialog";
import MonthFilter, { getDateRange, isInRange, isInRangeOrOpen, type PeriodMode } from "@/components/MonthFilter";
import OrderDetailsDialog from "@/components/purchases/OrderDetailsDialog";
import NewOrderDialog from "@/components/purchases/NewOrderDialog";
import { ChevronDown, ChevronRight } from "lucide-react";

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
  const [filterClient, setFilterClient] = useState("all");
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const dateRange = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);

  // Supplier dialog
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: "", cpf_cnpj: "", phone: "", email: "", products: "", notes: "" });
  const [editSupplierId, setEditSupplierId] = useState<string | null>(null);

  // Purchase dialog
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [pForm, setPForm] = useState({
    supplier_id: "", material: "", quantity: "1", unit: "un", unit_price: "0", original_price: "", purchase_date: localDateString(),
    invoice_number: "", payment_method: "pix", payment_status: "pendente", due_date: "", notes: "",
    client_id: "", work_order_id: "",
  });

  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string } | null>(null);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [editPurchaseId, setEditPurchaseId] = useState<string | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [orderDetailsId, setOrderDetailsId] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // Queries
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("*").order("name");
      return data ?? [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("*").order("name");
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

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_orders" as any)
        .select("*, suppliers(name)")
        .order("purchase_date", { ascending: false });
      return (data as any[]) ?? [];
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

  // All work orders for Compras view
  const { data: allWorkOrders = [] } = useQuery({
    queryKey: ["compras-work-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_orders")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: requestMaterials = {} } = useQuery({
    queryKey: ["purchase-request-materials", allWorkOrders.length],
    queryFn: async () => {
      const woIds = allWorkOrders.map((wo: any) => wo.id);
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
    enabled: allWorkOrders.length > 0,
  });

  // Best price per material from purchases history
  const bestPriceMap = useMemo(() => {
    const map: Record<string, { supplier_name: string; min_price: number }> = {};
    purchases.forEach((p: any) => {
      const key = p.material.trim().toLowerCase();
      const unitPrice = Number(p.unit_price) || 0;
      const supplierName = p.suppliers?.name ?? "Sem fornecedor";
      if (!map[key] || unitPrice < map[key].min_price) {
        map[key] = { supplier_name: supplierName, min_price: unitPrice };
      }
    });
    return map;
  }, [purchases]);

  const updateMaterialStatus = useMutation({
    mutationFn: async ({ materialId, status }: { materialId: string; status: string }) => {
      const { error } = await supabase.from("work_order_materials")
        .update({ purchase_status: status } as any)
        .eq("id", materialId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-request-materials"] });
    },
  });

  const confirmAllMaterials = useMutation({
    mutationFn: async (workOrderId: string) => {
      const request = purchaseRequests.find((r: any) => r.work_order_id === workOrderId) as any;
      // Mark all materials as comprado
      const mats = (requestMaterials as any)[workOrderId] ?? [];
      for (const m of mats) {
        await supabase.from("work_order_materials")
          .update({ purchase_status: "comprado" } as any)
          .eq("id", m.id);
      }
      // Confirm purchase request
      if (request) {
        await supabase.from("purchase_requests")
          .update({ status: "confirmado", confirmed_at: new Date().toISOString(), confirmed_by: user?.id } as any)
          .eq("id", request.id);
      }
      // Update work order
      await supabase.from("work_orders")
        .update({ material_status: "comprado" } as any)
        .eq("id", workOrderId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-requests"] });
      qc.invalidateQueries({ queryKey: ["purchase-request-materials"] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Todos os materiais confirmados!" });
    },
  });

  const confirmPurchaseRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const request = purchaseRequests.find((r: any) => r.id === requestId) as any;
      if (!request) throw new Error("Solicitação não encontrada");
      const { error } = await supabase.from("purchase_requests")
        .update({ status: "confirmado", confirmed_at: new Date().toISOString(), confirmed_by: user?.id } as any)
        .eq("id", requestId);
      if (error) throw error;
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
      const unitP = parseFloat(pForm.unit_price) || 0;
      const total = qty * unitP;

      const payload: any = {
        supplier_id: pForm.supplier_id || null,
        material: pForm.material,
        quantity: qty,
        unit: pForm.unit,
        unit_price: unitP,
        original_price: null,
        total,
        purchase_date: pForm.purchase_date,
        invoice_number: pForm.invoice_number || null,
        payment_method: pForm.payment_method,
        payment_status: pForm.payment_status,
        due_date: pForm.due_date || null,
        discount_percentage: 0,
        discount_amount: 0,
        notes: pForm.notes || null,
        client_id: pForm.client_id || null,
        work_order_id: pForm.work_order_id || null,
      };

      if (editPurchaseId) {
        // UPDATE existing purchase
        const { error } = await supabase.from("purchases").update(payload).eq("id", editPurchaseId);
        if (error) throw error;

        // Update linked financial transaction
        const oldPurchase = purchases.find(p => p.id === editPurchaseId);
        if (oldPurchase) {
          const supplierName = suppliers.find(s => s.id === pForm.supplier_id)?.name ?? "Fornecedor";
          const clientName = pForm.client_id ? clients.find(c => c.id === pForm.client_id)?.name : null;
          const descParts = [`Compra: ${pForm.material} - ${supplierName}`];
          if (clientName) descParts.push(`(${clientName})`);

          // Update existing financial transaction linked by purchase_id
          const oldSupplierName = (oldPurchase as any).suppliers?.name ?? "Fornecedor";
          await supabase.from("financial_transactions")
            .update({
              description: descParts.join(" "),
              amount: total,
              due_date: pForm.due_date || pForm.purchase_date,
              paid_date: pForm.payment_status === "pago" ? pForm.purchase_date : null,
              status: (pForm.payment_status === "pago" ? "pago" : "pendente") as any,
              client_id: pForm.client_id || null,
              work_order_id: pForm.work_order_id || null,
            })
            .eq("purchase_id", editPurchaseId);
        }

        if (pForm.work_order_id) {
          await supabase.from("work_orders")
            .update({ material_status: "comprado" } as any)
            .eq("id", pForm.work_order_id);
        }
      } else {
        // INSERT new purchase
        const { data: newPurchase, error } = await supabase.from("purchases").insert(payload).select().single();
        if (error) throw error;

        if (pForm.work_order_id) {
          await supabase.from("work_orders")
            .update({ material_status: "comprado" } as any)
            .eq("id", pForm.work_order_id);
        }

        const supplierName = suppliers.find(s => s.id === pForm.supplier_id)?.name ?? "Fornecedor";
        const clientName = pForm.client_id ? clients.find(c => c.id === pForm.client_id)?.name : null;
        const descParts = [`Compra: ${pForm.material} - ${supplierName}`];
        if (clientName) descParts.push(`(${clientName})`);
        
        await supabase.from("financial_transactions").insert({
          type: "a_pagar" as any,
          description: descParts.join(" "),
          amount: total,
          due_date: pForm.due_date || pForm.purchase_date,
          paid_date: pForm.payment_status === "pago" ? pForm.purchase_date : null,
          category: "Compras",
          status: (pForm.payment_status === "pago" ? "pago" : "pendente") as any,
          client_id: pForm.client_id || null,
          work_order_id: pForm.work_order_id || null,
          purchase_id: newPurchase.id,
        } as any);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      qc.invalidateQueries({ queryKey: ["financial-saidas"] });
      qc.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      qc.invalidateQueries({ queryKey: ["account-movements-list"] });
      qc.invalidateQueries({ queryKey: ["account-movements-all"] });
      qc.invalidateQueries({ queryKey: ["financial-accounts"] });
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      setPurchaseOpen(false);
      setEditPurchaseId(null);
      setPForm({
        supplier_id: "", material: "", quantity: "1", unit: "un", unit_price: "0", original_price: "", purchase_date: localDateString(),
        invoice_number: "", payment_method: "pix", payment_status: "pendente", due_date: "", notes: "",
        client_id: "", work_order_id: "",
      });
      toast({ title: editPurchaseId ? "Compra atualizada!" : "Compra registrada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Create a new purchase order with multiple items in one operation
  const saveOrder = useMutation({
    mutationFn: async (payload: {
      order: any;
      items: any[];
    }) => {
      const { order, items: orderItems } = payload;
      // 1) Generate order number
      const { data: numData, error: numErr } = await supabase.rpc("next_purchase_order_number" as any, {
        _date: order.purchase_date,
      });
      if (numErr) throw numErr;
      const orderNumber = numData as unknown as string;

      // 2) Insert purchase_orders header
      const { data: orderRow, error: orderErr } = await supabase
        .from("purchase_orders" as any)
        .insert({
          order_number: orderNumber,
          supplier_id: order.supplier_id,
          client_id: order.client_id,
          work_order_id: order.work_order_id,
          purchase_date: order.purchase_date,
          payment_method: order.payment_method,
          payment_status: order.payment_status,
          due_date: order.due_date,
          invoice_number: order.invoice_number,
          notes: order.notes,
          total: order.total,
        } as any)
        .select()
        .single();
      if (orderErr) throw orderErr;
      const newOrder = orderRow as any;

      // 3) Insert items linked to order
      const itemsToInsert = orderItems.map((it: any) => ({
        order_id: newOrder.id,
        material: it.material,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        total: it.total,
        supplier_id: order.supplier_id,
        client_id: it.client_id,
        work_order_id: it.work_order_id,
        purchase_date: order.purchase_date,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        due_date: order.due_date,
        invoice_number: order.invoice_number,
      }));
      const { error: itemsErr } = await supabase.from("purchases").insert(itemsToInsert as any);
      if (itemsErr) throw itemsErr;

      // 4) Create consolidated financial transaction
      const supplierName = suppliers.find(s => s.id === order.supplier_id)?.name ?? "Fornecedor";
      await supabase.from("financial_transactions").insert({
        type: "a_pagar" as any,
        description: `Compra — ${supplierName} — Pedido ${orderNumber}`,
        amount: order.total,
        due_date: order.due_date || order.purchase_date,
        paid_date: order.payment_status === "pago" ? order.purchase_date : null,
        category: "Compras",
        status: (order.payment_status === "pago" ? "pago" : "pendente") as any,
        payment_method: order.payment_method,
        client_id: order.client_id,
        work_order_id: order.work_order_id,
        purchase_order_id: newOrder.id,
        sync_origin: "purchase_order",
      } as any);

      // 5) Update WO material status if linked
      if (order.work_order_id) {
        await supabase.from("work_orders")
          .update({ material_status: "comprado" } as any)
          .eq("id", order.work_order_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      qc.invalidateQueries({ queryKey: ["financial-saidas"] });
      qc.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      qc.invalidateQueries({ queryKey: ["financial-contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["account-movements-list"] });
      qc.invalidateQueries({ queryKey: ["account-movements-all"] });
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setNewOrderOpen(false);
      toast({ title: "Pedido registrado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      // If deleting a purchase order, cascade to items and financial transaction
      if (type === "purchase_orders") {
        await supabase.from("financial_transactions").delete().eq("purchase_order_id", id);
        await supabase.from("purchases").delete().eq("order_id", id);
      }
      // If deleting a single purchase item, also cascade to financial transactions
      if (type === "purchases") {
        await supabase.from("financial_transactions").delete().eq("purchase_id", id);
      }
      const { error } = await supabase.from(type as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      qc.invalidateQueries({ queryKey: ["financial-contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeleteTarget(null);
      toast({ title: "Removido com sucesso!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const markPurchasePaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchases").update({ payment_status: "pago" }).eq("id", id);
      if (error) throw error;
      await supabase.from("financial_transactions")
        .update({ status: "pago" as any, paid_date: localDateString() })
        .eq("purchase_id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      qc.invalidateQueries({ queryKey: ["financial-contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: "Pagamento registrado!" });
    },
  });

  const markOrderPaid = useMutation({
    mutationFn: async (orderId: string) => {
      const today = localDateString();
      await supabase.from("purchase_orders" as any).update({ payment_status: "pago" }).eq("id", orderId);
      await supabase.from("purchases").update({ payment_status: "pago" }).eq("order_id", orderId);
      await supabase.from("financial_transactions")
        .update({ status: "pago" as any, paid_date: today })
        .eq("purchase_order_id", orderId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
      qc.invalidateQueries({ queryKey: ["financial-contas-pagar"] });
      qc.invalidateQueries({ queryKey: ["financial-movimentacao"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast({ title: "Pedido pago!" });
    },
  });

  // Helper: get client name for a purchase or order
  const getClientLabel = (p: any) => {
    if (p.work_order_id) {
      const wo = allWorkOrders.find((w: any) => w.id === p.work_order_id);
      const clientName = p.client_id
        ? clients.find(c => c.id === p.client_id)?.name
        : wo?.clients?.name;
      return `${clientName || "Cliente"} — OS #${p.work_order_id.slice(0, 8)}`;
    }
    if (p.client_id) {
      return clients.find(c => c.id === p.client_id)?.name || "Cliente";
    }
    return "Uso Geral / Estoque";
  };

  // Group items by order_id for quick lookup
  const itemsByOrder = useMemo(() => {
    const map: Record<string, any[]> = {};
    purchases.forEach((p: any) => {
      if (p.order_id) {
        if (!map[p.order_id]) map[p.order_id] = [];
        map[p.order_id].push(p);
      }
    });
    return map;
  }, [purchases]);

  // Calculations (per item — for materials/discounts/client costs)
  const monthPurchases = purchases.filter(p => {
    const isOpen = p.payment_status !== "pago";
    return isInRangeOrOpen(p.purchase_date, dateRange, isOpen, p.payment_status === "pago" ? p.purchase_date : null);
  });
  const totalDiscount = monthPurchases.reduce((s, p) => s + Number(p.discount_amount ?? 0), 0);

  // Orders for the period (for panel + listing) — based on purchase_orders
  const monthOrders = useMemo(() => {
    return purchaseOrders.filter((o: any) => {
      const isOpen = o.payment_status !== "pago";
      return isInRangeOrOpen(o.purchase_date, dateRange, isOpen, o.payment_status === "pago" ? o.purchase_date : null);
    });
  }, [purchaseOrders, dateRange]);

  const totalMonth = monthOrders.reduce((s: number, o: any) => s + Number(o.total ?? 0), 0);
  const pendingOrders = purchaseOrders.filter((o: any) => o.payment_status !== "pago");
  const pendingPayment = pendingOrders; // backwards compat for panel

  // Supplier discount ranking
  const supplierDiscounts = useMemo(() => {
    const map: Record<string, { name: string; totalOriginal: number; totalPaid: number; totalSaved: number; count: number }> = {};
    monthPurchases.forEach(p => {
      const sid = p.supplier_id;
      if (!sid) return;
      const name = (p as any).suppliers?.name ?? "Sem nome";
      if (!map[sid]) map[sid] = { name, totalOriginal: 0, totalPaid: 0, totalSaved: 0, count: 0 };
      const origPrice = Number((p as any).original_price ?? 0);
      const paidTotal = Number(p.total);
      const qty = Number(p.quantity);
      let originalTotal: number;
      if (origPrice > 0) {
        const asPerUnit = origPrice * qty;
        const asTotalDiff = Math.abs(origPrice - paidTotal);
        const asPerUnitDiff = Math.abs(asPerUnit - paidTotal);
        originalTotal = asTotalDiff < asPerUnitDiff ? origPrice : asPerUnit;
      } else {
        originalTotal = paidTotal;
      }
      map[sid].totalOriginal += originalTotal;
      map[sid].totalPaid += paidTotal;
      map[sid].totalSaved += originalTotal - paidTotal;
      if (Number(p.discount_amount ?? 0) > 0) map[sid].count++;
    });
    return Object.values(map).sort((a, b) => b.totalSaved - a.totalSaved);
  }, [monthPurchases]);

  // Client cost summary
  const clientCosts = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number }> = {};
    monthPurchases.forEach(p => {
      const key = (p as any).work_order_id || (p as any).client_id || "geral";
      if (!map[key]) {
        let name = "Uso Geral / Estoque";
        if ((p as any).work_order_id) {
          const wo = allWorkOrders.find((w: any) => w.id === (p as any).work_order_id);
          const cName = (p as any).client_id
            ? clients.find(c => c.id === (p as any).client_id)?.name
            : wo?.clients?.name;
          name = `${cName || "Cliente"} — OS #${((p as any).work_order_id as string).slice(0, 8)}`;
        } else if ((p as any).client_id) {
          name = clients.find(c => c.id === (p as any).client_id)?.name || "Cliente";
        }
        map[key] = { name, total: 0, count: 0 };
      }
      map[key].total += Number(p.total);
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [monthPurchases, allWorkOrders, clients]);

  const filteredPurchases = monthPurchases.filter(p => {
    if (filterSupplier !== "all" && p.supplier_id !== filterSupplier) return false;
    if (filterStatus !== "all" && p.payment_status !== filterStatus) return false;
    if (filterClient !== "all") {
      if (filterClient === "geral") {
        if ((p as any).client_id || (p as any).work_order_id) return false;
      } else {
        if ((p as any).client_id !== filterClient && (p as any).work_order_id !== filterClient) return false;
      }
    }
    if (search) {
      const s = search.toLowerCase();
      const name = (p as any).suppliers?.name ?? "";
      const clientName = getClientLabel(p);
      return p.material.toLowerCase().includes(s) || name.toLowerCase().includes(s) || (p.invoice_number ?? "").toLowerCase().includes(s) || clientName.toLowerCase().includes(s);
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

  // Unique clients from purchases for filter
  const purchaseClientIds = useMemo(() => {
    const ids = new Set<string>();
    purchases.forEach(p => {
      if ((p as any).client_id) ids.add((p as any).client_id);
    });
    return Array.from(ids);
  }, [purchases]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Compras</h1>
        <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="painel">Painel</TabsTrigger>
          <TabsTrigger value="solicitacoes">Solicitações</TabsTrigger>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
          <TabsTrigger value="materiais">Materiais</TabsTrigger>
          <TabsTrigger value="descontos">Descontos</TabsTrigger>
          <TabsTrigger value="custos-cliente">Custos por Cliente</TabsTrigger>
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

          {/* Recent orders */}
          <Card>
            <CardHeader><CardTitle className="text-base">Pedidos Recentes</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead className="hidden md:table-cell">Fornecedor</TableHead>
                      <TableHead className="hidden md:table-cell">Itens</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthOrders.slice(0, 10).map((o: any) => {
                      const oItems = itemsByOrder[o.id] ?? [];
                      return (
                        <TableRow key={o.id} className="cursor-pointer" onClick={() => setOrderDetailsId(o.id)}>
                          <TableCell className="font-medium">{o.order_number}</TableCell>
                          <TableCell className="hidden md:table-cell">{(o as any).suppliers?.name ?? "—"}</TableCell>
                          <TableCell className="hidden md:table-cell text-xs">{oItems.length} {oItems.length === 1 ? "item" : "itens"}</TableCell>
                          <TableCell>{fmt(Number(o.total))}</TableCell>
                          <TableCell><Badge className={statusColors[o.payment_status]}>{paymentStatuses[o.payment_status]}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                    {monthOrders.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum pedido registrado.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SOLICITAÇÕES - All OS appear automatically */}
        <TabsContent value="solicitacoes" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Ordens de Serviço — Materiais</CardTitle></CardHeader>
            <CardContent>
              {allWorkOrders.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhuma OS encontrada.</p>
              ) : (
                <div className="space-y-4">
                  {allWorkOrders.filter((wo: any) => {
                    const matStatus = wo.material_status || "nao_solicitado";
                    const isOpen = matStatus !== "comprado";
                    return isInRangeOrOpen(wo.created_at?.slice(0, 10), dateRange, isOpen, wo.completed_at?.slice(0, 10));
                  }).map((wo: any) => {
                    const mats = (requestMaterials as any)[wo.id] ?? [];
                    const req = purchaseRequests.find((r: any) => r.work_order_id === wo.id);
                    const materialStatusLabel: Record<string, string> = {
                      nao_solicitado: "Pendente",
                      aguardando_compra: "Aguardando Compra",
                      comprado: "Comprado",
                    };
                    const materialStatusColor: Record<string, string> = {
                      nao_solicitado: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
                      aguardando_compra: "bg-blue-500/10 text-blue-700 border-blue-500/20",
                      comprado: "bg-green-500/10 text-green-700 border-green-500/20",
                    };
                    const matStatus = wo.material_status || "nao_solicitado";
                    const allComprado = mats.length > 0 && mats.every((m: any) => (m.purchase_status || "pendente") === "comprado");
                    const matPurchaseStatusLabel: Record<string, string> = {
                      pendente: "Pendente",
                      em_cotacao: "Em Cotação",
                      comprado: "Comprado",
                    };
                    const matPurchaseStatusColor: Record<string, string> = {
                      pendente: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
                      em_cotacao: "bg-blue-500/10 text-blue-700 border-blue-500/20",
                      comprado: "bg-green-500/10 text-green-700 border-green-500/20",
                    };
                    return (
                      <Card key={wo.id} className="border">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-sm">OS #{wo.id.slice(0, 8)}</p>
                              <p className="text-xs text-muted-foreground">{wo.clients?.name} — {wo.description}</p>
                            </div>
                            <Badge className={materialStatusColor[matStatus] ?? materialStatusColor.nao_solicitado}>
                              {materialStatusLabel[matStatus] ?? "Pendente"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>💰 Valor: <strong className="text-foreground">{fmt(Number(wo.total))}</strong></span>
                            <span>📅 Criada: {new Date(wo.created_at).toLocaleDateString("pt-BR")}</span>
                          </div>

                          {/* Materials list */}
                          {mats.length > 0 ? (
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold flex items-center gap-1">
                                <Package className="h-3 w-3" /> Materiais ({mats.length})
                              </p>
                              {mats.map((m: any) => {
                                const mKey = m.material.trim().toLowerCase();
                                const best = bestPriceMap[mKey];
                                const currentStatus = m.purchase_status || "pendente";
                                return (
                                  <div key={m.id} className="text-xs bg-muted/50 rounded p-2 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 flex-1">
                                        <span className="font-medium">{m.material}</span>
                                        <span className="text-muted-foreground">{m.quantity} {m.unit}</span>
                                        {m.notes && <span className="text-muted-foreground italic">({m.notes})</span>}
                                      </div>
                                      {matStatus !== "comprado" && (
                                        <Select
                                          value={currentStatus}
                                          onValueChange={(v) => updateMaterialStatus.mutate({ materialId: m.id, status: v })}
                                        >
                                          <SelectTrigger className="h-6 text-[10px] w-28 border-0 bg-transparent">
                                            <Badge className={`${matPurchaseStatusColor[currentStatus]} text-[10px]`}>
                                              {matPurchaseStatusLabel[currentStatus]}
                                            </Badge>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="pendente">Pendente</SelectItem>
                                            <SelectItem value="em_cotacao">Em Cotação</SelectItem>
                                            <SelectItem value="comprado">Comprado</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      )}
                                      {matStatus === "comprado" && (
                                        <Badge className="bg-green-500/10 text-green-700 border-green-500/20 text-[10px]">
                                          Comprado
                                        </Badge>
                                      )}
                                    </div>
                                    {best && (
                                      <p className="text-[10px] text-muted-foreground">
                                        💡 Melhor preço: <strong>{best.supplier_name}</strong> — {fmt(best.min_price)}/{m.unit}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded p-2">
                              <AlertCircle className="h-3.5 w-3.5" />
                              <span>Aguardando lista de materiais da Produção</span>
                            </div>
                          )}

                          {/* Confirm all button - when all individual mats are comprado */}
                          {matStatus === "aguardando_compra" && allComprado && (
                            <Button
                              size="sm" className="w-full"
                              onClick={() => confirmAllMaterials.mutate(wo.id)}
                              disabled={confirmAllMaterials.isPending}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" /> Confirmar Aquisição (todos comprados)
                            </Button>
                          )}
                          {/* Legacy confirm button for requests without individual tracking */}
                          {req && req.status === "pendente" && !allComprado && matStatus === "aguardando_compra" && (
                            <Button
                              size="sm" variant="outline" className="w-full"
                              onClick={() => confirmPurchaseRequest.mutate(req.id)}
                              disabled={confirmPurchaseRequest.isPending}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" /> Confirmar Aquisição
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
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
              <Select value={filterClient} onValueChange={setFilterClient}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Cliente / Obra" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="geral">Uso Geral / Estoque</SelectItem>
                  {purchaseClientIds.map(cid => {
                    const c = clients.find(cl => cl.id === cid);
                    return c ? <SelectItem key={cid} value={cid}>{c.name}</SelectItem> : null;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPhotoDialogOpen(true)}>
                <Camera className="h-4 w-4 mr-2" />Registrar por Foto
              </Button>
              <Button onClick={() => setNewOrderOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />Novo Pedido
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead className="hidden md:table-cell">Fornecedor</TableHead>
                  <TableHead className="hidden lg:table-cell">Cliente / Obra</TableHead>
                  <TableHead className="hidden md:table-cell">Itens</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="hidden md:table-cell">Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  // Filter orders by search/supplier/status/client
                  const filteredOrders = monthOrders.filter((o: any) => {
                    if (filterSupplier !== "all" && o.supplier_id !== filterSupplier) return false;
                    if (filterStatus !== "all" && o.payment_status !== filterStatus) return false;
                    if (filterClient !== "all") {
                      const orderItems = itemsByOrder[o.id] ?? [];
                      const matchesOrder =
                        (filterClient === "geral" && !o.client_id && !o.work_order_id) ||
                        o.client_id === filterClient || o.work_order_id === filterClient;
                      const matchesItems = orderItems.some((it: any) => {
                        if (filterClient === "geral") return !it.client_id && !it.work_order_id;
                        return it.client_id === filterClient || it.work_order_id === filterClient;
                      });
                      if (!matchesOrder && !matchesItems) return false;
                    }
                    if (search) {
                      const s = search.toLowerCase();
                      const supName = (o as any).suppliers?.name ?? "";
                      const orderItems = itemsByOrder[o.id] ?? [];
                      const matchSearch =
                        (o.order_number || "").toLowerCase().includes(s) ||
                        supName.toLowerCase().includes(s) ||
                        (o.invoice_number ?? "").toLowerCase().includes(s) ||
                        orderItems.some((it: any) => (it.material || "").toLowerCase().includes(s));
                      if (!matchSearch) return false;
                    }
                    return true;
                  });

                  if (filteredOrders.length === 0) {
                    return <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum pedido encontrado.</TableCell></TableRow>;
                  }

                  return filteredOrders.flatMap((o: any) => {
                    const oItems = itemsByOrder[o.id] ?? [];
                    const isExpanded = expandedOrders.has(o.id);
                    const rows = [
                      <TableRow key={o.id} className="cursor-pointer" onClick={() => {
                        const next = new Set(expandedOrders);
                        if (next.has(o.id)) next.delete(o.id); else next.add(o.id);
                        setExpandedOrders(next);
                      }}>
                        <TableCell>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => {
                            e.stopPropagation();
                            const next = new Set(expandedOrders);
                            if (next.has(o.id)) next.delete(o.id); else next.add(o.id);
                            setExpandedOrders(next);
                          }}>
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{o.order_number}</TableCell>
                        <TableCell className="hidden md:table-cell">{(o as any).suppliers?.name ?? "—"}</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs">{getClientLabel(o)}</TableCell>
                        <TableCell className="hidden md:table-cell">{oItems.length} {oItems.length === 1 ? "item" : "itens"}</TableCell>
                        <TableCell className="font-medium">{fmt(Number(o.total))}</TableCell>
                        <TableCell className="hidden md:table-cell">{formatDateBR(o.purchase_date)}</TableCell>
                        <TableCell><Badge className={statusColors[o.payment_status]}>{paymentStatuses[o.payment_status]}</Badge></TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => setOrderDetailsId(o.id)}>Ver</Button>
                            {o.payment_status !== "pago" && (
                              <Button size="sm" variant="outline" onClick={() => markOrderPaid.mutate(o.id)}>Pagar</Button>
                            )}
                            {userRole === "admin" && (
                              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: "purchase_orders", id: o.id })}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>,
                    ];

                    if (isExpanded) {
                      rows.push(
                        <TableRow key={`${o.id}-detail`} className="bg-muted/30">
                          <TableCell colSpan={9}>
                            <div className="p-2 space-y-2">
                              <div className="text-xs text-muted-foreground">
                                {o.invoice_number && <>NF: <strong>{o.invoice_number}</strong> · </>}
                                Forma: <strong>{paymentMethods[o.payment_method] ?? o.payment_method}</strong>
                                {o.notes && <> · Obs: {o.notes}</>}
                              </div>
                              <div className="border rounded">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Material</TableHead>
                                      <TableHead className="w-24">Qtd</TableHead>
                                      <TableHead className="w-28">Vlr Unit.</TableHead>
                                      <TableHead className="w-28">Total</TableHead>
                                      <TableHead className="text-xs">Cliente / Obra</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {oItems.map((it: any) => (
                                      <TableRow key={it.id}>
                                        <TableCell className="font-medium">{it.material}</TableCell>
                                        <TableCell>{it.quantity} {it.unit}</TableCell>
                                        <TableCell>{fmt(Number(it.unit_price))}</TableCell>
                                        <TableCell className="font-medium">{fmt(Number(it.total))}</TableCell>
                                        <TableCell className="text-xs">{getClientLabel(it)}</TableCell>
                                      </TableRow>
                                    ))}
                                    {oItems.length === 0 && (
                                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Sem itens.</TableCell></TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return rows;
                  });
                })()}
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

        {/* MATERIAIS */}
        <TabsContent value="materiais">
          <MaterialsTab dateRange={dateRange} />
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

        {/* CUSTOS POR CLIENTE */}
        <TabsContent value="custos-cliente" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5" />
                Custo de Materiais por Cliente / Obra (Período Selecionado)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente / Obra</TableHead>
                      <TableHead>Itens</TableHead>
                      <TableHead>Total Gasto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientCosts.map((cc, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{cc.name}</TableCell>
                        <TableCell>{cc.count}</TableCell>
                        <TableCell className="font-bold">{fmt(cc.total)}</TableCell>
                      </TableRow>
                    ))}
                    {clientCosts.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Nenhuma compra no mês atual.</TableCell></TableRow>}
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

      <PhotoPurchaseDialog
        open={photoDialogOpen}
        onOpenChange={setPhotoDialogOpen}
        suppliers={suppliers}
        purchaseRequests={purchaseRequests}
        clients={clients}
        workOrders={allWorkOrders}
        onSave={async (data: any) => {
          const { items, linked_wo_id, order_total } = data;
          if (!items || items.length === 0) return;
          // Group all items into ONE purchase_order (foto = nota fiscal única)
          const first = items[0];
          const supplierId = first.supplier_id || null;
          const purchaseDate = first.purchase_date;
          const paymentMethod = first.payment_method || "pix";
          const paymentStatus = first.payment_status || "pendente";
          const dueDate = first.due_date || null;
          const invoiceNumber = first.invoice_number || null;
          const orderTotal = Number(order_total ?? items.reduce((s: number, it: any) => s + Number(it.total || 0), 0));
          const orderClient = first.client_id || null;
          const orderWO = first.work_order_id || null;

          // Generate order number
          const { data: numData, error: numErr } = await supabase.rpc("next_purchase_order_number" as any, { _date: purchaseDate });
          if (numErr) { toast({ title: "Erro", description: numErr.message, variant: "destructive" }); return; }
          const orderNumber = numData as unknown as string;

          // Insert order header
          const { data: newOrder, error: oErr } = await supabase.from("purchase_orders" as any).insert({
            order_number: orderNumber, supplier_id: supplierId, client_id: orderClient, work_order_id: orderWO,
            purchase_date: purchaseDate, payment_method: paymentMethod, payment_status: paymentStatus,
            due_date: dueDate, invoice_number: invoiceNumber, total: orderTotal,
          } as any).select().single();
          if (oErr) { toast({ title: "Erro", description: oErr.message, variant: "destructive" }); return; }

          // Insert items linked to order
          const itemsPayload = items.map((it: any) => ({ ...it, order_id: (newOrder as any).id }));
          const { error: iErr } = await supabase.from("purchases").insert(itemsPayload);
          if (iErr) { toast({ title: "Erro", description: iErr.message, variant: "destructive" }); return; }

          // Single consolidated financial transaction
          const supplierName = suppliers.find(s => s.id === supplierId)?.name ?? "Fornecedor";
          await supabase.from("financial_transactions").insert({
            type: "a_pagar" as any,
            description: `Compra — ${supplierName} — Pedido ${orderNumber}`,
            amount: orderTotal,
            due_date: dueDate || purchaseDate,
            paid_date: paymentStatus === "pago" ? purchaseDate : null,
            category: "Compras",
            status: (paymentStatus === "pago" ? "pago" : "pendente") as any,
            payment_method: paymentMethod,
            client_id: orderClient, work_order_id: orderWO,
            purchase_order_id: (newOrder as any).id, sync_origin: "purchase_order",
          } as any);

          // Update WO material status
          if (orderWO) {
            await supabase.from("work_orders").update({ material_status: "comprado" } as any).eq("id", orderWO);
          }
          if (linked_wo_id && linked_wo_id !== "none") {
            const req = purchaseRequests.find((r: any) => r.work_order_id === linked_wo_id);
            if (req) {
              await supabase.from("purchase_requests").update({ status: "confirmado", confirmed_at: new Date().toISOString(), confirmed_by: user?.id } as any).eq("id", req.id);
              await supabase.from("work_orders").update({ material_status: "comprado" } as any).eq("id", linked_wo_id);
            }
          }

          qc.invalidateQueries({ queryKey: ["purchases"] });
          qc.invalidateQueries({ queryKey: ["purchase-orders"] });
          qc.invalidateQueries({ queryKey: ["financial"] });
          qc.invalidateQueries({ queryKey: ["financial-saidas"] });
          qc.invalidateQueries({ queryKey: ["financial-contas-pagar"] });
          qc.invalidateQueries({ queryKey: ["financial-movimentacao"] });
          qc.invalidateQueries({ queryKey: ["purchase-requests"] });
          qc.invalidateQueries({ queryKey: ["work-orders"] });
          qc.invalidateQueries({ queryKey: ["production-orders"] });
          toast({ title: `Pedido ${orderNumber} criado com ${items.length} item(ns)!` });
        }}
      />

      <NewOrderDialog
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        suppliers={suppliers}
        clients={clients}
        workOrders={allWorkOrders}
        isPending={saveOrder.isPending}
        onSave={async (payload) => { await saveOrder.mutateAsync(payload); }}
      />

      <OrderDetailsDialog
        open={!!orderDetailsId}
        onOpenChange={(v) => !v && setOrderDetailsId(null)}
        order={purchaseOrders.find((o: any) => o.id === orderDetailsId) ?? null}
        items={orderDetailsId ? (itemsByOrder[orderDetailsId] ?? []) : []}
        supplierName={(() => {
          const o = purchaseOrders.find((o: any) => o.id === orderDetailsId);
          return o ? (o as any).suppliers?.name : undefined;
        })()}
        getClientLabel={getClientLabel}
      />
    </div>
  );
};

export default Purchases;
