import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateBR } from "@/lib/utils";

export interface ReportTransaction {
  date: string;
  description: string;
  category: string;
  amount: number;
  status: string;
  origin?: string;
}

export interface ReportConfig {
  title: string;
  periodLabel: string;
  filters: { label: string; value: string }[];
  transactions: ReportTransaction[];
  summary: {
    total: number;
    count: number;
    max: number;
    min: number;
    avg: number;
  };
  userName?: string;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function generateFinancialPDF(config: ReportConfig) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(config.title, pageWidth / 2, 20, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Período: ${config.periodLabel}`, pageWidth / 2, 28, { align: "center" });

  // Filters applied
  if (config.filters.length > 0) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    let y = 35;
    doc.text("Filtros aplicados:", 14, y);
    config.filters.forEach((f) => {
      y += 5;
      doc.text(`• ${f.label}: ${f.value}`, 18, y);
    });
    doc.setTextColor(0);
  }

  // Summary cards
  const summaryY = config.filters.length > 0 ? 35 + config.filters.length * 5 + 10 : 38;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Resumo", 14, summaryY);

  const summaryData = [
    ["Total", fmt(config.summary.total)],
    ["Quantidade", String(config.summary.count)],
    ["Maior Valor", fmt(config.summary.max)],
    ["Menor Valor", fmt(config.summary.min)],
    ["Ticket Médio", fmt(config.summary.avg)],
  ];

  autoTable(doc, {
    startY: summaryY + 3,
    head: [["Indicador", "Valor"]],
    body: summaryData,
    theme: "grid",
    headStyles: { fillColor: [41, 128, 185], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  // Transactions table
  const tableY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold");
  doc.text("Transações", 14, tableY);

  const tableData = config.transactions.map((t) => [
    formatDateBR(t.date),
    t.description.length > 50 ? t.description.substring(0, 47) + "..." : t.description,
    t.category || "—",
    fmt(t.amount),
    t.status,
  ]);

  autoTable(doc, {
    startY: tableY + 3,
    head: [["Data", "Descrição", "Categoria", "Valor", "Status"]],
    body: tableData,
    theme: "striped",
    headStyles: { fillColor: [41, 128, 185], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 65 },
      3: { halign: "right", cellWidth: 28 },
      4: { cellWidth: 22 },
    },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    const now = new Date();
    doc.text(
      `Gerado em ${now.toLocaleDateString("pt-BR")} às ${now.toLocaleTimeString("pt-BR")}${config.userName ? ` por ${config.userName}` : ""} — Página ${i}/${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  doc.save(`${config.title.replace(/\s+/g, "_")}_${config.periodLabel.replace(/\s+/g, "_")}.pdf`);
}

export function generateFinancialExcel(config: ReportConfig) {
  const header = "Data,Descrição,Categoria,Valor,Status\n";
  const rows = config.transactions
    .map(
      (t) =>
        `${formatDateBR(t.date)},"${t.description.replace(/"/g, '""')}","${t.category || ""}",${t.amount.toFixed(2)},"${t.status}"`
    )
    .join("\n");

  const summary = `\n\nResumo\nTotal,${config.summary.total.toFixed(2)}\nQuantidade,${config.summary.count}\nMaior,${config.summary.max.toFixed(2)}\nMenor,${config.summary.min.toFixed(2)}\nMédio,${config.summary.avg.toFixed(2)}`;

  const blob = new Blob(["\uFEFF" + header + rows + summary], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${config.title.replace(/\s+/g, "_")}_${config.periodLabel.replace(/\s+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
