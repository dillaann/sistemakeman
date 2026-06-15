import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Download, FileText } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { localDateString, parseLocalDate, formatDateBR } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type PeriodPreset = "month" | "3months" | "year" | "custom";

export default function DespesasReceitasTab() {
  const now = new Date();
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [dateFrom, setDateFrom] = useState(localDateString(startOfMonth(now)));
  const [dateTo, setDateTo] = useState(localDateString(endOfMonth(now)));

  const applyPreset = (p: PeriodPreset) => {
    setPreset(p);
    if (p === "month") { setDateFrom(localDateString(startOfMonth(now))); setDateTo(localDateString(endOfMonth(now))); }
    if (p === "3months") { setDateFrom(localDateString(startOfMonth(subMonths(now, 2)))); setDateTo(localDateString(endOfMonth(now))); }
    if (p === "year") { setDateFrom(localDateString(startOfYear(now))); setDateTo(localDateString(endOfYear(now))); }
  };

  // Cash basis: only PAID transactions, by paid_date (fallback due_date when paid_date is null).
  const { data: transactions = [] } = useQuery({
    queryKey: ["desp-rec", dateFrom, dateTo],
    queryFn: async () => {
      const { data } = await supabase.from("financial_transactions").select("*")
        .eq("status", "pago")
        .or(`and(paid_date.gte.${dateFrom},paid_date.lte.${dateTo}),and(paid_date.is.null,due_date.gte.${dateFrom},due_date.lte.${dateTo})`)
        .range(0, 10000);
      return (data ?? []).filter(t => {
        const ref = t.paid_date || t.due_date;
        return ref >= dateFrom && ref <= dateTo;
      });
    },
  });

  const totalReceitas = useMemo(() => transactions.filter(t => t.type === "a_receber").reduce((s, t) => s + Number(t.amount), 0), [transactions]);
  const totalDespesas = useMemo(() => transactions.filter(t => t.type === "a_pagar").reduce((s, t) => s + Number(t.amount), 0), [transactions]);
  const saldo = totalReceitas - totalDespesas;

  // Por mês
  const byMonth = useMemo(() => {
    const map: Record<string, { key: string; month: string; receitas: number; despesas: number }> = {};
    transactions.forEach(t => {
      const ref = t.paid_date || t.due_date;
      const m = ref.substring(0, 7);
      if (!map[m]) {
        const parsed = parseLocalDate(ref);
        map[m] = { key: m, month: parsed ? format(parsed, "MMM/yy", { locale: ptBR }) : m, receitas: 0, despesas: 0 };
      }
      if (t.type === "a_receber") map[m].receitas += Number(t.amount);
      else map[m].despesas += Number(t.amount);
    });
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [transactions]);

  // Por categoria
  const byCategory = useMemo(() => {
    const map: Record<string, { category: string; receitas: number; despesas: number }> = {};
    transactions.forEach(t => {
      const cat = t.category || "Sem categoria";
      if (!map[cat]) map[cat] = { category: cat, receitas: 0, despesas: 0 };
      if (t.type === "a_receber") map[cat].receitas += Number(t.amount);
      else map[cat].despesas += Number(t.amount);
    });
    return Object.values(map).sort((a, b) => (b.receitas + b.despesas) - (a.receitas + a.despesas));
  }, [transactions]);

  const periodLabel = `${formatDateBR(dateFrom)} a ${formatDateBR(dateTo)}`;

  const exportCSV = () => {
    let csv = "Despesas x Receitas;" + periodLabel + "\n\n";
    csv += "Resumo\nReceitas;Despesas;Saldo\n";
    csv += `${totalReceitas.toFixed(2)};${totalDespesas.toFixed(2)};${saldo.toFixed(2)}\n\n`;
    csv += "Por Categoria\nCategoria;Receitas;Despesas;Saldo\n";
    byCategory.forEach(c => { csv += `"${c.category}";${c.receitas.toFixed(2)};${c.despesas.toFixed(2)};${(c.receitas - c.despesas).toFixed(2)}\n`; });
    csv += "\nPor Mês\nMês;Receitas;Despesas;Saldo\n";
    byMonth.forEach(m => { csv += `${m.month};${m.receitas.toFixed(2)};${m.despesas.toFixed(2)};${(m.receitas - m.despesas).toFixed(2)}\n`; });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `despesas_x_receitas_${dateFrom}_${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text("Despesas x Receitas", w / 2, 20, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`Período: ${periodLabel} (regime de caixa)`, w / 2, 28, { align: "center" });

    autoTable(doc, {
      startY: 36,
      head: [["Indicador", "Valor"]],
      body: [
        ["Total Receitas", fmt(totalReceitas)],
        ["Total Despesas", fmt(totalDespesas)],
        ["Saldo", fmt(saldo)],
      ],
      theme: "grid",
      headStyles: { fillColor: [41, 128, 185], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });

    let y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont("helvetica", "bold"); doc.text("Por Categoria", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Categoria", "Receitas", "Despesas", "Saldo"]],
      body: byCategory.map(c => [c.category, fmt(c.receitas), fmt(c.despesas), fmt(c.receitas - c.despesas)]),
      theme: "striped",
      headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont("helvetica", "bold"); doc.text("Por Mês", 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Mês", "Receitas", "Despesas", "Saldo"]],
      body: byMonth.map(m => [m.month, fmt(m.receitas), fmt(m.despesas), fmt(m.receitas - m.despesas)]),
      theme: "striped",
      headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });

    doc.save(`Despesas_x_Receitas_${dateFrom}_${dateTo}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant={preset === "month" ? "default" : "outline"} size="sm" onClick={() => applyPreset("month")}>Mês Atual</Button>
        <Button variant={preset === "3months" ? "default" : "outline"} size="sm" onClick={() => applyPreset("3months")}>Últimos 3 Meses</Button>
        <Button variant={preset === "year" ? "default" : "outline"} size="sm" onClick={() => applyPreset("year")}>Ano Atual</Button>
        <div className="flex items-center gap-1 ml-auto">
          <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset("custom"); }} className="w-[150px]" />
          <span className="text-muted-foreground">a</span>
          <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset("custom"); }} className="w-[150px]" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-600" /> Receitas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{fmt(totalReceitas)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-600" /> Despesas</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{fmt(totalDespesas)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" /> Saldo</CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${saldo >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(saldo)}</p></CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
        <Button size="sm" onClick={exportPDF}><FileText className="h-4 w-4 mr-2" />Gerar PDF</Button>
      </div>

      {byMonth.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Despesas x Receitas por Mês</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="receitas" name="Receitas" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Por Categoria</CardTitle></CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right text-green-700">Receitas</TableHead>
                  <TableHead className="text-right text-red-700">Despesas</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCategory.map(c => {
                  const s = c.receitas - c.despesas;
                  return (
                    <TableRow key={c.category}>
                      <TableCell>{c.category}</TableCell>
                      <TableCell className="text-right font-medium text-green-700">{c.receitas ? fmt(c.receitas) : ""}</TableCell>
                      <TableCell className="text-right font-medium text-red-700">{c.despesas ? fmt(c.despesas) : ""}</TableCell>
                      <TableCell className={`text-right font-bold ${s >= 0 ? "text-green-700" : "text-red-700"}`}>{fmt(s)}</TableCell>
                    </TableRow>
                  );
                })}
                {byCategory.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma transação no período.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
