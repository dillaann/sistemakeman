import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, FileSpreadsheet, TrendingUp, TrendingDown, Hash, ArrowUpDown, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { formatDateBR } from "@/lib/utils";
import { generateFinancialPDF, generateFinancialExcel, type ReportTransaction, type ReportConfig } from "@/lib/generateFinancialReport";
import { useAuth } from "@/contexts/AuthContext";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CHART_COLORS = [
  "hsl(142, 76%, 36%)", "hsl(0, 84%, 60%)", "hsl(210, 79%, 46%)",
  "hsl(38, 92%, 50%)", "hsl(270, 67%, 47%)", "hsl(173, 58%, 39%)",
  "hsl(328, 73%, 48%)", "hsl(45, 93%, 47%)",
];

interface FinancialReportDialogProps {
  type: "entradas" | "saidas" | "movimentacoes" | "contas" | "visao_geral";
  transactions: ReportTransaction[];
  categories: string[];
  periodLabel: string;
  triggerLabel?: string;
}

const typeLabels: Record<string, string> = {
  entradas: "Relatório de Entradas",
  saidas: "Relatório de Saídas",
  movimentacoes: "Relatório de Movimentações",
  contas: "Relatório de Contas",
  visao_geral: "Relatório Financeiro Consolidado",
};

const statusLabels: Record<string, string> = {
  pendente: "Pendente", pago: "Pago", recebido: "Recebido", atrasado: "Atrasado", cancelado: "Cancelado",
};

export default function FinancialReportDialog({
  type,
  transactions,
  categories,
  periodLabel,
  triggerLabel = "Gerar Relatório",
}: FinancialReportDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (catFilter !== "all" && t.category !== catFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (dateFrom && t.date < dateFrom) return false;
      if (dateTo && t.date > dateTo) return false;
      return true;
    });
  }, [transactions, catFilter, statusFilter, dateFrom, dateTo]);

  const summary = useMemo(() => {
    const amounts = filtered.map((t) => t.amount);
    const total = amounts.reduce((s, v) => s + v, 0);
    return {
      total,
      count: filtered.length,
      max: amounts.length ? Math.max(...amounts) : 0,
      min: amounts.length ? Math.min(...amounts) : 0,
      avg: amounts.length ? total / amounts.length : 0,
    };
  }, [filtered]);

  const chartByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((t) => {
      const cat = t.category || "Sem categoria";
      map[cat] = (map[cat] || 0) + t.amount;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const appliedFilters = useMemo(() => {
    const f: { label: string; value: string }[] = [];
    if (catFilter !== "all") f.push({ label: "Categoria", value: catFilter });
    if (statusFilter !== "all") f.push({ label: "Status", value: statusLabels[statusFilter] || statusFilter });
    if (dateFrom) f.push({ label: "De", value: formatDateBR(dateFrom) });
    if (dateTo) f.push({ label: "Até", value: formatDateBR(dateTo) });
    return f;
  }, [catFilter, statusFilter, dateFrom, dateTo]);

  const buildConfig = (): ReportConfig => ({
    title: typeLabels[type],
    periodLabel,
    filters: appliedFilters,
    transactions: filtered,
    summary,
    userName: user?.email || undefined,
  });

  const uniqueStatuses = useMemo(() => {
    const set = new Set(transactions.map((t) => t.status));
    return Array.from(set);
  }, [transactions]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" />{triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{typeLabels[type]}</DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {uniqueStatuses.map((s) => <SelectItem key={s} value={s}>{statusLabels[s] || s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[140px] h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[140px] h-8 text-xs" />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Card>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Total</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-lg font-bold">{fmt(summary.total)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Hash className="h-3 w-3" /> Quantidade</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-lg font-bold">{summary.count}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Maior</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-lg font-bold">{fmt(summary.max)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Menor</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-lg font-bold">{fmt(summary.min)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" /> Ticket Médio</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <p className="text-lg font-bold">{fmt(summary.avg)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        {chartByCategory.length > 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartByCategory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="value" name="Valor" fill="hsl(210, 79%, 46%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                    {chartByCategory.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="border rounded-lg overflow-auto max-h-[300px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{formatDateBR(t.date)}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{t.description}</TableCell>
                  <TableCell className="text-xs">{t.category || "—"}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{fmt(t.amount)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{statusLabels[t.status] || t.status}</Badge></TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-xs">Nenhuma transação encontrada com os filtros aplicados.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Export Buttons */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => generateFinancialExcel(buildConfig())}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />Exportar CSV
          </Button>
          <Button size="sm" onClick={() => generateFinancialPDF(buildConfig())}>
            <Download className="h-4 w-4 mr-2" />Gerar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
