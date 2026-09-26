import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { fetchFeed, validateRSSUrl } from "../_shared/rss-feed.ts";

const FUNCTION_NAME = "execute-news-agents";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-zica-automation-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Agent = {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  topics: string[];
  rss_feeds: string[] | null;
  category: string | null;
  language: string;
  country: string;
  prompt_template: string;
  auto_publish: boolean;
  publish_status: string;
  news_per_day: number;
  active_days: string[] | null;
  execution_times: string[] | null;
  image_generation: string;
  articles_generated: number | null;
  last_run_at: string | null;
  is_active: boolean;
};

type NewsItem = { title: string; link: string; snippet: string; source: string; date?: string };
type Body = { force?: boolean; agentIds?: string[]; dryRun?: boolean; limitPerAgent?: number };
type JsonRecord = Record<string, unknown>;
type EdgeCallResult = { ok: boolean; status: number; data: JsonRecord | null };
type GeneratedArticle = {
  id: string;
  title: string;
  excerpt?: string;
  content: string;
  status: string;
  featured_image_url?: string | null;
  config?: JsonRecord | null;
};
type AgentRunResult = {
  agentId: string;
  agentName: string;
  discovered: number;
  generated: number;
  wordpressDrafts: number;
  published: number;
  imagePending: number;
  errors: string[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function saoPauloClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekday = String(parts.find((p) => p.type === "weekday")?.value || "").toLowerCase();
  const hour = String(parts.find((p) => p.type === "hour")?.value || "00").padStart(2, "0");
  const minute = String(parts.find((p) => p.type === "minute")?.value || "00").padStart(2, "0");
  const year = String(parts.find((p) => p.type === "year")?.value || "0000");
  const month = String(parts.find((p) => p.type === "month")?.value || "00").padStart(2, "0");
  const dayOfMonth = String(parts.find((p) => p.type === "day")?.value || "00").padStart(2, "0");
  const map: Record<string, string> = { sun: "dom", mon: "seg", tue: "ter", wed: "qua", thu: "qui", fri: "sex", sat: "sab" };
  return {
    date: `${year}-${month}-${dayOfMonth}`,
    day: map[weekday] || "seg",
    time: `${hour}:${minute}`,
    minuteOfDay: Number(hour) * 60 + Number(minute),
  };
}

function minuteOfDay(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function eligible(agent: Agent, force: boolean) {
  if (force) return true;
  const now = saoPauloClock();
  const days = agent.active_days?.length ? agent.active_days : ["seg", "ter", "qua", "qui", "sex"];
  if (!days.includes(now.day)) return false;
  const times = agent.execution_times?.length ? agent.execution_times : ["08:00"];
  const targetMinute = times
    .map(minuteOfDay)
    .find((value) => value !== null && now.minuteOfDay >= value && now.minuteOfDay - value < 15);
  if (targetMinute === undefined) return false;
  if (!agent.last_run_at) return true;
  const lastRun = saoPauloClock(new Date(agent.last_run_at));
  return lastRun.date !== now.date || lastRun.minuteOfDay < targetMinute;
}

function normalizeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "");
  }
}

async function fetchRSS(url: string, limit = 5): Promise<NewsItem[]> {
  try {
    validateRSSUrl(url);
    const feed = await fetchFeed(url);
    return feed.items
      .filter((item) => item.title && item.link)
      .slice(0, limit)
      .map((item) => ({
        title: item.title,
        link: item.link,
        snippet: (item.content || item.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200),
        source: item.source || feed.title || new URL(url).hostname,
        date: item.pubDate || undefined,
      }));
  } catch {
    return [];
  }
}

async function searchGoogleNews(topic: string, language = "pt-BR", country = "BR") {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=${encodeURIComponent(language)}&gl=${encodeURIComponent(country)}&ceid=${encodeURIComponent(country)}:${encodeURIComponent(language.split("-")[0])}`;
  return fetchRSS(url, 6);
}

async function fetchSourceContent(url: string) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 Zica.ai editorial verifier" },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return { content: "", finalUrl: url };
    const type = response.headers.get("content-type") || "";
    const text = await response.text();
    if (!type.includes("text/html")) return { content: text.slice(0, 60000), finalUrl: response.url || url };
    const content = text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60000);
    return { content, finalUrl: response.url || url };
  } catch {
    return { content: "", finalUrl: url };
  }
}

async function edgeCall(baseUrl: string, serviceKey: string, slug: string, body: Record<string, unknown>, attempts = 3) {
  let last: EdgeCallResult = { ok: false, status: 500, data: null };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/functions/v1/${slug}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(slug === "generate-image" ? 150000 : 120000),
      });
      const text = await response.text();
      let data: JsonRecord = {};
      try {
        const parsed: unknown = JSON.parse(text);
        data = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed as JsonRecord
          : { value: parsed };
      } catch {
        data = { error: text.slice(0, 500) };
      }
      last = { ok: response.ok && data?.success !== false, status: response.status, data };
      const noRetry = response.status === 401 || response.status === 403 || response.status === 402 || data?.retryable === false || data?.code === "editorial_gate";
      if (last.ok || noRetry) return last;
    } catch (error) {
      last = { ok: false, status: 500, data: { error: error instanceof Error ? error.message : "network_error" } };
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** (attempt - 1))));
  }
  return last;
}

async function authenticatedUser(req: Request, anonKey: string, supabaseUrl: string) {
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: header } } });
  const { data } = await client.auth.getUser(header.slice(7));
  return data.user || null;
}

Deno.serve(async (req: Request) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const started = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed", request_id: requestId }, 405);

  try {
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "");
    const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "");
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({})) as Body;

    let automated = false;
    const automationKey = req.headers.get("x-zica-automation-key") || "";
    if (automationKey) {
      const { data: keyRow } = await admin.from("automation_ingress_keys").select("secret_hash,enabled").eq("name", "news-agents").maybeSingle();
      automated = Boolean(keyRow?.enabled && keyRow.secret_hash && await sha256(automationKey) === keyRow.secret_hash);
      if (!automated) return json({ success: false, error: "Chave de automação inválida", request_id: requestId }, 401);
    }

    const user = automated ? null : await authenticatedUser(req, anonKey, supabaseUrl);
    if (!automated && !user) return json({ success: false, error: "Autorização necessária", request_id: requestId }, 401);

    let query = admin.from("news_agents").select("*").eq("is_active", true);
    if (user) query = query.eq("user_id", user.id);
    if (body.agentIds?.length) query = query.in("id", body.agentIds);
    const { data: agentRows, error } = await query;
    if (error) throw error;
    const agents = (agentRows || []) as Agent[];
    const selected = agents.filter((agent) => eligible(agent, Boolean(body.force)));
    const results: AgentRunResult[] = [];

    for (const agent of selected) {
      const result = { agentId: agent.id, agentName: agent.name, discovered: 0, generated: 0, wordpressDrafts: 0, published: 0, imagePending: 0, errors: [] as string[] };
      try {
        const candidates: NewsItem[] = [];
        for (const feed of agent.rss_feeds || []) candidates.push(...await fetchRSS(feed, 50));
        if (candidates.length < (agent.news_per_day || 1)) {
          for (const topic of (agent.topics || []).slice(0, 3)) {
            candidates.push(...await searchGoogleNews(topic, agent.language || "pt-BR", agent.country || "BR"));
            if (candidates.length >= Math.max(3, agent.news_per_day || 1)) break;
          }
        }
        const { data: priorRows } = await admin
          .from("agent_news")
          .select("source_url")
          .eq("agent_id", agent.id)
          .not("source_url", "is", null)
          .limit(5000);
        const seenUrls = new Set((priorRows || []).map((row) => normalizeSourceUrl(String(row.source_url || ""))));
        const unique = candidates
          .filter((item, index, all) => index === all.findIndex((other) => normalizeSourceUrl(other.link) === normalizeSourceUrl(item.link)))
          .filter((item) => !seenUrls.has(normalizeSourceUrl(item.link)))
          .slice(0, body.limitPerAgent || agent.news_per_day || 1);
        result.discovered = unique.length;

        for (const item of unique) {
          const source = await fetchSourceContent(item.link);
          const rewrite = await edgeCall(supabaseUrl, serviceKey, "rewrite-news", {
            sourceUrl: source.finalUrl || item.link,
            sourceContent: source.content || item.snippet,
            sourceName: item.source,
            analysisAngle: "impacto jurídico prático, linguagem acessível e prevenção",
            niche: agent.topics?.[0] || "jornalismo jurídico",
            projectId: agent.project_id,
            userId: agent.user_id,
            language: agent.language || "pt-BR",
            promptTemplate: agent.prompt_template,
            articleLength: "medium",
          });
          if (!rewrite.ok || !rewrite.data?.article) {
            result.errors.push(`rewrite: ${String(rewrite.data?.error || rewrite.status).slice(0, 160)}`);
            continue;
          }
          if (rewrite.data.duplicate === true) continue;

          const article = rewrite.data.article as GeneratedArticle;
          result.generated++;

          const categoryId = Number(agent.category);
          const wordpressCategories: Array<number | string> = agent.category
            ? [Number.isInteger(categoryId) && categoryId > 0 ? categoryId : agent.category]
            : [];
          const enrichedConfig = {
            ...(article.config && typeof article.config === "object" ? article.config : {}),
            source_type: agent.rss_feeds?.length ? "rss" : "news_search",
            source_agent_id: agent.id,
            source_agent_name: agent.name,
            source_url: source.finalUrl || item.link,
            source_name: item.source,
            source_original_title: item.title,
            source_published_at: item.date || null,
            wordpress_categories: wordpressCategories,
          };
          const { error: provenanceError } = await admin.from("articles").update({
            config: enrichedConfig,
            updated_at: new Date().toISOString(),
          }).eq("id", article.id).eq("user_id", agent.user_id);
          if (provenanceError) {
            result.errors.push(`provenance: ${provenanceError.message.slice(0, 160)}`);
            continue;
          }
          article.config = enrichedConfig;
          let imageOk = Boolean(article.featured_image_url);
          if (!body.dryRun && agent.image_generation !== "none" && article.status === "ready") {
            const image = await edgeCall(supabaseUrl, serviceKey, "generate-image", {
              userId: agent.user_id,
              articleId: article.id,
              projectId: agent.project_id,
              moduleKey: "news",
              allowAiGeneration: true,
              watermark: "RDM ADVOGADOS",
              title: article.title,
              context: article.excerpt,
              content: article.content,
              segment: "news",
              aspectRatio: "16:9",
              quality: "high",
            }, 2);
            imageOk = image.ok;
            if (!imageOk) {
              result.imagePending++;
              result.errors.push(`image: ${String(image.data?.error || image.status).slice(0, 160)}`);
              await admin.from("articles").update({ error_message: String(image.data?.error || "Imagem pendente").slice(0, 500), updated_at: new Date().toISOString() }).eq("id", article.id);
            }
          }

          if (!body.dryRun && agent.auto_publish && agent.project_id) {
            const targetStatus = agent.publish_status === "publish" ? "publish" : "draft";
            if (targetStatus === "publish" && (article.status !== "ready" || !imageOk)) {
              result.errors.push(`publish gate: artigo ${article.id} aguardando revisão/imagem`);
            } else {
              const publish = await edgeCall(supabaseUrl, serviceKey, "wordpress-operations", {
                action: "publish",
                articleId: article.id,
                projectId: agent.project_id,
                userId: agent.user_id,
                publishStatus: targetStatus,
              });
              if (publish.ok) {
                if (targetStatus === "publish") result.published++;
                else result.wordpressDrafts++;
              } else {
                result.errors.push(`wordpress: ${String(publish.data?.error || publish.status).slice(0, 160)}`);
              }
            }
          }

          await admin.from("agent_news").upsert({
            agent_id: agent.id,
            user_id: agent.user_id,
            title: article.title,
            content: article.content,
            source_url: source.finalUrl || item.link,
            source_name: item.source,
            original_title: item.title,
            status: article.status,
            article_id: article.id,
            generated_at: new Date().toISOString(),
          }, { onConflict: "article_id" });
        }

        await admin.from("news_agents").update({
          last_run_at: new Date().toISOString(),
          articles_generated: (agent.articles_generated || 0) + result.generated,
          last_error: result.errors.length ? result.errors.join("; ").slice(0, 2000) : null,
          updated_at: new Date().toISOString(),
        }).eq("id", agent.id);
      } catch (agentError) {
        result.errors.push(agentError instanceof Error ? agentError.message : "agent_error");
      }
      results.push(result);
    }

    log.requestEnd(200, Date.now() - started);
    return json({
      success: true,
      automated,
      force: Boolean(body.force),
      dryRun: Boolean(body.dryRun),
      selectedAgents: selected.length,
      results,
      request_id: requestId,
    });
  } catch (error) {
    log.error(error instanceof Error ? error.message : "internal_error");
    log.requestEnd(500, Date.now() - started);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno", request_id: requestId }, 500);
  }
});
