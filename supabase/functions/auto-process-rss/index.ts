import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  const res = await fetch(url, {
    headers: {
      "User-Agent": "GrupoSEO-AutoPost/1.0",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();
  if (xml.length > 5_000_000) throw new Error("RSS excede 5 MB");

  const items: RSSItem[] = [];
  const rssMatches = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  const atomMatches = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
  const blocks = rssMatches.length ? rssMatches.map((m) => m[1]) : atomMatches.map((m) => m[1]);

  for (const block of blocks.slice(0, 20)) {
    const title = stripHtml(firstTag(block, "title"));
    let link = firstTag(block, "link");
    if (!link) {
      const href = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
      link = href || "";
    }
    const descriptionRaw = firstTag(block, "description") || firstTag(block, "summary");
    const contentRaw = firstTag(block, "content:encoded") || firstTag(block, "content");
    const dateRaw = firstTag(block, "pubDate") || firstTag(block, "published") || firstTag(block, "updated");

    if (!title || !link) continue;
    try { new URL(link); } catch { continue; }
    items.push({
      title,
      link,
      description: stripHtml(descriptionRaw),
      content: contentRaw ? stripHtml(contentRaw) : undefined,
      publishedAt: dateRaw ? new Date(dateRaw).toISOString() : null,
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

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Autorização necessária" }, 401);
  const token = auth.slice(7);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Backend incompleto" }, 500);
  if (token !== serviceKey) return json({ error: "Execução restrita ao serviço de automação" }, 403);

  const admin = createClient(supabaseUrl, serviceKey);
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
