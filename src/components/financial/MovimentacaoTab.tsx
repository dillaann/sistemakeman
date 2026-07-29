import { formatDateBR, localDateString, parseLocalDate } from "@/lib/utils";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Download } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import FinancialReportDialog from "./FinancialReportDialog";
import CategoriasManager from "./CategoriasManager";
import { useAuth } from "@/contexts/AuthContext";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type PeriodPreset = "month" | "3months" | "year" | "custom";

interface MovimentacaoTabProps {
  dateRange?: { start: Date; end: Date };
}

export default function MovimentacaoTab({ dateRange: parentDateRange }: MovimentacaoTabProps) {
  const { userRole } = useAuth();
  const now = new Date();
  // Período ÚNICO controlado pelo filtro do topo da página (MonthFilter).
  // Garante que Visão Geral e Despesas x Receitas usem exatamente o mesmo intervalo,
  // eliminando divergências de total entre as abas.
  const dateFrom = localDateString(parentDateRange?.start ?? startOfMonth(now));
  const dateTo = localDateString(parentDateRange?.end ?? endOfMonth(now));

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-lookup"],
    queryFn: async () => { const { data } = await supabase.from("clients").select("id, name"); return data ?? []; },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["financial-movimentacao", dateFrom, dateTo],
    queryFn: async () => {
      // Visão Geral uses paid_date for paid transactions (cash basis).
      // Filter by date on the SERVER to avoid the 1000-row response cap.
      const data = await fetchAllRows<any>(() =>
        supabase.from("financial_transactions").select("*")
          .neq("status", "cancelado")
          .or(`and(paid_date.gte.${dateFrom},paid_date.lte.${dateTo}),and(paid_date.is.null,due_date.gte.${dateFrom},due_date.lte.${dateTo})`)
          .order("due_date", { ascending: true })
      );
      // Re-confirm cash-basis window client-side
      return data.filter(t => {
        const refDate = t.status === "pago" ? (t.paid_date || t.due_date) : t.due_date;
        return refDate >= dateFrom && refDate <= dateTo;
      });
    },
  });

  // Sincronizado com as abas Entradas/Saídas (regime de caixa):
  // - Conta APENAS transações pagas (status "pago")
  // - Entradas: exigem paid_date e excluem competência legada trazida para abril
  // - Saídas: ignoram registros marcados como exclude_from_totals
  const LEGACY_COMPETENCE_CUTOFF = "2026-04-01";
  const isLegacyCompetenceCarriedToApril = (t: any) =>
    Boolean(t.due_date && t.paid_date && t.due_date < LEGACY_COMPETENCE_CUTOFF && t.paid_date >= LEGACY_COMPETENCE_CUTOFF && t.paid_date < "2026-05-01");

  const paidTx = useMemo(
    () =>
      transactions.filter(t => {
        if (t.status !== "pago") return false;
        if (t.type === "a_receber") {
          if (!t.paid_date) return false;
          if (isLegacyCompetenceCarriedToApril(t)) return false;
        }
        return true;
      }),
    [transactions],
  );

  const totalEntradas = useMemo(() => paidTx.filter(t => t.type === "a_receber").reduce((s, t) => s + Number(t.amount), 0), [paidTx]);
  const totalSaidas = useMemo(() => paidTx.filter(t => t.type === "a_pagar" && !t.exclude_from_totals).reduce((s, t) => s + Number(t.amount), 0), [paidTx]);

  const saldo = totalEntradas - totalSaidas;

  const chartData = useMemo(() => {
    const map: Record<string, { month: string; entradas: number; saidas: number }> = {};
    paidTx.forEach(t => {
      const refDate = t.paid_date || t.due_date;
      const m = refDate.substring(0, 7);
      if (!map[m]) {
        const parsedDate = parseLocalDate(refDate);
        map[m] = { month: parsedDate ? format(parsedDate, "MMM/yy", { locale: ptBR }) : m, entradas: 0, saidas: 0 };
      }
      if (t.type === "a_receber") map[m].entradas += Number(t.amount);
      else map[m].saidas += Number(t.amount);
    });
    return Object.values(map);
  }, [paidTx]);

  const tableRows = useMemo(() => {
    let acc = 0;
    return paidTx.map(t => {
      const isEntrada = t.type === "a_receber";
      const val = Number(t.amount);
      acc += isEntrada ? val : -val;
      return { ...t, entrada: isEntrada ? val : 0, saida: isEntrada ? 0 : val, acumulado: acc };
    });
  }, [paidTx]);

  const exportCSV = () => {
    const header = "Data,Descrição,Entrada,Saída,Saldo Acumulado\n";
    const rows = tableRows.map(r => `${r.paid_date || r.due_date},"${r.description}",${r.entrada || ""},${r.saida || ""},${r.acumulado.toFixed(2)}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `movimentacao_${dateFrom}_${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Período: <span className="font-medium text-foreground">{formatDateBR(dateFrom)} a {formatDateBR(dateTo)}</span> — use o filtro no topo da página para alterar.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-600" /> Total Entrado</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{fmt(totalEntradas)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-600" /> Total Saído</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalSaidas)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" /> Saldo Resultado</CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${saldo >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(saldo)}</p></CardContent>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Entradas vs Saídas</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="entradas" name="Entradas" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="saidas" name="Saídas" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="font-semibold">Tabela Consolidada</h3>
        <div className="flex gap-2">
          <FinancialReportDialog
            type="visao_geral"
            transactions={paidTx.map(t => ({ date: t.paid_date || t.due_date, description: t.description, category: t.category ?? "", amount: Number(t.amount), status: t.status, origin: t.type === "a_receber" ? "Entrada" : "Saída" }))}
            categories={[...new Set(paidTx.map(t => t.category).filter(Boolean) as string[])]}
            periodLabel={`${formatDateBR(dateFrom)} a ${formatDateBR(dateTo)}`}
          />
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-auto max-h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right text-green-700">Entrada (R$)</TableHead>
              <TableHead className="text-right text-red-700">Saída (R$)</TableHead>
              <TableHead className="text-right">Saldo Acum.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableRows.map(r => (
              <TableRow key={r.id}>
                <TableCell>{formatDateBR(r.paid_date || r.due_date)}</TableCell>
                <TableCell className="max-w-[300px] truncate">{r.description}</TableCell>
                <TableCell className="text-right font-medium text-green-700">{r.entrada ? fmt(r.entrada) : ""}</TableCell>
                <TableCell className="text-right font-medium text-red-700">{r.saida ? fmt(r.saida) : ""}</TableCell>
                <TableCell className={`text-right font-bold ${r.acumulado >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(r.acumulado)}</TableCell>
              </TableRow>
            ))}
            {tableRows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma transação no período.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {(userRole === "admin" || userRole === "financeiro") && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-base">Configurações</CardTitle></CardHeader>
          <CardContent><CategoriasManager /></CardContent>
        </Card>
      )}
    </div>
  );
}
