import { localDateString } from "@/lib/utils";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, FileText, ClipboardList, DollarSign, Factory, Receipt, TrendingUp, TrendingDown, ShoppingBag, ShoppingCart, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import MonthFilter, { getDateRange, isInRange, type PeriodMode } from "@/components/MonthFilter";

const Dashboard = () => {
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const dateRange = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);

  const { data: clients } = useQuery({
    queryKey: ["clients-count"],
    queryFn: async () => {
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  // ── Source: quotes (approved) — same as Sales Admin, Billing, DRE ──
  const { data: approvedQuotes = [] } = useQuery({
    queryKey: ["dashboard-approved-quotes"],
    queryFn: async () => {
      const { data } = await supabase.from("quotes").select("id, status, total, created_at, approved_at, issue_date, seller_id, origem_venda, client_id");
      return data ?? [];
    },
  });

  // Pending quotes (not yet approved)
  const { data: pendingQuotes = [] } = useQuery({
    queryKey: ["dashboard-pending-quotes"],
    queryFn: async () => {
      const { data } = await supabase.from("quotes").select("id, status, total, issue_date").eq("status", "pendente");
      return data ?? [];
    },
  });

  // ── Source: work_orders — for production cards ──
  const { data: workOrders = [] } = useQuery({
    queryKey: ["dashboard-work-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("work_orders").select("id, status, quote_id, created_at");
      return data ?? [];
    },
  });

  // ── Source: financial_transactions — same as Financial module ──
  const { data: transactions = [] } = useQuery({
    queryKey: ["dashboard-financial-transactions"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_transactions").select("id, type, status, amount, due_date, paid_date, category");
      return data ?? [];
    },
  });

  // ── Source: marketing_campaigns — same as Marketing module ──
  const { data: allCampaigns = [] } = useQuery({
    queryKey: ["dashboard-marketing-campaigns"],
    queryFn: async () => {
      const { data } = await supabase.from("marketing_campaigns").select("amount_invested, start_date, end_date");
      return data ?? [];
    },
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // ═══════════════════════════════════════════════════════
  // VENDAS & FATURAMENTO — Source: quotes with status=aprovado, filtered by approved_at
  // Same logic as Sales Admin and Billing
  // ═══════════════════════════════════════════════════════
  const monthApprovedQuotes = useMemo(() => {
    return approvedQuotes.filter(q => q.status === "aprovado" && isInRange(q.approved_at, dateRange));
  }, [approvedQuotes, dateRange]);

  const totalBilled = useMemo(() => monthApprovedQuotes.reduce((s, q) => s + Number(q.total), 0), [monthApprovedQuotes]);
  const salesCount = monthApprovedQuotes.length;
  const uniqueSellers = useMemo(() => new Set(monthApprovedQuotes.filter(q => q.seller_id).map(q => q.seller_id)).size, [monthApprovedQuotes]);

  // ═══════════════════════════════════════════════════════
  // FATURAMENTO RECEBIDO — Source: financial_transactions type=a_receber, status=pago
  // Same logic as Entradas tab (only paid, filtered by due_date)
  // ═══════════════════════════════════════════════════════
  const totalReceived = useMemo(() => {
    return transactions
      .filter(t => t.type === "a_receber" && t.status === "pago" && isInRange(t.due_date, dateRange))
      .reduce((s, t) => s + Number(t.amount), 0);
  }, [transactions, dateRange]);

  // ═══════════════════════════════════════════════════════
  // CONTAS A RECEBER — accumulated: all open a_receber up to end of period
  // ═══════════════════════════════════════════════════════
  const { totalReceivable, receivableDoMes, receivableAcumulado } = useMemo(() => {
    const open = transactions.filter(t => t.type === "a_receber" && (t.status === "pendente" || t.status === "atrasado"));
    const total = open.reduce((s, t) => s + Number(t.amount), 0);
    const doMes = open.filter(t => isInRange(t.due_date, dateRange)).reduce((s, t) => s + Number(t.amount), 0);
    const acumulado = open.filter(t => {
      const d = new Date(t.due_date + "T00:00:00");
      return d < dateRange.start;
    }).reduce((s, t) => s + Number(t.amount), 0);
    return { totalReceivable: total, receivableDoMes: doMes, receivableAcumulado: acumulado };
  }, [transactions, dateRange]);

  // ═══════════════════════════════════════════════════════
  // CONTAS A PAGAR — accumulated: all open a_pagar up to end of period
  // ═══════════════════════════════════════════════════════
  const { totalPayable, payableDoMes, payableAcumulado } = useMemo(() => {
    const open = transactions.filter(t => t.type === "a_pagar" && (t.status === "pendente" || t.status === "atrasado"));
    const total = open.reduce((s, t) => s + Number(t.amount), 0);
    const doMes = open.filter(t => isInRange(t.due_date, dateRange)).reduce((s, t) => s + Number(t.amount), 0);
    const acumulado = open.filter(t => {
      const d = new Date(t.due_date + "T00:00:00");
      return d < dateRange.start;
    }).reduce((s, t) => s + Number(t.amount), 0);
    return { totalPayable: total, payableDoMes: doMes, payableAcumulado: acumulado };
  }, [transactions, dateRange]);

  // ═══════════════════════════════════════════════════════
  // TOTAL PAGO (saídas) — Source: financial_transactions type=a_pagar, status=pago
  // Same logic as Saídas tab
  // ═══════════════════════════════════════════════════════
  const totalPaid = useMemo(() => {
    return transactions
      .filter(t => t.type === "a_pagar" && t.status === "pago" && isInRange(t.due_date, dateRange))
      .reduce((s, t) => s + Number(t.amount), 0);
  }, [transactions, dateRange]);

  // ═══════════════════════════════════════════════════════
  // COMPRAS — Source: financial_transactions with category "Compras", status=pago
  // Aligned with Financial Saídas category filter
  // ═══════════════════════════════════════════════════════
  const purchasesSummary = useMemo(() => {
    const purchaseTxns = transactions.filter(t =>
      t.type === "a_pagar" && (t.category ?? "").toLowerCase().includes("compras") && isInRange(t.due_date, dateRange)
    );
    const totalSpent = purchaseTxns.filter(t => t.status === "pago").reduce((s, t) => s + Number(t.amount), 0);
    return { totalSpent };
  }, [transactions, dateRange]);

  // ═══════════════════════════════════════════════════════
  // ORÇAMENTOS PENDENTES — Quotes with status=pendente
  // ═══════════════════════════════════════════════════════
  const pendingQuotesCount = pendingQuotes.length;
  const pendingQuotesTotal = useMemo(() => pendingQuotes.reduce((s, q) => s + Number(q.total), 0), [pendingQuotes]);

  // ═══════════════════════════════════════════════════════
  // ORDENS DE SERVIÇO — by status (all time, not filtered by period)
  // ═══════════════════════════════════════════════════════
  const woByStatus = useMemo(() => ({
    aguardando: workOrders.filter(w => w.status === "aguardando").length,
    em_producao: workOrders.filter(w => w.status === "em_producao").length,
    aguardando_instalacao: workOrders.filter(w => w.status === "aguardando_instalacao").length,
    entregue: workOrders.filter(w => w.status === "entregue").length,
  }), [workOrders]);

  // ═══════════════════════════════════════════════════════
  // DRE — Same logic as DRE page: Revenue from approved quotes, Expenses from financial_transactions
  // ═══════════════════════════════════════════════════════
  const dreResult = useMemo(() => {
    const revenue = totalBilled; // approved quotes in period

    // Expenses: all a_pagar transactions in period (by due_date)
    const expenses = transactions
      .filter(t => t.type === "a_pagar" && isInRange(t.due_date, dateRange))
      .reduce((s, t) => s + Number(t.amount), 0);

    return { currResult: revenue - expenses };
  }, [totalBilled, transactions, dateRange]);

  // ═══════════════════════════════════════════════════════
  // MARKETING — Same as Marketing module
  // ═══════════════════════════════════════════════════════
  const marketingSummary = useMemo(() => {
    const rangeStart = localDateString(dateRange.start);
    const rangeEnd = localDateString(dateRange.end);

    const filteredCamps = allCampaigns.filter(c => {
      const campStart = c.start_date;
      const campEnd = c.end_date || c.start_date;
      return campStart <= rangeEnd && campEnd >= rangeStart;
    });
    const totalInvested = filteredCamps.reduce((s, c) => s + Number(c.amount_invested), 0);

    // Marketing sales: approved quotes with origem_venda = marketing in period
    const marketingSales = monthApprovedQuotes.filter(q => q.origem_venda === "marketing");
    const totalRevenue = marketingSales.reduce((s, q) => s + Number(q.total), 0);
    const roi = totalInvested > 0 ? ((totalRevenue - totalInvested) / totalInvested) * 100 : 0;
    return { totalInvested, totalRevenue, roi };
  }, [allCampaigns, monthApprovedQuotes, dateRange]);

  const statusLabels: Record<string, string> = {
    aguardando: "Aguardando",
    em_producao: "Em Produção",
    aguardando_instalacao: "Aguardando Instalação",
    entregue: "Entregue",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
        <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Orçamentos Pendentes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingQuotesCount}</div>
            <p className="text-xs text-muted-foreground">Total: {fmt(pendingQuotesTotal)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Receber</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{fmt(totalReceivable)}</div>
            <div className="flex flex-col gap-0.5 mt-1">
              <p className="text-xs text-muted-foreground">Do mês: <span className="font-medium text-blue-600">{fmt(receivableDoMes)}</span></p>
              {receivableAcumulado > 0 && <p className="text-xs text-muted-foreground">Acumulado: <span className="font-medium text-orange-600">{fmt(receivableAcumulado)}</span></p>}
              <p className="text-xs text-muted-foreground">Recebido no mês: {fmt(totalReceived)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Pagar</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{fmt(totalPayable)}</div>
            <div className="flex flex-col gap-0.5 mt-1">
              <p className="text-xs text-muted-foreground">Do mês: <span className="font-medium text-red-600">{fmt(payableDoMes)}</span></p>
              {payableAcumulado > 0 && <p className="text-xs text-muted-foreground">Acumulado: <span className="font-medium text-orange-600">{fmt(payableAcumulado)}</span></p>}
              <p className="text-xs text-muted-foreground">Pago no mês: {fmt(totalPaid)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Faturamento do Período</CardTitle>
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Faturado</p>
              <p className="text-lg sm:text-xl font-bold">{fmt(totalBilled)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recebido</p>
              <p className="text-lg sm:text-xl font-bold text-green-600">{fmt(totalReceived)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Resultado do Período (DRE)</CardTitle>
          {dreResult.currResult >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${dreResult.currResult >= 0 ? "text-green-600" : "text-red-600"}`}>
            {fmt(dreResult.currResult)}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4" /> Ordens de Serviço
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(woByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm">{statusLabels[status]}</span>
                  <Badge variant={status === "em_producao" ? "default" : "secondary"}>{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Factory className="h-4 w-4" /> Produção
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { key: "aguardando", label: "Fila de Produção" },
                { key: "em_producao", label: "Em Andamento" },
                { key: "aguardando_instalacao", label: "Aguardando Instalação" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  <Badge variant={key === "em_producao" ? "default" : "secondary"}>
                    {woByStatus[key as keyof typeof woByStatus] ?? 0}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Vendas do Período</CardTitle>
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Total Vendido</p>
              <p className="text-lg sm:text-xl font-bold">{fmt(totalBilled)}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Nº de Vendas</p>
              <p className="text-lg sm:text-xl font-bold">{salesCount}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Vendedores Ativos</p>
              <p className="text-lg sm:text-xl font-bold">{uniqueSellers}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Compras do Período</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(purchasesSummary.totalSpent)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fluxo de Caixa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Entradas</p>
                <p className="text-lg sm:text-xl font-bold text-green-600">{fmt(totalReceived)}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Saídas</p>
                <p className="text-lg sm:text-xl font-bold text-red-600">{fmt(totalPaid)}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Saldo</p>
                <p className={`text-lg sm:text-xl font-bold ${totalReceived - totalPaid >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmt(totalReceived - totalPaid)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Marketing do Período</CardTitle>
          <Megaphone className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Investido</p>
              <p className="text-lg sm:text-xl font-bold">{fmt(marketingSummary.totalInvested)}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Vendas Geradas</p>
              <p className="text-lg sm:text-xl font-bold text-green-600">{fmt(marketingSummary.totalRevenue)}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">ROI</p>
              <p className={`text-lg sm:text-xl font-bold ${marketingSummary.roi >= 0 ? "text-green-600" : "text-red-600"}`}>
                {marketingSummary.roi.toFixed(1)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
