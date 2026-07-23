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
  "aguardando": "Aguardando",
  "em_producao": "Em Produção",
  "aguardando_instalacao": "Aguardando Instalação",
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
    const body = await req.json().catch(() => ({}));
    const backfillDelivered: boolean = !!body?.backfill_delivered;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_SHEETS_API_KEY = Deno.env.get("GOOGLE_SHEETS_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_SHEETS_API_KEY) {
      throw new Error("Credenciais do Google Sheets não configuradas.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: woData, error: woErr } = await supabase
      .from("work_orders")
      .select(`
        id, 
        total,
        description,
        status,
        completed_at,
        delivered_at,
        created_at,
        quote_id,
        origem_venda,
        clients(name, phone)
      `)
      .eq("origem_venda", "marketing")
      .order("created_at", { ascending: false });
    
    if (woErr) throw woErr;

    const woIds = (woData ?? []).map((wo: any) => wo.id);
    const quoteIds = (woData ?? []).map((wo: any) => wo.quote_id).filter(Boolean);
    
    const itemsMap = new Map<string, any[]>();
    const paidMap = new Map<string, number>();
    const sellersMap = new Map<string, string>();

    if (woIds.length > 0) {
      const { data: items, error: itemsErr } = await supabase
        .from("work_order_items")
        .select("work_order_id, description, quantity")
        .in("work_order_id", woIds);
      if (itemsErr) throw itemsErr;
      (items ?? []).forEach((item: any) => {
        const list = itemsMap.get(item.work_order_id) || [];
        list.push(item);
        itemsMap.set(item.work_order_id, list);
      });

      const { data: txs, error: txErr } = await supabase
        .from("financial_transactions")
        .select("work_order_id, amount, status, type")
        .in("work_order_id", woIds)
        .eq("type", "a_receber")
        .eq("status", "pago");
      if (txErr) throw txErr;
      (txs ?? []).forEach((t: any) => {
        paidMap.set(t.work_order_id, (paidMap.get(t.work_order_id) || 0) + Number(t.amount || 0));
      });
    }

    if (quoteIds.length > 0) {
      const { data: quotes, error: quotesErr } = await supabase
        .from("quotes")
        .select("id, seller_id")
        .in("id", quoteIds);
      
      if (!quotesErr && quotes) {
        const sellerIds = quotes.map(q => q.seller_id).filter(Boolean);
        if (sellerIds.length > 0) {
          const { data: profiles, error: profilesErr } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", sellerIds);
          
          if (!profilesErr && profiles) {
            const pMap = new Map(profiles.map(p => [p.id, p.full_name]));
            quotes.forEach(q => {
              if (q.seller_id) sellersMap.set(q.id, pMap.get(q.seller_id) || "—");
            });
          }
        }
      }
    }

    const rows = (woData ?? [])
      .map((wo: any) => {
        const client = wo.clients;
        const sellerName = sellersMap.get(wo.quote_id) || "—";
        const dateObj = wo.created_at ? new Date(wo.created_at) : new Date();
        const createdAt = dateObj.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
        const services = (itemsMap.get(wo.id) || [])
          .map((item: any) => `${Number(item.quantity || 1)}x ${item.description || "Serviço"}`)
          .join("; ");
        const total = Number(wo.total || 0);
        const paid = Number(paidMap.get(wo.id) || 0);
        const remaining = Math.max(total - paid, 0);
        let paymentStatus = "Não pago";
        if (total > 0 && paid >= total) paymentStatus = "Pago integral";
        else if (paid > 0) {
          const pct = Math.round((paid / total) * 100);
          paymentStatus = `Parcial (${pct}%)`;
        }

        return {
          id: wo.id,
          name: client?.name?.trim() || "—",
          phone: client?.phone?.trim() || "",
          status: STATUS_LABELS[wo.status] || wo.status || "Aguardando",
          description: services || wo.description || "—",
          created_at: createdAt,
          completed_at: formatDateBR(wo.delivered_at || wo.completed_at),
          total,
          paid,
          remaining,
          paymentStatus,
          sellerName,
        };
      });


    console.log(`Syncing ${rows.length} rows to Google Sheets`);

    const ghHeaders = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
      "Content-Type": "application/json",
    };

    // Ordem das colunas (o bot lê estes cabeçalhos):
    // A: Data/Hora Pedido | B: Nome | C: Telefone | D: Status | E: Serviços
    // F: Conclusão/Entrega | G: Valor Total | H: Cobrado? | I: Pagamento
    // J: Valor Pago | K: Valor Restante | L: Vendedor | M: ID (referência oculta)

    // A coluna H ("Cobrado?") é 100% controlada pelo bot externo.
    // A sync NUNCA lê nem escreve nessa coluna — só limpa/escreve A:G e I:M.

    const titleRow = [`Produção Keman — atualizado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`];

    // Bloco esquerdo (A:G) — 7 colunas
    const leftHeader = ["Data/Hora Pedido", "Nome", "Telefone", "Status", "Serviços", "Conclusão/Entrega", "Valor Total"];
    const leftValues: any[][] = [
      titleRow,
      leftHeader,
      ...rows.map((r) => [r.created_at, r.name, r.phone, r.status, r.description, r.completed_at, r.total]),
    ];

    // Bloco direito (I:M) — 5 colunas
    const rightHeader = ["Pagamento", "Valor Pago", "Valor Restante", "Vendedor", "ID"];
    const rightValues: any[][] = [
      [""], // linha 1 (título só ocupa A)
      rightHeader,
      ...rows.map((r) => [r.paymentStatus, r.paid, r.remaining, r.sellerName, r.id]),
    ];

    // Limpa apenas A:G e I:M — coluna H permanece intocada
    const clearLeft = await fetch(`${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_NAME}'!A1:G10000:clear`, {
      method: "POST",
      headers: ghHeaders,
    });
    if (!clearLeft.ok) {
      throw new Error(`Erro ao limpar A:G (${clearLeft.status}): ${await clearLeft.text()}`);
    }
    const clearRight = await fetch(`${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_NAME}'!I1:M10000:clear`, {
      method: "POST",
      headers: ghHeaders,
    });
    if (!clearRight.ok) {
      throw new Error(`Erro ao limpar I:M (${clearRight.status}): ${await clearRight.text()}`);
    }

    // Garante header H2 = "Cobrado?" sem tocar em H3+ (dados do bot)
    await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_NAME}'!H2?valueInputOption=USER_ENTERED`,
      { method: "PUT", headers: ghHeaders, body: JSON.stringify({ values: [["Cobrado?"]] }) },
    );

    const writeLeft = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_NAME}'!A1?valueInputOption=USER_ENTERED`,
      { method: "PUT", headers: ghHeaders, body: JSON.stringify({ values: leftValues }) },
    );
    if (!writeLeft.ok) {
      throw new Error(`Erro ao escrever A:G (${writeLeft.status}): ${await writeLeft.text()}`);
    }
    const writeRight = await fetch(
      `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_NAME}'!I1?valueInputOption=USER_ENTERED`,
      { method: "PUT", headers: ghHeaders, body: JSON.stringify({ values: rightValues }) },
    );
    if (!writeRight.ok) {
      throw new Error(`Erro ao escrever I:M (${writeRight.status}): ${await writeRight.text()}`);
    }

    // Backfill one-shot: marca "Sim" em H para todas as OS entregues.
    // Só roda quando body.backfill_delivered === true.
    let backfilled = 0;
    if (backfillDelivered) {
      // Dados começam na linha 3 (linha 1 = título, linha 2 = header)
      const hValues: any[][] = rows.map((r) => [r.status === "Entregue" ? "Sim" : ""]);
      const backfillRes = await fetch(
        `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_NAME}'!H3?valueInputOption=USER_ENTERED`,
        { method: "PUT", headers: ghHeaders, body: JSON.stringify({ values: hValues }) },
      );
      if (!backfillRes.ok) {
        throw new Error(`Erro no backfill de H (${backfillRes.status}): ${await backfillRes.text()}`);
      }
      backfilled = hValues.filter((v) => v[0] === "Sim").length;
    }

    return new Response(
      JSON.stringify({ success: true, count: rows.length, backfilled, url: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit` }),
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
