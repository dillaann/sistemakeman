import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatDateBR } from "@/lib/utils";
import type { CashFlowAnalysis, CashFlowDay } from "@/lib/cashflow";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface CashFlowReportConfig {
  periodLabel: string;
  days: CashFlowDay[];
  analysis: CashFlowAnalysis;
  currentBalance: number;
  recommendations: string[];
}

export function generateCashFlowPDF({
  periodLabel,
  days,
  analysis,
  currentBalance,
  recommendations,
}: CashFlowReportConfig) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Fluxo de Caixa", pageWidth / 2, 18, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(periodLabel, pageWidth / 2, 25, { align: "center" });

  autoTable(doc, {
    startY: 32,
    theme: "plain",
    styles: { fontSize: 9 },
    body: [
      ["Saldo atual em conta", fmt(currentBalance)],
      ["Saldo mínimo diário", fmt(analysis.minBalance)],
      ["Total de entradas", fmt(analysis.totalInflow)],
      ["Total de saídas", fmt(analysis.totalOutflow)],
      ["Saldo projetado no fim do período", fmt(analysis.finalBalance)],
      ["Dias críticos (abaixo do mínimo)", String(analysis.criticalDays.length)],
      [
        "Pior dia",
        analysis.worstDay ? `${formatDateBR(analysis.worstDay.date)} - ${fmt(analysis.worstDay.cumulative)}` : "-",
      ],
      ["Necessidade de caixa", fmt(analysis.cashNeed)],
    ],
  });

  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
    head: [["Data", "Situação", "Entradas", "Saídas", "Saldo do dia", "Acumulado"]],
    body: days.map((d) => [
      formatDateBR(d.date),
      d.isProjected ? "Previsto" : "Realizado",
      fmt(d.inflow),
      fmt(d.outflow),
      fmt(d.net),
      fmt(d.cumulative),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const day = days[data.row.index];
      if (!day) return;
      if (day.cumulative < 0) data.cell.styles.textColor = [185, 28, 28];
      else if (day.cumulative < analysis.minBalance) data.cell.styles.textColor = [161, 98, 7];
    },
  });

  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  autoTable(doc, {
    startY: afterTable,
    head: [["Recomendações"]],
    body: recommendations.map((r) => [r]),
    styles: { fontSize: 9, cellWidth: "wrap" },
    headStyles: { fillColor: [30, 41, 59] },
  });

  doc.save(`fluxo-de-caixa-${periodLabel.replace(/[^\w]+/g, "-").toLowerCase()}.pdf`);
}

export function generateCashFlowExcel({ periodLabel, days, analysis, currentBalance }: CashFlowReportConfig) {
  const rows = days.map((d) => ({
    Data: formatDateBR(d.date),
    Situação: d.isProjected ? "Previsto" : "Realizado",
    Entradas: Number(d.inflow.toFixed(2)),
    Saídas: Number(d.outflow.toFixed(2)),
    "Saldo do dia": Number(d.net.toFixed(2)),
    "Saldo acumulado": Number(d.cumulative.toFixed(2)),
    Alerta: d.cumulative < 0 ? "Negativo" : d.cumulative < analysis.minBalance ? "Abaixo do mínimo" : "",
  }));

  const detail = days.flatMap((d) =>
    d.events.map((e) => ({
      Data: formatDateBR(d.date),
      Tipo: e.direction === "in" ? "Entrada" : "Saída",
      Situação: e.realized ? "Realizado" : "Previsto",
      Origem: e.source,
      Descrição: e.description,
      Valor: Number(e.amount.toFixed(2)),
    })),
  );

  const resumo = [
    { Indicador: "Período", Valor: periodLabel },
    { Indicador: "Saldo atual em conta", Valor: currentBalance },
    { Indicador: "Saldo mínimo diário", Valor: analysis.minBalance },
    { Indicador: "Total de entradas", Valor: analysis.totalInflow },
    { Indicador: "Total de saídas", Valor: analysis.totalOutflow },
    { Indicador: "Saldo final projetado", Valor: analysis.finalBalance },
    { Indicador: "Dias críticos", Valor: analysis.criticalDays.length },
    { Indicador: "Necessidade de caixa", Valor: analysis.cashNeed },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Fluxo Diário");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Lançamentos");
  XLSX.writeFile(wb, `fluxo-de-caixa-${periodLabel.replace(/[^\w]+/g, "-").toLowerCase()}.xlsx`);
}
