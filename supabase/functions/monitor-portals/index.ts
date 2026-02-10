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

interface ArticleLink {
  url: string;
  title: string;
  description?: string;
  pubDate?: string;
}

// Known RSS feed patterns for common news sites
const RSS_PATTERNS: Record<string, string[]> = {
  'migalhas.com.br': [
    'https://www.migalhas.com.br/rss/quentes',
    'https://www.migalhas.com.br/rss/noticias',
  ],
  'jurinews.com.br': [
    'https://jurinews.com.br/feed/',
    'https://jurinews.com.br/rss',
  ],
  'conjur.com.br': [
    'https://www.conjur.com.br/rss.xml',
    'https://www.conjur.com.br/feed/',
  ],
  'amazonasdireito.com.br': [
    'https://www.amazonasdireito.com.br/feed/',
  ],
  'lawletter.com.br': [
    'https://portal.lawletter.com.br/feed/',
  ],
};

// Try to discover RSS feed from a website
async function discoverRSSFeed(portalUrl: string): Promise<string | null> {
  console.log(`Discovering RSS feed for: ${portalUrl}`);
  
  try {
    // Extract domain for known patterns
    const urlObj = new URL(portalUrl);
    const domain = urlObj.hostname.replace('www.', '');
    
    // Check known patterns first
    for (const [knownDomain, feeds] of Object.entries(RSS_PATTERNS)) {
      if (domain.includes(knownDomain)) {
        for (const feedUrl of feeds) {
          try {
            console.log(`Trying known feed: ${feedUrl}`);
            const response = await fetch(feedUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentFactoryBot/1.0)' },
            });
            if (response.ok) {
              const text = await response.text();
              if (text.includes('<rss') || text.includes('<feed') || text.includes('<channel>')) {
                console.log(`Found valid RSS at: ${feedUrl}`);
                return feedUrl;
              }
            }
          } catch (e) {
            console.log(`Feed ${feedUrl} not accessible`);
          }
        }
      }
    }
    
    // Try common RSS patterns
    const commonPatterns = [
      `${urlObj.origin}/feed/`,
      `${urlObj.origin}/rss`,
      `${urlObj.origin}/rss.xml`,
      `${urlObj.origin}/feed.xml`,
      `${urlObj.origin}/atom.xml`,
    ];
    
    for (const feedUrl of commonPatterns) {
      try {
        console.log(`Trying: ${feedUrl}`);
        const response = await fetch(feedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentFactoryBot/1.0)' },
        });
        if (response.ok) {
          const text = await response.text();
          if (text.includes('<rss') || text.includes('<feed') || text.includes('<channel>')) {
            console.log(`Found valid RSS at: ${feedUrl}`);
            return feedUrl;
          }
        }
      } catch (e) {
        // Continue trying
      }
    }
    
    // Try to parse the HTML page for RSS link tags
    console.log(`Scraping page for RSS links: ${portalUrl}`);
    const pageResponse = await fetch(portalUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentFactoryBot/1.0)' },
    });
    
    if (pageResponse.ok) {
      const html = await pageResponse.text();
      
      // Look for RSS link tags
      const rssLinkMatch = html.match(/<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*href=["']([^"']+)["']/i);
      if (rssLinkMatch) {
        let feedUrl = rssLinkMatch[2];
        if (feedUrl.startsWith('/')) {
          feedUrl = urlObj.origin + feedUrl;
        }
        console.log(`Found RSS link in HTML: ${feedUrl}`);
        return feedUrl;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error discovering RSS for ${portalUrl}:`, error);
    return null;
  }
}

// Scrape article links directly from HTML if no RSS available
async function scrapeArticleLinks(portalUrl: string, limit: number = 10): Promise<ArticleLink[]> {
  console.log(`Scraping articles from: ${portalUrl}`);
  const articles: ArticleLink[] = [];
  
  try {
    const response = await fetch(portalUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentFactoryBot/1.0)' },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch portal: ${response.status}`);
      return articles;
    }
    
    const html = await response.text();
    const urlObj = new URL(portalUrl);
    
    // Extract article links - look for common patterns
    const articlePatterns = [
      // Common news article patterns
      /<a[^>]+href=["']([^"']+(?:\/noticias?\/|\/artigos?\/|\/news\/|\/post\/|\/\d{4}\/\d{2}\/)[^"']*)["'][^>]*>([^<]+)/gi,
      // Links with titles
      /<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/gi,
      // Article cards with h2/h3 titles
      /<article[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<h[23][^>]*>([^<]+)/gi,
    ];
    
    for (const pattern of articlePatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && articles.length < limit * 2) {
        let url = match[1];
        const title = match[2]?.replace(/<[^>]+>/g, '').trim();
        
        if (!url || !title || title.length < 10) continue;
        
        // Make URL absolute
        if (url.startsWith('/')) {
          url = urlObj.origin + url;
        } else if (!url.startsWith('http')) {
          continue;
        }
        
        // Skip non-article URLs
        if (url.includes('/tag/') || url.includes('/category/') || 
            url.includes('/autor/') || url.includes('/page/') ||
            url.includes('#') || url.includes('javascript:')) {
          continue;
        }
        
        // Avoid duplicates
        if (!articles.find(a => a.url === url)) {
          articles.push({ url, title });
        }
      }
    }
    
    console.log(`Scraped ${articles.length} article links`);
    return articles.slice(0, limit);
  } catch (error) {
    console.error(`Error scraping ${portalUrl}:`, error);
    return articles;
  }
}

// Parse RSS feed directly
async function parseRSSFeed(feedUrl: string, limit: number = 10): Promise<ArticleLink[]> {
  console.log(`Parsing RSS: ${feedUrl}`);
  const articles: ArticleLink[] = [];
  
  try {
    const response = await fetch(feedUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (compatible; ContentFactoryBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch RSS: ${response.status}`);
      return articles;
    }
    
    const xml = await response.text();
    
    // Parse RSS items
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null && articles.length < limit) {
      const itemContent = match[1];
      
      const titleMatch = itemContent.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const linkMatch = itemContent.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
      const descMatch = itemContent.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
      const pubDateMatch = itemContent.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/i);
      
      if (titleMatch && linkMatch) {
        const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        const url = linkMatch[1].replace(/<[^>]+>/g, '').trim();
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : undefined;
        const pubDate = pubDateMatch ? pubDateMatch[1].trim() : undefined;
        
        if (title && url && url.startsWith('http')) {
          articles.push({ url, title, description, pubDate });
        }
      }
    }
    
    // Also try Atom format
    if (articles.length === 0) {
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
      while ((match = entryRegex.exec(xml)) !== null && articles.length < limit) {
        const entryContent = match[1];
        
        const titleMatch = entryContent.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const linkMatch = entryContent.match(/<link[^>]+href=["']([^"']+)["']/i);
        const summaryMatch = entryContent.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i);
        const publishedMatch = entryContent.match(/<published[^>]*>([^<]+)<\/published>/i);
        
        if (titleMatch && linkMatch) {
          const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
          const url = linkMatch[1].trim();
          
          if (title && url && url.startsWith('http')) {
            articles.push({
              url,
              title,
              description: summaryMatch ? summaryMatch[1].replace(/<[^>]+>/g, '').trim() : undefined,
              pubDate: publishedMatch ? publishedMatch[1].trim() : undefined,
            });
          }
        }
      }
    }
    
    console.log(`Parsed ${articles.length} articles from RSS`);
    return articles;
  } catch (error) {
    console.error(`Error parsing RSS ${feedUrl}:`, error);
    return articles;
  }
}

async function processPortal(
  supabase: ReturnType<typeof createClient>,
  portal: MonitoredPortal,
  geminiKey: string
): Promise<{ success: boolean; articlesCreated: number; error?: string }> {
  console.log(`\n=== Processing portal: ${portal.portal_name} ===`);
  
  let articlesCreated = 0;
  let articleLinks: ArticleLink[] = [];
  let discoveredFeed: string | null = null;
  
  try {
    // Step 1: Get articles either from RSS or scraping
    if (portal.rss_feed_url) {
      console.log(`Using configured RSS: ${portal.rss_feed_url}`);
      articleLinks = await parseRSSFeed(portal.rss_feed_url, portal.max_articles_per_day);
    } else {
      // Try to discover RSS feed
      discoveredFeed = await discoverRSSFeed(portal.portal_url);
      
      if (discoveredFeed) {
        console.log(`Using discovered RSS: ${discoveredFeed}`);
        articleLinks = await parseRSSFeed(discoveredFeed, portal.max_articles_per_day);
        
        // Save discovered feed for future use
        await supabase
          .from('monitored_portals')
          .update({ rss_feed_url: discoveredFeed })
          .eq('id', portal.id);
      } else {
        // Fallback to scraping
        console.log(`No RSS found, scraping directly...`);
        articleLinks = await scrapeArticleLinks(portal.portal_url, portal.max_articles_per_day);
      }
    }
    
    if (articleLinks.length === 0) {
      console.log(`No articles found for ${portal.portal_name}`);
      await supabase
        .from('monitored_portals')
        .update({
          last_check_at: new Date().toISOString(),
          next_check_at: calculateNextCheckTime(portal.monitoring_frequency),
          last_error: 'Nenhum artigo encontrado no portal',
        })
        .eq('id', portal.id);
      return { success: true, articlesCreated: 0 };
    }
    
    console.log(`Found ${articleLinks.length} potential articles`);
    
    // Step 2: Process each article
    for (const article of articleLinks) {
      try {
        // Check if article already exists (by URL)
        const { data: existingArticle } = await supabase
          .from('articles')
          .select('id')
          .eq('user_id', portal.user_id)
          .or(`config->>source_url.ilike.%${encodeURIComponent(article.url)}%,keyword.ilike.%${article.title.substring(0, 50)}%`)
          .maybeSingle();

        if (existingArticle) {
          console.log(`Skipping (already exists): ${article.title.substring(0, 50)}...`);
          continue;
        }

        // Filter by preferred keywords if set
        if (portal.preferred_keywords?.length > 0) {
          const titleLower = article.title.toLowerCase();
          const hasKeyword = portal.preferred_keywords.some(kw => 
            titleLower.includes(kw.toLowerCase())
          );
          if (!hasKeyword) {
            console.log(`Skipping (no matching keywords): ${article.title.substring(0, 50)}...`);
            continue;
          }
        }

        // Filter out excluded keywords
        if (portal.excluded_keywords?.length > 0) {
          const titleLower = article.title.toLowerCase();
          const hasExcluded = portal.excluded_keywords.some(kw => 
            titleLower.includes(kw.toLowerCase())
          );
          if (hasExcluded) {
            console.log(`Skipping (excluded keyword): ${article.title.substring(0, 50)}...`);
            continue;
          }
        }

        console.log(`Processing: ${article.title.substring(0, 60)}...`);

        // Invoke rewrite-news to create the article
        const { data: rewriteResult, error: rewriteError } = await supabase.functions.invoke('rewrite-news', {
          body: {
            sourceUrl: article.url,
            sourceContent: article.description || article.title,
            sourceName: portal.portal_name,
            analysisAngle: portal.default_angle || 'Análise aprofundada',
            keyword: '',
            niche: portal.niches?.[0] || 'geral',
            articleLength: portal.article_length || 'long',
            projectId: portal.project_id,
            userId: portal.user_id,
            autoPublish: portal.auto_publish,
            preserveOriginalSeo: portal.preserve_original_seo,
            seoPreservationPercent: portal.seo_preservation_percent || 95,
          }
        });

        if (rewriteError) {
          console.error(`Rewrite error: ${rewriteError.message}`);
          continue;
        }

        if (rewriteResult?.articleId) {
          articlesCreated++;
          console.log(`✓ Created article: ${rewriteResult.articleId}`);
          
          // Create dashboard notification
          try {
            await supabase.from('cron_notifications').insert({
              user_id: portal.user_id,
              type: 'article_generated',
              title: `Artigo gerado: ${article.title.substring(0, 80)}`,
              message: `Novo artigo reescrito automaticamente do portal ${portal.portal_name} com ${rewriteResult.originalityScore || 95}% de originalidade.`,
              metadata: {
                article_id: rewriteResult.articleId,
                portal_name: portal.portal_name,
                portal_id: portal.id,
                source_url: article.url,
                originality_score: rewriteResult.originalityScore || 95,
              }
            });
          } catch (notifErr) {
            console.error('Notification insert error:', notifErr);
          }
        }
        
        // Small delay to avoid overwhelming the AI
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (articleError) {
        console.error(`Error processing article ${article.url}:`, articleError);
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
        ...(discoveredFeed ? { rss_feed_url: discoveredFeed } : {}),
      })
      .eq('id', portal.id);

    console.log(`=== Portal ${portal.portal_name}: ${articlesCreated} articles created ===\n`);
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
  console.log("=== Starting portal monitoring job ===");
  console.log(`Time: ${new Date().toISOString()}`);

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

    // Parse request body for options
    let forceProcess = false;
    let specificPortalId: string | null = null;
    
    try {
      const body = await req.json();
      forceProcess = body.force === true;
      specificPortalId = body.portalId || null;
      console.log(`Options: force=${forceProcess}, portalId=${specificPortalId}`);
    } catch {
      // No body, use defaults
    }

    const currentDay = getCurrentDayCode();
    const now = new Date().toISOString();
    console.log(`Current day: ${currentDay}`);

    // Build query for portals
    let query = supabase
      .from('monitored_portals')
      .select('*')
      .eq('is_active', true);
    
    if (specificPortalId) {
      query = query.eq('id', specificPortalId);
    } else if (!forceProcess) {
      // Only check time-based conditions if not forcing
      query = query
        .lte('next_check_at', now)
        .contains('active_days', [currentDay]);
    }

    const { data: portals, error: portalsError } = await query;

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
    console.log(`\n=== Portal monitoring completed ===`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Total articles created: ${totalArticlesCreated}`);

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
