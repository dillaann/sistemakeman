import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface QuoteItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface QuoteClient {
  name: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

interface QuotePDFData {
  date: string;
  client: QuoteClient;
  items: QuoteItem[];
  total: number;
  description?: string | null;
  valid_until?: string | null;
}

export function generateQuotePDF(data: QuotePDFData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = 210;
  const margin = 10;
  const cw = pw - margin * 2; // content width
  let y = margin;

  // Border around the page
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(margin, margin, cw, 277);

  // ===== HEADER: Company Logo Area =====
  // Draw roof/triangle logo
  const cx = pw / 2;
  doc.setLineWidth(1.5);
  // Outer triangle
  doc.line(cx - 18, y + 28, cx, y + 12);
  doc.line(cx, y + 12, cx + 18, y + 28);
  // Inner triangle
  doc.line(cx - 12, y + 28, cx, y + 18);
  doc.line(cx, y + 18, cx + 12, y + 28);
  // Base line
  doc.line(cx - 20, y + 28, cx + 20, y + 28);

  y += 34;

  // Company name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("SERRALHERIA KEMAN", cx, y, { align: "center" });
  y += 8;

  // Separator
  doc.setLineWidth(0.5);
  doc.line(margin, y, pw - margin, y);
  y += 5;

  // Services description
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Grades, Portões p/ elevação, Pantográficas, Peitoris, Estruturas, Reformas em geral.",
    cx,
    y,
    { align: "center" }
  );
  y += 6;

  // Address
  doc.setFontSize(9);
  doc.text(
    "Rua Jornalista Adolfo Ziguelli, n° 347 - Roçado    CEP 88.108-176 - São José - SC",
    cx,
    y,
    { align: "center" }
  );
  y += 8;

  // Phone
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("FONE : (48) 3259 - 3772", cx, y, { align: "center" });
  y += 6;

  // Separator
  doc.setLineWidth(0.5);
  doc.line(margin, y, pw - margin, y);
  y += 5;

  // ===== CLIENT INFO =====
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  const leftCol = margin + 3;
  const rightCol = pw / 2 + 5;

  doc.text(`Data Orçamento: ${data.date}`, leftCol, y);
  doc.text(`Fone: ${data.client.phone ?? ""}`, rightCol, y);
  y += 5;

  doc.text(`Cliente:    ${data.client.name}`, leftCol, y);
  doc.text(`Rua: ${data.client.address ?? ""}`, rightCol, y);
  y += 5;

  doc.text(`Cidade: ${data.client.city ?? ""}${data.client.state ? ` - ${data.client.state}` : ""}`, leftCol, y);
  doc.text(`Bairro:`, rightCol, y);
  y += 4;

  // Separator
  doc.line(margin, y, pw - margin, y);
  y += 6;

  // ===== PEDIDOS / ORÇAMENTOS TITLE =====
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PEDIDOS/ ORÇAMENTOS", cx, y, { align: "center" });
  y += 4;

  // ===== ITEMS TABLE =====
  const tableData = data.items.map((item) => [
    String(item.quantity),
    "", // Unid.
    item.description,
    `R$ ${item.unit_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    `R$ ${item.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
  ]);

  // Add empty row for total
  tableData.push([
    "",
    "",
    "",
    "",
    `R$ ${data.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Quant.", "Unid.", "Discriminação", "Preço Uni", "Total"]],
    body: tableData,
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 2,
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 20 },
      1: { halign: "center", cellWidth: 15 },
      2: { cellWidth: "auto" },
      3: { halign: "right", cellWidth: 28 },
      4: { halign: "right", cellWidth: 28 },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 2;

  // Observações
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Observações:", leftCol, y + 3);
  if (data.description) {
    doc.setFont("helvetica", "normal");
    doc.text(data.description, leftCol + 25, y + 3);
  }
  y += 8;

  // Separator
  doc.line(margin, y, pw - margin, y);
  y += 6;

  // Prazo de Entrega
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Prazo de Entrega: *", cx, y, { align: "center" });
  y += 6;

  // Contact info
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Tratar com Sérgio: 99167-2440 (Claro)  / Felipe 99151-7490 (Claro)",
    cx,
    y,
    { align: "center" }
  );

  // Save
  doc.save(`orcamento_${data.client.name.replace(/\s+/g, "_")}_${data.date.replace(/\//g, "-")}.pdf`);
}
