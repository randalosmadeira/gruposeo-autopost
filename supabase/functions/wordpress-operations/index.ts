import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-zica-automation-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "list" | "stats" | "schedule" | "cancel_schedule" | "publish" | "retry" | "cancel" | "process_due";
type Input = {
  action: Action;
  userId?: string;
  projectId?: string | null;
  articleId?: string | null;
  operationId?: string | null;
  scheduledAt?: string | null;
  publishStatus?: "draft" | "publish";
  categories?: Array<number | string>;
  tags?: Array<number | string>;
  limit?: number;
};

type OperationRow = {
  id: string;
  user_id: string;
  project_id: string;
  article_id: string | null;
  operation_type: "publish" | "draft" | "sync";
  status: "scheduled" | "pending" | "processing" | "retry" | "completed" | "failed" | "cancelled";
  scheduled_at: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  result: Record<string, any> | null;
  correlation_id: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const env = (name: string) => String(Deno.env.get(name) || "").trim();
const clampLimit = (value?: number) => Math.max(1, Math.min(100, Math.floor(Number(value || 50) || 50)));
const isFuture = (value?: string | null) => Boolean(value && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now() + 1000);

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sameProjectUrl(value: string, project: Record<string, any>) {
  try {
    const url = new URL(value);
    const base = new URL(String(project.wordpress_url || (project.domain ? `https://${project.domain}` : "")));
    return url.hostname.toLowerCase() === base.hostname.toLowerCase();
  } catch {
    return false;
  }
}

function labelFromUrl(value: string) {
  try {
    const url = new URL(value);
    const part = url.pathname.split("/").filter(Boolean).pop() || url.hostname;
    return decodeURIComponent(part).replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()).slice(0, 100);
  } catch {
    return "Conteúdo relacionado";
  }
}

async function validateAutomation(admin: any, req: Request) {
  const supplied = String(req.headers.get("x-zica-automation-key") || "").trim();
  if (!supplied) return false;
  const names = ["zica_brain_automation_key", "zica_news_automation_key"];
  for (const name of names) {
    const { data } = await admin.rpc("get_zica_automation_secret", { p_name: name });
    if (data && supplied === String(data)) return true;
  }
  return false;
}

async function ownedArticle(admin: any, userId: string, articleId: string) {
  const { data, error } = await admin.from("articles").select("*").eq("id", articleId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function ownedProject(admin: any, userId: string, projectId: string) {
  const { data, error } = await admin.from("projects").select("*").eq("id", projectId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function collectInternalLinks(admin: any, article: Record<string, any>, project: Record<string, any>) {
  const map = new Map<string, { url: string; title: string; score: number }>();
  const add = (url: unknown, title: unknown, score = 50) => {
    const value = String(url || "").trim();
    if (!value || !sameProjectUrl(value, project)) return;
    const currentUrl = String(article.published_url || "").replace(/\/$/, "");
    if (currentUrl && value.replace(/\/$/, "") === currentUrl) return;
    const existing = map.get(value);
    const candidate = { url: value, title: String(title || labelFromUrl(value)).slice(0, 140), score };
    if (!existing || candidate.score > existing.score) map.set(value, candidate);
  };

  for (const url of Array.isArray(project.links_prioritarios) ? project.links_prioritarios : []) add(url, null, 80);

  const [{ data: rules }, { data: indexRows }, { data: suggestions }] = await Promise.all([
    admin.from("keyword_link_rules").select("target_url,target_title,priority").eq("project_id", project.id).eq("user_id", article.user_id).eq("is_active", true).order("priority", { ascending: false }).limit(30),
    admin.from("wordpress_article_index").select("wp_post_url,wp_post_title,linkability_score,seo_score").eq("project_id", project.id).eq("user_id", article.user_id).eq("wp_post_status", "publish").order("linkability_score", { ascending: false }).limit(30),
    admin.from("internal_link_suggestions").select("target_url,anchor_text,relevance_score,status").eq("project_id", project.id).eq("user_id", article.user_id).in("status", ["pending", "approved", "applied"]).order("relevance_score", { ascending: false }).limit(30),
  ]);

  for (const row of rules || []) add(row.target_url, row.target_title, 90 + Number(row.priority || 0));
  for (const row of indexRows || []) add(row.wp_post_url, row.wp_post_title, 60 + Number(row.linkability_score || row.seo_score || 0) / 4);
  for (const row of suggestions || []) add(row.target_url, row.anchor_text, 70 + Number(row.relevance_score || 0) / 4);

  const base = String(project.wordpress_url || "").trim();
  if (base) add(base, project.name || "Página inicial", 20);
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, 6);
}

function collectSocialLinks(project: Record<string, any>) {
  const entries = [
    ["Instagram", project.social_instagram],
    ["YouTube", project.social_youtube],
    ["LinkedIn", project.social_linkedin],
    ["X", project.social_twitter],
    ["TikTok", project.social_tiktok],
    ["Google Maps", project.social_google_maps],
    ["Linktree", project.social_linktree],
  ] as Array<[string, unknown]>;
  return entries
    .map(([label, raw]) => ({ label, url: String(raw || "").trim() }))
    .filter((item) => item.url && /^https?:\/\//i.test(item.url));
}

async function enrichForDistribution(admin: any, article: Record<string, any>, project: Record<string, any>) {
  let content = String(article.content || "");
  const links = await collectInternalLinks(admin, article, project);
  const socials = collectSocialLinks(project);

  if (!/data-zica-interlinks=["']1["']/i.test(content) && links.length) {
    const items = links.map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></li>`).join("");
    content += `\n<section data-zica-interlinks="1" aria-label="Conteúdos relacionados"><h2>Leia também</h2><ul>${items}</ul></section>`;
  }
  if (!/data-zica-social=["']1["']/i.test(content) && socials.length) {
    const items = socials.map((item) => `<li><a href="${escapeHtml(item.url)}" rel="me noopener">${escapeHtml(item.label)}</a></li>`).join("");
    content += `\n<section data-zica-social="1" aria-label="Redes oficiais"><h2>Redes oficiais</h2><ul>${items}</ul></section>`;
  }

  const previousConfig = article.config && typeof article.config === "object" ? article.config : {};
  const nextConfig = {
    ...previousConfig,
    deterministic_distribution: true,
    deterministic_interlinks_count: links.length,
    deterministic_social_links_count: socials.length,
    deterministic_distribution_project_id: project.id,
    deterministic_distribution_enriched_at: new Date().toISOString(),
  };

  if (content !== String(article.content || "") || JSON.stringify(nextConfig) !== JSON.stringify(previousConfig)) {
    const { error } = await admin.from("articles").update({ content, config: nextConfig, updated_at: new Date().toISOString() }).eq("id", article.id).eq("user_id", article.user_id);
    if (error) throw error;
  }
  return { article: { ...article, content, config: nextConfig }, links, socials };
}

async function findActiveOperation(admin: any, articleId: string, projectId: string, operationType: string) {
  const { data, error } = await admin.from("wordpress_operations").select("*")
    .eq("article_id", articleId).eq("project_id", projectId).eq("operation_type", operationType)
    .in("status", ["scheduled", "pending", "processing", "retry"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as OperationRow | null;
}

async function createOrRefreshOperation(admin: any, params: {
  userId: string; projectId: string; articleId: string; operationType: "publish" | "draft";
  status: "scheduled" | "pending"; scheduledAt: string | null;
  categories?: Array<number | string>; tags?: Array<number | string>;
}) {
  const existing = await findActiveOperation(admin, params.articleId, params.projectId, params.operationType);
  const now = new Date().toISOString();
  const requestMeta = { request: { categories: params.categories || [], tags: params.tags || [] } };
  if (existing) {
    const previous = existing.result && typeof existing.result === "object" ? existing.result : {};
    const { data, error } = await admin.from("wordpress_operations").update({ status: params.status, scheduled_at: params.scheduledAt, last_error: null, result: { ...previous, ...requestMeta }, completed_at: null, updated_at: now }).eq("id", existing.id).select("*").single();
    if (error) throw error;
    return data as OperationRow;
  }
  const { data, error } = await admin.from("wordpress_operations").insert({ user_id: params.userId, project_id: params.projectId, article_id: params.articleId, operation_type: params.operationType, status: params.status, scheduled_at: params.scheduledAt, result: requestMeta }).select("*").single();
  if (error) throw error;
  return data as OperationRow;
}

async function callPublisher(admin: any, operation: OperationRow) {
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  if (!supabaseUrl || !serviceKey) throw new Error("Backend interno incompleto");
  const attempt = Number(operation.attempts || 0) + 1;
  const startedAt = new Date().toISOString();
  await admin.from("wordpress_operations").update({ status: "processing", attempts: attempt, started_at: startedAt, updated_at: startedAt, last_error: null }).eq("id", operation.id);

  try {
    const [article, project] = await Promise.all([
      ownedArticle(admin, operation.user_id, String(operation.article_id)),
      ownedProject(admin, operation.user_id, operation.project_id),
    ]);
    if (!article || !project) throw new Error("Artigo ou projeto não encontrado durante distribuição");
    const enrichment = await enrichForDistribution(admin, article, project);
    const requestMeta = operation.result?.request && typeof operation.result.request === "object" ? operation.result.request : {};
    const response = await fetch(`${supabaseUrl}/functions/v1/publish-to-wordpress`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: operation.article_id, projectId: operation.project_id, userId: operation.user_id, publishStatus: operation.operation_type === "draft" ? "draft" : "publish", requireFeaturedImage: false, allowCrossProject: true, categories: Array.isArray(requestMeta.categories) ? requestMeta.categories : [], tags: Array.isArray(requestMeta.tags) ? requestMeta.tags : [] }),
      signal: AbortSignal.timeout(180000),
    });
    const text = await response.text();
    let payload: Record<string, any> = {};
    try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 1000) }; }
    if (!response.ok || payload.success === false) {
      const message = String(payload.error || `WordPress HTTP ${response.status}`).slice(0, 2000);
      const gate = ["editorial_gate", "featured_image_gate", "content_gate", "publication_residue_gate", "meta_description_gate"].includes(String(payload.code || ""));
      const terminal = gate || attempt >= Number(operation.max_attempts || 3) || response.status === 401 || response.status === 403;
      const nextStatus = terminal ? "failed" : "retry";
      const now = new Date().toISOString();
      await admin.from("wordpress_operations").update({ status: nextStatus, last_error: message, result: { ...payload, request: requestMeta, enrichment: { interlinks: enrichment.links.length, social: enrichment.socials.length } }, updated_at: now, completed_at: terminal ? now : null }).eq("id", operation.id);
      return { success: false, status: nextStatus, error: message, payload };
    }
    const now = new Date().toISOString();
    const finalPayload = { ...payload, request: requestMeta, enrichment: { interlinks: enrichment.links.length, social: enrichment.socials.length, project_id: operation.project_id } };
    await admin.from("wordpress_operations").update({ status: "completed", last_error: null, result: finalPayload, completed_at: now, updated_at: now }).eq("id", operation.id);
    return { success: true, status: "completed", payload: finalPayload };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "Falha interna de publicação";
    const terminal = attempt >= Number(operation.max_attempts || 3);
    const now = new Date().toISOString();
    await admin.from("wordpress_operations").update({ status: terminal ? "failed" : "retry", last_error: message, updated_at: now, completed_at: terminal ? now : null }).eq("id", operation.id);
    return { success: false, status: terminal ? "failed" : "retry", error: message };
  }
}

async function processDue(admin: any, limit: number) {
  const { data, error } = await admin.from("wordpress_operations").select("*").in("status", ["scheduled", "pending", "retry"]).order("scheduled_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: true }).limit(Math.min(100, Math.max(limit * 3, limit)));
  if (error) throw error;
  const due = ((data || []) as OperationRow[]).filter((row) => !row.scheduled_at || Date.parse(row.scheduled_at) <= Date.now()).slice(0, limit);
  const results = [];
  for (const operation of due) results.push({ id: operation.id, ...(await callPublisher(admin, operation)) });
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const input = await req.json().catch(() => ({})) as Input;
    if (!input.action) return json({ success: false, error: "action é obrigatório", request_id: requestId }, 400);
    const automated = await validateAutomation(admin, req);
    let actor: { userId: string; mode: "user" | "service" } | null = null;
    if (!automated) actor = await resolveRequestActor(req, input.userId);

    if (input.action === "process_due") {
      if (!automated && actor?.mode !== "service") return json({ success: false, error: "Operação interna", request_id: requestId }, 403);
      const results = await processDue(admin, clampLimit(input.limit || 20));
      return json({ success: true, processed: results.length, results, request_id: requestId });
    }
    if (!actor) {
      if (!input.userId) return json({ success: false, error: "userId é obrigatório para automação", request_id: requestId }, 400);
      actor = { userId: input.userId, mode: "service" };
    }
    const userId = actor.userId;

    if (input.action === "list") {
      let q = admin.from("wordpress_operations").select("id,user_id,project_id,article_id,operation_type,status,scheduled_at,attempts,max_attempts,last_error,result,correlation_id,created_at,updated_at,started_at,completed_at,articles(title),projects(name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(clampLimit(input.limit));
      if (input.projectId) q = q.eq("project_id", input.projectId);
      const { data, error } = await q;
      if (error) throw error;
      return json({ success: true, items: data || [], request_id: requestId });
    }

    if (input.action === "stats") {
      let q = admin.from("wordpress_operations").select("status,attempts,created_at,completed_at").eq("user_id", userId).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(5000);
      if (input.projectId) q = q.eq("project_id", input.projectId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];
      const counts: Record<string, number> = { scheduled: 0, pending: 0, processing: 0, retry: 0, completed: 0, failed: 0, cancelled: 0 };
      let attempts = 0;
      let completedLastHour = 0;
      const oneHourAgo = Date.now() - 3600000;
      for (const row of rows) {
        counts[String(row.status)] = (counts[String(row.status)] || 0) + 1;
        attempts += Number(row.attempts || 0);
        if (row.status === "completed" && row.completed_at && Date.parse(row.completed_at) >= oneHourAgo) completedLastHour++;
      }
      return json({ success: true, stats: { ...counts, total: rows.length, completed_last_hour: completedLastHour, avg_attempts: rows.length ? Number((attempts / rows.length).toFixed(2)) : 0 }, request_id: requestId });
    }

    if (input.action === "schedule") {
      if (!input.articleId || !input.projectId || !input.scheduledAt) return json({ success: false, error: "articleId, projectId e scheduledAt são obrigatórios", request_id: requestId }, 400);
      if (!isFuture(input.scheduledAt)) return json({ success: false, error: "scheduledAt deve estar no futuro", code: "invalid_schedule", request_id: requestId }, 422);
      const [article, project] = await Promise.all([ownedArticle(admin, userId, input.articleId), ownedProject(admin, userId, input.projectId)]);
      if (!article || !project) return json({ success: false, error: "Artigo ou projeto não encontrado", request_id: requestId }, 404);
      const scheduledAt = new Date(input.scheduledAt).toISOString();
      const op = await createOrRefreshOperation(admin, { userId, projectId: input.projectId, articleId: input.articleId, operationType: input.publishStatus === "draft" ? "draft" : "publish", status: "scheduled", scheduledAt, categories: input.categories, tags: input.tags });
      return json({ success: true, operation: op, scheduled_at: scheduledAt, request_id: requestId });
    }

    if (input.action === "cancel_schedule") {
      if (!input.articleId) return json({ success: false, error: "articleId é obrigatório", request_id: requestId }, 400);
      const now = new Date().toISOString();
      let q = admin.from("wordpress_operations").update({ status: "cancelled", completed_at: now, updated_at: now }).eq("article_id", input.articleId).eq("user_id", userId).in("status", ["scheduled", "pending", "retry"]);
      if (input.projectId) q = q.eq("project_id", input.projectId);
      await q;
      return json({ success: true, request_id: requestId });
    }

    if (input.action === "publish") {
      if (!input.articleId || !input.projectId) return json({ success: false, error: "articleId e projectId são obrigatórios", request_id: requestId }, 400);
      const [article, project] = await Promise.all([ownedArticle(admin, userId, input.articleId), ownedProject(admin, userId, input.projectId)]);
      if (!article || !project) return json({ success: false, error: "Artigo ou projeto não encontrado", request_id: requestId }, 404);
      const requested = input.scheduledAt || article.scheduled_at || null;
      const op = await createOrRefreshOperation(admin, { userId, projectId: input.projectId, articleId: input.articleId, operationType: input.publishStatus === "draft" ? "draft" : "publish", status: isFuture(requested) ? "scheduled" : "pending", scheduledAt: isFuture(requested) ? new Date(String(requested)).toISOString() : null, categories: input.categories, tags: input.tags });
      if (isFuture(requested)) return json({ success: true, scheduled: true, operation: op, request_id: requestId });
      const result = await callPublisher(admin, op);
      return json({ success: result.success, operation_id: op.id, ...result, request_id: requestId }, result.success ? 200 : 502);
    }

    if (input.action === "retry") {
      if (!input.operationId) return json({ success: false, error: "operationId é obrigatório", request_id: requestId }, 400);
      const { data: op, error } = await admin.from("wordpress_operations").select("*").eq("id", input.operationId).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!op) return json({ success: false, error: "Operação não encontrada", request_id: requestId }, 404);
      if (["processing", "completed", "cancelled"].includes(String(op.status))) return json({ success: false, error: "Operação não pode ser reprocessada neste estado", request_id: requestId }, 409);
      await admin.from("wordpress_operations").update({ status: "pending", last_error: null, completed_at: null, updated_at: new Date().toISOString() }).eq("id", op.id);
      const result = await callPublisher(admin, { ...op, status: "pending", last_error: null } as OperationRow);
      return json({ success: result.success, operation_id: op.id, ...result, request_id: requestId }, result.success ? 200 : 502);
    }

    if (input.action === "cancel") {
      if (!input.operationId) return json({ success: false, error: "operationId é obrigatório", request_id: requestId }, 400);
      const now = new Date().toISOString();
      const { data, error } = await admin.from("wordpress_operations").update({ status: "cancelled", completed_at: now, updated_at: now }).eq("id", input.operationId).eq("user_id", userId).in("status", ["scheduled", "pending", "retry", "failed"]).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return json({ success: false, error: "Operação não encontrada ou não cancelável", request_id: requestId }, 404);
      return json({ success: true, request_id: requestId });
    }

    return json({ success: false, error: "Ação não suportada", request_id: requestId }, 400);
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ success: false, error: error.message, code: error.code, request_id: requestId }, error.status);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno", request_id: requestId }, 500);
  }
});
