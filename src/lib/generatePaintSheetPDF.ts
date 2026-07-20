import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateBR } from "@/lib/utils";

interface PaintSheetItem {
  item_number: number;
  part_name?: string | null;
  quantity?: number | null;
  width?: number | null;
  height?: number | null;
  color?: string | null;
}

interface PaintSheetPDFData {
  sheet_number: string;
  sheet_date: string;
  client_name: string;
  responsible?: string | null;
  status: string;
  notes?: string | null;
  work_order_short?: string | null;
  items: PaintSheetItem[];
}

async function loadLogoBase64(): Promise<string | null> {
  try {
    const response = await fetch("/images/logo-keman.png");
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const STATUS_LABEL: Record<string, string> = {
  aguardando: "Aguardando",
  em_pintura: "Em Pintura",
  finalizado: "Finalizado",
};

export async function generatePaintSheetPDF(data: PaintSheetPDFData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogoBase64();
  const pw = 210;
  const margin = 15;

  // Header
  doc.setFillColor(26, 32, 44);
  doc.rect(0, 0, pw, 28, "F");
  if (logo) {
    try { doc.addImage(logo, "PNG", margin, 6, 18, 18); } catch {}
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("FICHA DE CONTROLE DE PINTURA EPÓXI", margin + 22, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Serralheria KEMAN", margin + 22, 20);

  doc.setTextColor(0, 0, 0);
  let y = 36;

  // Meta box
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, pw - margin * 2, 26);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Nº da Ficha:", margin + 3, y + 6);
  doc.text("Data:", margin + 70, y + 6);
  doc.text("Status:", margin + 130, y + 6);
  doc.text("Cliente / Obra:", margin + 3, y + 15);
  doc.text("Responsável:", margin + 3, y + 22);

  doc.setFont("helvetica", "normal");
  doc.text(data.sheet_number, margin + 30, y + 6);
  doc.text(formatDateBR(data.sheet_date), margin + 82, y + 6);
  doc.text(STATUS_LABEL[data.status] || data.status, margin + 145, y + 6);
  doc.text(data.client_name || "-", margin + 35, y + 15);
  doc.text(data.responsible || "-", margin + 33, y + 22);
  if (data.work_order_short) {
    doc.setFont("helvetica", "bold");
    doc.text("OS:", margin + 100, y + 15);
    doc.setFont("helvetica", "normal");
    doc.text(data.work_order_short, margin + 110, y + 15);
  }

  y += 32;

  // Items table
  autoTable(doc, {
    startY: y,
    head: [["Item", "Peça", "Qtd", "Largura (mm)", "Altura (mm)", "Cor"]],
    body: (data.items || []).map((i) => [
      String(i.item_number ?? ""),
      i.part_name || "-",
      i.quantity != null ? String(i.quantity) : "-",
      i.width != null ? String(i.width) : "-",
      i.height != null ? String(i.height) : "-",
      i.color || "-",
    ]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [26, 32, 44], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: margin, right: margin },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 40;
  let ny = finalY + 8;

  if (data.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Observações:", margin, ny);
    ny += 5;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(data.notes, pw - margin * 2);
    doc.text(lines, margin, ny);
    ny += lines.length * 4 + 6;
  }

  // Signatures
  const sigY = Math.max(ny + 20, 250);
  doc.setDrawColor(0);
  doc.line(margin + 10, sigY, margin + 80, sigY);
  doc.line(pw - margin - 80, sigY, pw - margin - 10, sigY);
  doc.setFontSize(8);
  doc.text("Responsável Pintura", margin + 25, sigY + 5);
  doc.text("Conferência", pw - margin - 55, sigY + 5);

  doc.save(`Ficha_Pintura_${data.sheet_number}.pdf`);
}
