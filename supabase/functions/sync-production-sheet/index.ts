import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SPREADSHEET_ID = "1_IKiOkNRyy6P-PG5WKL5RYjFCr14pAmca2mhhHs2Cg4";
const SHEET_NAME = "Produção";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

const STATUS_ORDER: Record<string, number> = {
  "aguardando_aprovacao": 0,
  "aguardando": 1,
  "em_producao": 2,
  "instalando": 3,
  "entregue": 4,
  "rejeitado": 5,
};

const STATUS_LABELS: Record<string, string> = {
  "aguardando": "Aguardando Início",
  "em_producao": "Em Produção",
  "instalando": "Em Instalação",
  "entregue": "Entregue",
  "aguardando_aprovacao": "Orçamento Pendente",
  "rejeitado": "Rejeitado",
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
  cartao_debito: "Cartão de Crédito", // Mapping both as standard
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
    const { client_id: _ignored } = await req.json().catch(() => ({ client_id: null }));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_SHEETS_API_KEY) {
      throw new Error("Credenciais do Google Sheets não configuradas.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch ONLY approved quotes with their work orders.
    let query = supabase
      .from("quotes")
      .select(`
        id, 
        status, 
        payment_method, 
        collection_date,
        client_id, 
        clients(name, phone),
        work_orders(status_producao)
      `)
      .eq("status", "aprovado");
    
    const { data: quotesData, error: qErr } = await query.order("created_at", { ascending: false });
    
    if (qErr) throw qErr;

    const rows = (quotesData ?? [])
      .map((q: any) => {
        const client = q.clients;
        const pm = q.payment_method ?? "";
        // Get status from work order if approved, otherwise from quote
        const wo = q.work_orders?.[0];
        let statusKey = "aguardando_aprovacao";
        
        if (q.status === "aprovado") {
          statusKey = wo?.status_producao || "aguardando";
        } else if (q.status === "rejeitado") {
          statusKey = "rejeitado";
        }

        
        return {
          status: STATUS_LABELS[statusKey] || statusKey,
          statusKey: statusKey,
          name: client?.name?.trim() || "—",
          phone: client?.phone?.trim() || "",
          collection: formatDateBR(q.collection_date ?? null),
          payment: PAYMENT_LABELS[pm] || pm,
        };
      })
      .sort((a, b) => (STATUS_ORDER[a.statusKey] ?? 9) - (STATUS_ORDER[b.statusKey] ?? 9) || a.name.localeCompare(b.name));

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

    // Clear existing content - use single quotes for sheet names with spaces
    const clearRes = await fetch(`${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_NAME}'!A1:Z10000:clear`, {
      method: "POST",
      headers: ghHeaders,
    });
    if (!clearRes.ok) {
      throw new Error(`Erro ao limpar planilha (${clearRes.status}): ${await clearRes.text()}`);
    }

    // Write new values - use single quotes for sheet names with spaces
    const writeRes = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_NAME}'!A1?valueInputOption=USER_ENTERED`,
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
