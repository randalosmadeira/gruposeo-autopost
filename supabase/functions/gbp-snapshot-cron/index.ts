// deno-lint-ignore-file no-explicit-any
// Daily snapshot of tracked GBP competitors — invoked via pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function serperPlaces(query: string, apiKey: string, country: string, lang: string) {
  const res = await fetch("https://google.serper.dev/places", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: country, hl: lang }),
  });
  if (!res.ok) return null;
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: competitors, error } = await admin
    .from("gbp_competitors")
    .select("id, user_id, name, audit_id, gbp_audits!inner(city, country, language)")
    .eq("tracked", true)
    .limit(500);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Group by user for BYOK
  const byUser: Record<string, any[]> = {};
  for (const c of competitors || []) {
    (byUser[c.user_id] ||= []).push(c);
  }

  let processed = 0;
  for (const [userId, list] of Object.entries(byUser)) {
    const { data: settings } = await admin
      .from("user_settings")
      .select("serper_api_key")
      .eq("user_id", userId)
      .maybeSingle();
    const key = settings?.serper_api_key || Deno.env.get("SERPER_API_KEY") || "";
    if (!key) continue;

    for (const c of list) {
      try {
        const cityInfo = (c.gbp_audits as any) || {};
        const data = await serperPlaces(
          `${c.name} ${cityInfo.city || ""}`,
          key,
          (cityInfo.country || "br").toLowerCase(),
          (cityInfo.language || "pt-br").toLowerCase(),
        );
        const p = data?.places?.[0];
        if (!p) continue;
        await admin
          .from("gbp_competitor_snapshots")
          .upsert(
            {
              competitor_id: c.id,
              user_id: userId,
              rating: typeof p.rating === "number" ? p.rating : null,
              reviews_count: typeof p.ratingCount === "number" ? p.ratingCount : null,
              raw: p,
            },
            { onConflict: "competitor_id,snapshot_date" },
          );
        processed++;
      } catch (e) {
        console.warn("[gbp-snapshot-cron] err", c.id, e);
      }
    }
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
