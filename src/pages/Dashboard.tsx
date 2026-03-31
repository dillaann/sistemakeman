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

  const { data: quotes } = useQuery({
    queryKey: ["quotes-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("quotes").select("status, total, created_at, approved_at");
      return data ?? [];
    },
  });

  const { data: workOrders } = useQuery({
    queryKey: ["work-orders-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("work_orders").select("status, total, created_at");
      return data ?? [];
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ["financial-summary"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_transactions").select("type, status, amount, due_date, paid_date");
      return data ?? [];
    },
  });

  const billingData = useMemo(() => {
    const approvedInRange = (quotes ?? []).filter(q => q.status === "aprovado" && isInRange(q.approved_at, dateRange));
    const totalBilled = approvedInRange.reduce((s, q) => s + Number(q.total), 0);
    return { totalBilled, totalReceived: 0 };
  }, [quotes, dateRange]);

  // Filtered data
  const filteredQuotes = useMemo(() => (quotes ?? []).filter(q => isInRange(q.created_at, dateRange)), [quotes, dateRange]);
  const filteredWO = useMemo(() => (workOrders ?? []).filter(w => isInRange(w.created_at, dateRange)), [workOrders, dateRange]);
  const filteredTxns = useMemo(() => (transactions ?? []).filter(t => isInRange(t.due_date, dateRange)), [transactions, dateRange]);

  // Sales summary
  const { data: allSales = [] } = useQuery({
    queryKey: ["sales-dashboard-all"],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("amount, created_at, seller_id, origem_venda");
      return data ?? [];
    },
  });

  // Purchases summary
  const { data: allPurchases = [] } = useQuery({
    queryKey: ["purchases-dashboard-all"],
    queryFn: async () => {
      const { data } = await supabase.from("purchases").select("total, discount_amount, purchase_date");
      return data ?? [];
    },
  });

  // Marketing summary
  const { data: allCampaigns = [] } = useQuery({
    queryKey: ["marketing-dashboard-all"],
    queryFn: async () => {
      const { data } = await supabase.from("marketing_campaigns").select("amount_invested, start_date");
      return data ?? [];
    },
  });

  const salesSummary = useMemo(() => {
    const filtered = allSales.filter(s => isInRange(s.created_at, dateRange));
    const totalSold = filtered.reduce((s, sale) => s + Number(sale.amount), 0);
    const uniqueSellers = new Set(filtered.map(s => s.seller_id)).size;
    return { totalSold, count: filtered.length, sellers: uniqueSellers };
  }, [allSales, dateRange]);

  const purchasesSummary = useMemo(() => {
    const filtered = allPurchases.filter(p => isInRange(p.purchase_date, dateRange));
    const totalSpent = filtered.reduce((s, p) => s + Number(p.total), 0);
    const totalDiscount = filtered.reduce((s, p) => s + Number(p.discount_amount ?? 0), 0);
    return { totalSpent, totalDiscount };
  }, [allPurchases, dateRange]);

  const marketingSummary = useMemo(() => {
    const filteredCamps = allCampaigns.filter(c => isInRange(c.start_date, dateRange));
    const totalInvested = filteredCamps.reduce((s, c) => s + Number(c.amount_invested), 0);
    const filteredSales = allSales.filter(s => (s as any).origem_venda === "marketing" && isInRange(s.created_at, dateRange));
    const totalRevenue = filteredSales.reduce((s, sale) => s + Number(sale.amount), 0);
    const roi = totalInvested > 0 ? ((totalRevenue - totalInvested) / totalInvested) * 100 : 0;
    return { totalInvested, totalRevenue, roi };
  }, [allCampaigns, allSales, dateRange]);

  const pendingQuotes = filteredQuotes.filter(q => q.status === "pendente").length;
  const quotesTotal = filteredQuotes.filter(q => q.status === "aprovado").reduce((s, q) => s + Number(q.total), 0);

  const woByStatus = {
    aguardando: filteredWO.filter(w => w.status === "aguardando").length,
    em_producao: filteredWO.filter(w => w.status === "em_producao").length,
    concluido: filteredWO.filter(w => w.status === "concluido").length,
    entregue: filteredWO.filter(w => w.status === "entregue").length,
  };

  const totalReceivable = filteredTxns.filter(t => t.type === "a_receber" && t.status === "pendente").reduce((s, t) => s + Number(t.amount), 0);
  const totalPayable = filteredTxns.filter(t => t.type === "a_pagar" && t.status === "pendente").reduce((s, t) => s + Number(t.amount), 0);
  const totalReceived = filteredTxns.filter(t => t.type === "a_receber" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0);
  const totalPaid = filteredTxns.filter(t => t.type === "a_pagar" && t.status === "pago").reduce((s, t) => s + Number(t.amount), 0);

  const dreResult = useMemo(() => {
    const revenue = filteredQuotes.filter(q => q.status === "aprovado" && isInRange(q.approved_at, dateRange)).reduce((s, q) => s + Number(q.total), 0);
    const expenses = filteredTxns.filter(t => t.type === "a_pagar").reduce((s, t) => s + Number(t.amount), 0);
    const currResult = revenue - expenses;
    return { currResult, variation: 0 };
  }, [filteredQuotes, filteredTxns, dateRange]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const statusLabels: Record<string, string> = {
    aguardando: "Aguardando",
    em_producao: "Em Produção",
    concluido: "Concluído",
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
            <div className="text-2xl font-bold">{pendingQuotes}</div>
            <p className="text-xs text-muted-foreground">Aprovados: {fmt(quotesTotal)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Receber</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{fmt(totalReceivable)}</div>
            <p className="text-xs text-muted-foreground">Recebido: {fmt(totalReceived)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Pagar</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{fmt(totalPayable)}</div>
            <p className="text-xs text-muted-foreground">Pago: {fmt(totalPaid)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Faturamento do Mês</CardTitle>
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Faturado</p>
              <p className="text-lg sm:text-xl font-bold">{fmt(billingData?.totalBilled ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Recebido</p>
              <p className="text-lg sm:text-xl font-bold text-green-600">{fmt(billingOrders?.totalReceived ?? 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Resultado do Mês (DRE)</CardTitle>
          {(dreResult?.currResult ?? 0) >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${(dreResult?.currResult ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
            {fmt(dreResult?.currResult ?? 0)}
          </div>
          <p className="text-xs text-muted-foreground">
            Variação: {(dreResult?.variation ?? 0) > 0 ? "+" : ""}{(dreResult?.variation ?? 0).toFixed(1)}% vs mês anterior
          </p>
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
                { key: "concluido", label: "Finalizado" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm">{label}</span>
                  <Badge variant={key === "em_producao" ? "default" : "secondary"}>
                    {workOrders?.filter(w => w.status === key).length ?? 0}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Vendas do Mês</CardTitle>
          <ShoppingBag className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Total Vendido</p>
              <p className="text-lg sm:text-xl font-bold">{fmt(salesSummary?.totalSold ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Nº de Vendas</p>
              <p className="text-lg sm:text-xl font-bold">{salesSummary?.count ?? 0}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Vendedores Ativos</p>
              <p className="text-lg sm:text-xl font-bold">{salesSummary?.sellers ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Compras do Mês</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(purchasesSummary?.totalSpent ?? 0)}</div>
            <p className="text-xs text-muted-foreground">Economizado: <span className="text-green-600">{fmt(purchasesSummary?.totalDiscount ?? 0)}</span></p>
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
          <CardTitle className="text-sm font-medium">Marketing do Mês</CardTitle>
          <Megaphone className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Investido</p>
              <p className="text-lg sm:text-xl font-bold">{fmt(marketingSummary?.totalInvested ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Vendas Geradas</p>
              <p className="text-lg sm:text-xl font-bold text-green-600">{fmt(marketingSummary?.totalRevenue ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">ROI</p>
              <p className={`text-lg sm:text-xl font-bold ${(marketingSummary?.roi ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                {(marketingSummary?.roi ?? 0).toFixed(1)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
