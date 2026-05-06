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

    const { fileUrl, fileBase64, fileName } = await req.json();
    
    let imageContent;
    if (fileUrl) {
      imageContent = { type: "image_url", image_url: { url: fileUrl } };
    } else if (fileBase64) {
      // Assuming it's already a data URL or just base64
      const mimeType = fileName?.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
      const dataUrl = fileBase64.startsWith("data:") ? fileBase64 : `data:${mimeType};base64,${fileBase64}`;
      imageContent = { type: "image_url", image_url: { url: dataUrl } };
    } else {
      return new Response(JSON.stringify({ error: "fileUrl or fileBase64 is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um especialista em extração de dados de Notas Fiscais Brasileiras (NF-e, NFS-e, CT-e).
Analise o documento enviado e extraia os dados estruturados em JSON.

Campos obrigatórios:
- invoice_number (apenas números)
- series (série da nota)
- issue_date (YYYY-MM-DD)
- amount (valor total bruto, número decimal)
- taxes (detalhamento dos impostos como string: "ICMS: 10,00, PIS: 5,00")
- icms_amount (valor total do ICMS, número decimal)
- net_amount (valor líquido, número decimal)
- entity_name (razão social do cliente/destinatário)
- entity_cnpj (CNPJ do cliente/destinatário)
- items (array de objetos com: description, quantity, unit_price, total_price)
- payment_condition (ex: "30 dias", "à vista", "pix")
- due_date (data de vencimento, YYYY-MM-DD ou null)

Regras:
- Retorne APENAS o JSON.
- Se não encontrar um campo, use null ou string vazia.
- Datas sempre em YYYY-MM-DD.
- Valores monetários como números (ex: 1250.50).`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados desta Nota Fiscal:" },
              imageContent,
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erro ao processar com IA", details: errorText }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content ?? "";
    
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    jsonStr = jsonStr.trim();

    const extracted = JSON.parse(jsonStr);

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-fiscal-invoice error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
