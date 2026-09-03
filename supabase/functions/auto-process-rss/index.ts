import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { discoverFeed, fetchValidatedFeedItems } from "../_shared/rss-discovery.ts";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  scheduleId?: string | null;
  forceDraft?: boolean;
  maxSchedules?: number;
  itemLimit?: number;
};

const J = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...H, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

function jwtRole(token: string) {
  try {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return String(JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')))?.role || '');
  } catch { return ''; }
}

function nextRun(frequency: string | null) {
  const normalized = (frequency || 'hourly').toLowerCase();
  const ms = normalized === 'realtime' ? 900000 : normalized === 'daily' ? 86400000 : normalized === 'weekly' ? 604800000 : 3600000;
  return new Date(Date.now() + ms).toISOString();
}

async function claim(admin: any, schedule: Schedule, targeted: boolean) {
  const until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  let query = admin.from('rss_schedules').update({ next_run_at: until, updated_at: new Date().toISOString() }).eq('id', schedule.id);
  if (!targeted) query = schedule.next_run_at ? query.eq('next_run_at', schedule.next_run_at) : query.is('next_run_at', null);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function call(url: string, key: string, slug: string, body: any) {
  const response = await fetch(`${url}/functions/v1/${slug}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  const text = await response.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 1000) }; }
  return { ok: response.ok && data?.success !== false, status: response.status, data };
}

async function resolvePortal(admin: any, schedule: Schedule): Promise<Portal | null> {
  if (!schedule.project_id) return null;
  const { data, error } = await admin.from('monitored_portals')
    .select('id,project_id,portal_name,portal_url,rss_feed_url,automation_mode,max_articles_per_day')
    .eq('project_id', schedule.project_id)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data || []) as Portal[];
  return rows.find((portal) => portal.rss_feed_url === schedule.feed_url)
    || rows.find((portal) => portal.portal_name === schedule.feed_name)
    || null;
}

async function resolveFeed(admin: any, schedule: Schedule, portal: Portal | null) {
  let siteUrl = portal?.portal_url || '';
  if (!siteUrl && schedule.project_id) {
    const { data: project } = await admin.from('projects').select('wordpress_url').eq('id', schedule.project_id).maybeSingle();
    siteUrl = String(project?.wordpress_url || schedule.feed_url);
  }
  if (!siteUrl) siteUrl = schedule.feed_url;

  const discovery = await discoverFeed(siteUrl, { directCandidate: schedule.feed_url });
  if (!discovery.valid) throw new Error(`Feed inválido/não descoberto: ${discovery.reason || 'unknown'}`);

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

  if (discovery.url !== schedule.feed_url) {
    const { data: conflict } = await admin.from('rss_schedules')
      .select('id').eq('project_id', schedule.project_id).eq('feed_url', discovery.url).neq('id', schedule.id).limit(1).maybeSingle();
    if (!conflict) await admin.from('rss_schedules').update({ feed_url: discovery.url, updated_at: validatedAt }).eq('id', schedule.id);
  }
  if (portal?.id) {
    await admin.from('monitored_portals').update({
      rss_feed_url: discovery.url,
      rss_feed_validation: validation,
      rss_feed_validated_at: validatedAt,
      last_error: null,
      updated_at: validatedAt,
    }).eq('id', portal.id);
  }
  if (schedule.project_id) {
    await admin.from('projects').update({
      rss_feed_url: discovery.url,
      rss_feed_validation: validation,
      rss_feed_validated_at: validatedAt,
      updated_at: validatedAt,
    }).eq('id', schedule.project_id);
  }
  return discovery;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: H });
  if (req.method !== 'POST') return J({ success: false, error: 'Method not allowed' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return J({ success: false, error: 'Autorização necessária' }, 401);
  if (jwtRole(auth.slice(7)) !== 'service_role') return J({ success: false, error: 'Execução restrita ao serviço de automação' }, 403);

  const input = await req.json().catch(() => ({})) as Input;
  const targeted = Boolean(input.scheduleId);
  const maxSchedules = targeted ? 1 : Math.max(1, Math.min(25, Number(input.maxSchedules || 25)));
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) return J({ success: false, error: 'Backend incompleto' }, 500);

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  let schedulesQuery = admin.from('rss_schedules')
    .select('id,user_id,project_id,feed_url,feed_name,niche,article_length,frequency,auto_publish,last_run_at,next_run_at,articles_generated')
    .eq('is_active', true);
  if (input.scheduleId) schedulesQuery = schedulesQuery.eq('id', input.scheduleId);
  else schedulesQuery = schedulesQuery.or(`next_run_at.is.null,next_run_at.lte.${now}`);
  const { data: schedules, error } = await schedulesQuery.order('next_run_at', { ascending: true, nullsFirst: true }).limit(maxSchedules);
  if (error) return J({ success: false, error: error.message }, 500);
  if (!schedules?.length) return J({ success: true, processed: 0, queued: 0, drafts: 0, skipped: 0, schedules: [], targeted });

  let processed = 0;
  let queued = 0;
  let drafts = 0;
  let skipped = 0;
  const results: any[] = [];

  for (const raw of schedules) {
    const schedule = raw as Schedule;
    try {
      if (!(await claim(admin, schedule, targeted))) continue;
      const portal = await resolvePortal(admin, schedule);
      const feed = await resolveFeed(admin, schedule, portal);
      const itemLimit = Math.max(1, Math.min(10, Number(input.itemLimit || portal?.max_articles_per_day || 5)));
      const { validation, items } = await fetchValidatedFeedItems(feed.url, itemLimit);
      if (!validation.valid) throw new Error(`RSS falhou na segunda validação: ${validation.reason || 'unknown'}`);

      let created = 0;
      let enqueued = 0;
      let draftCount = 0;
      let lastProfile: any = null;
      let lastConfidence: number | null = null;

      if (portal?.id) {
        await admin.from('monitored_portals').update({
          last_check_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          last_error: null,
          last_articles_found: items.length,
          updated_at: new Date().toISOString(),
        }).eq('id', portal.id);
      }

      for (const item of items) {
        const rewrite = await call(url, key, 'rewrite-news', {
          sourceUrl: item.link,
          sourceContent: item.content || item.description || item.title,
          sourceName: schedule.feed_name,
          rssFeedUrl: feed.url,
          analysisAngle: 'AUTO_SEMANTIC',
          niche: 'auto',
          articleLength: 'auto',
          automationMode: portal?.automation_mode || 'ai_95',
          projectId: schedule.project_id,
          userId: schedule.user_id,
          language: 'pt-BR',
        });

        if (!rewrite.ok) {
          results.push({ schedule_id: schedule.id, source_url: item.link, stage: 'rewrite', error: String(rewrite.data?.error || `HTTP ${rewrite.status}`).slice(0, 700) });
          continue;
        }
        if (rewrite.data?.skipped) {
          skipped++;
          results.push({ schedule_id: schedule.id, source_url: item.link, stage: 'triage', skipped: true, triage: rewrite.data?.triage || null });
          continue;
        }
        const article = rewrite.data?.article;
        if (!article?.id) continue;
        if (!rewrite.data?.duplicate) { created++; processed++; }
        lastProfile = rewrite.data?.triage || article.config?.automation_profile || null;
        lastConfidence = Number(lastProfile?.confidence ?? 0) || null;

        await admin.from('articles').update({
          rss_feed_url: feed.url,
          source_canonical_url: item.link,
          config: {
            ...(article.config && typeof article.config === 'object' ? article.config : {}),
            schedule_id: schedule.id,
            rss_published_at: item.published_at,
            rss_source_url: item.link,
            rss_feed_url: feed.url,
          },
        }).eq('id', article.id);

        if (schedule.project_id && !rewrite.data?.duplicate) {
          const safeToPublish = Boolean(
            !input.forceDraft &&
            schedule.auto_publish &&
            article.status === 'ready' &&
            Number(article.originality_score || 0) >= 95 &&
            rewrite.data?.auto_publish_recommended === true
          );
          const publishStatus = safeToPublish ? 'publish' : 'draft';
          const profile = rewrite.data?.triage || {};
          const distribution = await call(url, key, 'wordpress-operations', {
            action: 'publish',
            articleId: article.id,
            projectId: schedule.project_id,
            userId: schedule.user_id,
            publishStatus,
            categories: profile.wordpress_category ? [profile.wordpress_category] : [],
            tags: Array.isArray(profile.tags) ? profile.tags : [],
          });
          if (distribution.ok) {
            enqueued++;
            queued++;
            if (publishStatus === 'draft') { draftCount++; drafts++; }
          } else {
            results.push({ schedule_id: schedule.id, article_id: article.id, stage: 'distribution', publish_status: publishStatus, error: String(distribution.data?.error || `HTTP ${distribution.status}`).slice(0, 700) });
          }
        }
      }

      const updatedAt = new Date().toISOString();
      await admin.from('rss_schedules').update({
        last_run_at: updatedAt,
        next_run_at: nextRun(schedule.frequency),
        articles_generated: Number(schedule.articles_generated || 0) + created,
        updated_at: updatedAt,
      }).eq('id', schedule.id);

      if (portal?.id) {
        const portalUpdate: Record<string, any> = {
          rss_feed_url: feed.url,
          last_ai_profile: lastProfile || {},
          last_ai_confidence: lastConfidence,
          articles_generated: Number(schedule.articles_generated || 0) + created,
          next_check_at: nextRun(schedule.frequency),
          updated_at: updatedAt,
        };
        if (created > 0) portalUpdate.last_article_at = updatedAt;
        await admin.from('monitored_portals').update(portalUpdate).eq('id', portal.id);
      }

      results.push({
        schedule_id: schedule.id,
        feed: schedule.feed_name,
        resolved_feed_url: feed.url,
        discovery_method: feed.discovery_method,
        feed_format: feed.format,
        feed_http_status: feed.status,
        feed_content_type: feed.content_type,
        feed_structure_valid: feed.structure_valid,
        items_found: items.length,
        created,
        queued: enqueued,
        drafts: draftCount,
        force_draft: Boolean(input.forceDraft),
        success: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      await admin.from('rss_schedules').update({ next_run_at: nextRun(schedule.frequency), updated_at: new Date().toISOString() }).eq('id', schedule.id);
      if (schedule.project_id) {
        const { data: portals } = await admin.from('monitored_portals').select('id,portal_name').eq('project_id', schedule.project_id).eq('is_active', true).limit(100);
        const match = (portals || []).find((portal: any) => portal.portal_name === schedule.feed_name);
        if (match?.id) await admin.from('monitored_portals').update({ last_check_at: new Date().toISOString(), last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq('id', match.id);
      }
      results.push({ schedule_id: schedule.id, success: false, error: message });
    }
  }

  return J({ success: true, processed, queued, drafts, skipped, schedules: results, targeted, force_draft: Boolean(input.forceDraft) });
});
