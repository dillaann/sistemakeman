import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SPREADSHEET_ID = "1_IKiOkNRyy6P-PG5WKL5RYjFCr14pAmca2mhhHs2Cg4";
const SHEET_NAME = "Produção";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

const STATUS_ORDER: Record<string, number> = {
  "Fila de Produção": 1,
  "Em Produção": 2,
  "Aguardando Instalação": 3,
  "Entregue": 4,
};

function formatDateBR(value: string | null): string {
  if (!value) return "";
  const [y, m, d] = value.split("T")[0].split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  boleto: "Boleto",
  transferencia: "Transferência",
  cheque: "Cheque",
  "50/50": "50/50",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_SHEETS_API_KEY) {
      throw new Error("Credenciais do Google Sheets não configuradas.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch production with related work order, client and quote
    const { data: prod, error } = await supabase
      .from("production")
      .select("id, status, priority, created_at, os_id");
    if (error) throw error;

    const osIds = [...new Set((prod ?? []).map((p: any) => p.os_id).filter(Boolean))];
    let woMap = new Map<string, any>();
    if (osIds.length) {
      const { data: wos } = await supabase
        .from("work_orders")
        .select("id, client_id, quote_id")
        .in("id", osIds);
      (wos ?? []).forEach((w: any) => woMap.set(w.id, w));
    }

    const clientIds = [...new Set([...woMap.values()].map((w) => w.client_id).filter(Boolean))];
    const quoteIds = [...new Set([...woMap.values()].map((w) => w.quote_id).filter(Boolean))];

    let clientMap = new Map<string, any>();
    if (clientIds.length) {
      const { data: cs } = await supabase.from("clients").select("id, name, phone").in("id", clientIds);
      (cs ?? []).forEach((c: any) => clientMap.set(c.id, c));
    }
    let quoteMap = new Map<string, any>();
    if (quoteIds.length) {
      const { data: qs } = await supabase
        .from("quotes")
        .select("id, payment_method, collection_date")
        .in("id", quoteIds);
      (qs ?? []).forEach((q: any) => quoteMap.set(q.id, q));
    }

    const rows = (prod ?? [])
      .map((p: any) => {
        const wo = woMap.get(p.os_id);
        const client = wo ? clientMap.get(wo.client_id) : null;
        const quote = wo ? quoteMap.get(wo.quote_id) : null;
        const pm = quote?.payment_method ?? "";
        return {
          status: p.status ?? "",
          name: client?.name?.trim() || "—",
          phone: client?.phone?.trim() || "",
          collection: formatDateBR(quote?.collection_date ?? null),
          payment: PAYMENT_LABELS[pm] ?? pm,
        };
      })
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name));

    const header = ["Nome", "Telefone", "Data de Cobrança", "Método de Pagamento", "Status"];
    const values = [
      [`Produção Keman — atualizado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`],
      header,
      ...rows.map((r) => [r.name, r.phone, r.collection, r.payment, r.status]),
    ];

    const ghHeaders = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
      "Content-Type": "application/json",
    };

    // Clear existing content
    const clearRes = await fetch(`${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:Z10000:clear`, {
      method: "POST",
      headers: ghHeaders,
    });
    if (!clearRes.ok) {
      throw new Error(`Erro ao limpar planilha (${clearRes.status}): ${await clearRes.text()}`);
    }

    // Write new values
    const writeRes = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1?valueInputOption=USER_ENTERED`,
      { method: "PUT", headers: ghHeaders, body: JSON.stringify({ values }) },
    );
    if (!writeRes.ok) {
      throw new Error(`Erro ao escrever planilha (${writeRes.status}): ${await writeRes.text()}`);
    }

    return new Response(
      JSON.stringify({ success: true, count: rows.length, url: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sync-production-sheet error:", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
