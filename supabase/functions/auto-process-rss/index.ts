import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import type { RecentEditorialDecision } from "../_shared/editorial-autonomy.ts";

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
  editorial_autonomy?: boolean | null;
  last_run_at: string | null;
  next_run_at: string | null;
  articles_generated: number | null;
}

interface RequestBody {
  force?: boolean;
  dryRun?: boolean;
  scheduleIds?: string[];
  maxSchedules?: number;
  maxItemsPerSchedule?: number;
}

interface Caller {
  mode: "automation" | "service" | "user";
  userId: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function env(name: string) {
  return String(Deno.env.get(name) || "").trim();
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticateCaller(req: Request, admin: ReturnType<typeof createClient>, supabaseUrl: string): Promise<Caller> {
  const automationKey = String(req.headers.get("x-zica-automation-key") || "").trim();
  if (automationKey) {
    const { data: keyRow } = await admin
      .from("automation_ingress_keys")
      .select("secret_hash,enabled")
      .eq("name", "news-agents")
      .maybeSingle();
    const valid = Boolean(keyRow?.enabled && keyRow.secret_hash && await sha256(automationKey) === keyRow.secret_hash);
    if (!valid) throw new Error("automation_key_invalid");
    return { mode: "automation", userId: null };
  }

  const authorization = String(req.headers.get("Authorization") || "");
  if (!authorization.startsWith("Bearer ")) throw new Error("authorization_required");
  const token = authorization.slice(7).trim();
  const serviceTokens = [env("SUPABASE_SERVICE_ROLE_KEY"), env("SUPABASE_SECRET_KEY")].filter(Boolean);
  if (serviceTokens.includes(token)) return { mode: "service", userId: null };

  const anonKey = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  if (!anonKey) throw new Error("backend_auth_incomplete");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new Error("session_invalid");
  return { mode: "user", userId: data.user.id };
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

function stripHtml(value: string) {
  return decodeXml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function firstTag(xml: string, tag: string) {
  const escaped = tag.replace(":", "\\:");
  const match = xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match?.[1] ? decodeXml(match[1]) : "";
}

async function fetchFeed(url: string): Promise<RSSItem[]> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("RSS URL inválida");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "ZicaAI-Repost-Queue/3.0",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`RSS HTTP ${response.status}`);
  const xml = await response.text();
  if (xml.length > 5_000_000) throw new Error("RSS excede 5 MB");

  const items: RSSItem[] = [];
  const rssMatches = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  const atomMatches = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
  const blocks = rssMatches.length ? rssMatches.map((match) => match[1]) : atomMatches.map((match) => match[1]);

  for (const block of blocks.slice(0, 30)) {
    const title = stripHtml(firstTag(block, "title"));
    let link = firstTag(block, "link");
    if (!link) link = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || "";
    const descriptionRaw = firstTag(block, "description") || firstTag(block, "summary");
    const contentRaw = firstTag(block, "content:encoded") || firstTag(block, "content");
    const dateRaw = firstTag(block, "pubDate") || firstTag(block, "published") || firstTag(block, "updated");
    if (!title || !link) continue;
    try {
      new URL(link);
    } catch {
      continue;
    }
    let publishedAt: string | null = null;
    if (dateRaw) {
      const parsedDate = new Date(dateRaw);
      if (!Number.isNaN(parsedDate.getTime())) publishedAt = parsedDate.toISOString();
    }
    items.push({
      title,
      link,
      description: stripHtml(descriptionRaw),
      content: contentRaw ? stripHtml(contentRaw) : undefined,
      publishedAt,
    });
  }
  return items;
}

function nextRun(frequency: string | null) {
  const normalized = String(frequency || "daily").toLowerCase();
  const milliseconds = normalized === "realtime" ? 15 * 60 * 1000
    : normalized === "hourly" ? 60 * 60 * 1000
    : normalized === "twice_daily" ? 12 * 60 * 60 * 1000
    : normalized === "weekly" ? 7 * 24 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  return new Date(Date.now() + milliseconds).toISOString();
}

async function claimSchedule(admin: ReturnType<typeof createClient>, schedule: Schedule) {
  const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  let query = admin
    .from("rss_schedules")
    .update({ next_run_at: lockUntil, updated_at: new Date().toISOString() })
    .eq("id", schedule.id);
  query = schedule.next_run_at ? query.eq("next_run_at", schedule.next_run_at) : query.is("next_run_at", null);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function callEdge(
  supabaseUrl: string,
  serviceKey: string,
  slug: string,
  body: Record<string, unknown>,
  timeout = 150000,
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.slice(0, 800) };
  }
  return { ok: response.ok && data?.success !== false, status: response.status, data };
}

function decisionForHistory(article: Record<string, any>, decision: Record<string, any> | null): RecentEditorialDecision {
  return {
    niche: decision?.niche || article.nicho_detectado || null,
    analysisAngleId: decision?.analysisAngleId || null,
    analysisAngle: decision?.analysisAngle || article.angulo_analise || null,
    emotionalTrigger: decision?.emotionalTrigger || article.emotional_trigger || null,
    articleLength: decision?.articleLength || null,
    keyword: decision?.keyword || article.keyword || null,
    sourceName: article.config?.source_name || null,
    createdAt: article.created_at || new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID();
  try {
    const supabaseUrl = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let caller: Caller;
    try {
      caller = await authenticateCaller(req, admin, supabaseUrl);
    } catch (error) {
      const code = error instanceof Error ? error.message : "authorization_failed";
      const status = code === "automation_key_invalid" || code === "session_invalid" ? 401 : code === "authorization_required" ? 401 : 500;
      return json({ success: false, error: code, request_id: requestId }, status);
    }

    const body = await req.json().catch(() => ({})) as RequestBody;
    const maxSchedules = Math.min(50, Math.max(1, Number(body.maxSchedules || 25)));
    const maxItems = Math.min(10, Math.max(1, Number(body.maxItemsPerSchedule || 3)));
    const nowIso = new Date().toISOString();

    let query = admin
      .from("rss_schedules")
      .select("id,user_id,project_id,feed_url,feed_name,niche,article_length,frequency,auto_publish,editorial_autonomy,last_run_at,next_run_at,articles_generated")
      .eq("is_active", true)
      .order("next_run_at", { ascending: true, nullsFirst: true })
      .limit(maxSchedules);
    if (!body.force) query = query.or(`next_run_at.is.null,next_run_at.lte.${nowIso}`);
    if (caller.userId) query = query.eq("user_id", caller.userId);
    if (body.scheduleIds?.length) query = query.in("id", body.scheduleIds.slice(0, 50));

    const { data: schedules, error } = await query;
    if (error) return json({ success: false, error: error.message, request_id: requestId }, 500);
    if (!schedules?.length) {
      return json({ success: true, processed: 0, published: 0, rssConfirmed: 0, schedules: [], request_id: requestId });
    }

    const results: Array<Record<string, unknown>> = [];
    let processed = 0;
    let published = 0;
    let rssConfirmed = 0;
    let duplicates = 0;

    for (const raw of schedules) {
      const schedule = raw as Schedule;
      const scheduleResult: Record<string, any> = {
        schedule_id: schedule.id,
        feed: schedule.feed_name,
        items_found: 0,
        created: 0,
        duplicates: 0,
        published: 0,
        rss_confirmed: 0,
        held_for_review: 0,
        decisions: [],
        errors: [],
        success: true,
      };

      try {
        if (!body.force && !(await claimSchedule(admin, schedule))) continue;
        const items = await fetchFeed(schedule.feed_url);
        const queue = items.slice(0, maxItems);
        scheduleResult.items_found = items.length;
        const currentRunDecisions: RecentEditorialDecision[] = [];

        for (let index = 0; index < queue.length; index += 1) {
          const item = queue[index];
          const rewrite = await callEdge(supabaseUrl, serviceKey, "rewrite-news", {
            sourceUrl: item.link,
            sourceContent: item.content || item.description || item.title,
            sourceName: schedule.feed_name,
            niche: schedule.niche || "auto",
            analysisAngle: "auto",
            articleLength: schedule.article_length || "auto",
            projectId: schedule.project_id,
            userId: schedule.user_id,
            language: "pt-BR",
            editorialAutonomy: schedule.editorial_autonomy !== false,
            repostBatchContext: {
              scheduleId: schedule.id,
              sourceType: "rss",
              queuePosition: index + 1,
              queueSize: queue.length,
              feedName: schedule.feed_name,
              recentDecisions: currentRunDecisions,
            },
          });

          if (!rewrite.ok || !rewrite.data?.article) {
            scheduleResult.errors.push({ source_url: item.link, stage: "rewrite", status: rewrite.status, error: String(rewrite.data?.error || "rewrite_failed").slice(0, 500) });
            continue;
          }

          const article = rewrite.data.article as Record<string, any>;
          const decision = rewrite.data.editorialDecision || article.config?.editorial_decision || null;
          currentRunDecisions.unshift(decisionForHistory(article, decision));
          scheduleResult.decisions.push({
            article_id: article.id,
            source_url: item.link,
            duplicate: Boolean(rewrite.data.duplicate),
            niche: decision?.niche || article.nicho_detectado || null,
            angle: decision?.analysisAngle || article.angulo_analise || null,
            length: decision?.articleLength || null,
            trigger: decision?.emotionalTrigger || article.emotional_trigger || null,
            risk: decision?.riskLevel || null,
            review_required: Boolean(decision?.requiresHumanReview || article.config?.requires_human_review),
          });

          if (rewrite.data.duplicate) {
            duplicates += 1;
            scheduleResult.duplicates += 1;
            continue;
          }

          processed += 1;
          scheduleResult.created += 1;
          const mergedConfig = {
            ...(article.config || {}),
            schedule_id: schedule.id,
            rss_feed_url: schedule.feed_url,
            rss_feed_name: schedule.feed_name,
            rss_source_published_at: item.publishedAt,
            rss_ingested_at: new Date().toISOString(),
          };
          await admin.from("articles").update({ config: mergedConfig, updated_at: new Date().toISOString() }).eq("id", article.id).eq("user_id", schedule.user_id);

          const ready = article.status === "ready" && article.config?.review_pass !== false && article.config?.requires_human_review !== true;
          if (body.dryRun || !schedule.auto_publish || !schedule.project_id) continue;
          if (!ready) {
            scheduleResult.held_for_review += 1;
            continue;
          }

          const publish = await callEdge(supabaseUrl, serviceKey, "publish-to-wordpress", {
            articleId: article.id,
            projectId: schedule.project_id,
            userId: schedule.user_id,
            publishStatus: "publish",
          }, 180000);

          if (!publish.ok || !publish.data?.success) {
            scheduleResult.errors.push({ source_url: item.link, article_id: article.id, stage: "publish", status: publish.status, error: String(publish.data?.error || "publish_failed").slice(0, 500) });
            continue;
          }

          published += 1;
          scheduleResult.published += 1;
          if (publish.data.rss?.status === "confirmed") {
            rssConfirmed += 1;
            scheduleResult.rss_confirmed += 1;
          }
        }

        const lastDecision = scheduleResult.decisions.at(-1) || null;
        await admin.from("rss_schedules").update({
          last_run_at: new Date().toISOString(),
          next_run_at: nextRun(schedule.frequency),
          articles_generated: Number(schedule.articles_generated || 0) + Number(scheduleResult.created || 0),
          last_error: scheduleResult.errors.length ? JSON.stringify(scheduleResult.errors).slice(0, 4000) : null,
          last_decision: lastDecision,
          updated_at: new Date().toISOString(),
        }).eq("id", schedule.id);
      } catch (scheduleError) {
        scheduleResult.success = false;
        scheduleResult.errors.push({ stage: "schedule", error: scheduleError instanceof Error ? scheduleError.message : "Erro desconhecido" });
        await admin.from("rss_schedules").update({
          next_run_at: nextRun(schedule.frequency),
          last_error: String(scheduleError instanceof Error ? scheduleError.message : "Erro desconhecido").slice(0, 4000),
          updated_at: new Date().toISOString(),
        }).eq("id", schedule.id);
      }

      results.push(scheduleResult);
    }

    return json({
      success: true,
      caller: caller.mode,
      dryRun: Boolean(body.dryRun),
      processed,
      duplicates,
      published,
      rssConfirmed,
      schedules: results,
      request_id: requestId,
    });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno", request_id: requestId }, 500);
  }
});
