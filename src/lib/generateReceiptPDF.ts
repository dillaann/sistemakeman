import jsPDF from "jspdf";

interface ReceiptClient {
  name: string;
  cpf_cnpj?: string | null;
  phone?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
}

export interface ReceiptPDFData {
  date: string;
  client: ReceiptClient;
  amount: number;
  quoteTotal: number;
  /** Human label of the receipt type, e.g. "Entrada (50%)", "Valor total", "Saldo restante", "Valor personalizado" */
  paymentLabel: string;
  description?: string | null;
  quoteRef?: string | null;
  createdByName?: string | null;
}

const DARK = [26, 32, 44] as const;

const fmtCurrency = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

// Convert a number (up to millions) into Brazilian Portuguese words for currency.
function numberToWordsBRL(value: number): string {
  const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
  const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  const threeDigitsToWords = (n: number): string => {
    if (n === 0) return "";
    if (n === 100) return "cem";
    const parts: string[] = [];
    const h = Math.floor(n / 100);
    const rest = n % 100;
    if (h > 0) parts.push(hundreds[h]);
    if (rest > 0) {
      if (rest < 10) parts.push(units[rest]);
      else if (rest < 20) parts.push(teens[rest - 10]);
      else {
        const t = Math.floor(rest / 10);
        const u = rest % 10;
        parts.push(u > 0 ? `${tens[t]} e ${units[u]}` : tens[t]);
      }
    }
    return parts.join(" e ");
  };

  const intPart = Math.floor(value);
  const cents = Math.round((value - intPart) * 100);

  const buildInteger = (n: number): string => {
    if (n === 0) return "zero";
    const groups: number[] = [];
    let temp = n;
    while (temp > 0) {
      groups.push(temp % 1000);
      temp = Math.floor(temp / 1000);
    }
    const scales = ["", "mil", "milhão", "bilhão"];
    const scalesPlural = ["", "mil", "milhões", "bilhões"];
    const parts: string[] = [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      if (g === 0) continue;
      let words = threeDigitsToWords(g);
      if (i === 1) {
        words = g === 1 ? "mil" : `${words} mil`;
      } else if (i >= 2) {
        words = `${words} ${g === 1 ? scales[i] : scalesPlural[i]}`;
      }
      parts.push(words);
    }
    return parts.join(" e ");
  };

  const reaisWord = intPart === 1 ? "real" : "reais";
  let result = `${buildInteger(intPart)} ${reaisWord}`;
  if (cents > 0) {
    const centsWord = cents === 1 ? "centavo" : "centavos";
    result += ` e ${buildInteger(cents)} ${centsWord}`;
  }
  return result.charAt(0).toUpperCase() + result.slice(1);
}

export async function generateReceiptPDF(data: ReceiptPDFData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await loadLogoBase64();
  } catch { /* fallback: no logo */ }

  const pw = 210;
  const margin = 15;
  const cw = pw - margin * 2;
  let y = margin;

  // ===== TOP LINE =====
  doc.setDrawColor(0);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pw - margin, y);
  y += 6;

  // ===== HEADER: Logo LEFT + Info RIGHT =====
  const logoImgW = 50;
  const logoImgH = 35;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", margin + 2, y, logoImgW, logoImgH);
  }

  const rightX = margin + 58;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("RECIBO", rightX, y + 9);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Serralheria Keman", rightX, y + 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("CNPJ: 38.527.314/0001-10", rightX, y + 22);
  doc.text("R. Ivo Vicente Coelho 890 - Forquilhas", rightX, y + 27);
  doc.text("São José - SC, 88107-110  •  (48) 3259-3772", rightX, y + 32);

  y += 40;

  // ===== VALUE BOX (dark, highlighted) =====
  const valBoxH = 16;
  doc.setFillColor(DARK[0], DARK[1], DARK[2]);
  doc.rect(margin, y, cw, valBoxH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("VALOR RECEBIDO", margin + 4, y + 6);
  doc.setFontSize(18);
  doc.text(fmtCurrency(data.amount), margin + 4, y + 13);
  // Type label on the right
  doc.setFontSize(10);
  doc.text(data.paymentLabel, pw - margin - 4, y + valBoxH / 2 + 1, { align: "right", baseline: "middle" });
  doc.setTextColor(0, 0, 0);

  y += valBoxH + 6;

  // ===== DECLARAÇÃO =====
  drawDarkBanner(doc, margin, y, cw, 7, "DECLARAÇÃO DE RECEBIMENTO");
  y += 11;

  const amountWords = numberToWordsBRL(data.amount);
  const clientDoc = data.client.cpf_cnpj ? `, portador(a) do CPF/CNPJ ${data.client.cpf_cnpj}` : "";
  const refText = data.quoteRef ? ` referente ao orçamento ${data.quoteRef}` : "";
  const purposeText = data.description ? ` (${data.description})` : "";

  const declaration =
    `Recebemos de ${data.client.name}${clientDoc} a importância de ${fmtCurrency(data.amount)} ` +
    `(${amountWords})${refText}${purposeText}, referente a "${data.paymentLabel}". ` +
    `Para maior clareza, firmamos o presente recibo, dando plena e total quitação do valor acima descrito.`;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const declLines = doc.splitTextToSize(declaration, cw - 4);
  doc.text(declLines, margin + 2, y);
  y += declLines.length * 5.5 + 4;

  // ===== DETALHES =====
  drawDarkBanner(doc, margin, y, cw, 7, "DETALHES");
  y += 11;

  const labelX = margin + 3;
  const valueX = margin + 45;
  const line = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label, labelX, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, valueX, y);
    y += 6;
  };

  line("Cliente:", data.client.name);
  if (data.client.cpf_cnpj) line("CPF/CNPJ:", data.client.cpf_cnpj);
  const addrParts = [
    data.client.address,
    data.client.number,
    data.client.complement,
    data.client.neighborhood,
    data.client.city,
    data.client.state,
    data.client.cep ? `CEP: ${data.client.cep}` : null,
  ].filter(Boolean).join(", ");
  if (addrParts) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Endereço:", labelX, y);
    doc.setFont("helvetica", "normal");
    const addrLines = doc.splitTextToSize(addrParts, cw - 48);
    doc.text(addrLines, valueX, y);
    y += addrLines.length * 6;
  }
  if (data.client.phone) line("Telefone:", data.client.phone);
  line("Valor do orçamento:", fmtCurrency(data.quoteTotal));
  line("Valor deste recibo:", fmtCurrency(data.amount));
  if (data.quoteTotal > 0 && data.amount < data.quoteTotal) {
    line("Saldo em aberto:", fmtCurrency(Math.max(data.quoteTotal - data.amount, 0)));
  }
  line("Data:", data.date);

  y += 12;

  // ===== ASSINATURA =====
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const sigCenter = pw / 2;
  doc.line(sigCenter - 45, y, sigCenter + 45, y);
  y += 5;
  doc.text("Serralheria Keman", sigCenter, y, { align: "center" });
  if (data.createdByName) {
    y += 5;
    doc.setFontSize(8);
    doc.text(data.createdByName, sigCenter, y, { align: "center" });
  }

  const fileName = `recibo_${data.client.name.replace(/\s+/g, "_")}_${data.date.replace(/\//g, "-")}.pdf`;
  doc.save(fileName);
}
