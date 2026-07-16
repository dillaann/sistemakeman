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
    const itemsMap = new Map<string, any[]>();
    const paidMap = new Map<string, number>();
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

    const rows = (woData ?? [])
      .map((wo: any) => {
        const client = wo.clients;
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
    // J: Valor Pago | K: Valor Restante | L: ID (referência oculta)
    const header = ["Data/Hora Pedido", "Nome", "Telefone", "Status", "Serviços", "Conclusão/Entrega", "Valor Total", "Cobrado?", "Pagamento", "Valor Pago", "Valor Restante", "ID"];

    // Preserva a coluna "Cobrado?" já marcada pelo bot: lê a planilha atual e
    // monta um mapa ID -> valor de "Cobrado?" antes de reescrever tudo.
    const cobradoMap = new Map<string, string>();
    try {
      const readRes = await fetch(
        `${GATEWAY}/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_NAME}'!A1:Z10000`,
        { method: "GET", headers: ghHeaders },
      );
      if (readRes.ok) {
        const existing = await readRes.json();
        const existingValues: any[][] = existing.values || [];
        const headerRowIdx = existingValues.findIndex((r) => Array.isArray(r) && r.includes("ID"));
        if (headerRowIdx >= 0) {
          const hRow = existingValues[headerRowIdx];
          const idCol = hRow.indexOf("ID");
          const cobradoCol = hRow.indexOf("Cobrado?");
          if (idCol >= 0 && cobradoCol >= 0) {
            for (let i = headerRowIdx + 1; i < existingValues.length; i++) {
              const dataRow = existingValues[i];
              const rowId = (dataRow[idCol] || "").toString().trim();
              const cobrado = (dataRow[cobradoCol] || "").toString().trim();
              if (rowId && cobrado) cobradoMap.set(rowId, cobrado);
            }
          }
        }
      } else {
        console.error(`Falha ao ler planilha existente (${readRes.status}): ${await readRes.text()}`);
      }
      console.log(`Marcações 'Cobrado?' preservadas: ${cobradoMap.size}`);
    } catch (readErr) {
      console.error("Aviso: não foi possível ler marcações existentes de 'Cobrado?':", readErr);
    }



    const values = [
      [`Produção Keman — atualizado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`],
      header,
      ...rows.map((r) => {
        const existing = cobradoMap.get(r.id);
        const cobrado = cobradoMap.has(r.id) ? existing ?? "Não" : "Não";
        return [
          r.created_at,
          r.name,
          r.phone,
          r.status,
          r.description,
          r.completed_at,
          r.total,
          cobrado,
          r.paymentStatus,
          r.paid,
          r.remaining,
          r.id,
        ];
      }),
    ];


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
