import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createLogger, createRequestId } from "../_shared/logger.ts";

const FUNCTION_NAME = "execute-news-agents";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-zica-automation-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Agent = {
  id: string; user_id: string; project_id: string | null; name: string; topics: string[]; rss_feeds: string[] | null;
  language: string; country: string; prompt_template: string; auto_publish: boolean; publish_status: string;
  news_per_day: number; active_days: string[] | null; execution_times: string[] | null; image_generation: string;
  articles_generated: number | null; is_active: boolean;
};

type NewsItem = { title: string; link: string; snippet: string; source: string; date?: string };
type Body = { force?: boolean; agentIds?: string[]; dryRun?: boolean; limitPerAgent?: number };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function nowSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const weekday = String(parts.find((p) => p.type === "weekday")?.value || "").toLowerCase();
  const hour = String(parts.find((p) => p.type === "hour")?.value || "00").padStart(2, "0");
  const minute = String(parts.find((p) => p.type === "minute")?.value || "00").padStart(2, "0");
  const map: Record<string, string> = { sun: "dom", mon: "seg", tue: "ter", wed: "qua", thu: "qui", fri: "sex", sat: "sab" };
  return { day: map[weekday] || "seg", time: `${hour}:${minute}`, hour };
}

function eligible(agent: Agent, force: boolean) {
  if (force) return true;
  const now = nowSaoPaulo();
  const days = agent.active_days?.length ? agent.active_days : ["seg", "ter", "qua", "qui", "sex"];
  if (!days.includes(now.day)) return false;
  const times = agent.execution_times || [];
  if (!times.length) return now.hour === "08";
  return times.some((value) => value.startsWith(now.hour));
}

async function fetchRSS(url: string, limit = 5): Promise<NewsItem[]> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "ZicaNewsBot/3.10.2", Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const xml = await response.text();
    const rows: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) && rows.length < limit) {
      const block = match[1];
      const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>([^<]+)<\/title>/i)?.slice(1).find(Boolean) || "").trim();
      const link = (block.match(/<link>([^<]+)<\/link>/i)?.[1] || "").trim();
      const snippet = (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/i)?.slice(1).find(Boolean) || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
      const source = (block.match(/<source[^>]*>([^<]+)<\/source>/i)?.[1] || new URL(url).hostname).trim();
      const date = block.match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1];
      if (title && link) rows.push({ title, link, snippet, source, date });
    }
    return rows;
  } catch { return []; }
}

async function searchGoogleNews(topic: string, language = "pt-BR", country = "BR") {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=${encodeURIComponent(language)}&gl=${encodeURIComponent(country)}&ceid=${encodeURIComponent(country)}:${encodeURIComponent(language.split("-")[0])}`;
  return fetchRSS(url, 6);
}

async function fetchSourceContent(url: string) {
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 Zica.ai editorial verifier" }, signal: AbortSignal.timeout(20000) });
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
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ").trim().slice(0, 60000);
    return { content, finalUrl: response.url || url };
  } catch { return { content: "", finalUrl: url }; }
}

async function edgeCall(baseUrl: string, serviceKey: string, slug: string, body: Record<string, unknown>, attempts = 3) {
  let last: { ok: boolean; status: number; data: any } = { ok: false, status: 500, data: null };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/functions/v1/${slug}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(slug === "generate-image" ? 150000 : 120000),
      });
      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 500) }; }
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !anonKey || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);
    const admin = createClient(supabaseUrl, serviceKey);
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
    const results: any[] = [];

    for (const agent of selected) {
      const result = { agentId: agent.id, agentName: agent.name, discovered: 0, generated: 0, wordpressDrafts: 0, published: 0, imagePending: 0, errors: [] as string[] };
      try {
        const candidates: NewsItem[] = [];
        for (const feed of agent.rss_feeds || []) candidates.push(...await fetchRSS(feed, agent.news_per_day || 1));
        if (candidates.length < (agent.news_per_day || 1)) {
          for (const topic of (agent.topics || []).slice(0, 3)) {
            candidates.push(...await searchGoogleNews(topic, agent.language || "pt-BR", agent.country || "BR"));
            if (candidates.length >= Math.max(3, agent.news_per_day || 1)) break;
          }
        }
        const unique = candidates.filter((item, index, all) => index === all.findIndex((other) => other.title === item.title)).slice(0, body.limitPerAgent || agent.news_per_day || 1);
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
          });
          if (!rewrite.ok || !rewrite.data?.article) {
            result.errors.push(`rewrite: ${String(rewrite.data?.error || rewrite.status).slice(0, 160)}`);
            continue;
          }
          const article = rewrite.data.article;
          result.generated++;

          let imageOk = Boolean(article.featured_image_url);
          if (!body.dryRun && agent.image_generation !== "none" && article.status === "ready") {
            const image = await edgeCall(supabaseUrl, serviceKey, "generate-image", {
              userId: agent.user_id,
              articleId: article.id,
              title: article.title,
              context: article.excerpt,
              content: article.content,
              segment: "legal",
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
              const publish = await edgeCall(supabaseUrl, serviceKey, "publish-to-wordpress", {
                articleId: article.id,
                projectId: agent.project_id,
                userId: agent.user_id,
                publishStatus: targetStatus,
                requireFeaturedImage: targetStatus === "publish",
              });
              if (publish.ok) {
                if (targetStatus === "publish") result.published++;
                else result.wordpressDrafts++;
              } else result.errors.push(`wordpress: ${String(publish.data?.error || publish.status).slice(0, 160)}`);
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
    return json({ success: true, automated, force: Boolean(body.force), dryRun: Boolean(body.dryRun), selectedAgents: selected.length, results, request_id: requestId });
  } catch (error) {
    log.error("execution_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - started);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno", request_id: requestId }, 500);
  }
});
