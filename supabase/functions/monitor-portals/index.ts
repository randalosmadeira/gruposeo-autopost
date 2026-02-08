import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MonitoredPortal {
  id: string;
  user_id: string;
  project_id: string | null;
  portal_name: string;
  portal_url: string;
  portal_domain: string;
  rss_feed_url: string | null;
  niches: string[];
  preferred_keywords: string[];
  excluded_keywords: string[];
  article_length: string;
  default_angle: string | null;
  custom_slug_prefix: string | null;
  auto_title: boolean;
  auto_meta_description: boolean;
  preserve_original_seo: boolean;
  seo_preservation_percent: number;
  is_active: boolean;
  monitoring_frequency: string;
  active_days: string[];
  max_articles_per_day: number;
  auto_publish: boolean;
  update_sitemap: boolean;
  sitemap_priority: number;
  articles_generated: number;
}

async function processPortal(
  supabase: ReturnType<typeof createClient>,
  portal: MonitoredPortal,
  geminiKey: string
): Promise<{ success: boolean; articlesCreated: number; error?: string }> {
  console.log(`Processing portal: ${portal.portal_name}`);
  
  let articlesCreated = 0;
  
  try {
    // If portal has RSS feed, use that
    if (portal.rss_feed_url) {
      const { data: rssData, error: rssError } = await supabase.functions.invoke('parse-rss', {
        body: { feedUrl: portal.rss_feed_url, limit: portal.max_articles_per_day }
      });

      if (rssError) {
        console.error(`RSS parse error for ${portal.portal_name}:`, rssError);
        return { success: false, articlesCreated: 0, error: `RSS error: ${rssError.message}` };
      }

      if (rssData?.items?.length > 0) {
        for (const item of rssData.items.slice(0, portal.max_articles_per_day)) {
          // Check if article already exists (by URL)
          const { data: existingArticle } = await supabase
            .from('articles')
            .select('id')
            .eq('user_id', portal.user_id)
            .ilike('config->>source_url', item.link)
            .maybeSingle();

          if (existingArticle) {
            console.log(`Article already exists for: ${item.link}`);
            continue;
          }

          // Filter by preferred keywords if set
          if (portal.preferred_keywords?.length > 0) {
            const titleLower = item.title.toLowerCase();
            const hasKeyword = portal.preferred_keywords.some(kw => 
              titleLower.includes(kw.toLowerCase())
            );
            if (!hasKeyword) {
              console.log(`Skipping article (no matching keywords): ${item.title}`);
              continue;
            }
          }

          // Filter out excluded keywords
          if (portal.excluded_keywords?.length > 0) {
            const titleLower = item.title.toLowerCase();
            const hasExcluded = portal.excluded_keywords.some(kw => 
              titleLower.includes(kw.toLowerCase())
            );
            if (hasExcluded) {
              console.log(`Skipping article (excluded keyword): ${item.title}`);
              continue;
            }
          }

          // Invoke rewrite-news to create the article
          const { data: rewriteResult, error: rewriteError } = await supabase.functions.invoke('rewrite-news', {
            body: {
              sourceUrl: item.link,
              sourceContent: item.content || item.description || item.title,
              sourceName: portal.portal_name,
              analysisAngle: portal.default_angle || 'Análise de impacto',
              keyword: '',
              niche: portal.niches?.[0] || 'geral',
              articleLength: portal.article_length,
              projectId: portal.project_id,
              userId: portal.user_id,
              autoPublish: portal.auto_publish,
              preserveOriginalSeo: portal.preserve_original_seo,
              seoPreservationPercent: portal.seo_preservation_percent,
            }
          });

          if (rewriteError) {
            console.error(`Rewrite error for ${item.title}:`, rewriteError);
            continue;
          }

          if (rewriteResult?.articleId) {
            articlesCreated++;
            console.log(`Created article: ${rewriteResult.articleId}`);
          }
        }
      }
    }

    // Update portal stats
    await supabase
      .from('monitored_portals')
      .update({
        last_check_at: new Date().toISOString(),
        articles_generated: portal.articles_generated + articlesCreated,
        next_check_at: calculateNextCheckTime(portal.monitoring_frequency),
        last_error: null,
      })
      .eq('id', portal.id);

    return { success: true, articlesCreated };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error processing portal ${portal.portal_name}:`, error);
    
    // Update portal with error
    await supabase
      .from('monitored_portals')
      .update({
        last_check_at: new Date().toISOString(),
        next_check_at: calculateNextCheckTime(portal.monitoring_frequency),
        last_error: errorMessage,
      })
      .eq('id', portal.id);

    return { success: false, articlesCreated, error: errorMessage };
  }
}

function calculateNextCheckTime(frequency: string): string {
  const now = new Date();
  
  switch (frequency) {
    case 'realtime':
      now.setMinutes(now.getMinutes() + 15);
      break;
    case 'hourly':
      now.setHours(now.getHours() + 1);
      break;
    case 'daily':
      now.setDate(now.getDate() + 1);
      break;
    case 'weekly':
      now.setDate(now.getDate() + 7);
      break;
    default:
      now.setHours(now.getHours() + 1);
  }
  
  return now.toISOString();
}

function getCurrentDayCode(): string {
  const days = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  return days[new Date().getDay()];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("Starting portal monitoring job...");

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      console.error("GEMINI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentDay = getCurrentDayCode();
    const now = new Date().toISOString();

    // Get active portals that need to be checked
    const { data: portals, error: portalsError } = await supabase
      .from('monitored_portals')
      .select('*')
      .eq('is_active', true)
      .lte('next_check_at', now)
      .contains('active_days', [currentDay]);

    if (portalsError) {
      console.error("Error fetching portals:", portalsError);
      return new Response(
        JSON.stringify({ error: portalsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${portals?.length || 0} portals to process`);

    const results = [];
    let totalArticlesCreated = 0;

    for (const portal of portals || []) {
      const result = await processPortal(supabase, portal, geminiKey);
      results.push({
        portal_id: portal.id,
        portal_name: portal.portal_name,
        ...result
      });
      totalArticlesCreated += result.articlesCreated;
    }

    const duration = Date.now() - startTime;
    console.log(`Portal monitoring completed in ${duration}ms. Articles created: ${totalArticlesCreated}`);

    return new Response(
      JSON.stringify({
        success: true,
        portalsProcessed: portals?.length || 0,
        totalArticlesCreated,
        results,
        duration,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Portal monitoring error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
