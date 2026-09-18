import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validateRSSUrl, fetchFeed as fetchSharedFeed } from "../_shared/rss-feed.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-zica-automation-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RSSItem {
  title: string;
  link: string;
  description: string;
  publishedAt: string | null;
  content?: string;
}

interface Schedule {
  id: string;
  user_id: string;
  project_id: string | null;
  feed_url: string;
  feed_name: string;
  niche: string | null;
  article_length: string | null;
  frequency: string | null;
  auto_publish: boolean | null;
  last_run_at: string | null;
  next_run_at: string | null;
  articles_generated: number | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Fetches a feed via the shared, SSRF-hardened rss-feed module and adapts
// its richer item shape to this function's local RSSItem contract. Callers
// MUST call validateRSSUrl(url) first (this function does not validate).
async function fetchFeed(url: string): Promise<RSSItem[]> {
  const feed = await fetchSharedFeed(url);

  const items: RSSItem[] = [];
  for (const item of feed.items.slice(0, 20)) {
    if (!item.title || !item.link) continue;
    try { new URL(item.link); } catch { continue; }
    items.push({
      title: item.title,
      link: item.link,
      description: item.description || "",
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      content: item.content || undefined,
    });
  }
  return items;
}

function nextRun(frequency: string | null) {
  const now = Date.now();
  const normalized = (frequency || "daily").toLowerCase();
  const ms = normalized === "hourly" ? 60 * 60 * 1000
    : normalized === "weekly" ? 7 * 24 * 60 * 60 * 1000
    : normalized === "realtime" ? 15 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  return new Date(now + ms).toISOString();
}

async function claimSchedule(admin: ReturnType<typeof createClient>, schedule: Schedule) {
  const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  let query = admin.from("rss_schedules").update({ next_run_at: lockUntil, updated_at: new Date().toISOString() }).eq("id", schedule.id);
  query = schedule.next_run_at ? query.eq("next_run_at", schedule.next_run_at) : query.is("next_run_at", null);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Backend incompleto" }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = req.headers.get("Authorization") || "";
  const serviceAuthorized = auth.startsWith("Bearer ") && auth.slice(7) === serviceKey;
  const automationKey = req.headers.get("x-zica-automation-key") || "";
  let automationAuthorized = false;
  if (automationKey) {
    // Accepts either the shared "news-agents" ingress key (execute-news-agents
    // cron) or the dedicated "rss-schedules" key (auto-process-rss cron, see
    // migration 20260919010000_auto_process_rss_cron.sql) so each cron job can
    // carry its own rotatable secret without duplicating this auth check.
    const { data: ingressRows } = await admin
      .from("automation_ingress_keys")
      .select("secret_hash,enabled")
      .in("name", ["news-agents", "rss-schedules"])
      .eq("enabled", true);
    const keyHash = await sha256(automationKey);
    automationAuthorized = Boolean(ingressRows?.some((row) => row.secret_hash && row.secret_hash === keyHash));
  }
  if (!serviceAuthorized && !automationAuthorized) return json({ error: "Autorização necessária" }, 401);
  const body = await req.json().catch(() => ({}));
  if (body?.dryRun === true) return json({ success: true, authorized: true, dry_run: true });

  const nowIso = new Date().toISOString();
  const { data: schedules, error } = await admin
    .from("rss_schedules")
    .select("id,user_id,project_id,feed_url,feed_name,niche,article_length,frequency,auto_publish,last_run_at,next_run_at,articles_generated")
    .eq("is_active", true)
    .or(`next_run_at.is.null,next_run_at.lte.${nowIso}`)
    .order("next_run_at", { ascending: true, nullsFirst: true })
    .limit(25);

  if (error) return json({ error: error.message }, 500);
  if (!schedules?.length) return json({ success: true, processed: 0, published: 0, schedules: [] });

  const results: Array<Record<string, unknown>> = [];
  let processed = 0;
  let published = 0;

  for (const raw of schedules) {
    const schedule = raw as Schedule;
    try {
      if (!(await claimSchedule(admin, schedule))) continue;
      validateRSSUrl(schedule.feed_url); // throws on private/local targets; caught below, this schedule is skipped and logged
      const items = await fetchFeed(schedule.feed_url);
      let createdForSchedule = 0;
      let publishedForSchedule = 0;

      for (const item of items.slice(0, 3)) {
        const rewrite = await fetch(`${supabaseUrl}/functions/v1/rewrite-news`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceUrl: item.link,
            sourceContent: item.content || item.description || item.title,
            sourceName: schedule.feed_name,
            analysisAngle: `Contextualizar ${item.title} para o nicho ${schedule.niche || "geral"}, sem criar fatos novos.`,
            niche: schedule.niche || "geral",
            articleLength: schedule.article_length || "medium",
            projectId: schedule.project_id,
            userId: schedule.user_id,
            language: "pt-BR",
          }),
        });

        if (!rewrite.ok) {
          const detail = await rewrite.text();
          results.push({ schedule_id: schedule.id, source_url: item.link, stage: "rewrite", error: detail.slice(0, 500) });
          continue;
        }

        const rewriteResult = await rewrite.json();
        if (!rewriteResult?.success || !rewriteResult?.article) continue;
        if (!rewriteResult.duplicate) {
          createdForSchedule += 1;
          processed += 1;
        }

        const article = rewriteResult.article;
        await admin.from("articles").update({
          config: {
            ...(article.config || {}),
            schedule_id: schedule.id,
            rss_published_at: item.publishedAt,
          },
        }).eq("id", article.id);

        let imageReady = Boolean(article.featured_image_url);
        if (!imageReady && schedule.project_id) {
          const image = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: schedule.user_id,
              articleId: article.id,
              projectId: schedule.project_id,
              moduleKey: "news",
              allowAiGeneration: true,
              watermark: "RDM ADVOGADOS",
              title: article.title,
              context: article.excerpt || item.description || "",
              content: article.content || "",
              segment: "news",
              aspectRatio: "16:9",
              quality: "high",
            }),
          });
          const imageBody = await image.json().catch(() => ({}));
          imageReady = image.ok && imageBody?.success === true;
          if (!imageReady) {
            await admin.from("articles").update({
              error_message: String(imageBody?.error || `Imagem pendente: HTTP ${image.status}`).slice(0, 500),
              updated_at: new Date().toISOString(),
            }).eq("id", article.id);
          }
        }

        if (schedule.auto_publish && schedule.project_id && imageReady && !rewriteResult.duplicate && Number(article.originality_score || 0) >= 95) {
          const publish = await fetch(`${supabaseUrl}/functions/v1/publish-to-wordpress`, {
            method: "POST",
            headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ articleId: article.id, projectId: schedule.project_id, userId: schedule.user_id }),
          });
          if (publish.ok) {
            const publishBody = await publish.json().catch(() => ({}));
            if (publishBody?.success) {
              publishedForSchedule += 1;
              published += 1;
            }
          }
        }
      }

      await admin.from("rss_schedules").update({
        last_run_at: new Date().toISOString(),
        next_run_at: nextRun(schedule.frequency),
        articles_generated: Number(schedule.articles_generated || 0) + createdForSchedule,
        last_decision: {
          status: "completed",
          items_found: items.length,
          created: createdForSchedule,
          published: publishedForSchedule,
          checked_at: new Date().toISOString(),
        },
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", schedule.id);

      results.push({
        schedule_id: schedule.id,
        feed: schedule.feed_name,
        items_found: items.length,
        created: createdForSchedule,
        published: publishedForSchedule,
        success: true,
      });
    } catch (scheduleError) {
      const message = scheduleError instanceof Error ? scheduleError.message : "Erro desconhecido";
      await admin.from("rss_schedules").update({
        next_run_at: nextRun(schedule.frequency),
        last_error: message.slice(0, 1000),
        last_decision: { status: "failed", checked_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }).eq("id", schedule.id);
      results.push({ schedule_id: schedule.id, success: false, error: message });
    }
  }

  return json({ success: true, processed, published, schedules: results });
});
