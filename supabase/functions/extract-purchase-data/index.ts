import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require an authenticated user before consuming AI credits
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");


    const { imageUrls } = await req.json();
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return new Response(JSON.stringify({ error: "imageUrls array is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageContents = imageUrls.map((url: string) => ({
      type: "image_url" as const,
      image_url: { url },
    }));

    const systemPrompt = `Você é um assistente especializado em extrair dados de documentos de compras.
O usuário enviará até duas fotos: uma do pedido original (antes da negociação) e outra do pedido final (após negociação/com descontos).

Sua tarefa é extrair e comparar os dados das duas fotos em formato JSON:

{
  "supplier_name": "nome do fornecedor",
  "purchase_date": "YYYY-MM-DD",
  "invoice_number": "número do pedido ou nota fiscal",
  "items": [
    {
      "material": "nome do material/produto",
      "quantity": 1,
      "unit": "un",
      "original_unit_price": 0.00,
      "final_unit_price": 0.00
    }
  ],
  "original_total": 0.00,
  "final_total": 0.00,
  "payment_method": "pix|boleto|cartao|dinheiro|transferencia|null",
  "due_date": "YYYY-MM-DD ou null",
  "notes": "observações relevantes"
}

Regras Cruciais:
1. Se houver DUAS fotos:
   - Identifique qual é o pedido original (preços maiores) e qual é o final (preços menores).
   - "original_total" deve vir da foto sem desconto.
   - "final_total" deve vir da foto com desconto.
   - Para cada item, cruze as informações pelo nome do material para obter "original_unit_price" e "final_unit_price".
2. Se houver apenas UMA foto:
   - Se a foto já mostrar descontos aplicados (ex: preço riscado ou coluna de desconto), extraia ambos.
   - Caso contrário, defina "original_unit_price" e "final_unit_price" como o mesmo valor.
3. Valores monetários devem ser números decimais (ex: 1250.50).
4. Datas no formato YYYY-MM-DD.
5. Retorne APENAS o JSON.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados de compra das imagens a seguir:" },
              ...imageContents,
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao processar imagens com IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    
    // Extract JSON from response (may be wrapped in markdown code block)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    jsonStr = jsonStr.trim();

    let extracted;
    try {
      extracted = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Não foi possível interpretar a resposta da IA", raw: content }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-purchase-data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
