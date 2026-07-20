import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'imageBase64 obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY ausente' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const prompt = `Você recebe a foto/scan de uma FICHA DE CONTROLE DE PINTURA EPÓXI da serralheria KEMAN.
Extraia os dados e retorne APENAS um JSON válido (sem markdown, sem comentários) no formato:
{
  "sheet_date": "YYYY-MM-DD" ou null,
  "client_name": "cliente/obra" ou null,
  "responsible": "responsável" ou null,
  "notes": "observações" ou null,
  "items": [
    { "item_number": 1, "part_name": "nome da peça", "quantity": 0, "width": 0, "height": 0, "color": "cor" }
  ]
}
Regras:
- item_number sequencial começando em 1
- quantity, width, height são números (use ponto decimal). Se não houver, use null
- Não invente dados. Campos ausentes = null. items pode ser [] se não houver tabela legível.`;

    const url = mimeType?.startsWith('image/')
      ? `data:${mimeType};base64,${imageBase64}`
      : `data:image/jpeg;base64,${imageBase64}`;

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url } },
          ] },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: 'Falha na IA', detail: errText }), { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const json = await resp.json();
    let content: string = json.choices?.[0]?.message?.content ?? '';
    content = content.replace(/```json|```/g, '').trim();

    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { raw: content }; }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
