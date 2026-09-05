import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-zica-automation-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bucket(minutes: number) {
  const ms = minutes * 60_000;
  return new Date(Math.floor(Date.now() / ms) * ms).toISOString();
}

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function stripHtml(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function countMatches(value: string, re: RegExp) { return (value.match(re) || []).length; }

async function state(admin: any, userId: string, subsystem: string, status: "healthy"|"degraded"|"offline"|"unknown", metrics: Record<string, unknown> = {}, error?: string) {
  const now = new Date().toISOString();
  await admin.from("zica_brain_state").upsert({
    user_id: userId,
    subsystem,
    status,
    last_heartbeat_at: now,
    last_success_at: status === "healthy" ? now : undefined,
    last_error_at: error ? now : undefined,
    last_error: error ? error.slice(0, 2000) : null,
    metrics,
    updated_at: now,
  }, { onConflict: "user_id,subsystem" });
}

async function enqueue(admin: any, row: Record<string, unknown>) {
  const { error } = await admin.from("zica_brain_jobs").upsert(row, { onConflict: "user_id,idempotency_key", ignoreDuplicates: true });
  if (error && !String(error.message).includes("duplicate")) throw error;
}

async function edgeCall(baseUrl: string, serviceKey: string, slug: string, body: Record<string, unknown>, timeoutMs = 90000) {
  const response = await fetch(`${baseUrl}/functions/v1/${slug}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 800) }; }
  return { ok: response.ok && data?.success !== false, status: response.status, data };
}

async function providerHealth(admin: any, userId: string) {
  const { data: settings } = await admin.from("user_settings")
    .select("openai_api_key,anthropic_api_key")
    .eq("user_id", userId).maybeSingle();
  const openaiConfigured = String(settings?.openai_api_key || "").trim().length > 0;
  const anthropicConfigured = String(settings?.anthropic_api_key || "").trim().length > 0;
  const checkedAt = new Date().toISOString();

  // Automatic health checks must never consume tokens. Operational probes are
  // explicit, manual actions handled by zica-ai-provider-health.
  const result = {
    checked_at: checkedAt,
    mode: "non_billable_configuration_check",
    openai: {
      configured: openaiConfigured,
      operational: null,
      verification: openaiConfigured ? "configured_unverified" : "not_configured",
    },
    anthropic: {
      configured: anthropicConfigured,
      operational: null,
      verification: anthropicConfigured ? "configured_unverified" : "not_configured",
    },
  };

  for (const provider of ["openai", "anthropic"] as const) {
    await admin.from("zica_ai_provider_health_cache").upsert({
      provider,
      checked_at: checkedAt,
      payload: {
        provider: result[provider],
        operational: null,
        billable_probe: false,
        automatic_probe: true,
      },
    }, { onConflict: "provider" });
  }
  return result;
}

async function auditArticle(admin: any, userId: string, articleId: string) {
  const { data: article } = await admin.from("articles").select("id,title,content,excerpt,keyword,secondary_keywords,originality_score,status,project_id,published_url,config").eq("id", articleId).eq("user_id", userId).maybeSingle();
  if (!article) throw new Error("article_not_found");
  const html = String(article.content || "");
  const text = stripHtml(html);
  const words = text.split(/\s+/).filter(Boolean);
  const h2 = countMatches(html, /<h2\b/gi) + countMatches(html, /^##\s+/gm);
  const h3 = countMatches(html, /<h3\b/gi) + countMatches(html, /^###\s+/gm);
  const links = countMatches(html, /href=["'][^"']+["']/gi) + countMatches(html, /https?:\/\/[^\s<)]+/gi);
  const internalSuggestions = Array.isArray(article.config?.internal_link_suggestions) ? article.config.internal_link_suggestions.length : 0;
  const sourceCount = [article.config?.primary_sources, article.config?.secondary_sources, article.config?.legal_authorities]
    .filter(Array.isArray).reduce((sum: number, arr: any) => sum + arr.length, 0);
  const faq = /FAQ|perguntas frequentes|<details|FAQPage/i.test(html);
  const hasExcerpt = String(article.excerpt || "").trim().length >= 80;
  const hasKeyword = String(article.keyword || "").trim().length > 2;
  const hasTitle = String(article.title || "").trim().length > 10;

  let discovery = 0;
  if (article.project_id) {
    const { data: stats } = await admin.from("wordpress_stats").select("raw_data,total_internal_links").eq("project_id", article.project_id).maybeSingle();
    const raw = stats?.raw_data || {};
    const serialized = JSON.stringify(raw);
    if (/llms\.txt/i.test(serialized)) discovery += 5;
    if (/ai\.txt/i.test(serialized)) discovery += 4;
    if (/sitemap/i.test(serialized)) discovery += 4;
    if (/schema/i.test(serialized)) discovery += 4;
  }

  const llmReadiness = clamp(
    Math.min(30, words.length / 60) + Math.min(20, (h2 + h3) * 3) + (faq ? 10 : 0) +
    Math.min(15, sourceCount * 3) + Math.min(10, (links + internalSuggestions) * 1.5) +
    (hasExcerpt ? 5 : 0) + (hasKeyword ? 5 : 0) + (hasTitle ? 5 : 0) + discovery
  );
  const semanticAuthority = clamp(
    Math.min(30, words.length / 70) + Math.min(15, (h2 + h3) * 2.5) + Math.min(15, sourceCount * 3) +
    Math.min(15, links * 2) + Math.min(10, internalSuggestions * 2) + Math.min(10, Number(article.originality_score || 0) / 10) + (faq ? 5 : 0)
  );
  const now = new Date().toISOString();
  const traffic = article.status === "published" ? "active" : article.status === "error" ? "error" : undefined;
  const patch: any = { llm_visibility_score: llmReadiness, semantic_authority_score: semanticAuthority, last_llm_audit_at: now, updated_at: now };
  if (traffic) patch.traffic_wave_status = traffic;
  await admin.from("articles").update(patch).eq("id", article.id).eq("user_id", userId);
  return { llm_readiness_score: llmReadiness, semantic_authority_score: semanticAuthority, metric_definition: "discoverability_readiness_not_observed_llm_citation", words, headings: h2 + h3, sources: sourceCount, links };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "method_not_allowed" }, 405);
  const requestId = crypto.randomUUID();
  const started = Date.now();
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
    if (!url || !serviceKey) return json({ success: false, error: "backend_not_configured", request_id: requestId }, 500);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const automationKey = req.headers.get("x-zica-automation-key") || "";
    const { data: ingress } = await admin.from("automation_ingress_keys").select("secret_hash,enabled").eq("name", "zica-brain").maybeSingle();
    if (!automationKey || !ingress?.enabled || !ingress.secret_hash || await sha256(automationKey) !== ingress.secret_hash) {
      return json({ success: false, error: "automation_unauthorized", request_id: requestId }, 401);
    }
    const body = await req.json().catch(() => ({}));
    // Image jobs can download several unavailable candidates before succeeding.
    // Keep the default batch below the Edge Function wall-clock limit so locks
    // are completed instead of being abandoned by an overlapping cron tick.
    const maxJobs = Math.max(1, Math.min(20, Number(body?.maxJobs || 5)));

    const [{ data: projectUsers }, { data: articleUsers }, { data: agentUsers }] = await Promise.all([
      admin.from("projects").select("user_id"),
      admin.from("articles").select("user_id"),
      admin.from("news_agents").select("user_id"),
    ]);
    const users = [...new Set([...(projectUsers || []), ...(articleUsers || []), ...(agentUsers || [])].map((r: any) => String(r.user_id)).filter(Boolean))];

    const reconcileWindow = bucket(15), providerWindow = bucket(15), auditWindow = bucket(1440);
    let enqueued = 0;
    for (const userId of users) {
      await state(admin, userId, "brain", "healthy", { phase: "enqueue", tick: requestId });
      const { data: projects } = await admin.from("projects").select("id").eq("user_id", userId).eq("is_connected", true).eq("wordpress_connector_mode", "zica_posts");
      for (const project of projects || []) {
        await enqueue(admin, { user_id: userId, project_id: project.id, job_type: "wordpress_reconcile", status: "queued", priority: 75, idempotency_key: `wordpress:${project.id}:${reconcileWindow}`, payload: { projectId: project.id }, next_attempt_at: new Date().toISOString() });
        enqueued++;
      }

      const { data: due } = await admin.from("articles").select("id,project_id,scheduled_at").eq("user_id", userId).eq("status", "ready").not("scheduled_at", "is", null).lte("scheduled_at", new Date().toISOString()).not("project_id", "is", null).limit(100);
      for (const article of due || []) {
        await enqueue(admin, { user_id: userId, project_id: article.project_id, article_id: article.id, job_type: "scheduled_publish", status: "queued", priority: 100, idempotency_key: `scheduled-publish:${article.id}:${article.scheduled_at}`, payload: { articleId: article.id, projectId: article.project_id }, next_attempt_at: new Date().toISOString() });
        enqueued++;
      }

      await enqueue(admin, { user_id: userId, job_type: "provider_health", status: "queued", priority: 80, idempotency_key: `providers:${providerWindow}`, payload: {}, next_attempt_at: new Date().toISOString() });
      enqueued++;

      const cutoff = new Date(Date.now() - 6 * 3600_000).toISOString();
      const { data: auditRows } = await admin.from("articles").select("id").eq("user_id", userId).in("status", ["ready", "published"]).or(`last_llm_audit_at.is.null,last_llm_audit_at.lt.${cutoff}`).limit(50);
      for (const article of auditRows || []) {
        await enqueue(admin, { user_id: userId, article_id: article.id, job_type: "llm_audit", status: "queued", priority: 55, idempotency_key: `llm-audit:${article.id}:${auditWindow}`, payload: { articleId: article.id }, next_attempt_at: new Date().toISOString() });
        enqueued++;
      }

      // Keep image recovery deliberately serial. The previous UI flow launched
      // hundreds of direct requests and retried HTTP 500 responses, consuming
      // provider budget without durable queue state.
      const { count: activeImageJobs } = await admin.from("zica_brain_jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("job_type", "image_generate")
        .in("status", ["queued", "processing", "retry"]);
      if (!activeImageJobs) {
        const { data: imageArticle } = await admin.from("articles")
          .select("id,project_id")
          .eq("user_id", userId)
          .in("status", ["ready", "draft"])
          .not("project_id", "is", null)
          .not("content", "is", null)
          .or("featured_image_url.is.null,featured_image_url.eq.")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (imageArticle) {
          await enqueue(admin, {
            user_id: userId,
            project_id: imageArticle.project_id,
            article_id: imageArticle.id,
            job_type: "image_generate",
            status: "queued",
            priority: 65,
            max_attempts: 3,
            idempotency_key: `image-generate:${imageArticle.id}:v2`,
            payload: { articleId: imageArticle.id, projectId: imageArticle.project_id },
            next_attempt_at: new Date().toISOString(),
          });
          enqueued++;
        }
      }
    }

    const { data: jobs, error: claimError } = await admin.rpc("claim_zica_brain_jobs", { p_limit: maxJobs, p_worker: `edge:${requestId}` });
    if (claimError) throw claimError;
    const results: any[] = [];

    for (const job of jobs || []) {
      let ok = false, result: any = {}, errorMessage = "";
      try {
        if (job.job_type === "wordpress_reconcile") {
          const call = await edgeCall(url, serviceKey, "wordpress-operations", { userId: job.user_id, projectId: job.project_id, action: "process_due" }, 90000);
          ok = call.ok; result = call.data; errorMessage = call.ok ? "" : String(call.data?.error || `HTTP ${call.status}`);
          await state(admin, job.user_id, "wordpress", ok ? "healthy" : "degraded", { projectId: job.project_id, httpStatus: call.status }, errorMessage || undefined);
        } else if (job.job_type === "scheduled_publish") {
          const call = await edgeCall(url, serviceKey, "publish-to-wordpress", { userId: job.user_id, articleId: job.article_id, projectId: job.project_id, publishStatus: "publish", requireFeaturedImage: false }, 90000);
          ok = call.ok; result = call.data; errorMessage = call.ok ? "" : String(call.data?.error || `HTTP ${call.status}`);
          if (ok) await state(admin, job.user_id, "scheduler", "healthy", { lastPublishedArticleId: job.article_id });
          else await state(admin, job.user_id, "scheduler", "degraded", { articleId: job.article_id }, errorMessage);
        } else if (job.job_type === "provider_health") {
          result = await providerHealth(admin, job.user_id);
          const configured = result.openai?.configured === true || result.anthropic?.configured === true;
          ok = configured;
          await state(
            admin,
            job.user_id,
            "ai_providers",
            configured ? "unknown" : "offline",
            { openai: result.openai, anthropic: result.anthropic, automaticProbe: "non_billable" },
            configured ? undefined : "Nenhum provedor textual configurado",
          );
        } else if (job.job_type === "article_generate") {
          const config = job.payload?.config && typeof job.payload.config === "object" ? job.payload.config : {};
          const call = await edgeCall(url, serviceKey, "generate-article", {
            userId: job.user_id,
            responseFormat: "json",
            config: { ...config, articleId: job.article_id, projectId: job.project_id },
          }, 170000);
          ok = call.ok;
          result = call.data;
          errorMessage = call.ok ? "" : String(call.data?.error || `HTTP ${call.status}`);
          if (ok) {
            const content = String(call.data?.content || "");
            const wordCount = Number(call.data?.words || stripHtml(content).split(/\s+/).filter(Boolean).length);
            await admin.from("articles").update({
              content, status: "ready", word_count: wordCount, error_message: null, updated_at: new Date().toISOString(),
            }).eq("id", job.article_id).eq("user_id", job.user_id);
            await enqueue(admin, {
              user_id: job.user_id, project_id: job.project_id, article_id: job.article_id,
              job_type: "image_generate", status: "queued", priority: 70, max_attempts: 3,
              idempotency_key: `image-generate:${job.article_id}:v3`,
              payload: { articleId: job.article_id, projectId: job.project_id, moduleKey: "article" },
              next_attempt_at: new Date().toISOString(),
            });
          }
          await state(admin, job.user_id, "article_generation", ok ? "healthy" : "degraded", {
            articleId: job.article_id, projectId: job.project_id, httpStatus: call.status,
          }, errorMessage || undefined);
        } else if (job.job_type === "image_generate") {
          const { data: article } = await admin.from("articles")
            .select("id,title,keyword,excerpt,content,project_id,featured_image_url")
            .eq("id", job.article_id)
            .eq("user_id", job.user_id)
            .maybeSingle();
          if (!article) throw new Error("image_article_not_found");
          if (String(article.featured_image_url || "").trim()) {
            ok = true;
            result = { skipped: true, reason: "image_already_present" };
          } else {
            const call = await edgeCall(url, serviceKey, "generate-image", {
              userId: job.user_id,
              articleId: article.id,
              projectId: article.project_id,
              moduleKey: String(job.payload?.moduleKey || "article"),
              title: article.title,
              keywords: article.keyword || "",
              context: article.excerpt || "",
              content: article.content || "",
              aspectRatio: "16:9",
              quality: "high",
              allowAiGeneration: true,
            }, 170000);
            ok = call.ok;
            result = call.ok
              ? { source: call.data?.source, generated: call.data?.generated === true, requestId: call.data?.request_id }
              : call.data;
            errorMessage = call.ok ? "" : String(call.data?.error || `HTTP ${call.status}`);
            await state(admin, job.user_id, "image_generation", ok ? "healthy" : "degraded", {
              articleId: article.id,
              projectId: article.project_id,
              httpStatus: call.status,
            }, errorMessage || undefined);
          }
        } else if (job.job_type === "llm_audit" || job.job_type === "semantic_audit") {
          result = await auditArticle(admin, job.user_id, job.article_id);
          ok = true;
          await state(admin, job.user_id, "semantic_metrics", "healthy", { lastArticleId: job.article_id, ...result });
        } else {
          ok = true; result = { skipped: true, reason: "job_type_reserved" };
        }
      } catch (e) {
        errorMessage = e instanceof Error ? e.message : "job_failed";
      }
      await admin.rpc("finish_zica_brain_job", { p_id: job.id, p_ok: ok, p_result: result || {}, p_error: errorMessage || null });
      results.push({ id: job.id, type: job.job_type, ok, error: errorMessage || null });
    }

    for (const userId of users) {
      const dead = (await admin.from("zica_brain_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "dead_letter")).count || 0;
      const retry = (await admin.from("zica_brain_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "retry")).count || 0;
      await state(admin, userId, "brain", dead > 0 ? "degraded" : "healthy", { requestId, enqueued, claimed: (jobs || []).length, deadLetter: dead, retry, durationMs: Date.now() - started }, dead > 0 ? `${dead} job(s) em dead letter` : undefined);
    }

    return json({ success: true, request_id: requestId, users: users.length, enqueued, claimed: (jobs || []).length, results, duration_ms: Date.now() - started });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error
        ? JSON.stringify(error).slice(0, 1200)
        : String(error || "brain_tick_failed");
    console.error("[zica-brain-tick]", requestId, message);
    return json({ success: false, error: message, request_id: requestId, duration_ms: Date.now() - started }, 500);
  }
});
