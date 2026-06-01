import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const expected = Deno.env.get("SIGNUP_ACCESS_CODE");
    if (!expected) {
      return new Response(JSON.stringify({ error: "Cadastro indisponível no momento" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { accessCode } = await req.json().catch(() => ({ accessCode: "" }));

    const valid = typeof accessCode === "string" && accessCode === expected;

    return new Response(JSON.stringify({ valid }), {
      status: valid ? 200 : 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ valid: false }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
