import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const systemPrompt = `Você é um assistente especializado em extrair dados de documentos de compras, notas fiscais e pedidos de fornecedores.
Analise as imagens enviadas e extraia os seguintes dados em formato JSON:

{
  "supplier_name": "nome do fornecedor",
  "purchase_date": "YYYY-MM-DD",
  "invoice_number": "número do pedido ou nota fiscal",
  "items": [
    {
      "material": "nome do material/produto",
      "quantity": 1,
      "unit": "un",
      "unit_price": 0.00
    }
  ],
  "original_total": 0.00,
  "final_total": 0.00,
  "payment_method": "pix|boleto|cartao|dinheiro|transferencia|null",
  "due_date": "YYYY-MM-DD ou null",
  "notes": "observações relevantes"
}

Regras:
- Se houver duas imagens, a primeira é o pedido original (valor sem desconto) e a segunda é o pedido final (valor negociado)
- Se houver apenas uma imagem, extraia os dados disponíveis
- Para unit, use: un, kg, m, m², m³, litro, peça, pacote, cx, rolo
- Se não conseguir identificar um campo, use null
- Retorne APENAS o JSON, sem texto adicional
- Valores monetários devem ser números decimais (ex: 1250.50)
- Datas devem estar no formato YYYY-MM-DD`;

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
