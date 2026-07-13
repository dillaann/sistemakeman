import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import { Download, TrendingUp, TrendingDown, FileText, FileSpreadsheet, ArrowUp, ArrowDown, Minus } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import MonthFilter, { getDateRange, type PeriodMode } from "@/components/MonthFilter";
import {
  calcDRE, DRE_LINES, previousPeriodRange, sameLastYearRange,
  type DRESources, type DREResult,
} from "@/lib/dre";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtCompact = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);
const variation = (curr: number, prev: number) =>
  prev === 0 ? (curr === 0 ? 0 : 100) : ((curr - prev) / Math.abs(prev)) * 100;

type CompareMode = "none" | "prev" | "yoy";

const DRE = () => {
  const [refDate, setRefDate] = useState(new Date());
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [compareMode, setCompareMode] = useState<CompareMode>("prev");

  const { data: quotes = [] } = useQuery({
    queryKey: ["dre-quotes"],
    queryFn: async () =>
      fetchAllRows<any>(() => supabase.from("quotes").select("total, issue_date, status")),
  });
  const { data: transactions = [] } = useQuery({
    queryKey: ["dre-transactions"],
    queryFn: async () =>
      fetchAllRows<any>(() =>
        supabase.from("financial_transactions").select("type, status, amount, category, due_date, paid_date"),
      ),
  });
  const { data: closings = [] } = useQuery({
    queryKey: ["dre-closings"],
    queryFn: async () => {
      const { data } = await supabase.from("monthly_closings").select("net_pay, month_ref");
      return data ?? [];
    },
  });
  const { data: commissions = [] } = useQuery({
    queryKey: ["dre-commissions"],
    queryFn: async () => {
      const { data } = await supabase.from("sales_commissions").select("amount, status, created_at");
      return data ?? [];
    },
  });
  const { data: campaigns = [] } = useQuery({
    queryKey: ["dre-campaigns"],
    queryFn: async () => {
      const { data } = await supabase.from("marketing_campaigns").select("amount_invested, start_date, end_date");
      return data ?? [];
    },
  });

  const sources: DRESources = useMemo(
    () => ({ quotes, transactions, closings, commissions, campaigns }),
    [quotes, transactions, closings, commissions, campaigns],
  );

  const range = useMemo(() => getDateRange(refDate, periodMode), [refDate, periodMode]);
  const current = useMemo(() => calcDRE(sources, range), [sources, range]);

  const { compareResult, compareLabel } = useMemo(() => {
    if (compareMode === "none") return { compareResult: null as DREResult | null, compareLabel: "" };
    const { range: cmpRange, refDate: cmpRef } =
      compareMode === "prev" ? previousPeriodRange(refDate, periodMode) : sameLastYearRange(refDate, periodMode);
    return {
      compareResult: calcDRE(sources, cmpRange),
      compareLabel:
        periodMode === "ano"
          ? `${cmpRef.getFullYear()}`
          : `${MONTH_LABELS[cmpRef.getMonth()]}/${cmpRef.getFullYear()}`,
    };
  }, [compareMode, sources, refDate, periodMode]);

  // Monthly series: 6 months ending at the selected reference month
  const monthlySeries = useMemo(() => {
    const out: Array<{ name: string; Receita: number; Custos: number; Despesas: number; Resultado: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
      const r = getDateRange(d, "month");
      const dre = calcDRE(sources, r);
      out.push({
        name: `${MONTH_LABELS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        Receita: Math.round(dre.receitaLiquida),
        Custos: Math.round(dre.csp),
        Despesas: Math.round(dre.totalDespOp),
        Resultado: Math.round(dre.resultadoLiquido),
      });
    }
    return out;
  }, [sources, refDate]);

  const lucro = current.resultadoLiquido >= 0;

  // ---- Exports ----
  const periodLabel = useMemo(() => {
    const base =
      periodMode === "ano"
        ? `${refDate.getFullYear()}`
        : `${MONTH_LABELS[refDate.getMonth()]}/${refDate.getFullYear()}`;
    return base;
  }, [refDate, periodMode]);

  const buildRows = () =>
    DRE_LINES.map((l) => {
      const val = current[l.key];
      const pct = current.receitaBruta ? (val / current.receitaBruta) * 100 : 0;
      const prev = compareResult ? compareResult[l.key] : null;
      const varPct = prev !== null ? variation(val, prev) : null;
      return { l, val, pct, prev, varPct };
    });

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("DRE - Demonstrativo de Resultado do Exercício", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Período: ${periodLabel}${compareResult ? `  •  Comparação: ${compareLabel}` : ""}`, 14, 25);

    const head = compareResult
      ? [["Conta", "Valor", "% Rec. Bruta", `Ant. (${compareLabel})`, "Variação"]]
      : [["Conta", "Valor", "% Rec. Bruta"]];
    const body = buildRows().map(({ l, val, pct, prev, varPct }) =>
      compareResult
        ? [l.label, fmt(val), `${pct.toFixed(1)}%`, prev !== null ? fmt(prev) : "—", varPct !== null ? `${varPct.toFixed(1)}%` : "—"]
        : [l.label, fmt(val), `${pct.toFixed(1)}%`],
    );

    autoTable(doc, {
      head,
      body,
      startY: 32,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
      didParseCell: (data) => {
        if (data.section === "body") {
          const line = DRE_LINES[data.row.index];
          if (line && (line.kind === "subtotal" || line.kind === "total" || line.kind === "final")) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [241, 245, 249];
          }
        }
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setTextColor(lucro ? 22 : 200, lucro ? 130 : 30, lucro ? 60 : 30);
    doc.text(
      `Resultado Líquido do Período: ${fmt(current.resultadoLiquido)} (${lucro ? "LUCRO" : "PREJUÍZO"})`,
      14,
      finalY,
    );
    doc.save(`DRE_${periodLabel.replace("/", "-")}.pdf`);
  };

  const exportExcel = () => {
    const rows = buildRows().map(({ l, val, pct, prev, varPct }) => {
      const base: Record<string, any> = {
        Conta: l.label,
        Valor: Number(val.toFixed(2)),
        "% Receita Bruta": Number(pct.toFixed(1)),
      };
      if (compareResult) {
        base[`Anterior (${compareLabel})`] = prev !== null ? Number(prev.toFixed(2)) : "";
        base["Variação %"] = varPct !== null ? Number(varPct.toFixed(1)) : "";
      }
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 36 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DRE");
    XLSX.writeFile(wb, `DRE_${periodLabel.replace("/", "-")}.xlsx`);
  };

  const rowClass = (kind: string) => {
    if (kind === "final") return "bg-primary/10 font-bold text-base";
    if (kind === "subtotal" || kind === "total") return "bg-muted/60 font-semibold";
    return "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">DRE — Demonstrativo de Resultado</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPDF}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <MonthFilter refDate={refDate} onRefDateChange={setRefDate} periodMode={periodMode} onPeriodModeChange={setPeriodMode} />
        <Select value={compareMode} onValueChange={(v) => setCompareMode(v as CompareMode)}>
          <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem comparação</SelectItem>
            <SelectItem value="prev">Comparar com período anterior</SelectItem>
            <SelectItem value="yoy">Comparar com ano anterior</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Result indicator */}
      <Card className={lucro ? "border-green-500/30" : "border-red-500/30"}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {lucro ? <TrendingUp className="h-10 w-10 text-green-600" /> : <TrendingDown className="h-10 w-10 text-red-600" />}
            <div>
              <p className="text-sm text-muted-foreground">Resultado Líquido do Período</p>
              <p className={`text-4xl font-bold ${lucro ? "text-green-600" : "text-red-600"}`}>
                {fmt(current.resultadoLiquido)}
              </p>
              {compareResult && (
                <p className="text-xs text-muted-foreground mt-1">
                  {(() => {
                    const v = variation(current.resultadoLiquido, compareResult.resultadoLiquido);
                    return `${v >= 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(1)}% vs ${compareLabel}`;
                  })()}
                </p>
              )}
            </div>
            <Badge variant={lucro ? "default" : "destructive"} className="ml-auto text-base px-4 py-1">
              {lucro ? "LUCRO" : "PREJUÍZO"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* DRE Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Demonstrativo — {periodLabel}</CardTitle></CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">% Rec. Bruta</TableHead>
                  {compareResult && <TableHead className="text-right hidden md:table-cell">Anterior ({compareLabel})</TableHead>}
                  {compareResult && <TableHead className="text-right">Variação</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {buildRows().map(({ l, val, pct, prev, varPct }) => (
                  <TableRow key={l.key} className={rowClass(l.kind)}>
                    <TableCell style={{ paddingLeft: `${1 + (l.indent ?? 0) * 1.5}rem` }}>{l.label}</TableCell>
                    <TableCell className={`text-right tabular-nums ${l.kind === "final" ? (val >= 0 ? "text-green-600" : "text-red-600") : ""}`}>
                      {fmt(val)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden sm:table-cell text-muted-foreground">
                      {pct.toFixed(1)}%
                    </TableCell>
                    {compareResult && (
                      <TableCell className="text-right tabular-nums hidden md:table-cell text-muted-foreground">
                        {prev !== null ? fmt(prev) : "—"}
                      </TableCell>
                    )}
                    {compareResult && (
                      <TableCell className="text-right tabular-nums">
                        {varPct !== null ? (
                          <span className={`inline-flex items-center gap-0.5 ${varPct > 0 ? "text-green-600" : varPct < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                            {varPct > 0 ? <ArrowUp className="h-3 w-3" /> : varPct < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {Math.abs(varPct).toFixed(1)}%
                          </span>
                        ) : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Receita × Custos × Despesas × Resultado</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlySeries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={fmtCompact} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Custos" stackId="gastos" fill="#f59e0b" />
                <Bar dataKey="Despesas" stackId="gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Resultado" radius={[4, 4, 0, 0]}>
                  {monthlySeries.map((e, i) => (
                    <Cell key={i} fill={e.Resultado >= 0 ? "#16a34a" : "#dc2626"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Evolução do Resultado Líquido</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlySeries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={fmtCompact} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Line type="monotone" dataKey="Resultado" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DRE;
