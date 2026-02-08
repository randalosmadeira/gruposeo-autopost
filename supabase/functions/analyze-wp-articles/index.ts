import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface ArticleData {
  wp_post_id: number;
  wp_post_url: string;
  wp_post_slug?: string;
  wp_post_title: string;
  wp_post_type?: string;
  wp_post_status?: string;
  wp_categories?: string[];
  wp_tags?: string[];
  content: string;
  word_count?: number;
  last_wp_modified_at?: string;
}

interface AnalysisResult {
  primary_keyword: string;
  secondary_keywords: string[];
  topic_cluster: string;
  semantic_summary: string;
  linkability_score: number;
  seo_score: number;
  suggested_anchor_texts: string[];
}

// Quick analysis without AI (fallback when credits exhausted or for bulk processing)
function analyzeArticleBasic(article: ArticleData): AnalysisResult {
  const title = article.wp_post_title || '';
  const content = article.content || '';
  
  // Extract keywords from title and categories
  const words = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const categories = article.wp_categories || [];
  
  // Simple keyword extraction
  const primaryKeyword = words.slice(0, 3).join(' ') || title.substring(0, 50);
  const secondaryKeywords = [...new Set([...words.slice(3, 8), ...categories.slice(0, 3)])].slice(0, 5);
  
  // Detect topic cluster from categories
  const topicCluster = categories[0] || 'Geral';
  
  // Generate simple summary
  const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const semanticSummary = plainText.substring(0, 150) || title;
  
  // Calculate scores based on content quality
  const wordCount = article.word_count || plainText.split(/\s+/).length;
  const hasHeadings = /<h[2-4]/i.test(content);
  const hasImages = /<img/i.test(content);
  const hasLinks = /<a\s/i.test(content);
  
  let seoScore = 50;
  if (wordCount > 500) seoScore += 15;
  if (wordCount > 1000) seoScore += 10;
  if (hasHeadings) seoScore += 10;
  if (hasImages) seoScore += 10;
  if (hasLinks) seoScore += 5;
  
  const linkabilityScore = Math.min(100, 40 + (wordCount / 50) + (hasHeadings ? 15 : 0) + (categories.length * 5));
  
  return {
    primary_keyword: primaryKeyword,
    secondary_keywords: secondaryKeywords as string[],
    topic_cluster: topicCluster,
    semantic_summary: semanticSummary,
    linkability_score: Math.min(100, Math.round(linkabilityScore)),
    seo_score: Math.min(100, seoScore),
    suggested_anchor_texts: [title, primaryKeyword, ...secondaryKeywords.slice(0, 2)].filter(Boolean) as string[],
  };
}

// Analyze article content with AI (with fallback)
// Returns { result, usedAI, creditsExhausted }
async function analyzeArticle(article: ArticleData, useAI: boolean = true): Promise<{ result: AnalysisResult; usedAI: boolean; creditsExhausted: boolean }> {
  // If AI is disabled, use basic analysis immediately
  if (!useAI) {
    return { result: analyzeArticleBasic(article), usedAI: false, creditsExhausted: false };
  }
  
  const prompt = `Analise o seguinte artigo e extraia informações para otimização de SEO e linkagem interna.

TÍTULO: ${article.wp_post_title}
CATEGORIAS: ${article.wp_categories?.join(', ') || 'Não especificadas'}
TAGS: ${article.wp_tags?.join(', ') || 'Não especificadas'}

CONTEÚDO (primeiros 2000 caracteres):
${article.content.substring(0, 2000)}

Retorne APENAS um JSON válido (sem markdown, sem explicações) com a seguinte estrutura:
{
  "primary_keyword": "palavra-chave principal do artigo (máximo 50 caracteres)",
  "secondary_keywords": ["lista de 3-5 palavras-chave secundárias"],
  "topic_cluster": "nome do cluster temático (ex: 'Marketing Digital', 'SEO', 'Vendas B2B')",
  "semantic_summary": "resumo semântico de 100-150 caracteres para matching de links",
  "linkability_score": 85,
  "seo_score": 75,
  "suggested_anchor_texts": ["lista de 3-5 textos âncora sugeridos para links apontando para este artigo"]
}

IMPORTANTE:
- linkability_score: 0-100, quão útil é este artigo como destino de links (conteúdo evergreen = alto, notícias = baixo)
- seo_score: 0-100, qualidade SEO geral do conteúdo
- topic_cluster: identifique o tema principal para agrupar artigos relacionados`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout per article
    
    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite", // Use cheaper model for bulk analysis
        messages: [
          { role: "system", content: "Você é um especialista em SEO e análise de conteúdo. Responda APENAS com JSON válido." },
          { role: "user", content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      console.error("AI Gateway error:", error);
      
      // Check for payment/credit errors - signal to stop using AI
      if (response.status === 402 || error.includes('credits') || error.includes('payment')) {
        console.log("AI credits exhausted, using basic analysis");
        return { result: analyzeArticleBasic(article), usedAI: false, creditsExhausted: true };
      }
      
      // Other errors - use fallback but don't signal credits issue
      return { result: analyzeArticleBasic(article), usedAI: false, creditsExhausted: false };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    try {
      let jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return { result: JSON.parse(jsonStr), usedAI: true, creditsExhausted: false };
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      return { result: analyzeArticleBasic(article), usedAI: false, creditsExhausted: false };
    }
  } catch (e: any) {
    // Handle abort/timeout
    if (e.name === 'AbortError') {
      console.log("AI request timed out, using basic analysis");
    } else {
      console.error("AI analysis error, using fallback:", e);
    }
    return { result: analyzeArticleBasic(article), usedAI: false, creditsExhausted: false };
  }
}

// Generate content hash for change detection
function generateContentHash(content: string): string {
  // Simple hash using first 500 chars + length
  const sample = content.substring(0, 500) + content.length;
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    const char = sample.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

// Count internal and external links
function countLinks(content: string, siteUrl: string): { internal: number; external: number } {
  const linkRegex = /href=["']([^"']+)["']/gi;
  let internal = 0;
  let external = 0;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const url = match[1];
    if (url.startsWith(siteUrl) || url.startsWith('/')) {
      internal++;
    } else if (url.startsWith('http')) {
      external++;
    }
  }

  return { internal, external };
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

// Fetch articles using standard WordPress REST API with full pagination
async function fetchArticlesViaRestAPI(
  baseUrl: string,
  username: string,
  appPassword: string
): Promise<ArticleData[]> {
  const authHeader = `Basic ${btoa(`${username}:${appPassword}`)}`;
  const allArticles: ArticleData[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;
  
  console.log("Fetching articles via REST API with pagination...");
  
  while (hasMore) {
    const postsUrl = `${baseUrl}/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}&_fields=id,title,link,slug,categories,tags,content,modified_gmt,status,type`;
    const postsResp = await fetch(postsUrl, {
      headers: { Authorization: authHeader },
    });

    if (!postsResp.ok) {
      // Check if it's just no more pages (empty page returns 400)
      if (postsResp.status === 400 && page > 1) {
        hasMore = false;
        break;
      }
      const t = await postsResp.text().catch(() => '');
      throw new Error(`Falha ao buscar posts via REST API (${postsResp.status}): ${t}`);
    }

    const posts = await postsResp.json().catch(() => []) as any[];
    
    if (!posts.length) {
      hasMore = false;
      break;
    }
    
    const articles = (posts || []).map((post: any) => ({
      wp_post_id: Number(post.id),
      wp_post_url: String(post.link || ''),
      wp_post_slug: post.slug ? String(post.slug) : undefined,
      wp_post_title: String(post.title?.rendered || ''),
      wp_post_type: post.type ? String(post.type) : undefined,
      wp_post_status: post.status ? String(post.status) : undefined,
      wp_categories: Array.isArray(post.categories) ? post.categories.map((id: number) => `cat-${id}`) : [],
      wp_tags: Array.isArray(post.tags) ? post.tags.map((id: number) => `tag-${id}`) : [],
      content: String(post.content?.rendered || ''),
      word_count: String(post.content?.rendered || '').split(/\s+/).filter(Boolean).length,
      last_wp_modified_at: post.modified_gmt ? String(post.modified_gmt) : undefined,
    })).filter((a: ArticleData) => Number.isFinite(a.wp_post_id) && !!a.wp_post_url);
    
    allArticles.push(...articles);
    console.log(`REST API: Fetched page ${page}, got ${articles.length} articles (total: ${allArticles.length})`);
    
    // Check total pages from headers
    const totalPages = parseInt(postsResp.headers.get('X-WP-TotalPages') || '1', 10);
    if (page >= totalPages || posts.length < perPage) {
      hasMore = false;
    } else {
      page++;
    }
  }
  
  console.log(`REST API: Total articles fetched: ${allArticles.length}`);
  return allArticles;
}

// Fetch articles using ContentFactory plugin endpoints with full pagination
async function fetchArticlesViaPlugin(
  baseUrl: string,
  apiKey: string
): Promise<ArticleData[]> {
  const allArticles: ArticleData[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;
  
  console.log("Fetching articles via ContentFactory plugin with pagination...");
  
  while (hasMore) {
    const listUrl = `${baseUrl}/wp-json/cfrdm/v1/articles-for-indexing?per_page=${perPage}&page=${page}`;
    const listResp = await fetch(listUrl, {
      headers: {
        'X-CFRDM-API-Key': apiKey,
      },
    });

    if (!listResp.ok) {
      const t = await listResp.text().catch(() => '');
      const errorInfo = `(${listResp.status}): ${t}`;
      
      // Check if it's a "route not found" error - plugin not installed
      if (listResp.status === 404 && t.includes('rest_no_route')) {
        throw new Error(`PLUGIN_NOT_FOUND:${errorInfo}`);
      }
      throw new Error(`Falha ao buscar lista de artigos no plugin ${errorInfo}`);
    }

    const listJson = await listResp.json().catch(() => null) as any;
    const ids: number[] = Array.isArray(listJson?.articles)
      ? listJson.articles.map((a: any) => Number(a.wp_post_id)).filter((n: number) => Number.isFinite(n))
      : [];

    if (ids.length === 0) {
      hasMore = false;
      break;
    }
    
    // Get total pages from response
    const totalPages = listJson?.pages || 1;
    
    // Fetch content in batch
    const batchUrl = `${baseUrl}/wp-json/cfrdm/v1/export-articles-batch`;
    const batchResp = await fetch(batchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CFRDM-API-Key': apiKey,
      },
      body: JSON.stringify({ post_ids: ids }),
    });

    if (!batchResp.ok) {
      const t = await batchResp.text().catch(() => '');
      throw new Error(`Falha ao exportar artigos no plugin (${batchResp.status}): ${t}`);
    }

    const batchJson = await batchResp.json().catch(() => null) as any;
    const articles: any[] = Array.isArray(batchJson?.articles) ? batchJson.articles : [];

    const formattedArticles = articles
      .filter((a: any) => a && typeof a.content === 'string')
      .map((a: any) => ({
        wp_post_id: Number(a.wp_post_id),
        wp_post_url: String(a.wp_post_url || ''),
        wp_post_slug: a.wp_post_slug ? String(a.wp_post_slug) : undefined,
        wp_post_title: String(a.wp_post_title || ''),
        wp_post_type: a.wp_post_type ? String(a.wp_post_type) : undefined,
        wp_post_status: a.wp_post_status ? String(a.wp_post_status) : undefined,
        wp_categories: Array.isArray(a.wp_categories) ? a.wp_categories.map(String) : [],
        wp_tags: Array.isArray(a.wp_tags) ? a.wp_tags.map(String) : [],
        content: String(a.content || ''),
        word_count: typeof a.word_count === 'number' ? a.word_count : undefined,
        last_wp_modified_at: a.last_wp_modified_at ? String(a.last_wp_modified_at) : undefined,
      }))
      .filter((a: ArticleData) => Number.isFinite(a.wp_post_id) && !!a.wp_post_url);
    
    allArticles.push(...formattedArticles);
    console.log(`Plugin: Fetched page ${page}/${totalPages}, got ${formattedArticles.length} articles (total: ${allArticles.length})`);
    
    if (page >= totalPages || ids.length < perPage) {
      hasMore = false;
    } else {
      page++;
    }
  }
  
  console.log(`Plugin: Total articles fetched: ${allArticles.length}`);
  return allArticles;
}

async function fetchWordPressArticlesForIndexing(args: {
  wordpressUrl: string;
  wordpressUsername: string | null;
  wordpressAppPassword: string | null;
  useFallback?: boolean;
}): Promise<{ articles: ArticleData[]; usedFallback: boolean; fallbackReason?: string }> {
  const baseUrl = stripTrailingSlashes(args.wordpressUrl);
  if (!baseUrl) return { articles: [], usedFallback: false };

  const isPluginAuth = args.wordpressUsername === '__CFRDM_PLUGIN__';
  const username = args.wordpressUsername || '';
  const appPassword = args.wordpressAppPassword || '';

  // If explicitly requesting fallback or not using plugin auth, use REST API directly
  if (args.useFallback || !isPluginAuth) {
    if (!username || !appPassword || isPluginAuth) {
      throw new Error('Para usar a REST API padrão, configure o WordPress com usuário e Application Password nas configurações do projeto.');
    }
    const articles = await fetchArticlesViaRestAPI(baseUrl, username, appPassword);
    return { articles, usedFallback: true, fallbackReason: 'Solicitado pelo usuário' };
  }

  // Try plugin first
  try {
    const articles = await fetchArticlesViaPlugin(baseUrl, appPassword);
    return { articles, usedFallback: false };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Check if plugin is not found - offer to use fallback
    if (errorMsg.startsWith('PLUGIN_NOT_FOUND:')) {
      // Check if we have real Application Password credentials for fallback
      // If username is __CFRDM_PLUGIN__, we're using plugin auth and need to either install the plugin
      // or reconfigure the project with real WordPress credentials
      throw new Error(JSON.stringify({
        code: 'PLUGIN_NOT_FOUND',
        message: 'O plugin ContentFactory não está instalado ou ativo neste site WordPress.',
        canUseFallback: false,
        instructions: 'Instale o plugin ContentFactory no WordPress ou reconfigure o projeto com credenciais de Application Password (vá em Projetos → Editar → Conexão Standard).',
      }));
    }
    
    // For other errors, just throw them
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "User not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, project_id, articles, site_url, keyword, content, max_links = 10, full_sync, use_fallback } = body;
    const fullSync = !!full_sync;
    const useFallback = !!use_fallback;

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, wordpress_url, wordpress_username, wordpress_app_password")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: "Project not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const effectiveSiteUrl = stripTrailingSlashes(site_url || project.wordpress_url || "");

    switch (action) {
      case "sync": {
        // Sync articles from WordPress
        let inputArticles: ArticleData[] = [];
        let usedFallbackMode = false;
        let fallbackReason: string | undefined;

        if (Array.isArray(articles)) {
          inputArticles = articles as ArticleData[];
        } else {
          // No articles provided: fetch directly from WordPress (backend-side, avoids browser CORS)
          const wpUrl = project.wordpress_url || "";
          if (!wpUrl) {
            return new Response(
              JSON.stringify({ error: "wordpress_url não configurada no projeto" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const fetchResult = await fetchWordPressArticlesForIndexing({
            wordpressUrl: wpUrl,
            wordpressUsername: (project as any).wordpress_username ?? null,
            wordpressAppPassword: (project as any).wordpress_app_password ?? null,
            useFallback,
          });
          
          inputArticles = fetchResult.articles;
          usedFallbackMode = fetchResult.usedFallback;
          fallbackReason = fetchResult.fallbackReason;
        }
        if (!inputArticles.length) {
          return new Response(
            JSON.stringify({ success: true, results: { synced: 0, analyzed: 0, errors: 0, skipped: 0 }, message: "Nenhum artigo encontrado para indexação" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const results = {
          total: inputArticles.length,
          synced: 0,
          analyzed: 0,
          analyzedWithAI: 0,
          analyzedBasic: 0,
          errors: 0,
          skipped: 0,
        };
        
        // Track if AI credits are exhausted
        let aiCreditsExhausted = false;
        let consecutiveAIErrors = 0;
        const MAX_AI_ERRORS = 3;

        console.log(`Starting sync for ${inputArticles.length} articles...`);

        for (const article of inputArticles as ArticleData[]) {
          try {
            const contentHash = generateContentHash(article.content);
            const links = countLinks(article.content, effectiveSiteUrl);

            // Check if article exists and has changed
            const { data: existing } = await supabase
              .from("wordpress_article_index")
              .select("id, content_hash")
              .eq("project_id", project_id)
              .eq("wp_post_id", article.wp_post_id)
              .single();

            if (!fullSync && existing && existing.content_hash === contentHash) {
              results.skipped++;
              continue;
            }

            // Analyze with AI (with automatic fallback when credits exhausted)
            // Use AI only if credits not exhausted and not too many consecutive errors
            const shouldTryAI = !aiCreditsExhausted && consecutiveAIErrors < MAX_AI_ERRORS;
            
            const analysisResult = await analyzeArticle(article, shouldTryAI);
            const analysis = analysisResult.result;
            
            // Update AI status based on result
            if (analysisResult.creditsExhausted) {
              aiCreditsExhausted = true;
              console.log("AI credits exhausted, all remaining articles will use basic analysis");
            }
            
            if (analysisResult.usedAI) {
              consecutiveAIErrors = 0;
              results.analyzedWithAI++;
            } else {
              results.analyzedBasic++;
            }
            
            results.analyzed++;

            // Upsert article index
            const { error: upsertError } = await supabase
              .from("wordpress_article_index")
              .upsert({
                user_id: user.id,
                project_id: project_id,
                wp_post_id: article.wp_post_id,
                wp_post_url: article.wp_post_url,
                wp_post_slug: article.wp_post_slug,
                wp_post_title: article.wp_post_title,
                wp_post_type: article.wp_post_type || 'post',
                wp_post_status: article.wp_post_status || 'publish',
                wp_categories: article.wp_categories || [],
                wp_tags: article.wp_tags || [],
                primary_keyword: analysis.primary_keyword,
                secondary_keywords: analysis.secondary_keywords,
                topic_cluster: analysis.topic_cluster,
                semantic_summary: analysis.semantic_summary,
                content_hash: contentHash,
                word_count: article.word_count || article.content.split(/\s+/).length,
                internal_links_count: links.internal,
                external_links_count: links.external,
                seo_score: analysis.seo_score,
                linkability_score: analysis.linkability_score,
                last_wp_modified_at: article.last_wp_modified_at,
                last_analyzed_at: new Date().toISOString(),
                sync_status: 'synced',
              }, {
                onConflict: 'project_id,wp_post_id',
              });

            if (upsertError) {
              console.error("Upsert error:", upsertError);
              results.errors++;
            } else {
              results.synced++;
            }

            // Small delay to avoid rate limiting (shorter for basic analysis)
            await new Promise(r => setTimeout(r, useAI ? 150 : 50));
          } catch (e) {
            console.error("Article processing error:", e);
            results.errors++;
          }
        }
        
        console.log(`Sync completed: ${results.synced} synced, ${results.analyzedWithAI} with AI, ${results.analyzedBasic} basic, ${results.skipped} skipped, ${results.errors} errors`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            results,
            usedFallback: usedFallbackMode,
            fallbackReason,
            aiStatus: aiCreditsExhausted ? 'credits_exhausted' : 'ok',
            message: aiCreditsExhausted 
              ? `Sincronização concluída. ${results.analyzedWithAI} artigos analisados com IA, ${results.analyzedBasic} com análise básica (créditos de IA esgotados).`
              : `Sincronização concluída com sucesso. ${results.synced} artigos indexados.`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "generate_clusters": {
        // Generate topic clusters from indexed articles
        const { data: indexedArticles, error: fetchError } = await supabase
          .from("wordpress_article_index")
          .select("id, wp_post_title, topic_cluster, primary_keyword, secondary_keywords, linkability_score")
          .eq("project_id", project_id)
          .eq("user_id", user.id);

        if (fetchError) {
          return new Response(
            JSON.stringify({ error: "Failed to fetch articles" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Group by topic cluster
        const clusters: Record<string, any[]> = {};
        for (const article of indexedArticles || []) {
          const cluster = article.topic_cluster || "Geral";
          if (!clusters[cluster]) {
            clusters[cluster] = [];
          }
          clusters[cluster].push(article);
        }

        // Create/update cluster records
        const clusterResults = [];
        for (const [name, articles] of Object.entries(clusters)) {
          if (articles.length < 2) continue; // Skip clusters with only 1 article

          const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          
          // Find best pillar article (highest linkability score)
          const pillarArticle = articles.reduce((best, curr) => 
            (curr.linkability_score || 0) > (best.linkability_score || 0) ? curr : best
          );

          // Collect all keywords
          const allKeywords = articles.flatMap(a => [a.primary_keyword, ...(a.secondary_keywords || [])]).filter(Boolean);
          const keywordCounts: Record<string, number> = {};
          for (const kw of allKeywords) {
            keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
          }
          const sortedKeywords = Object.entries(keywordCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([kw]) => kw);

          const { error: clusterError } = await supabase
            .from("topic_clusters")
            .upsert({
              user_id: user.id,
              project_id: project_id,
              name,
              slug,
              pillar_article_id: pillarArticle.id,
              primary_keywords: sortedKeywords.slice(0, 5),
              related_keywords: sortedKeywords.slice(5, 15),
              article_count: articles.length,
              average_seo_score: Math.round(articles.reduce((sum, a) => sum + (a.seo_score || 0), 0) / articles.length),
              cluster_strength: Math.min(100, articles.length * 10 + Math.round(articles.reduce((sum, a) => sum + (a.linkability_score || 0), 0) / articles.length / 2)),
              is_auto_generated: true,
            }, {
              onConflict: 'project_id,slug',
            });

          if (!clusterError) {
            clusterResults.push({ name, article_count: articles.length, slug });
          }
        }

        return new Response(
          JSON.stringify({ success: true, clusters: clusterResults }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_link_suggestions": {
        // Get smart link suggestions for new content
        // keyword, content, max_links already extracted from body at the top

        // Fetch indexed articles
        const { data: indexedArticles, error: fetchError } = await supabase
          .from("wordpress_article_index")
          .select("*")
          .eq("project_id", project_id)
          .eq("user_id", user.id)
          .eq("sync_status", "synced")
          .order("linkability_score", { ascending: false });

        if (fetchError) {
          return new Response(
            JSON.stringify({ error: "Failed to fetch articles" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Also fetch keyword rules
        const { data: keywordRules } = await supabase
          .from("keyword_link_rules")
          .select("*")
          .eq("project_id", project_id)
          .eq("user_id", user.id)
          .eq("is_active", true);

        // Use AI to find best matches
        const articlesContext = (indexedArticles || []).slice(0, 50).map(a => ({
          id: a.id,
          title: a.wp_post_title,
          url: a.wp_post_url,
          keywords: [a.primary_keyword, ...(a.secondary_keywords || [])],
          cluster: a.topic_cluster,
          summary: a.semantic_summary,
          score: a.linkability_score,
        }));

        const suggestionsPrompt = `Você é um especialista em SEO e linkagem interna. Analise o conteúdo abaixo e sugira os melhores links internos.

PALAVRA-CHAVE DO NOVO ARTIGO: ${keyword}

CONTEÚDO DO NOVO ARTIGO (primeiros 2000 caracteres):
${content?.substring(0, 2000) || 'Conteúdo ainda será gerado'}

ARTIGOS DISPONÍVEIS PARA LINKAGEM:
${JSON.stringify(articlesContext, null, 2)}

${keywordRules?.length ? `REGRAS DE LINKAGEM OBRIGATÓRIAS:\n${JSON.stringify(keywordRules, null, 2)}` : ''}

Retorne APENAS um JSON válido com array de sugestões:
{
  "suggestions": [
    {
      "article_id": "uuid do artigo",
      "url": "url do artigo",
      "anchor_text": "texto âncora sugerido",
      "relevance_score": 85,
      "position": "introduction|body|conclusion",
      "reason": "breve explicação do porquê este link é relevante"
    }
  ]
}

REGRAS:
- Máximo de ${max_links} sugestões
- Priorize artigos com alta relevância semântica
- Varie os textos âncora (não repita)
- Distribua links entre introdução, corpo e conclusão
- Se houver regras de linkagem, inclua-as obrigatoriamente`;

        const aiResponse = await fetch(AI_GATEWAY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "Você é um especialista em SEO. Responda APENAS com JSON válido." },
              { role: "user", content: suggestionsPrompt }
            ],
            max_tokens: 2000,
            temperature: 0.3,
          }),
        });

        let suggestions = [];
        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const aiContent = aiData.choices?.[0]?.message?.content || "";
          try {
            const jsonStr = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(jsonStr);
            suggestions = parsed.suggestions || [];
          } catch (e) {
            console.error("Failed to parse AI suggestions:", aiContent);
          }
        }

        // Add keyword rule matches
        if (keywordRules && content) {
          for (const rule of keywordRules) {
            const regex = rule.case_sensitive 
              ? new RegExp(`\\b${rule.keyword}\\b`, 'g')
              : new RegExp(`\\b${rule.keyword}\\b`, 'gi');
            
            if (regex.test(content)) {
              suggestions.push({
                article_id: null,
                url: rule.target_url,
                anchor_text: rule.keyword,
                relevance_score: 100,
                position: 'body',
                reason: 'Regra de linkagem automática',
                is_rule: true,
              });
            }
          }
        }

        return new Response(
          JSON.stringify({ success: true, suggestions: suggestions.slice(0, max_links) }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_articles_for_linking": {
        // Simple endpoint to get all indexed articles for a project
        const { data: articles, error } = await supabase
          .from("wordpress_article_index")
          .select("id, wp_post_id, wp_post_url, wp_post_title, primary_keyword, secondary_keywords, topic_cluster, linkability_score, semantic_summary")
          .eq("project_id", project_id)
          .eq("user_id", user.id)
          .eq("sync_status", "synced")
          .order("linkability_score", { ascending: false });

        if (error) {
          return new Response(
            JSON.stringify({ error: "Failed to fetch articles" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, articles }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "generate_backlink_suggestions": {
        // Auto-generate backlink suggestions between all indexed articles
        const { data: indexedArticles, error: fetchError } = await supabase
          .from("wordpress_article_index")
          .select("*")
          .eq("project_id", project_id)
          .eq("user_id", user.id)
          .eq("sync_status", "synced")
          .order("linkability_score", { ascending: false });

        if (fetchError) {
          return new Response(
            JSON.stringify({ error: "Failed to fetch articles" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!indexedArticles || indexedArticles.length < 2) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              suggestions_created: 0, 
              message: "Precisa de pelo menos 2 artigos indexados para gerar sugestões" 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Group by topic cluster for better matching
        const clusterGroups: Record<string, typeof indexedArticles> = {};
        for (const article of indexedArticles) {
          const cluster = article.topic_cluster || "geral";
          if (!clusterGroups[cluster]) clusterGroups[cluster] = [];
          clusterGroups[cluster].push(article);
        }

        // Use AI to analyze and suggest links
        const articlesForAI = indexedArticles.slice(0, 50).map(a => ({
          id: a.id,
          wp_post_id: a.wp_post_id,
          title: a.wp_post_title,
          url: a.wp_post_url,
          keywords: [a.primary_keyword, ...(a.secondary_keywords || [])].filter(Boolean),
          cluster: a.topic_cluster,
          summary: a.semantic_summary,
          linkability: a.linkability_score,
          internal_links: a.internal_links_count,
        }));

        const analysisPrompt = `Você é um especialista em SEO e estratégia de linkagem interna. Analise os artigos abaixo e sugira links internos entre eles para melhorar o SEO.

ARTIGOS DISPONÍVEIS:
${JSON.stringify(articlesForAI, null, 2)}

Para cada artigo que precisa de mais links (internal_links < 5), sugira até 3 artigos de destino relevantes.

Retorne APENAS um JSON válido:
{
  "suggestions": [
    {
      "source_article_id": "uuid do artigo fonte",
      "source_wp_post_id": 123,
      "target_article_id": "uuid do artigo destino",
      "target_wp_post_id": 456,
      "target_url": "url do artigo destino",
      "anchor_text": "texto âncora sugerido (natural e variado)",
      "relevance_score": 85,
      "position_suggestion": "introduction|body|conclusion",
      "anchor_context": "breve contexto de onde inserir o link (1-2 frases)"
    }
  ]
}

REGRAS IMPORTANTES:
1. Priorize artigos com poucos links internos (internal_links < 3)
2. Prefira links dentro do mesmo cluster temático
3. Artigos com alto linkability_score são melhores destinos
4. Varie os textos âncora - não use sempre o título
5. Máximo de 30 sugestões no total
6. Não sugira links de um artigo para ele mesmo
7. Distribua as posições (introduction, body, conclusion)`;

        const aiResponse = await fetch(AI_GATEWAY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "Você é um especialista em SEO. Responda APENAS com JSON válido." },
              { role: "user", content: analysisPrompt }
            ],
            max_tokens: 4000,
            temperature: 0.3,
          }),
        });

        let suggestions: any[] = [];
        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const aiContent = aiData.choices?.[0]?.message?.content || "";
          try {
            const jsonStr = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(jsonStr);
            suggestions = parsed.suggestions || [];
          } catch (e) {
            console.error("Failed to parse AI suggestions:", aiContent);
          }
        }

        // Insert suggestions into database
        let suggestionsCreated = 0;
        for (const suggestion of suggestions) {
          try {
            // Check if suggestion already exists
            const { data: existing } = await supabase
              .from("internal_link_suggestions")
              .select("id")
              .eq("project_id", project_id)
              .eq("source_wp_post_id", suggestion.source_wp_post_id)
              .eq("target_wp_post_id", suggestion.target_wp_post_id)
              .maybeSingle();

            if (existing) continue; // Skip duplicates

            const { error: insertError } = await supabase
              .from("internal_link_suggestions")
              .insert({
                user_id: user.id,
                project_id: project_id,
                source_article_id: suggestion.source_article_id,
                source_wp_post_id: suggestion.source_wp_post_id,
                target_article_id: suggestion.target_article_id,
                target_wp_post_id: suggestion.target_wp_post_id,
                target_url: suggestion.target_url,
                anchor_text: suggestion.anchor_text,
                relevance_score: suggestion.relevance_score || 75,
                position_suggestion: suggestion.position_suggestion || 'body',
                anchor_context: suggestion.anchor_context,
                status: 'pending',
              });

            if (!insertError) {
              suggestionsCreated++;
            }
          } catch (e) {
            console.error("Error inserting suggestion:", e);
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            suggestions_created: suggestionsCreated,
            total_analyzed: indexedArticles.length,
            clusters_found: Object.keys(clusterGroups).length,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
