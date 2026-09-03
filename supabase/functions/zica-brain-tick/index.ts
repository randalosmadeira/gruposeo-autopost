import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-zica-automation-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...H, "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function bucket(minutes: number) { const ms = minutes * 60000; return new Date(Math.floor(Date.now() / ms) * ms).toISOString(); }
function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function stripHtml(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function countMatches(value: string, re: RegExp) { return (value.match(re) || []).length; }

async function state(admin: any, userId: string, subsystem: string, status: "healthy"|"degraded"|"offline"|"unknown", metrics: Record<string, unknown> = {}, error?: string) {
  const now = new Date().toISOString();
  await admin.from("zica_brain_state").upsert({ user_id: userId, subsystem, status, last_heartbeat_at: now, last_success_at: status === "healthy" ? now : undefined, last_error_at: error ? now : undefined, last_error: error ? error.slice(0, 2000) : null, metrics, updated_at: now }, { onConflict: "user_id,subsystem" });
}

async function enqueue(admin: any, row: Record<string, unknown>) {
  const { error } = await admin.from("zica_brain_jobs").upsert(row, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true });
  if (error && !String(error.message).includes("duplicate")) throw error;
}

async function edgeCall(baseUrl: string, serviceKey: string, slug: string, body: Record<string, unknown>, timeoutMs = 120000) {
  const response = await fetch(`${baseUrl}/functions/v1/${slug}`, { method: "POST", headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text(); let data: any = null;
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 800) }; }
  return { ok: response.ok && data?.success !== false, status: response.status, data };
}

async function providerHealth(admin: any, userId: string) {
  const { data: settings } = await admin.from("user_settings").select("openai_api_key,anthropic_api_key").eq("user_id", userId).maybeSingle();
  const openaiKey = String(settings?.openai_api_key || "").trim();
  const anthropicKey = String(settings?.anthropic_api_key || "").trim();
  const result: any = { checked_at: new Date().toISOString() };
  if (openaiKey) {
    try {
      const r = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-5.6-sol", input: "Responda somente OK.", max_output_tokens: 16, store: false }), signal: AbortSignal.timeout(30000) });
      const text = await r.text(); let payload: any = {}; try { payload = JSON.parse(text); } catch { /* ignore */ }
      result.openai = { configured: true, operational: r.ok, httpStatus: r.status, model: "gpt-5.6-sol", errorCode: payload?.error?.code || null, errorType: payload?.error?.type || null };
    } catch (e) { result.openai = { configured: true, operational: false, httpStatus: 0, model: "gpt-5.6-sol", errorCode: "network_error", detail: e instanceof Error ? e.message : "error" }; }
  } else result.openai = { configured: false, operational: false, httpStatus: null };
  if (anthropicKey) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 8, messages: [{ role: "user", content: "Responda somente OK." }] }), signal: AbortSignal.timeout(30000) });
      const payload = await r.json().catch(() => ({}));
      result.anthropic = { configured: true, operational: r.ok, httpStatus: r.status, model: "claude-sonnet-4-6", errorType: payload?.error?.type || null };
    } catch (e) { result.anthropic = { configured: true, operational: false, httpStatus: 0, model: "claude-sonnet-4-6", errorType: "network_error", detail: e instanceof Error ? e.message : "error" }; }
  } else result.anthropic = { configured: false, operational: false, httpStatus: null };
  for (const provider of ["openai", "anthropic"] as const) await admin.from("zica_ai_provider_health_cache").upsert({ provider, checked_at: result.checked_at, payload: { provider: result[provider], operational: result[provider]?.operational === true, billable_probe: true } }, { onConflict: "provider" });
  return result;
}

async function auditArticle(admin: any, userId: string, articleId: string) {
  const { data: article } = await admin.from("articles").select("id,title,content,excerpt,keyword,secondary_keywords,originality_score,status,project_id,published_url,config").eq("id", articleId).eq("user_id", userId).maybeSingle();
  if (!article) throw new Error("article_not_found");
  const html = String(article.content || ""); const text = stripHtml(html); const words = text.split(/\s+/).filter(Boolean);
  const h2 = countMatches(html, /<h2\b/gi) + countMatches(html, /^##\s+/gm); const h3 = countMatches(html, /<h3\b/gi) + countMatches(html, /^###\s+/gm);
  const links = countMatches(html, /href=["'][^"']+["']/gi) + countMatches(html, /https?:\/\/[^\s<)]+/gi);
  const internalSuggestions = Array.isArray(article.config?.internal_link_suggestions) ? article.config.internal_link_suggestions.length : 0;
  const sourceCount = [article.config?.primary_sources, article.config?.secondary_sources, article.config?.legal_authorities].filter(Array.isArray).reduce((sum: number, arr: any) => sum + arr.length, 0);
  const faq = /FAQ|perguntas frequentes|<details|FAQPage/i.test(html); const hasExcerpt = String(article.excerpt || "").trim().length >= 80; const hasKeyword = String(article.keyword || "").trim().length > 2; const hasTitle = String(article.title || "").trim().length > 10;
  let discovery = 0;
  if (article.project_id) {
    const { data: stats } = await admin.from("wordpress_stats").select("raw_data,total_internal_links").eq("project_id", article.project_id).maybeSingle();
    const serialized = JSON.stringify(stats?.raw_data || {});
    if (/llms\.txt/i.test(serialized)) discovery += 5; if (/ai\.txt/i.test(serialized)) discovery += 4; if (/sitemap/i.test(serialized)) discovery += 4; if (/schema/i.test(serialized)) discovery += 4;
  }
  const llmReadiness = clamp(Math.min(30, words.length / 60) + Math.min(20, (h2 + h3) * 3) + (faq ? 10 : 0) + Math.min(15, sourceCount * 3) + Math.min(10, (links + internalSuggestions) * 1.5) + (hasExcerpt ? 5 : 0) + (hasKeyword ? 5 : 0) + (hasTitle ? 5 : 0) + discovery);
  const semanticAuthority = clamp(Math.min(30, words.length / 70) + Math.min(15, (h2 + h3) * 2.5) + Math.min(15, sourceCount * 3) + Math.min(15, links * 2) + Math.min(10, internalSuggestions * 2) + Math.min(10, Number(article.originality_score || 0) / 10) + (faq ? 5 : 0));
  const now = new Date().toISOString(); const traffic = article.status === "published" ? "active" : article.status === "error" ? "error" : undefined;
  const patch: any = { llm_visibility_score: llmReadiness, semantic_authority_score: semanticAuthority, last_llm_audit_at: now, updated_at: now }; if (traffic) patch.traffic_wave_status = traffic;
  await admin.from("articles").update(patch).eq("id", article.id).eq("user_id", userId);
  return { llm_readiness_score: llmReadiness, semantic_authority_score: semanticAuthority, metric_definition: "discoverability_readiness_not_observed_llm_citation", words: words.length, headings: h2 + h3, sources: sourceCount, links };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: H });
  if (req.method !== "POST") return J({ success: false, error: "method_not_allowed" }, 405);
  const requestId = crypto.randomUUID(); const started = Date.now();
  try {
    const url = Deno.env.get("SUPABASE_URL") || ""; const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !serviceKey) return J({ success: false, error: "backend_not_configured", request_id: requestId }, 500);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const automationKey = req.headers.get("x-zica-automation-key") || "";
    const { data: ingress } = await admin.from("automation_ingress_keys").select("secret_hash,enabled").eq("name", "zica-brain").maybeSingle();
    if (!automationKey || !ingress?.enabled || !ingress.secret_hash || await sha256(automationKey) !== ingress.secret_hash) return J({ success: false, error: "automation_unauthorized", request_id: requestId }, 401);
    const body = await req.json().catch(() => ({})); const maxJobs = Math.max(1, Math.min(50, Number(body?.maxJobs || 20)));
    const [{ data: projectUsers }, { data: articleUsers }, { data: agentUsers }] = await Promise.all([admin.from("projects").select("user_id"), admin.from("articles").select("user_id"), admin.from("news_agents").select("user_id")]);
    const users = [...new Set([...(projectUsers || []), ...(articleUsers || []), ...(agentUsers || [])].map((r: any) => String(r.user_id)).filter(Boolean))];
    const five = bucket(5), fifteen = bucket(15), sixHours = bucket(360); let enqueued = 0;

    for (const userId of users) {
      await state(admin, userId, "brain", "healthy", { phase: "enqueue", tick: requestId });
      const { data: projects } = await admin.from("projects").select("id").eq("user_id", userId).eq("is_connected", true).eq("wordpress_connector_mode", "zica_posts");
      for (const project of projects || []) {
        await enqueue(admin, { user_id: userId, project_id: project.id, job_type: "wordpress_reconcile", status: "queued", priority: 75, idempotency_key: `wordpress:${project.id}:${five}`, payload: { projectId: project.id }, next_attempt_at: new Date().toISOString() }); enqueued++;
      }
      const { data: due } = await admin.from("articles").select("id,project_id,scheduled_at").eq("user_id", userId).eq("status", "ready").not("scheduled_at", "is", null).lte("scheduled_at", new Date().toISOString()).not("project_id", "is", null).limit(100);
      for (const article of due || []) {
        await enqueue(admin, { user_id: userId, project_id: article.project_id, article_id: article.id, job_type: "scheduled_publish", status: "queued", priority: 100, idempotency_key: `scheduled-publish:${article.id}:${article.scheduled_at}`, payload: { articleId: article.id, projectId: article.project_id }, next_attempt_at: new Date().toISOString() }); enqueued++;
      }
      await enqueue(admin, { user_id: userId, job_type: "provider_health", status: "queued", priority: 80, idempotency_key: `providers:${fifteen}`, payload: {}, next_attempt_at: new Date().toISOString() }); enqueued++;
      const cutoff = new Date(Date.now() - 6 * 3600_000).toISOString();
      const { data: auditRows } = await admin.from("articles").select("id").eq("user_id", userId).in("status", ["ready", "published"]).or(`last_llm_audit_at.is.null,last_llm_audit_at.lt.${cutoff}`).limit(50);
      for (const article of auditRows || []) { await enqueue(admin, { user_id: userId, article_id: article.id, job_type: "llm_audit", status: "queued", priority: 55, idempotency_key: `llm-audit:${article.id}:${sixHours}`, payload: { articleId: article.id }, next_attempt_at: new Date().toISOString() }); enqueued++; }
    }
    if (users.length) { await enqueue(admin, { user_id: users[0], job_type: "rss_repost", status: "queued", priority: 70, idempotency_key: `rss-repost:${fifteen}`, payload: { allUsers: true }, next_attempt_at: new Date().toISOString() }); enqueued++; }

    const { data: jobs, error: claimError } = await admin.rpc("claim_zica_brain_jobs", { p_limit: maxJobs, p_worker: `edge:${requestId}` }); if (claimError) throw claimError;
    const results: any[] = [];
    for (const job of jobs || []) {
      let ok = false, result: any = {}, errorMessage = "";
      try {
        if (job.job_type === "wordpress_reconcile") {
          const call = await edgeCall(url, serviceKey, "wordpress-operations", { action: "process_due", limit: 20 }, 120000); ok = call.ok; result = call.data; errorMessage = call.ok ? "" : String(call.data?.error || `HTTP ${call.status}`);
          await state(admin, job.user_id, "wordpress", ok ? "healthy" : "degraded", { projectId: job.project_id, httpStatus: call.status, processed: call.data?.processed || 0 }, errorMessage || undefined);
        } else if (job.job_type === "scheduled_publish") {
          const call = await edgeCall(url, serviceKey, "wordpress-operations", { action: "publish", userId: job.user_id, articleId: job.article_id, projectId: job.project_id, publishStatus: "publish" }, 180000); ok = call.ok; result = call.data; errorMessage = call.ok ? "" : String(call.data?.error || `HTTP ${call.status}`);
          await state(admin, job.user_id, "scheduler", ok ? "healthy" : "degraded", { articleId: job.article_id, operationId: call.data?.operation_id || null }, errorMessage || undefined);
        } else if (job.job_type === "rss_repost") {
          const call = await edgeCall(url, serviceKey, "auto-process-rss", { force: false, dryRun: false, maxSchedules: 25, maxItemsPerSchedule: 3 }, 240000); ok = call.ok; result = call.data; errorMessage = call.ok ? "" : String(call.data?.error || `HTTP ${call.status}`);
          await state(admin, job.user_id, "rss_repost", ok ? "healthy" : "degraded", { processed: call.data?.processed || 0, queued: call.data?.queued || 0, drafts: call.data?.drafts || 0, duplicates: call.data?.duplicates || 0 }, errorMessage || undefined);
        } else if (job.job_type === "provider_health") {
          result = await providerHealth(admin, job.user_id); const open = result.openai?.operational === true, claude = result.anthropic?.operational === true; ok = open || claude;
          await state(admin, job.user_id, "ai_providers", open && claude ? "healthy" : ok ? "degraded" : "offline", { openai: result.openai, anthropic: result.anthropic }, ok ? undefined : "Nenhum provedor textual operacional");
        } else if (job.job_type === "llm_audit" || job.job_type === "semantic_audit") {
          result = await auditArticle(admin, job.user_id, job.article_id); ok = true; await state(admin, job.user_id, "semantic_metrics", "healthy", { lastArticleId: job.article_id, ...result });
        } else { ok = true; result = { skipped: true, reason: "job_type_reserved" }; }
      } catch (e) { errorMessage = e instanceof Error ? e.message : "job_failed"; }
      await admin.rpc("finish_zica_brain_job", { p_id: job.id, p_ok: ok, p_result: result || {}, p_error: errorMessage || null });
      results.push({ id: job.id, type: job.job_type, ok, error: errorMessage || null });
    }

    for (const userId of users) {
      const recentCutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
      const historicalDead = (await admin.from("zica_brain_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "dead_letter")).count || 0;
      const recentDead = (await admin.from("zica_brain_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "dead_letter").gte("updated_at", recentCutoff)).count || 0;
      const retry = (await admin.from("zica_brain_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "retry")).count || 0;
      await state(admin, userId, "brain", recentDead > 0 ? "degraded" : "healthy", { requestId, enqueued, claimed: (jobs || []).length, deadLetterHistorical: historicalDead, deadLetterRecent24h: recentDead, retry, durationMs: Date.now() - started }, recentDead > 0 ? `${recentDead} job(s) recentes em dead letter` : undefined);
    }
    return J({ success: true, request_id: requestId, users: users.length, enqueued, claimed: (jobs || []).length, results, duration_ms: Date.now() - started });
  } catch (error) {
    return J({ success: false, error: error instanceof Error ? error.message : "brain_tick_failed", request_id: requestId, duration_ms: Date.now() - started }, 500);
  }
});
