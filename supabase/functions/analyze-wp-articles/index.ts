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

// Analyze article content with AI
async function analyzeArticle(article: ArticleData): Promise<AnalysisResult> {
  const prompt = `Analise o seguinte artigo e extraia informações para otimização de SEO e linkagem interna.

TÍTULO: ${article.wp_post_title}
CATEGORIAS: ${article.wp_categories?.join(', ') || 'Não especificadas'}
TAGS: ${article.wp_tags?.join(', ') || 'Não especificadas'}

CONTEÚDO (primeiros 3000 caracteres):
${article.content.substring(0, 3000)}

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

  const response = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Você é um especialista em SEO e análise de conteúdo. Responda APENAS com JSON válido." },
        { role: "user", content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("AI Gateway error:", error);
    throw new Error(`AI analysis failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  // Parse JSON from response
  try {
    // Remove markdown code blocks if present
    let jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse AI response:", content);
    // Return default values
    return {
      primary_keyword: article.wp_post_title.substring(0, 50),
      secondary_keywords: [],
      topic_cluster: "Geral",
      semantic_summary: article.wp_post_title,
      linkability_score: 50,
      seo_score: 50,
      suggested_anchor_texts: [article.wp_post_title],
    };
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
    const { action, project_id, articles, site_url, keyword, content, max_links = 10 } = body;

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, wordpress_url")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: "Project not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const effectiveSiteUrl = site_url || project.wordpress_url || "";

    switch (action) {
      case "sync": {
        // Sync articles from WordPress
        if (!articles || !Array.isArray(articles)) {
          return new Response(
            JSON.stringify({ error: "Articles array required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const results = {
          synced: 0,
          analyzed: 0,
          errors: 0,
          skipped: 0,
        };

        for (const article of articles as ArticleData[]) {
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

            if (existing && existing.content_hash === contentHash) {
              results.skipped++;
              continue;
            }

            // Analyze with AI
            const analysis = await analyzeArticle(article);
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

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 200));
          } catch (e) {
            console.error("Article processing error:", e);
            results.errors++;
          }
        }

        return new Response(
          JSON.stringify({ success: true, results }),
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
