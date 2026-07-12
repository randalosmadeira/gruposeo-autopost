// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AuditRequest {
  business_name: string;
  city: string;
  category?: string;
  country?: string;
  language?: string;
  project_id?: string;
}

async function serperPlaces(query: string, apiKey: string, country = "br", lang = "pt-br") {
  const res = await fetch("https://google.serper.dev/places", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: country, hl: lang }),
  });
  if (!res.ok) throw new Error(`Serper places ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function serperSearch(query: string, apiKey: string, country = "br", lang = "pt-br") {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: country, hl: lang }),
  });
  if (!res.ok) throw new Error(`Serper search ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function callAI(
  systemPrompt: string,
  userPrompt: string,
  keys: { openai?: string; gemini?: string },
): Promise<{ text: string; provider: string }> {
  // Prefer OpenAI when available (better JSON), fallback Gemini
  if (keys.openai) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${keys.openai}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
    });
    if (r.ok) {
      const j = await r.json();
      return { text: j.choices?.[0]?.message?.content ?? "{}", provider: "openai" };
    }
    console.warn("[gbp-audit] openai failed", r.status, await r.text());
  }
  if (keys.gemini) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keys.gemini}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
        }),
      },
    );
    if (r.ok) {
      const j = await r.json();
      return {
        text: j.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}",
        provider: "gemini",
      };
    }
    throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  }
  throw new Error("Nenhuma chave BYOK (OpenAI/Gemini) configurada em user_settings");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser(auth.replace("Bearer ", ""));
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;

    const body = (await req.json()) as AuditRequest;
    if (!body.business_name || !body.city) {
      return new Response(JSON.stringify({ error: "business_name e city obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: settings } = await admin
      .from("user_settings")
      .select("openai_api_key, gemini_api_key, serper_api_key")
      .eq("user_id", userId)
      .maybeSingle();

    const serperKey = settings?.serper_api_key || Deno.env.get("SERPER_API_KEY") || "";
    if (!serperKey) {
      return new Response(
        JSON.stringify({ error: "Configure sua chave Serper em user_settings.serper_api_key" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const country = (body.country || "br").toLowerCase();
    const language = (body.language || "pt-br").toLowerCase();
    const query = body.category
      ? `${body.category} ${body.city}`
      : `${body.business_name} ${body.city}`;

    // Create audit row
    const { data: audit, error: insErr } = await admin
      .from("gbp_audits")
      .insert({
        user_id: userId,
        project_id: body.project_id || null,
        business_name: body.business_name,
        city: body.city,
        category: body.category || null,
        country,
        language,
        search_query: query,
        status: "running",
      })
      .select()
      .single();
    if (insErr) throw insErr;

    try {
      const [places, serp] = await Promise.all([
        serperPlaces(query, serperKey, country, language),
        serperSearch(query, serperKey, country, language),
      ]);

      const localPack: any[] = places?.places || [];
      const ownPlace =
        localPack.find(
          (p) =>
            p.title?.toLowerCase().includes(body.business_name.toLowerCase()) ||
            body.business_name.toLowerCase().includes((p.title || "").toLowerCase()),
        ) || null;

      const competitors = localPack
        .filter((p) => p !== ownPlace)
        .slice(0, 10)
        .map((p) => ({
          place_id: p.placeId || p.cid || null,
          name: p.title,
          address: p.address,
          category: p.category || p.type,
          rating: typeof p.rating === "number" ? p.rating : null,
          reviews_count: typeof p.ratingCount === "number" ? p.ratingCount : null,
          phone: p.phoneNumber || null,
          website: p.website || null,
          latitude: p.latitude || null,
          longitude: p.longitude || null,
          price_level: p.priceLevel || null,
          hours: p.openingHours || null,
          raw: p,
        }));

      // AI analysis
      const aiSystem = `Você é um auditor sênior de SEO Local (Google Business Profile). Devolva SEMPRE JSON válido no formato:
{
  "diagnostico_perfil_proprio": string,
  "gaps_criticos": [string],
  "concorrentes_top": [
    {"nome": string, "pontos_fortes": [string], "pontos_fracos": [string], "padrao_resposta_reviews": string, "frequencia_publicacao_estimada": string, "estrategia_conteudo": string}
  ],
  "oportunidades_conteudo": [string],
  "recomendacoes_prioritarias": [string],
  "palavras_chave_locais": [string]
}
Analise TUDO com base nos dados reais fornecidos. Não invente.`;

      const aiUser = `NEGÓCIO ANALISADO: ${body.business_name} — ${body.city}
CATEGORIA: ${body.category || "não informada"}

PERFIL PRÓPRIO (Google Maps):
${JSON.stringify(ownPlace, null, 2)}

TOP CONCORRENTES (local pack):
${JSON.stringify(competitors.slice(0, 5), null, 2)}

SERP orgânica (top resultados):
${JSON.stringify((serp?.organic || []).slice(0, 5), null, 2)}

People Also Ask:
${JSON.stringify(serp?.peopleAlsoAsk || [], null, 2)}

Faça engenharia reversa dos concorrentes, analise padrão de respostas a avaliações (com base no que os dados mostram), estime frequência de publicação e produza recomendações acionáveis.`;

      const ai = await callAI(aiSystem, aiUser, {
        openai: settings?.openai_api_key || undefined,
        gemini: settings?.gemini_api_key || undefined,
      });

      let insights: any = {};
      try {
        insights = JSON.parse(ai.text);
      } catch {
        insights = { raw: ai.text };
      }

      const { error: updErr } = await admin
        .from("gbp_audits")
        .update({
          own_place: ownPlace,
          serp_data: serp,
          local_pack: localPack,
          ai_insights: insights,
          ai_provider: ai.provider,
          status: "completed",
        })
        .eq("id", audit.id);
      if (updErr) throw updErr;

      if (competitors.length) {
        const rows = competitors.map((c) => ({ ...c, audit_id: audit.id, user_id: userId }));
        const { data: inserted } = await admin
          .from("gbp_competitors")
          .insert(rows)
          .select("id, rating, reviews_count");
        // seed first snapshot
        if (inserted?.length) {
          await admin.from("gbp_competitor_snapshots").insert(
            inserted.map((c: any) => ({
              competitor_id: c.id,
              user_id: userId,
              rating: c.rating,
              reviews_count: c.reviews_count,
            })),
          );
        }
      }

      return new Response(JSON.stringify({ audit_id: audit.id, insights, provider: ai.provider }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err: any) {
      await admin
        .from("gbp_audits")
        .update({ status: "failed", error_message: String(err?.message || err) })
        .eq("id", audit.id);
      throw err;
    }
  } catch (err: any) {
    console.error("[gbp-audit] error", err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
