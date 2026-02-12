import { createClient } from "jsr:@supabase/supabase-js@2";
import { setEnvKeysForUser } from "../_shared/byok-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  content?: string;
}

interface ScheduledFeed {
  id: string;
  user_id: string;
  project_id: string | null;
  feed_url: string;
  feed_name: string;
  niche: string;
  article_length: string;
  auto_publish: boolean;
  is_active: boolean;
  last_run_at: string | null;
  articles_generated: number;
}

interface Project {
  id: string;
  name: string;
  domain: string;
  description: string | null;
  wordpress_url: string | null;
}

// Combined niche configurations for better content adaptation
const COMBINED_NICHE_CONFIGS: Record<string, {
  primaryNiches: string[];
  suggestedAngle: string;
  tone: string;
  focusAreas: string[];
}> = {
  'advocacia': {
    primaryNiches: ['advocacia'],
    suggestedAngle: 'Análise jurídica e implicações legais',
    tone: 'técnico e acessível',
    focusAreas: ['jurisprudência', 'direitos', 'processos', 'prazos']
  },
  'saude': {
    primaryNiches: ['saude'],
    suggestedAngle: 'Impacto na saúde e orientações médicas',
    tone: 'informativo e responsável',
    focusAreas: ['prevenção', 'tratamentos', 'sintomas', 'bem-estar']
  },
  'beleza': {
    primaryNiches: ['beleza'],
    suggestedAngle: 'Tendências e cuidados estéticos',
    tone: 'aspiracional e prático',
    focusAreas: ['tratamentos', 'procedimentos', 'resultados', 'inovações']
  },
  'tecnologia': {
    primaryNiches: ['tecnologia'],
    suggestedAngle: 'Inovação e transformação digital',
    tone: 'dinâmico e inovador',
    focusAreas: ['aplicações', 'impacto', 'tendências', 'disrupção']
  },
  'marketing': {
    primaryNiches: ['marketing'],
    suggestedAngle: 'Estratégias e resultados de mercado',
    tone: 'estratégico e orientado a resultados',
    focusAreas: ['ROI', 'conversão', 'leads', 'engajamento']
  },
  'saude_beleza': {
    primaryNiches: ['saude', 'beleza'],
    suggestedAngle: 'Saúde integral: bem-estar físico e estético',
    tone: 'holístico e aspiracional',
    focusAreas: ['autocuidado', 'procedimentos', 'prevenção', 'qualidade de vida']
  },
  'tecnologia_marketing': {
    primaryNiches: ['tecnologia', 'marketing'],
    suggestedAngle: 'MarTech: tecnologia aplicada ao marketing',
    tone: 'inovador e estratégico',
    focusAreas: ['automação', 'analytics', 'IA em marketing', 'tendências digitais']
  },
  'advocacia_tecnologia': {
    primaryNiches: ['advocacia', 'tecnologia'],
    suggestedAngle: 'Direito Digital e regulamentação tecnológica',
    tone: 'técnico e contemporâneo',
    focusAreas: ['LGPD', 'crimes cibernéticos', 'contratos digitais', 'compliance']
  },
  'advocacia_tecnologia_marketing': {
    primaryNiches: ['advocacia', 'tecnologia', 'marketing'],
    suggestedAngle: 'Negócios digitais: aspectos jurídicos e estratégicos',
    tone: 'abrangente e consultivo',
    focusAreas: ['compliance digital', 'marketing legal', 'proteção de dados', 'contratos']
  },
  'tecnologia_crimes_geral': {
    primaryNiches: ['tecnologia', 'advocacia', 'geral'],
    suggestedAngle: 'Segurança digital e crimes cibernéticos',
    tone: 'investigativo e educacional',
    focusAreas: ['segurança', 'prevenção', 'legislação', 'proteção']
  },
  'geral': {
    primaryNiches: ['geral'],
    suggestedAngle: 'Análise do impacto para o público brasileiro',
    tone: 'informativo e acessível',
    focusAreas: ['atualidades', 'impacto', 'tendências', 'contexto']
  }
};

// Detect niche from domain/project description
function detectNichesFromProject(project: Project): string[] {
  const domain = project.domain.toLowerCase();
  const description = (project.description || '').toLowerCase();
  const name = project.name.toLowerCase();
  
  const detectedNiches: string[] = [];
  
  // Domain-based detection
  const nichePatterns: Record<string, string[]> = {
    'advocacia': ['advogado', 'advocacia', 'juridico', 'direito', 'law', 'lawyer', 'oab'],
    'saude': ['saude', 'medico', 'medicina', 'health', 'clinica', 'hospital', 'nutrição'],
    'beleza': ['beleza', 'estetica', 'beauty', 'skin', 'cabelo', 'hair', 'spa', 'cosmetic'],
    'tecnologia': ['tech', 'tecnologia', 'digital', 'software', 'dev', 'code', 'app', 'cyber'],
    'marketing': ['marketing', 'seo', 'digital', 'agency', 'agencia', 'mkt', 'publicidade'],
  };
  
  for (const [niche, patterns] of Object.entries(nichePatterns)) {
    for (const pattern of patterns) {
      if (domain.includes(pattern) || description.includes(pattern) || name.includes(pattern)) {
        if (!detectedNiches.includes(niche)) {
          detectedNiches.push(niche);
        }
        break;
      }
    }
  }
  
  return detectedNiches.length > 0 ? detectedNiches : ['geral'];
}

// Get combined niche configuration
function getCombinedNicheConfig(niches: string[]): {
  primaryNiches: string[];
  suggestedAngle: string;
  tone: string;
  focusAreas: string[];
  combinedNicheKey: string;
} {
  // Sort niches for consistent key lookup
  const sortedNiches = [...niches].sort();
  const combinedKey = sortedNiches.join('_');
  
  // Check for exact match
  if (COMBINED_NICHE_CONFIGS[combinedKey]) {
    return { ...COMBINED_NICHE_CONFIGS[combinedKey], combinedNicheKey: combinedKey };
  }
  
  // Check for partial matches
  for (const [key, config] of Object.entries(COMBINED_NICHE_CONFIGS)) {
    const keyNiches = key.split('_');
    if (sortedNiches.every(n => keyNiches.includes(n)) || keyNiches.every(n => sortedNiches.includes(n))) {
      return { ...config, combinedNicheKey: key };
    }
  }
  
  // Build dynamic config for new combinations
  const focusAreas: string[] = [];
  let tone = '';
  
  for (const niche of niches) {
    const config = COMBINED_NICHE_CONFIGS[niche] || COMBINED_NICHE_CONFIGS['geral'];
    focusAreas.push(...config.focusAreas.slice(0, 2));
    if (!tone) tone = config.tone;
  }
  
  return {
    primaryNiches: niches,
    suggestedAngle: `Análise integrada: ${niches.join(' + ')}`,
    tone: tone || 'informativo e acessível',
    focusAreas: [...new Set(focusAreas)].slice(0, 6),
    combinedNicheKey: combinedKey
  };
}

// Fetch and parse RSS feed
async function fetchRSSFeed(feedUrl: string): Promise<RSSItem[]> {
  try {
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'ContentFactory RSS Reader/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch RSS: ${response.status}`);
      return [];
    }
    
    const xmlText = await response.text();
    
    // Simple XML parsing
    const items: RSSItem[] = [];
    const itemMatches = xmlText.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);
    
    for (const match of itemMatches) {
      const itemXml = match[1];
      
      const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const linkMatch = itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
      const descMatch = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
      const pubDateMatch = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
      const contentMatch = itemXml.match(/<content:encoded[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i);
      
      if (titleMatch && linkMatch) {
        items.push({
          title: titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
          link: linkMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
          description: descMatch ? descMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '').trim() : '',
          pubDate: pubDateMatch ? pubDateMatch[1].trim() : new Date().toISOString(),
          content: contentMatch ? contentMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : undefined,
        });
      }
    }
    
    return items.slice(0, 10); // Limit to 10 items
  } catch (error) {
    console.error('RSS fetch error:', error);
    return [];
  }
}

// Check if article already exists
async function articleExists(supabase: any, userId: string, sourceUrl: string): Promise<boolean> {
  const { data } = await supabase
    .from('articles')
    .select('id')
    .eq('user_id', userId)
    .contains('config', { source_url: sourceUrl })
    .limit(1);
  
  return data && data.length > 0;
}

// Generate adaptive analysis angle based on combined niches
function generateAdaptiveAngle(
  nicheConfig: ReturnType<typeof getCombinedNicheConfig>,
  newsTitle: string
): string {
  const { suggestedAngle, focusAreas, primaryNiches } = nicheConfig;
  
  // AI-like adaptation based on content signals
  const titleLower = newsTitle.toLowerCase();
  
  // Check for specific topic signals
  if (titleLower.includes('lei') || titleLower.includes('decisão') || titleLower.includes('stf') || titleLower.includes('stj')) {
    if (primaryNiches.includes('advocacia')) {
      return 'Análise jurídica: impactos e implicações legais da decisão';
    }
    return 'Entenda os aspectos legais e como isso afeta você';
  }
  
  if (titleLower.includes('ia') || titleLower.includes('inteligência artificial') || titleLower.includes('tecnologia')) {
    if (primaryNiches.includes('tecnologia')) {
      return 'Transformação digital: impactos práticos e tendências futuras';
    }
    if (primaryNiches.includes('marketing')) {
      return 'Como a tecnologia está revolucionando estratégias de mercado';
    }
    return 'Inovação e tecnologia: impacto no dia a dia do brasileiro';
  }
  
  if (titleLower.includes('crime') || titleLower.includes('golpe') || titleLower.includes('fraude')) {
    if (primaryNiches.includes('advocacia') && primaryNiches.includes('tecnologia')) {
      return 'Crimes digitais: aspectos jurídicos e como se proteger';
    }
    return 'Segurança e prevenção: como se proteger de fraudes e golpes';
  }
  
  if (titleLower.includes('saúde') || titleLower.includes('médico') || titleLower.includes('tratamento')) {
    if (primaryNiches.includes('saude') && primaryNiches.includes('beleza')) {
      return 'Bem-estar integral: saúde e estética para qualidade de vida';
    }
    return 'Saúde em foco: orientações e cuidados importantes';
  }
  
  // Default to configured angle with focus areas
  const focusStr = focusAreas.slice(0, 3).join(', ');
  return `${suggestedAngle}. Foco em: ${focusStr}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("[RSS-AUTO] Starting automatic RSS processing...");

    // Fetch all active schedules
    const { data: schedules, error: scheduleError } = await supabase
      .from('rss_schedules')
      .select('*, projects:project_id(*)')
      .eq('is_active', true);

    if (scheduleError) {
      throw new Error(`Failed to fetch schedules: ${scheduleError.message}`);
    }

    if (!schedules || schedules.length === 0) {
      console.log("[RSS-AUTO] No active schedules found");
      return new Response(
        JSON.stringify({ success: true, message: "No active schedules", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[RSS-AUTO] Found ${schedules.length} active schedules`);

    let totalProcessed = 0;
    let totalPublished = 0;
    const results: any[] = [];

    for (const schedule of schedules) {
      const feed = schedule as ScheduledFeed & { projects?: Project };
      
      try {
        console.log(`[RSS-AUTO] Processing feed: ${feed.feed_name} (${feed.feed_url})`);
        
        // Load user's BYOK keys for this feed's owner
        await setEnvKeysForUser(feed.user_id);
        // Fetch RSS items
        const rssItems = await fetchRSSFeed(feed.feed_url);
        
        if (rssItems.length === 0) {
          console.log(`[RSS-AUTO] No items found in feed: ${feed.feed_name}`);
          continue;
        }

        // Detect niches from project if available
        let detectedNiches: string[] = [feed.niche || 'geral'];
        
        if (feed.projects) {
          const projectNiches = detectNichesFromProject(feed.projects);
          detectedNiches = [...new Set([...detectedNiches, ...projectNiches])];
        }

        // Get combined niche configuration
        const nicheConfig = getCombinedNicheConfig(detectedNiches);
        console.log(`[RSS-AUTO] Combined niches: ${nicheConfig.combinedNicheKey}`);

        // Process only new items (not already in database)
        let newItemsProcessed = 0;
        
        for (const item of rssItems.slice(0, 3)) { // Limit to 3 new items per feed per run
          // Check if already exists
          if (await articleExists(supabase, feed.user_id, item.link)) {
            console.log(`[RSS-AUTO] Skipping existing article: ${item.title.substring(0, 50)}...`);
            continue;
          }

          // Generate adaptive angle
          const adaptiveAngle = generateAdaptiveAngle(nicheConfig, item.title);
          console.log(`[RSS-AUTO] Adaptive angle: ${adaptiveAngle}`);

          // Extract content
          const content = item.content || item.description || item.title;
          const sourceName = new URL(feed.feed_url).hostname.replace('www.', '');

          // Call rewrite-news function
          const rewriteResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/rewrite-news`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                sourceUrl: item.link,
                sourceContent: content,
                sourceName: sourceName,
                analysisAngle: adaptiveAngle,
                niche: nicheConfig.primaryNiches[0],
                articleLength: feed.article_length || 'medium',
                projectId: feed.project_id,
                userId: feed.user_id,
                language: 'pt-BR',
              }),
            }
          );

          if (!rewriteResponse.ok) {
            const errorText = await rewriteResponse.text();
            console.error(`[RSS-AUTO] Rewrite failed: ${errorText}`);
            continue;
          }

          const rewriteResult = await rewriteResponse.json();
          
          if (rewriteResult.success && rewriteResult.article) {
            newItemsProcessed++;
            totalProcessed++;

            // Update article with combined niche info
            await supabase
              .from('articles')
              .update({
                config: {
                  ...rewriteResult.article.config,
                  combined_niches: nicheConfig.combinedNicheKey,
                  detected_niches: detectedNiches,
                  adaptive_angle: adaptiveAngle,
                  auto_generated: true,
                  schedule_id: feed.id,
                }
              })
              .eq('id', rewriteResult.article.id);

            // Auto-publish if enabled and quality is good
            if (feed.auto_publish && feed.project_id && rewriteResult.article.originality_score >= 95) {
              try {
                const publishResponse = await fetch(
                  `${Deno.env.get("SUPABASE_URL")}/functions/v1/publish-to-wordpress`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    },
                    body: JSON.stringify({
                      articleId: rewriteResult.article.id,
                      projectId: feed.project_id,
                    }),
                  }
                );

                if (publishResponse.ok) {
                  totalPublished++;
                  console.log(`[RSS-AUTO] Auto-published: ${rewriteResult.article.title}`);
                }
              } catch (pubError) {
                console.error(`[RSS-AUTO] Auto-publish failed:`, pubError);
              }
            }

            console.log(`[RSS-AUTO] Created article: ${rewriteResult.article.id}`);
          }
        }

        // Update schedule stats
        await supabase
          .from('rss_schedules')
          .update({
            last_run_at: new Date().toISOString(),
            articles_generated: (feed.articles_generated || 0) + newItemsProcessed,
          })
          .eq('id', feed.id);

        results.push({
          feed_id: feed.id,
          feed_name: feed.feed_name,
          items_found: rssItems.length,
          items_processed: newItemsProcessed,
          combined_niches: nicheConfig.combinedNicheKey,
        });

      } catch (feedError) {
        console.error(`[RSS-AUTO] Error processing feed ${feed.feed_name}:`, feedError);
        results.push({
          feed_id: feed.id,
          feed_name: feed.feed_name,
          error: feedError instanceof Error ? feedError.message : 'Unknown error',
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[RSS-AUTO] Completed in ${duration}ms. Processed: ${totalProcessed}, Published: ${totalPublished}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        published: totalPublished,
        duration_ms: duration,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[RSS-AUTO] Fatal error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal error",
        processed: 0 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
