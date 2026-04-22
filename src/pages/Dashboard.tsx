import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, FileText, ClipboardList, DollarSign, Factory, Receipt,
  TrendingUp, TrendingDown, ShoppingBag, ShoppingCart, Megaphone, Briefcase, AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import MonthFilter, { getDateRange, isInRange, isInRangeOrOpen, type PeriodMode } from "@/components/MonthFilter";
import { localDateString } from "@/lib/utils";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const monthRefOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const Dashboard = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const dateRange = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);
  const monthRef = useMemo(() => monthRefOf(refDate), [refDate]);

  // ─── Realtime: invalida queries do dashboard quando algo muda em qualquer módulo
  useEffect(() => {
    const tables = [
      "quotes", "sales", "work_orders", "production",
      "financial_transactions", "purchases", "marketing_campaigns",
      "employees", "monthly_closings", "salary_payments", "clients",
    ];
    const channel = supabase.channel("dashboard-realtime");
    tables.forEach((t) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      });
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  // ─── CLIENTES
  const { data: clientsCount = 0 } = useQuery({
    queryKey: ["dashboard", "clients-count"],
    queryFn: async () => {
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  // ─── QUOTES (fonte: Vendas Admin + Faturamento + DRE)
  const { data: quotes = [] } = useQuery({
    queryKey: ["dashboard", "quotes"],
    queryFn: async () => {
      const { data } = await supabase.from("quotes").select("id, status, total, approved_at, issue_date, origem_venda");
      return data ?? [];
    },
  });

  // ─── WORK ORDERS (para mapear quote→OS no Faturamento e cards de OS)
  const { data: workOrders = [] } = useQuery({
    queryKey: ["dashboard", "work-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("work_orders").select("id, status, quote_id, material_status");
      return data ?? [];
    },
  });

  // ─── PRODUCTION (Kanban)
  const { data: production = [] } = useQuery({
    queryKey: ["dashboard", "production"],
    queryFn: async () => {
      const { data } = await supabase.from("production").select("id, status");
      return data ?? [];
    },
  });

  // ─── FINANCIAL TRANSACTIONS (fonte única do Financeiro)
  const { data: transactions = [] } = useQuery({
    queryKey: ["dashboard", "financial-transactions"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_transactions")
        .select("id, type, status, amount, due_date, paid_date, category, work_order_id");
      return data ?? [];
    },
  });

  // ─── PURCHASES
  const { data: purchases = [] } = useQuery({
    queryKey: ["dashboard", "purchases"],
    queryFn: async () => {
      const { data } = await supabase.from("purchases")
        .select("id, total, discount_amount, purchase_date, payment_status");
      return data ?? [];
    },
  });

  // ─── MARKETING
  const { data: campaigns = [] } = useQuery({
    queryKey: ["dashboard", "campaigns"],
    queryFn: async () => {
      const { data } = await supabase.from("marketing_campaigns")
        .select("id, amount_invested, start_date, end_date, leads_generated");
      return data ?? [];
    },
  });

  // Vendas com origem marketing (mesma fonte do módulo Marketing)
  const { data: marketingSales = [] } = useQuery({
    queryKey: ["dashboard", "marketing-sales"],
    queryFn: async () => {
      const { data } = await supabase.from("sales")
        .select("id, amount, created_at").eq("origem_venda", "marketing");
      return data ?? [];
    },
  });

  // ─── HR
  const { data: employees = [] } = useQuery({
    queryKey: ["dashboard", "employees"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id, salary").eq("active", true);
      return data ?? [];
    },
  });
  const { data: closings = [] } = useQuery({
    queryKey: ["dashboard", "closings", monthRef],
    queryFn: async () => {
      const { data } = await supabase.from("monthly_closings")
        .select("net_pay, paid").eq("month_ref", monthRef);
      return data ?? [];
    },
  });
  const { data: salaryPayments = [] } = useQuery({
    queryKey: ["dashboard", "salary-payments", monthRef],
    queryFn: async () => {
      const { data } = await supabase.from("salary_payments")
        .select("amount").eq("month_ref", monthRef);
      return data ?? [];
    },
  });

  // ════════════════════════════════════════════════════════════════
  // VENDAS / FATURAMENTO (igual a Vendas Admin + Faturamento)
  // Fonte: quotes aprovados, filtrados por approved_at no período
  // ════════════════════════════════════════════════════════════════
  const approvedInPeriod = useMemo(() => quotes.filter(q =>
    q.status === "aprovado" && isInRange(q.approved_at, dateRange)
  ), [quotes, dateRange]);

  const totalBilled = useMemo(() => approvedInPeriod.reduce((s, q) => s + Number(q.total), 0), [approvedInPeriod]);
  const salesCount = approvedInPeriod.length;
  const ticketMedio = salesCount > 0 ? totalBilled / salesCount : 0;

  // Faturamento: Recebido = soma de transações pagas vinculadas a OS de quotes do período (regime competência)
  const billingMetrics = useMemo(() => {
    // Quotes cujo issue_date está no período (mesma lógica do Billing.tsx)
    const periodQuotes = quotes.filter(q => q.status === "aprovado" && isInRange(q.issue_date, dateRange));
    const billed = periodQuotes.reduce((s, q) => s + Number(q.total), 0);

    // Mapa quote→OS
    const woByQuote = new Map<string, string>();
    workOrders.forEach(w => { if (w.quote_id) woByQuote.set(w.quote_id, w.id); });

    let received = 0;
    periodQuotes.forEach(q => {
      const woId = woByQuote.get(q.id);
      if (!woId) return;
      received += transactions
        .filter(t => t.work_order_id === woId && t.status === "pago")
        .reduce((s, t) => s + Number(t.amount), 0);
    });

    // Em aberto acumulado (todos os quotes não pagos até o fim do período)
    const allApproved = quotes.filter(q => q.status === "aprovado");
    let openAcumulado = 0;
    const periodEnd = dateRange.end;
    allApproved.forEach(q => {
      const issueDate = q.issue_date ? new Date(q.issue_date + "T12:00:00") : null;
      if (!issueDate || issueDate > periodEnd) return;
      const woId = woByQuote.get(q.id);
      const paid = woId ? transactions
        .filter(t => t.work_order_id === woId && t.status === "pago")
        .reduce((s, t) => s + Number(t.amount), 0) : 0;
      const remaining = Math.max(Number(q.total) - paid, 0);
      if (remaining > 0) openAcumulado += remaining;
    });

    return { billed, received, openAcumulado };
  }, [quotes, workOrders, transactions, dateRange]);

  // ════════════════════════════════════════════════════════════════
  // CONTAS A RECEBER / A PAGAR (igual a ContasReceberTab / ContasPagarTab)
  // Acumulado: TODOS os meses em aberto (não filtra por período)
  // ════════════════════════════════════════════════════════════════
  const totalReceivable = useMemo(() => transactions
    .filter(t => t.type === "a_receber" && (t.status === "pendente" || t.status === "atrasado"))
    .reduce((s, t) => s + Number(t.amount), 0), [transactions]);

  const totalPayable = useMemo(() => transactions
    .filter(t => t.type === "a_pagar" && (t.status === "pendente" || t.status === "atrasado"))
    .reduce((s, t) => s + Number(t.amount), 0), [transactions]);

  // ════════════════════════════════════════════════════════════════
  // ENTRADAS / SAÍDAS (igual a EntradasTab / SaidasTab)
  // Filtro: status=pago, refDate=paid_date ?? due_date, dentro do período e ≤ hoje
  // ════════════════════════════════════════════════════════════════
  const today = localDateString();
  const totalEntradas = useMemo(() => transactions
    .filter(t => {
      if (t.type !== "a_receber" || t.status !== "pago") return false;
      const ref = t.paid_date ?? t.due_date;
      if (ref > today) return false;
      return isInRange(ref, dateRange);
    })
    .reduce((s, t) => s + Number(t.amount), 0), [transactions, dateRange, today]);

  const totalSaidas = useMemo(() => transactions
    .filter(t => {
      if (t.type !== "a_pagar" || t.status !== "pago") return false;
      const ref = t.paid_date ?? t.due_date;
      if (ref > today) return false;
      return isInRange(ref, dateRange);
    })
    .reduce((s, t) => s + Number(t.amount), 0), [transactions, dateRange, today]);

  const saldoCaixa = totalEntradas - totalSaidas;

  // ════════════════════════════════════════════════════════════════
  // ORDENS DE SERVIÇO (igual ao módulo OS)
  // Aguardando Material = work_orders com material_status='solicitado' (ainda não comprado)
  // ════════════════════════════════════════════════════════════════
  const woSummary = useMemo(() => ({
    aguardando: workOrders.filter(w => w.status === "aguardando").length,
    em_producao: workOrders.filter(w => w.status === "em_producao").length,
    aguardando_material: workOrders.filter(w => w.material_status === "solicitado").length,
    aguardando_instalacao: workOrders.filter(w => w.status === "aguardando_instalacao").length,
    entregue: workOrders.filter(w => w.status === "entregue").length,
  }), [workOrders]);

  // ════════════════════════════════════════════════════════════════
  // PRODUÇÃO (igual ao Kanban)
  // ════════════════════════════════════════════════════════════════
  const prodSummary = useMemo(() => ({
    fila: production.filter(p => p.status === "Fila de Produção").length,
    andamento: production.filter(p => p.status === "Em Andamento").length,
    aguardando_material: production.filter(p => p.status === "Aguardando Material").length,
    aguardando_instalacao: production.filter(p => p.status === "Aguardando Instalação").length,
  }), [production]);

  // ════════════════════════════════════════════════════════════════
  // COMPRAS (igual ao módulo Purchases)
  // monthPurchases = isInRangeOrOpen(purchase_date, dateRange, isOpen, paidDate)
  // ════════════════════════════════════════════════════════════════
  const purchasesMetrics = useMemo(() => {
    const monthPurchases = purchases.filter(p => {
      const isOpen = p.payment_status !== "pago";
      return isInRangeOrOpen(
        p.purchase_date, dateRange, isOpen,
        p.payment_status === "pago" ? p.purchase_date : null
      );
    });
    const totalSpent = monthPurchases.reduce((s, p) => s + Number(p.total), 0);
    const totalSaved = monthPurchases.reduce((s, p) => s + Number(p.discount_amount ?? 0), 0);
    return { totalSpent, totalSaved, count: monthPurchases.length };
  }, [purchases, dateRange]);

  // ════════════════════════════════════════════════════════════════
  // MARKETING (igual ao módulo Marketing)
  // ════════════════════════════════════════════════════════════════
  const marketingMetrics = useMemo(() => {
    const rangeStart = localDateString(dateRange.start);
    const rangeEnd = localDateString(dateRange.end);

    const periodCampaigns = campaigns.filter(c => {
      const cStart = c.start_date;
      const cEnd = c.end_date || c.start_date;
      return cStart <= rangeEnd && cEnd >= rangeStart;
    });
    const invested = periodCampaigns.reduce((s, c) => s + Number(c.amount_invested), 0);

    // Vendas marketing no período (mesma fonte: tabela sales + filtro por created_at)
    const periodSales = marketingSales.filter(s => isInRange(s.created_at, dateRange));
    const revenue = periodSales.reduce((s, sale) => s + Number(sale.amount), 0);
    const roi = invested > 0 ? ((revenue - invested) / invested) * 100 : 0;
    return { invested, revenue, roi, salesCount: periodSales.length };
  }, [campaigns, marketingSales, dateRange]);

  // ════════════════════════════════════════════════════════════════
  // RH (igual ao módulo HR)
  // Folha do mês = soma do net_pay dos closings do mês de referência
  // ════════════════════════════════════════════════════════════════
  const hrMetrics = useMemo(() => {
    const folha = closings.reduce((s, c) => s + Number(c.net_pay), 0);
    const pago = salaryPayments.reduce((s, p) => s + Number(p.amount), 0);
    return { folha, pago, employeesCount: employees.length };
  }, [closings, salaryPayments, employees]);

  // ─── DRE simplificado
  const dreResult = useMemo(() => {
    const expenses = transactions
      .filter(t => t.type === "a_pagar" && isInRange(t.due_date, dateRange))
      .reduce((s, t) => s + Number(t.amount), 0);
    return totalBilled - expenses;
  }, [totalBilled, transactions, dateRange]);

  // ─── Navegação por card
  const goTo = (path: string) => navigate(path);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
        <MonthFilter
          refDate={refDate}
          onRefDateChange={setRefDate}
          periodMode={periodMode}
          onPeriodModeChange={setPeriodMode}
        />
      </div>

      {/* ROW 1 — KPIs principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card onClick={() => goTo("/clientes")} className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientsCount}</div>
            <p className="text-xs text-muted-foreground">Total cadastrado</p>
          </CardContent>
        </Card>

        <Card onClick={() => goTo("/vendas")} className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vendas do Período</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(totalBilled)}</div>
            <p className="text-xs text-muted-foreground">{salesCount} vendas · Ticket {fmt(ticketMedio)}</p>
          </CardContent>
        </Card>

        <Card onClick={() => goTo("/financeiro")} className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Receber</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{fmt(totalReceivable)}</div>
            <p className="text-xs text-muted-foreground">Acumulado de todos os meses</p>
          </CardContent>
        </Card>

        <Card onClick={() => goTo("/financeiro")} className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">A Pagar</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{fmt(totalPayable)}</div>
            <p className="text-xs text-muted-foreground">Acumulado de todos os meses</p>
          </CardContent>
        </Card>
      </div>

      {/* ROW 2 — Faturamento + DRE */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card onClick={() => goTo("/faturamento")} className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Faturamento do Período</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Faturado</p>
                <p className="text-lg sm:text-xl font-bold">{fmt(billingMetrics.billed)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recebido</p>
                <p className="text-lg sm:text-xl font-bold text-green-600">{fmt(billingMetrics.received)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Em Aberto</p>
                <p className="text-lg sm:text-xl font-bold text-yellow-600">{fmt(billingMetrics.openAcumulado)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card onClick={() => goTo("/dre")} className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Resultado do Período (DRE)</CardTitle>
            {dreResult >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${dreResult >= 0 ? "text-green-600" : "text-red-600"}`}>
              {fmt(dreResult)}
            </div>
            <p className="text-xs text-muted-foreground">Receita - Despesas (regime competência)</p>
          </CardContent>
        </Card>
      </div>

      {/* ROW 3 — OS + Produção */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card onClick={() => goTo("/ordens")} className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4" /> Ordens de Serviço
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between"><span className="text-sm">Aguardando</span><Badge variant="secondary">{woSummary.aguardando}</Badge></div>
              <div className="flex items-center justify-between"><span className="text-sm">Em Produção</span><Badge>{woSummary.em_producao}</Badge></div>
              <div className="flex items-center justify-between"><span className="text-sm">Aguardando Material</span><Badge variant="secondary">{woSummary.aguardando_material}</Badge></div>
              <div className="flex items-center justify-between"><span className="text-sm">Aguardando Instalação</span><Badge variant="secondary">{woSummary.aguardando_instalacao}</Badge></div>
              <div className="flex items-center justify-between"><span className="text-sm">Entregue</span><Badge variant="secondary">{woSummary.entregue}</Badge></div>
            </div>
          </CardContent>
        </Card>

        <Card onClick={() => goTo("/producao")} className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Factory className="h-4 w-4" /> Produção (Kanban)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between"><span className="text-sm">Fila de Produção</span><Badge variant="secondary">{prodSummary.fila}</Badge></div>
              <div className="flex items-center justify-between"><span className="text-sm">Em Andamento</span><Badge>{prodSummary.andamento}</Badge></div>
              <div className="flex items-center justify-between"><span className="text-sm">Aguardando Material</span><Badge variant="secondary">{prodSummary.aguardando_material}</Badge></div>
              <div className="flex items-center justify-between"><span className="text-sm">Aguardando Instalação</span><Badge variant="secondary">{prodSummary.aguardando_instalacao}</Badge></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROW 4 — Compras + RH */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card onClick={() => goTo("/compras")} className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Compras do Período</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Total Gasto</p>
                <p className="text-lg sm:text-xl font-bold">{fmt(purchasesMetrics.totalSpent)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Economizado</p>
                <p className="text-lg sm:text-xl font-bold text-green-600">{fmt(purchasesMetrics.totalSaved)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Compras</p>
                <p className="text-lg sm:text-xl font-bold">{purchasesMetrics.count}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card onClick={() => goTo("/rh")} className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Recursos Humanos</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Folha do Mês</p>
                <p className="text-lg sm:text-xl font-bold">{fmt(hrMetrics.folha)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pago no Mês</p>
                <p className="text-lg sm:text-xl font-bold text-green-600">{fmt(hrMetrics.pago)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Funcionários</p>
                <p className="text-lg sm:text-xl font-bold">{hrMetrics.employeesCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROW 5 — Marketing + Fluxo de Caixa */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card onClick={() => goTo("/marketing")} className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Marketing do Período</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Investido</p>
                <p className="text-lg sm:text-xl font-bold">{fmt(marketingMetrics.invested)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vendas Geradas</p>
                <p className="text-lg sm:text-xl font-bold text-green-600">{fmt(marketingMetrics.revenue)}</p>
                <p className="text-[10px] text-muted-foreground">{marketingMetrics.salesCount} vendas</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ROI</p>
                <p className={`text-lg sm:text-xl font-bold ${marketingMetrics.roi >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {marketingMetrics.roi.toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card onClick={() => goTo("/financeiro")} className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4" /> Fluxo de Caixa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Entradas</p>
                <p className="text-lg sm:text-xl font-bold text-green-600">{fmt(totalEntradas)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saídas</p>
                <p className="text-lg sm:text-xl font-bold text-red-600">{fmt(totalSaidas)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className={`text-lg sm:text-xl font-bold ${saldoCaixa >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmt(saldoCaixa)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
