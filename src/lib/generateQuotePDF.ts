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
  cpf_cnpj?: string | null;
}

interface QuotePDFData {
  date: string;
  client: QuoteClient;
  items: QuoteItem[];
  total: number;
  description?: string | null;
  valid_until?: string | null;
  delivery_deadline?: string | null;
  quote_number?: string | null;
}

const DARK = [26, 32, 44] as const; // dark navy for banners

function drawDarkBanner(doc: jsPDF, x: number, y: number, w: number, h: number, text: string) {
  doc.setFillColor(DARK[0], DARK[1], DARK[2]);
  doc.rect(x, y, w, h, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(text, x + 4, y + h / 2 + 1, { baseline: "middle" });
  doc.setTextColor(0, 0, 0);
}

async function loadLogoBase64(): Promise<string> {
  const response = await fetch("/images/logo-keman.png");
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export async function generateQuotePDF(data: QuotePDFData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await loadLogoBase64();
  } catch { /* fallback: no logo */ }
  const pw = 210;
  const ph = 297;
  const margin = 15;
  const cw = pw - margin * 2; // content width
  let y = margin;

  // ===== TOP LINE =====
  doc.setDrawColor(0);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pw - margin, y);
  y += 6;

  // ===== HEADER: Logo LEFT + Info RIGHT =====
  // Logo image (maintains aspect ratio ~1.5:1 width:height)
  const logoImgW = 50;
  const logoImgH = 35;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", margin + 2, y, logoImgW, logoImgH);
  }

  // Right side: Title + services + address
  const rightX = margin + 58;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("PEDIDOS/ ORÇAMENTOS", rightX, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    "Grades, Portões p/ elevação, Pantográficas, Peitoris, Estruturas,",
    rightX,
    y + 14
  );
  doc.text("Reformas em geral.", rightX, y + 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("R. Ivo Vicente Coelho 890 - Forquilhas", rightX, y + 25);
  doc.text("São José - SC, 88107-110", rightX, y + 30);

  y += 38;

  // ===== INFO BOX: No. ORÇAMENTO | DATA | PRAZO DE ENTREGA =====
  const boxH = 14;
  doc.setLineWidth(0.3);
  doc.setDrawColor(0);
  doc.rect(margin, y, cw, boxH);

  // Vertical dividers — 4 columns now
  const col1W = cw * 0.30;
  const col2W = cw * 0.22;
  const col3W = cw * 0.22;
  doc.line(margin + col1W, y, margin + col1W, y + boxH);
  doc.line(margin + col1W + col2W, y, margin + col1W + col2W, y + boxH);
  doc.line(margin + col1W + col2W + col3W, y, margin + col1W + col2W + col3W, y + boxH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const textY = y + boxH / 2;
  doc.text(`No. ORÇAMENTO: ${data.quote_number ?? "___"}`, margin + 3, textY, { baseline: "middle" });
  doc.text(`EMISSÃO: ${data.date}`, margin + col1W + 3, textY, { baseline: "middle" });
  doc.text(`VALIDADE: ${data.valid_until ?? "___"}`, margin + col1W + col2W + 3, textY, { baseline: "middle" });

  const deadlineDays = data.delivery_deadline ?? "___";
  doc.text("PRAZO DE ENTREGA", margin + col1W + col2W + col3W + 3, y + 5);
  doc.text(`${deadlineDays} dias úteis`, margin + col1W + col2W + col3W + 3, y + 10);

  y += boxH + 4;

  // ===== DADOS DA EMPRESA =====
  drawDarkBanner(doc, margin, y, cw, 7, "DADOS DA EMPRESA");
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const labelX = margin + 3;
  const valueX = margin + 35;

  doc.text("Razao social:", labelX, y);
  doc.setFont("helvetica", "normal");
  doc.text("Serralheria Keman", valueX, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.text("CNPJ:", labelX, y);
  doc.setFont("helvetica", "normal");
  doc.text("", valueX, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.text("Endereco:", labelX, y);
  doc.setFont("helvetica", "normal");
  doc.text("R. Ivo Vicente Coelho 890 - Forquilhas, São José - SC, 88107-110", valueX, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.text("Telefone:", labelX, y);
  doc.setFont("helvetica", "normal");
  doc.text("(48) 3259-3772", valueX, y);
  y += 6;

  // ===== DADOS DO CLIENTE =====
  drawDarkBanner(doc, margin, y, cw, 7, "DADOS DO CLIENTE");
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.text("Cliente:", labelX, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.client.name, valueX, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.text("CPF/CNPJ:", labelX, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.client.cpf_cnpj ?? "", valueX, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.text("Endereco:", labelX, y);
  doc.setFont("helvetica", "normal");
  const clientAddr = [data.client.address, data.client.city, data.client.state].filter(Boolean).join(", ");
  doc.text(clientAddr, valueX, y);
  y += 5;

  doc.setFont("helvetica", "bold");
  doc.text("Telefone:", labelX, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.client.phone ?? "", valueX, y);
  y += 6;

  // ===== ITENS DO ORÇAMENTO =====
  drawDarkBanner(doc, margin, y, cw, 7, "ITENS DO ORÇAMENTO");
  y += 9;

  // Table
  const tableData = data.items.map((item) => [
    String(item.quantity),
    item.description,
    `R$ ${item.unit_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    `R$ ${item.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["QTD", "DESCRIÇAO", "VALOR UNIT.", "TOTAL"]],
    body: tableData,
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "left",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 22 },
      1: { cellWidth: "auto" },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 30 },
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // ===== PAGE 2: OBSERVAÇÕES + VALOR TOTAL + APROVAÇÃO =====
  // Check if we need a new page
  if (y > ph - 80) {
    doc.addPage();
    y = margin;
  }

  // Top line
  doc.setLineWidth(0.8);
  doc.line(margin, y, pw - margin, y);
  y += 4;

  // OBSERVAÇÕES + VALOR TOTAL side by side
  const obsW = cw * 0.6;
  const totalW = cw * 0.4;
  const boxHeight = 35;

  // Observações box
  doc.setLineWidth(0.3);
  doc.rect(margin, y, obsW, boxHeight);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("OBSERVACOES", margin + 3, y + 5);
  if (data.description) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const obsLines = doc.splitTextToSize(data.description, obsW - 8);
    doc.text(obsLines, margin + 3, y + 10);
  }

  // Valor Total box (dark)
  doc.setFillColor(DARK[0], DARK[1], DARK[2]);
  doc.rect(margin + obsW, y, totalW, boxHeight, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("VALOR TOTAL", margin + obsW + 4, y + 5);
  doc.setFontSize(14);
  doc.text(
    `R$ ${data.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    margin + obsW + 4,
    y + 16
  );
  doc.setTextColor(0, 0, 0);

  y += boxHeight + 8;

  // ===== APROVAÇÃO =====
  drawDarkBanner(doc, margin, y, cw, 7, "APROVAÇAO");
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  doc.text("Responsavel:", margin + 3, y);
  doc.line(margin + 3, y + 2, margin + cw * 0.4, y + 2);

  doc.text("Assinatura/Carimbo:", margin + cw * 0.5, y);
  doc.line(margin + cw * 0.5, y + 2, pw - margin - 3, y + 2);

  // Save
  const fileName = `orcamento_${data.client.name.replace(/\s+/g, "_")}_${data.date.replace(/\//g, "-")}.pdf`;
  doc.save(fileName);
}
