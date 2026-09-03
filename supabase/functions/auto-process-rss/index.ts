import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { discoverFeed, fetchValidatedFeedItems } from "../_shared/rss-discovery.ts";
import type { RecentEditorialDecision } from "../_shared/editorial-autonomy.ts";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-zica-automation-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Schedule = {
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
};

type Portal = {
  id: string;
  project_id: string | null;
  portal_name: string;
  portal_url: string;
  rss_feed_url: string | null;
  automation_mode: string | null;
  max_articles_per_day: number | null;
};

type Input = {
  force?: boolean;
  dryRun?: boolean;
  forceDraft?: boolean;
  scheduleId?: string | null;
  scheduleIds?: string[];
  maxSchedules?: number;
  maxItemsPerSchedule?: number;
};

type Caller = { mode: "automation" | "service" | "user"; userId: string | null };

const J = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...H, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const env = (name: string) => String(Deno.env.get(name) || "").trim();

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticateCaller(req: Request, admin: any, supabaseUrl: string): Promise<Caller> {
  const automationKey = String(req.headers.get("x-zica-automation-key") || "").trim();
  if (automationKey) {
    const { data: keyRow } = await admin.from("automation_ingress_keys").select("secret_hash,enabled").eq("name", "news-agents").maybeSingle();
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
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new Error("session_invalid");
  return { mode: "user", userId: data.user.id };
}

function nextRun(frequency: string | null) {
  const normalized = String(frequency || "hourly").toLowerCase();
  const milliseconds = normalized === "realtime" ? 15 * 60 * 1000
    : normalized === "hourly" ? 60 * 60 * 1000
    : normalized === "twice_daily" ? 12 * 60 * 60 * 1000
    : normalized === "weekly" ? 7 * 24 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  return new Date(Date.now() + milliseconds).toISOString();
}

async function claim(admin: any, schedule: Schedule, targeted: boolean) {
  const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  let query = admin.from("rss_schedules").update({ next_run_at: lockUntil, updated_at: new Date().toISOString() }).eq("id", schedule.id);
  if (!targeted) query = schedule.next_run_at ? query.eq("next_run_at", schedule.next_run_at) : query.is("next_run_at", null);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function callEdge(url: string, key: string, slug: string, body: Record<string, unknown>, timeout = 180000) {
  const response = await fetch(`${url}/functions/v1/${slug}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await response.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 1000) }; }
  return { ok: response.ok && data?.success !== false, status: response.status, data };
}

async function resolvePortal(admin: any, schedule: Schedule): Promise<Portal | null> {
  if (!schedule.project_id) return null;
  const { data, error } = await admin.from("monitored_portals")
    .select("id,project_id,portal_name,portal_url,rss_feed_url,automation_mode,max_articles_per_day")
    .eq("project_id", schedule.project_id).eq("is_active", true).order("updated_at", { ascending: false }).limit(100);
  if (error) throw error;
  const rows = (data || []) as Portal[];
  return rows.find((portal) => portal.rss_feed_url === schedule.feed_url) || rows.find((portal) => portal.portal_name === schedule.feed_name) || null;
}

async function resolveFeed(admin: any, schedule: Schedule, portal: Portal | null) {
  let siteUrl = String(portal?.portal_url || "").trim();
  let project: any = null;
  if (schedule.project_id) {
    const { data } = await admin.from("projects").select("id,wordpress_url,domain,rss_feed_url").eq("id", schedule.project_id).maybeSingle();
    project = data;
    if (!siteUrl) siteUrl = String(data?.wordpress_url || data?.domain || schedule.feed_url);
  }
  if (siteUrl && !/^https?:\/\//i.test(siteUrl)) siteUrl = `https://${siteUrl}`;
  if (!siteUrl) siteUrl = schedule.feed_url;
  const directCandidate = String(schedule.feed_url || project?.rss_feed_url || "").trim() || null;
  const discovery = await discoverFeed(siteUrl, { directCandidate, timeoutMs: 15000 });
  if (!discovery.valid) throw new Error(`Feed inválido/não descoberto: ${discovery.reason || "unknown"}`);

  const validatedAt = new Date().toISOString();
  const validation = {
    url: discovery.url,
    site_url: discovery.site_url,
    format: discovery.format,
    http_status: discovery.status,
    content_type: discovery.content_type,
    content_type_valid: discovery.content_type_valid,
    structure_valid: discovery.structure_valid,
    bytes: discovery.bytes,
    discovery_method: discovery.discovery_method,
    attempted: discovery.attempted,
    validated_at: validatedAt,
  };

  if (discovery.url !== schedule.feed_url) {
    const { data: conflict } = await admin.from("rss_schedules").select("id").eq("project_id", schedule.project_id).eq("feed_url", discovery.url).neq("id", schedule.id).limit(1).maybeSingle();
    if (!conflict) await admin.from("rss_schedules").update({ feed_url: discovery.url, updated_at: validatedAt }).eq("id", schedule.id);
  }
  if (portal?.id) {
    await admin.from("monitored_portals").update({ rss_feed_url: discovery.url, rss_feed_validation: validation, rss_feed_validated_at: validatedAt, last_error: null, updated_at: validatedAt }).eq("id", portal.id);
  }
  if (schedule.project_id) {
    await admin.from("projects").update({ rss_feed_url: discovery.url, rss_feed_validation: validation, rss_feed_validated_at: validatedAt, updated_at: validatedAt }).eq("id", schedule.project_id);
  }
  return { discovery, validation };
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
  if (req.method === "OPTIONS") return new Response(null, { headers: H });
  if (req.method !== "POST") return J({ success: false, error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();
  try {
    const url = env("SUPABASE_URL");
    const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
    if (!url || !key) return J({ success: false, error: "Backend incompleto", request_id: requestId }, 500);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    let caller: Caller;
    try { caller = await authenticateCaller(req, admin, url); }
    catch (error) {
      const code = error instanceof Error ? error.message : "authorization_failed";
      return J({ success: false, error: code, request_id: requestId }, ["automation_key_invalid", "session_invalid", "authorization_required"].includes(code) ? 401 : 500);
    }

    const input = await req.json().catch(() => ({})) as Input;
    const targetedIds = input.scheduleId ? [input.scheduleId] : (input.scheduleIds || []);
    const targeted = targetedIds.length > 0;
    const maxSchedules = targeted ? Math.min(50, targetedIds.length) : Math.max(1, Math.min(25, Number(input.maxSchedules || 25)));
    const itemLimitInput = Math.max(1, Math.min(10, Number(input.maxItemsPerSchedule || 3)));
    const now = new Date().toISOString();

    let query = admin.from("rss_schedules")
      .select("id,user_id,project_id,feed_url,feed_name,niche,article_length,frequency,auto_publish,editorial_autonomy,last_run_at,next_run_at,articles_generated")
      .eq("is_active", true).order("next_run_at", { ascending: true, nullsFirst: true }).limit(maxSchedules);
    if (!input.force && !targeted) query = query.or(`next_run_at.is.null,next_run_at.lte.${now}`);
    if (caller.userId) query = query.eq("user_id", caller.userId);
    if (targeted) query = query.in("id", targetedIds.slice(0, 50));
    const { data: schedules, error } = await query;
    if (error) throw error;
    if (!schedules?.length) return J({ success: true, processed: 0, queued: 0, drafts: 0, duplicates: 0, schedules: [], request_id: requestId });

    let processed = 0, queued = 0, drafts = 0, duplicates = 0, heldForReview = 0;
    const results: any[] = [];

    for (const raw of schedules) {
      const schedule = raw as Schedule;
      const scheduleResult: Record<string, any> = { schedule_id: schedule.id, feed: schedule.feed_name, items_found: 0, created: 0, duplicates: 0, queued: 0, drafts: 0, held_for_review: 0, decisions: [], errors: [], success: true };
      try {
        if (!input.force && !(await claim(admin, schedule, targeted))) continue;
        const portal = await resolvePortal(admin, schedule);
        const { discovery, validation } = await resolveFeed(admin, schedule, portal);
        const itemLimit = Math.min(itemLimitInput, Math.max(1, Number(portal?.max_articles_per_day || itemLimitInput)));
        const { validation: secondValidation, items } = await fetchValidatedFeedItems(discovery.url, itemLimit);
        if (!secondValidation.valid) throw new Error(`RSS falhou na segunda validação: ${secondValidation.reason || "unknown"}`);
        scheduleResult.items_found = items.length;
        const currentRunDecisions: RecentEditorialDecision[] = [];

        if (portal?.id) {
          await admin.from("monitored_portals").update({ last_check_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null, last_articles_found: items.length, updated_at: new Date().toISOString() }).eq("id", portal.id);
        }

        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          const rewrite = await callEdge(url, key, "rewrite-news", {
            sourceUrl: item.link,
            sourceContent: item.content || item.description || item.title,
            sourceName: schedule.feed_name,
            rssFeedUrl: discovery.url,
            niche: schedule.niche || "auto",
            analysisAngle: "auto",
            articleLength: schedule.article_length || "auto",
            projectId: schedule.project_id,
            userId: schedule.user_id,
            language: "pt-BR",
            automationMode: portal?.automation_mode || "ai_95",
            editorialAutonomy: schedule.editorial_autonomy !== false,
            repostBatchContext: { scheduleId: schedule.id, sourceType: "rss", queuePosition: index + 1, queueSize: items.length, feedName: schedule.feed_name, recentDecisions: currentRunDecisions },
          });

          if (!rewrite.ok || !rewrite.data?.article) {
            scheduleResult.errors.push({ source_url: item.link, stage: "rewrite", status: rewrite.status, error: String(rewrite.data?.error || "rewrite_failed").slice(0, 700) });
            continue;
          }
          if (rewrite.data?.skipped) continue;
          const article = rewrite.data.article as Record<string, any>;
          const decision = rewrite.data.editorialDecision || article.config?.editorial_decision || null;
          currentRunDecisions.unshift(decisionForHistory(article, decision));
          scheduleResult.decisions.push({ article_id: article.id, source_url: item.link, duplicate: Boolean(rewrite.data.duplicate), niche: decision?.niche || article.nicho_detectado || null, angle: decision?.analysisAngle || article.angulo_analise || null, length: decision?.articleLength || null, trigger: decision?.emotionalTrigger || article.emotional_trigger || null, risk: decision?.riskLevel || null, review_required: Boolean(decision?.requiresHumanReview || article.config?.requires_human_review) });

          if (rewrite.data.duplicate) {
            duplicates++; scheduleResult.duplicates++;
            continue;
          }
          processed++; scheduleResult.created++;
          const mergedConfig = {
            ...(article.config || {}),
            schedule_id: schedule.id,
            rss_feed_url: discovery.url,
            rss_feed_name: schedule.feed_name,
            rss_source_url: item.link,
            rss_source_published_at: item.published_at,
            rss_ingested_at: new Date().toISOString(),
            rss_feed_validation: validation,
          };
          await admin.from("articles").update({ rss_feed_url: discovery.url, source_canonical_url: item.link, rss_feed_validation: validation, rss_feed_validated_at: validation.validated_at, config: mergedConfig, updated_at: new Date().toISOString() }).eq("id", article.id).eq("user_id", schedule.user_id);

          const ready = article.status === "ready" && article.config?.review_pass !== false && article.config?.requires_human_review !== true && article.config?.needs_primary_source !== true;
          if (input.dryRun || !schedule.project_id) continue;
          const publishStatus = input.forceDraft ? "draft" : (schedule.auto_publish && ready && rewrite.data?.auto_publish_recommended !== false ? "publish" : "draft");
          if (!input.forceDraft && publishStatus === "draft" && !ready) { heldForReview++; scheduleResult.held_for_review++; }

          const distribution = await callEdge(url, key, "wordpress-operations", {
            action: "publish",
            articleId: article.id,
            projectId: schedule.project_id,
            userId: schedule.user_id,
            publishStatus,
            categories: decision?.wordpress_category ? [decision.wordpress_category] : [],
            tags: Array.isArray(decision?.tags) ? decision.tags : [],
          });
          if (distribution.ok && distribution.data?.success) {
            queued++; scheduleResult.queued++;
            if (publishStatus === "draft") { drafts++; scheduleResult.drafts++; }
          } else {
            scheduleResult.errors.push({ article_id: article.id, source_url: item.link, stage: "wordpress_operations", publish_status: publishStatus, status: distribution.status, error: String(distribution.data?.error || "distribution_failed").slice(0, 700) });
          }
        }

        const updatedAt = new Date().toISOString();
        const lastDecision = scheduleResult.decisions.at(-1) || null;
        await admin.from("rss_schedules").update({ last_run_at: updatedAt, next_run_at: nextRun(schedule.frequency), articles_generated: Number(schedule.articles_generated || 0) + Number(scheduleResult.created || 0), last_error: scheduleResult.errors.length ? JSON.stringify(scheduleResult.errors).slice(0, 4000) : null, last_decision: lastDecision, updated_at: updatedAt }).eq("id", schedule.id);
        if (portal?.id) {
          await admin.from("monitored_portals").update({ rss_feed_url: discovery.url, last_ai_profile: lastDecision || {}, last_ai_confidence: Number(lastDecision?.confidence || 0) || null, articles_generated: Number(schedule.articles_generated || 0) + Number(scheduleResult.created || 0), next_check_at: nextRun(schedule.frequency), updated_at: updatedAt }).eq("id", portal.id);
        }
        scheduleResult.resolved_feed_url = discovery.url;
        scheduleResult.discovery_method = discovery.discovery_method;
        scheduleResult.feed_format = discovery.format;
        scheduleResult.feed_http_status = discovery.status;
        scheduleResult.feed_content_type = discovery.content_type;
        scheduleResult.feed_structure_valid = discovery.structure_valid;
        scheduleResult.force_draft = Boolean(input.forceDraft);
      } catch (scheduleError) {
        scheduleResult.success = false;
        const message = scheduleError instanceof Error ? scheduleError.message : "Erro desconhecido";
        scheduleResult.errors.push({ stage: "schedule", error: message });
        await admin.from("rss_schedules").update({ next_run_at: nextRun(schedule.frequency), last_error: message.slice(0, 4000), updated_at: new Date().toISOString() }).eq("id", schedule.id);
      }
      results.push(scheduleResult);
    }

    return J({ success: true, caller: caller.mode, dry_run: Boolean(input.dryRun), force_draft: Boolean(input.forceDraft), processed, queued, drafts, duplicates, held_for_review: heldForReview, schedules: results, request_id: requestId });
  } catch (error) {
    return J({ success: false, error: error instanceof Error ? error.message : "Erro interno", request_id: requestId }, 500);
  }
});
