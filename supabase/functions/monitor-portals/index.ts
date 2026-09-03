import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";
import { discoverFeed } from "../_shared/rss-discovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Input = {
  force?: boolean;
  portalId?: string | null;
  userId?: string;
  forceDraft?: boolean;
  itemLimit?: number;
};

type Portal = {
  id: string;
  user_id: string;
  project_id: string | null;
  portal_name: string;
  portal_url: string;
  rss_feed_url: string | null;
  niches: string[] | null;
  monitoring_frequency: string | null;
  max_articles_per_day: number | null;
  auto_publish: boolean | null;
  automation_mode: string | null;
  is_active: boolean;
  next_check_at: string | null;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

function nextCheck(frequency: string | null) {
  const normalized = String(frequency || "hourly").toLowerCase();
  const ms = normalized === "realtime" ? 15 * 60_000 : normalized === "daily" ? 86_400_000 : normalized === "weekly" ? 604_800_000 : 3_600_000;
  return new Date(Date.now() + ms).toISOString();
}

async function callInternal(supabaseUrl: string, serviceKey: string, slug: string, body: unknown) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${slug}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240000),
  });
  const text = await response.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 1000) }; }
  return { ok: response.ok && data?.success !== false, status: response.status, data };
}

async function ensureSchedule(admin: any, portal: Portal, feedUrl: string) {
  if (!portal.project_id) return null;
  const payload = {
    user_id: portal.user_id,
    project_id: portal.project_id,
    feed_url: feedUrl,
    feed_name: portal.portal_name,
    niche: Array.isArray(portal.niches) && portal.niches[0] ? portal.niches[0] : "auto",
    article_length: "auto",
    frequency: portal.monitoring_frequency || "hourly",
    auto_publish: portal.auto_publish !== false,
    is_active: portal.is_active,
    next_run_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: byFeed, error: feedError } = await admin.from("rss_schedules")
    .select("id,feed_url")
    .eq("project_id", portal.project_id)
    .eq("feed_url", feedUrl)
    .limit(1)
    .maybeSingle();
  if (feedError) throw feedError;
  if (byFeed?.id) {
    const { data, error } = await admin.from("rss_schedules").update(payload).eq("id", byFeed.id).select("id,feed_url").single();
    if (error) throw error;
    return data;
  }

  const { data: sameName, error: nameError } = await admin.from("rss_schedules")
    .select("id,feed_url")
    .eq("project_id", portal.project_id)
    .eq("feed_name", portal.portal_name)
    .limit(1)
    .maybeSingle();
  if (nameError) throw nameError;
  if (sameName?.id) {
    const { data, error } = await admin.from("rss_schedules").update(payload).eq("id", sameName.id).select("id,feed_url").single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await admin.from("rss_schedules").insert({ ...payload, articles_generated: 0, created_at: new Date().toISOString() }).select("id,feed_url").single();
  if (error) throw error;
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();

  try {
    const input = await req.json().catch(() => ({})) as Input;
    const actor = await resolveRequestActor(req, input.userId);
    const userId = actor.userId;
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const now = new Date().toISOString();
    let query = admin.from("monitored_portals").select("id,user_id,project_id,portal_name,portal_url,rss_feed_url,niches,monitoring_frequency,max_articles_per_day,auto_publish,automation_mode,is_active,next_check_at").eq("user_id", userId).eq("is_active", true);
    if (input.portalId) query = query.eq("id", input.portalId);
    else if (!input.force) query = query.or(`next_check_at.is.null,next_check_at.lte.${now}`);
    const { data, error } = await query.order("next_check_at", { ascending: true, nullsFirst: true }).limit(input.portalId ? 1 : 25);
    if (error) throw error;

    const portals = (data || []) as Portal[];
    const results: any[] = [];
    let generated = 0;
    let drafts = 0;
    let queued = 0;

    for (const portal of portals) {
      const startedAt = new Date().toISOString();
      try {
        const discovery = await discoverFeed(portal.portal_url, { directCandidate: portal.rss_feed_url });
        if (!discovery.valid) {
          await admin.from("monitored_portals").update({
            last_check_at: startedAt,
            next_check_at: nextCheck(portal.monitoring_frequency),
            last_error: `RSS não validado: ${discovery.reason || "feed_not_found"}`,
            rss_feed_validation: { ...discovery, attempted: discovery.attempted.slice(0, 30) },
            rss_feed_validated_at: null,
            updated_at: new Date().toISOString(),
          }).eq("id", portal.id).eq("user_id", userId);
          results.push({ portal_id: portal.id, portal_name: portal.portal_name, success: false, stage: "rss_discovery", discovery });
          continue;
        }

        const validatedAt = new Date().toISOString();
        const validation = {
          url: discovery.url,
          format: discovery.format,
          http_status: discovery.status,
          content_type: discovery.content_type,
          content_type_valid: discovery.content_type_valid,
          structure_valid: discovery.structure_valid,
          discovery_method: discovery.discovery_method,
          attempted: discovery.attempted,
        };
        await admin.from("monitored_portals").update({
          rss_feed_url: discovery.url,
          rss_feed_validation: validation,
          rss_feed_validated_at: validatedAt,
          last_check_at: startedAt,
          last_success_at: validatedAt,
          next_check_at: nextCheck(portal.monitoring_frequency),
          last_error: null,
          automation_mode: portal.automation_mode || "ai_95",
          updated_at: validatedAt,
        }).eq("id", portal.id).eq("user_id", userId);

        if (!portal.project_id) {
          results.push({ portal_id: portal.id, portal_name: portal.portal_name, success: true, feed: discovery.url, discovery_method: discovery.discovery_method, processing: "not_started_without_project" });
          continue;
        }

        await admin.from("projects").update({ rss_feed_url: discovery.url, rss_feed_validation: validation, rss_feed_validated_at: validatedAt, updated_at: validatedAt }).eq("id", portal.project_id).eq("user_id", userId);
        const schedule = await ensureSchedule(admin, portal, discovery.url);
        if (!schedule?.id) throw new Error("Não foi possível sincronizar rss_schedule");

        const processed = await callInternal(supabaseUrl, serviceKey, "auto-process-rss", {
          scheduleId: schedule.id,
          forceDraft: Boolean(input.forceDraft),
          itemLimit: Math.max(1, Math.min(10, Number(input.itemLimit || portal.max_articles_per_day || 5))),
        });
        if (!processed.ok) throw new Error(String(processed.data?.error || `auto-process-rss HTTP ${processed.status}`));
        generated += Number(processed.data?.processed || 0);
        drafts += Number(processed.data?.drafts || 0);
        queued += Number(processed.data?.queued || 0);
        results.push({
          portal_id: portal.id,
          portal_name: portal.portal_name,
          success: true,
          feed: discovery.url,
          feed_http_status: discovery.status,
          feed_content_type: discovery.content_type,
          discovery_method: discovery.discovery_method,
          schedule_id: schedule.id,
          pipeline: processed.data,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao processar portal";
        await admin.from("monitored_portals").update({ last_check_at: startedAt, next_check_at: nextCheck(portal.monitoring_frequency), last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", portal.id).eq("user_id", userId);
        results.push({ portal_id: portal.id, portal_name: portal.portal_name, success: false, error: message });
      }
    }

    return json({ success: true, portals_processed: portals.length, articles_created: generated, wordpress_operations: queued, drafts, results, request_id: requestId });
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ success: false, error: error.message, code: error.code, request_id: requestId }, error.status);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno", request_id: requestId }, 500);
  }
});
