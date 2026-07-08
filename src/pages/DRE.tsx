import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Download, TrendingUp, TrendingDown } from "lucide-react";

type PeriodType = "month" | "quarter" | "year";

const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const getMonthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const getMonthLabel = (key: string) => {
  const [y, m] = key.split("-");
  return `${monthNames[parseInt(m) - 1]}/${y}`;
};

const DRE = () => {
  const now = new Date();
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(now));
  const [compareMonth, setCompareMonth] = useState("");

  // Fetch approved quotes (revenue source by approved_at date)
  const { data: approvedQuotes = [] } = useQuery({
    queryKey: ["dre-approved-quotes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("id, total, approved_at, issue_date, payment_status, down_payment, remaining_amount")
        .eq("status", "aprovado");
      return data ?? [];
    },
  });

  // Financial transactions (deductions, admin expenses, payments received)
  const { data: transactions = [] } = useQuery({
    queryKey: ["dre-transactions"],
    queryFn: async () => {
      const { data } = await supabase.from("financial_transactions").select("*");
      return data ?? [];
    },
  });

  // Monthly closings (personnel expenses)
  const { data: closings = [] } = useQuery({
    queryKey: ["dre-closings"],
    queryFn: async () => {
      const { data } = await supabase.from("monthly_closings").select("*");
      return data ?? [];
    },
  });

  // Employee overtime, saturdays (extra personnel data)
  const { data: overtime = [] } = useQuery({
    queryKey: ["dre-overtime"],
    queryFn: async () => {
      const { data } = await supabase.from("employee_overtime").select("month_ref, calculated_value");
      return data ?? [];
    },
  });

  const { data: saturdays = [] } = useQuery({
    queryKey: ["dre-saturdays"],
    queryFn: async () => {
      const { data } = await supabase.from("employee_saturdays").select("month_ref, calculated_value");
      return data ?? [];
    },
  });

  // 13th salary provisions
  const { data: thirteenth = [] } = useQuery({
    queryKey: ["dre-thirteenth"],
    queryFn: async () => {
      const { data } = await supabase.from("thirteenth_salary").select("*");
      return data ?? [];
    },
  });

  // Employee vacations
  const { data: vacations = [] } = useQuery({
    queryKey: ["dre-vacations"],
    queryFn: async () => {
      const { data } = await supabase.from("employee_vacations").select("start_date, total_value");
      return data ?? [];
    },
  });

  // Purchases data (for discount info only)
  const { data: purchasesData = [] } = useQuery({
    queryKey: ["dre-purchases"],
    queryFn: async () => {
      const { data } = await supabase.from("purchases").select("purchase_date, total, discount_amount");
      return data ?? [];
    },
  });

  // Generate month options (last 24 months)
  const monthOptions = useMemo(() => {
    const opts: { key: string; label: string }[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({ key: getMonthKey(d), label: getMonthLabel(getMonthKey(d)) });
    }
    return opts;
  }, []);

  // Calculate DRE for a given month key
  const calcDRE = (monthKey: string) => {
    const [year, month] = monthKey.split("-").map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const inMonth = (dateStr: string | null) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return d >= start && d <= end;
    };

    // Revenue: approved quotes by issue_date (competência)
    const monthQuotes = approvedQuotes.filter((q: any) => inMonth(q.issue_date));
    const receitaBruta = monthQuotes.reduce((s: number, q: any) => s + Number(q.total), 0);

    // Deductions: cancelled transactions in the period
    const deducoes = transactions
      .filter((t) => t.type === "a_receber" && t.status === "cancelado" && inMonth(t.due_date))
      .reduce((s, t) => s + Number(t.amount), 0);

    const receitaLiquida = receitaBruta - deducoes;

    // Operational costs: "a_pagar" transactions with material/service/compras categories
    // Source: financial_transactions (single source of truth — purchases create transactions automatically)
    const custosOp = transactions
      .filter((t) => {
        if (t.type !== "a_pagar") return false;
        if (!inMonth(t.due_date)) return false;
        const cat = (t.category ?? "").toLowerCase();
        return cat.includes("material") || cat.includes("serviço") || cat.includes("servico") || cat.includes("terceiriz") || cat.includes("compras");
      })
      .reduce((s, t) => s + Number(t.amount), 0);

    // Personnel expenses from monthly closings
    const monthClosings = closings.filter((c) => c.month_ref === monthKey);
    const folha = monthClosings.reduce((s, c) => s + Number(c.net_pay), 0);

    // Overtime and saturdays for the month
    const otValue = overtime.filter((o) => o.month_ref === monthKey).reduce((s, o) => s + Number(o.calculated_value), 0);
    const satValue = saturdays.filter((s_) => s_.month_ref === monthKey).reduce((s, s_) => s + Number(s_.calculated_value), 0);

    // 13th salary monthly provision
    const thirteenthProv = thirteenth
      .filter((t) => t.year === year)
      .reduce((s, t) => s + Number(t.monthly_provision), 0);

    // Vacations in the month
    const vacValue = vacations.filter((v) => inMonth(v.start_date)).reduce((s, v) => s + Number(v.total_value), 0);

    const despPessoal = folha + otValue + satValue + thirteenthProv + vacValue;

    // Purchases discount info (from purchases table for discount tracking only)
    const monthPurchases = purchasesData.filter((p: any) => inMonth(p.purchase_date));
    const custosCompras = custosOp; // Already included in custosOp from financial_transactions
    const descontosCompras = monthPurchases.reduce((s: number, p: any) => s + Number(p.discount_amount ?? 0), 0);

    // Admin expenses: other "a_pagar" not in operational costs and NOT payroll
    // (payroll is already counted via monthly_closings under despPessoal — regime de competência)
    const despAdmin = transactions
      .filter((t) => {
        if (t.type !== "a_pagar") return false;
        if (!inMonth(t.due_date)) return false;
        const cat = (t.category ?? "").toLowerCase();
        if (cat.includes("material") || cat.includes("serviço") || cat.includes("servico") || cat.includes("terceiriz") || cat.includes("compras")) return false;
        if (cat.includes("folha") || cat.includes("salário") || cat.includes("salario")) return false;
        return true;
      })
      .reduce((s, t) => s + Number(t.amount), 0);

    const totalCustosOp = custosOp;
    const resultadoOp = receitaLiquida - totalCustosOp - despPessoal - despAdmin + descontosCompras;
    const resultadoFinal = resultadoOp;

    return {
      monthKey,
      label: getMonthLabel(monthKey),
      receitaBruta,
      deducoes,
      receitaLiquida,
      custosOp: totalCustosOp,
      custosCompras,
      descontosCompras,
      despPessoal,
      despAdmin,
      resultadoOp,
      resultadoFinal,
      details: { folha, otValue, satValue, thirteenthProv, vacValue },
    };
  };

  // Get months for the selected period
  const getMonthsForPeriod = (monthKey: string, type: PeriodType): string[] => {
    const [year, month] = monthKey.split("-").map(Number);
    if (type === "month") return [monthKey];
    if (type === "quarter") {
      const qStart = Math.floor((month - 1) / 3) * 3 + 1;
      return [1, 2, 3].map((i) => `${year}-${String(qStart + i - 1).padStart(2, "0")}`);
    }
    return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  };

  const periodMonths = getMonthsForPeriod(selectedMonth, periodType);
  const periodDREs = periodMonths.map(calcDRE);
  const aggregated = periodDREs.reduce(
    (acc, d) => ({
      receitaBruta: acc.receitaBruta + d.receitaBruta,
      deducoes: acc.deducoes + d.deducoes,
      receitaLiquida: acc.receitaLiquida + d.receitaLiquida,
      custosOp: acc.custosOp + d.custosOp,
      custosCompras: acc.custosCompras + d.custosCompras,
      descontosCompras: acc.descontosCompras + d.descontosCompras,
      despPessoal: acc.despPessoal + d.despPessoal,
      despAdmin: acc.despAdmin + d.despAdmin,
      resultadoOp: acc.resultadoOp + d.resultadoOp,
      resultadoFinal: acc.resultadoFinal + d.resultadoFinal,
    }),
    { receitaBruta: 0, deducoes: 0, receitaLiquida: 0, custosOp: 0, custosCompras: 0, descontosCompras: 0, despPessoal: 0, despAdmin: 0, resultadoOp: 0, resultadoFinal: 0 }
  );

  // Comparison period
  const compareDRE = compareMonth
    ? getMonthsForPeriod(compareMonth, periodType).map(calcDRE).reduce(
        (acc, d) => ({
          receitaBruta: acc.receitaBruta + d.receitaBruta,
          deducoes: acc.deducoes + d.deducoes,
          receitaLiquida: acc.receitaLiquida + d.receitaLiquida,
          custosOp: acc.custosOp + d.custosOp,
          custosCompras: acc.custosCompras + d.custosCompras,
          descontosCompras: acc.descontosCompras + d.descontosCompras,
          despPessoal: acc.despPessoal + d.despPessoal,
          despAdmin: acc.despAdmin + d.despAdmin,
          resultadoOp: acc.resultadoOp + d.resultadoOp,
          resultadoFinal: acc.resultadoFinal + d.resultadoFinal,
        }),
        { receitaBruta: 0, deducoes: 0, receitaLiquida: 0, custosOp: 0, custosCompras: 0, descontosCompras: 0, despPessoal: 0, despAdmin: 0, resultadoOp: 0, resultadoFinal: 0 }
      )
    : null;

  // Chart data: last 6 months
  const chartData = useMemo(() => {
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(getMonthKey(d));
    }
    return months.map((mk) => {
      const dre = calcDRE(mk);
      return {
        name: dre.label,
        Receita: dre.receitaLiquida,
        Custos: dre.custosOp + dre.despPessoal + dre.despAdmin,
        Resultado: dre.resultadoFinal,
      };
    });
  }, [approvedQuotes, transactions, closings, overtime, saturdays, thirteenth, vacations, purchasesData]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (curr: number, prev: number) => (prev === 0 ? 0 : ((curr - prev) / Math.abs(prev)) * 100);

  const dreLines = [
    { label: "Receita Bruta", key: "receitaBruta" as const, bold: true, indent: 0 },
    { label: "(-) Deduções", key: "deducoes" as const, bold: false, indent: 1 },
    { label: "= Receita Líquida", key: "receitaLiquida" as const, bold: true, indent: 0 },
    { label: "(-) Custos Operacionais", key: "custosOp" as const, bold: false, indent: 1 },
    { label: "   Compras", key: "custosCompras" as const, bold: false, indent: 2 },
    { label: "   (+) Descontos em Compras", key: "descontosCompras" as const, bold: false, indent: 2 },
    { label: "(-) Despesas com Pessoal", key: "despPessoal" as const, bold: false, indent: 1 },
    { label: "(-) Despesas Administrativas", key: "despAdmin" as const, bold: false, indent: 1 },
    { label: "= Resultado Operacional", key: "resultadoOp" as const, bold: true, indent: 0 },
    { label: "= Resultado Final", key: "resultadoFinal" as const, bold: true, indent: 0, highlight: true },
  ];

  // Export CSV
  const exportCSV = () => {
    const header = compareMonth
      ? `Linha;Período Atual;Período Comparação;Variação %`
      : `Linha;Valor`;
    const rows = dreLines.map((l) => {
      const val = aggregated[l.key];
      if (compareDRE) {
        const cVal = compareDRE[l.key];
        return `${l.label};${val.toFixed(2)};${cVal.toFixed(2)};${pct(val, cVal).toFixed(1)}%`;
      }
      return `${l.label};${val.toFixed(2)}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DRE_${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export PDF (simple print-based)
  const exportPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">DRE - Demonstrativo de Resultado</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 print:hidden">
        <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mensal</SelectItem>
            <SelectItem value="quarter">Trimestral</SelectItem>
            <SelectItem value="year">Anual</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map((o) => (
              <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={compareMonth || "none"} onValueChange={(v) => setCompareMonth(v === "none" ? "" : v)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Comparar com..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem comparação</SelectItem>
            {monthOptions.map((o) => (
              <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Result indicator */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {aggregated.resultadoFinal >= 0 ? (
              <TrendingUp className="h-8 w-8 text-green-600" />
            ) : (
              <TrendingDown className="h-8 w-8 text-red-600" />
            )}
            <div>
              <p className="text-sm text-muted-foreground">Resultado do Período</p>
              <p className={`text-3xl font-bold ${aggregated.resultadoFinal >= 0 ? "text-green-600" : "text-red-600"}`}>
                {fmt(aggregated.resultadoFinal)}
              </p>
            </div>
            <Badge variant={aggregated.resultadoFinal >= 0 ? "default" : "destructive"} className="ml-auto text-base px-4 py-1">
              {aggregated.resultadoFinal >= 0 ? "LUCRO" : "PREJUÍZO"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* DRE Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Demonstrativo de Resultado</CardTitle></CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Período Atual</TableHead>
                  {compareDRE && <TableHead className="text-right">Período Anterior</TableHead>}
                  {compareDRE && <TableHead className="text-right">Variação</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dreLines.map((line) => {
                  const val = aggregated[line.key];
                  const cVal = compareDRE?.[line.key];
                  const variation = cVal !== undefined ? pct(val, cVal) : null;
                  return (
                    <TableRow key={line.key} className={line.highlight ? "bg-muted/50" : ""}>
                      <TableCell className={`${line.bold ? "font-bold" : ""}`} style={{ paddingLeft: `${1 + line.indent * 1.5}rem` }}>
                        {line.label}
                      </TableCell>
                      <TableCell className={`text-right ${line.bold ? "font-bold" : ""} ${line.highlight ? (val >= 0 ? "text-green-600" : "text-red-600") : ""}`}>
                        {fmt(val)}
                      </TableCell>
                      {compareDRE && (
                        <TableCell className="text-right">{cVal !== undefined ? fmt(cVal) : "—"}</TableCell>
                      )}
                      {compareDRE && (
                        <TableCell className={`text-right ${variation !== null && variation > 0 ? "text-green-600" : variation !== null && variation < 0 ? "text-red-600" : ""}`}>
                          {variation !== null ? `${variation > 0 ? "+" : ""}${variation.toFixed(1)}%` : "—"}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="print:hidden">
        <CardHeader><CardTitle className="text-base">Receita x Custos x Resultado (últimos 6 meses)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="Receita" fill="hsl(142, 71%, 45%)" />
                <Bar dataKey="Custos" fill="hsl(0, 84%, 60%)" />
                <Bar dataKey="Resultado" fill="hsl(217, 91%, 60%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DRE;
