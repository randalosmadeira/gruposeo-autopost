
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { getOrchestrator } from "../_shared/ai-orchestrator.ts";

const FUNCTION_NAME = "execute-news-agents";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Day name mapping for Brazilian Portuguese
const DAY_NAMES: Record<number, string> = {
  0: "dom",
  1: "seg",
  2: "ter",
  3: "qua",
  4: "qui",
  5: "sex",
  6: "sab",
};

interface NewsAgent {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  topics: string[];
  rss_feeds: string[] | null;
  language: string;
  country: string;
  prompt_template: string;
  auto_publish: boolean;
  publish_status: string;
  news_per_day: number;
  active_days: string[] | null;
  execution_times: string[] | null;
  cite_sources_inline: boolean;
  cite_sources_footer: boolean;
  image_generation: string;
  articles_generated: number;
}

interface NewsItem {
  title: string;
  link: string;
  snippet: string;
  source: string;
  date?: string;
}

// Fetch RSS feeds
async function fetchRSSFeeds(feedUrls: string[], limit: number = 5): Promise<NewsItem[]> {
  if (!feedUrls || feedUrls.length === 0) return [];
  
  const items: NewsItem[] = [];
  
  for (const feedUrl of feedUrls) {
    try {
      const response = await fetch(feedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ContentFactoryBot/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
      });
      
      if (!response.ok) continue;
      
      const xmlText = await response.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      
      while ((match = itemRegex.exec(xmlText)) !== null && items.length < limit) {
        const itemContent = match[1];
        
        const titleMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>([^<]+)<\/title>/);
        const linkMatch = itemContent.match(/<link>([^<]+)<\/link>/);
        const descMatch = itemContent.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>([^<]+)<\/description>/);
        const sourceMatch = itemContent.match(/<source[^>]*>([^<]+)<\/source>/);
        const pubDateMatch = itemContent.match(/<pubDate>([^<]+)<\/pubDate>/);
        
        if (titleMatch && linkMatch) {
          items.push({
            title: (titleMatch[1] || titleMatch[2] || '').trim(),
            link: linkMatch[1].trim(),
            snippet: descMatch ? (descMatch[1] || descMatch[2] || '').replace(/<[^>]+>/g, '').trim().slice(0, 500) : '',
            source: sourceMatch ? sourceMatch[1] : new URL(feedUrl).hostname,
            date: pubDateMatch ? pubDateMatch[1] : undefined,
          });
        }
      }
    } catch (error) {
      console.error(`Error fetching RSS feed ${feedUrl}:`, error);
    }
  }
  
  return items.slice(0, limit);
}

// Search Google News RSS
async function searchGoogleNews(topic: string, language: string, country: string): Promise<NewsItem[]> {
  const query = encodeURIComponent(topic);
  const googleNewsUrl = `https://news.google.com/rss/search?q=${query}&hl=${language}&gl=${country}&ceid=${country}:${language.split('-')[0]}`;
  
  try {
    const response = await fetch(googleNewsUrl);
    const xmlText = await response.text();
    
    const items: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xmlText)) !== null && items.length < 5) {
      const itemContent = match[1];
      
      const titleMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
      const linkMatch = itemContent.match(/<link>(.*?)<\/link>/);
      const descMatch = itemContent.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/);
      const sourceMatch = itemContent.match(/<source.*?>(.*?)<\/source>/);
      const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
      
      if (titleMatch && linkMatch) {
        items.push({
          title: titleMatch[1] || titleMatch[2] || '',
          link: linkMatch[1] || '',
          snippet: descMatch ? (descMatch[1] || descMatch[2] || '') : '',
          source: sourceMatch ? sourceMatch[1] : 'Google News',
          date: pubDateMatch ? pubDateMatch[1] : undefined,
        });
      }
    }
    
    return items;
  } catch (error) {
    console.error('Error fetching news:', error);
    return [];
  }
}

// MAA System Prompt for journalistic rewriting (Lei 9.610/98 compliance)
const MAA_SYSTEM_PROMPT = `Você é o Assistente MAA Pro, especializado em repostagem jornalística com compliance Lei 9.610/98 (Direitos Autorais).

🚨 REGRA INEGOCIÁVEL - LEGIBILIDADE FLESCH 60-100:
| Score | Nível | Escolaridade |
|-------|-------|-------------|
| 90-100 | Muito Fácil | 5º ano — criança de 11 anos entende |
| 70-80 | Bastante Fácil | 8º ano — maioria dos adultos |
| 60-70 | Padrão | 8º-9º ano — ideal para conteúdo web |
| < 60 | ❌ REPROVADO | Reescrever obrigatoriamente |

- Sentenças curtas: MÁXIMO 15 palavras por sentença
- Parágrafos curtos: MÁXIMO 3-4 linhas
- Vocabulário SIMPLES: palavras do dia-a-dia, evite jargões
- Se usar termo técnico, SEMPRE explique entre parênteses
- Escreva como se explicasse para um amigo de 14 anos

DIRETRIZES DE COMPLIANCE:

✅ PERMITIDO:
- Reescrever 100% do conteúdo com palavras e estrutura própria
- Manter citações curtas (máx 2-3 frases) com aspas
- Creditar fonte original (nome do veículo + link)
- Adicionar análise, contexto ou opinião própria (40%+ do conteúdo)
- REUTILIZAR imagem oficial do portal/fonte original quando disponível

❌ PROIBIDO:
- Copiar/colar parágrafos inteiros
- Parafrasear apenas trocando palavras (plágio)
- Remover créditos da fonte original
- Republicar conteúdo de agências (Reuters, AFP) sem licença

TÉCNICA DE REESTRUTURAÇÃO:
1. Identificar 3-5 pontos principais da notícia original
2. Reescrever com estrutura TOTALMENTE diferente
3. Adicionar: contexto local, dados complementares, impacto prático, análise técnica
4. Inserir créditos no rodapé

SEO 2026:
- E-E-A-T (Experience, Expertise, Authority, Trust)
- Parágrafos curtos (mobile-first, máx 3-4 linhas)
- Flesch Reading Ease ≥ 60 (OBRIGATÓRIO)
- Featured Snippets optimization
- Estrutura: H1 (1x), H2 (3-5x), H3 (quando necessário)
- FAQ obrigatório (3-5 perguntas)
- SEMPRE gerar prompt de imagem para o artigo

FORMATO DE SAÍDA (JSON):
{
  "title": "Título otimizado (55-65 chars)",
  "meta_description": "Meta description (150-160 chars)",
  "slug": "url-amigavel",
  "content_html": "HTML completo do artigo reestruturado",
  "excerpt": "Resumo em 2-3 frases",
  "credits": "Fonte: [Veículo] - [URL]",
  "originality_score": 95,
  "keywords": ["keyword1", "keyword2"],
  "word_count": 1200,
  "image_prompt": "Prompt detalhado para gerar imagem destacada cinematic hyper-realistic"
}`;

async function rewriteNewsItem(
  newsItem: NewsItem,
  agent: NewsAgent,
  _apiKey: string
): Promise<{
  title: string;
  content: string;
  excerpt: string;
  slug: string;
  credits: string;
  originality_score: number;
} | null> {
  const userPrompt = `TAREFA: Repostagem jornalística com compliance Lei 9.610/98

FONTE ORIGINAL:
- Veículo: ${newsItem.source}
- URL: ${newsItem.link}
- Título: ${newsItem.title}
- Resumo: ${newsItem.snippet}

IDIOMA: ${agent.language}

${agent.cite_sources_inline ? 'IMPORTANTE: Citar fonte no texto quando relevante.' : ''}
${agent.cite_sources_footer ? 'IMPORTANTE: Incluir créditos completos no rodapé.' : ''}

INSTRUÇÕES CRÍTICAS:
1. Reescrever 100% com estrutura TOTALMENTE diferente
2. NÃO copiar parágrafos ou frases longas
3. Adicionar análise e contexto próprio (mín 40% do conteúdo)
4. Creditar fonte: "Fonte: ${newsItem.source}${newsItem.link ? ` - ${newsItem.link}` : ''}"
5. Gerar artigo com mín 600 palavras
6. Estrutura: H2 para seções principais, parágrafos curtos

Se originalidade < 90%, reescreva novamente até atingir 90%+.

Retorne o resultado em formato JSON conforme especificado.`;

  try {
    const orchestrator = getOrchestrator();
    const rawContent = await orchestrator.call('news_rewrite', [
      { role: "system", content: MAA_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ], { maxTokens: 4096, temperature: 0.7 });
    
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || newsItem.title,
        content: parsed.content_html || "",
        excerpt: parsed.excerpt || parsed.meta_description || "",
        slug: parsed.slug || "",
        credits: parsed.credits || `Fonte: ${newsItem.source}`,
        originality_score: parsed.originality_score || 0,
        image_prompt: parsed.image_prompt || null,
      };
    } catch {
      let fixed = jsonMatch[0]
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/'/g, '"');
      try {
        const parsed = JSON.parse(fixed);
        return {
          title: parsed.title || newsItem.title,
          content: parsed.content_html || "",
          excerpt: parsed.excerpt || parsed.meta_description || "",
          slug: parsed.slug || "",
          credits: parsed.credits || `Fonte: ${newsItem.source}`,
          originality_score: parsed.originality_score || 0,
          image_prompt: parsed.image_prompt || null,
        };
      } catch {
        return null;
      }
    }
  } catch (error) {
    console.error('Error rewriting news:', error);
    return null;
  }
}

// Image generation now uses generate-image edge function (no more gateway dependency)

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  log.requestStart(req.method);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const AI_API_KEY = "byok"; // Using AIOrchestrator BYOK keys

    if (!getOrchestrator().getAvailableProviders().length) {
      throw new Error("Nenhuma chave de IA configurada (GEMINI_API_KEY ou OPENAI_API_KEY)");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current day and hour
    const now = new Date();
    const currentDay = DAY_NAMES[now.getDay()];
    const currentHour = now.getHours().toString().padStart(2, '0') + ':00';

    log.info("checking_agents", { day: currentDay, hour: currentHour });

    // Fetch active agents that should run now
    const { data: agents, error: agentsError } = await supabase
      .from("news_agents")
      .select("*")
      .eq("is_active", true);

    if (agentsError) {
      throw new Error(`Failed to fetch agents: ${agentsError.message}`);
    }

    if (!agents || agents.length === 0) {
      log.info("no_active_agents");
      log.requestEnd(200, Date.now() - startTime);
      return new Response(
        JSON.stringify({ success: true, message: "No active agents", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter agents that should run today and at this hour
    const eligibleAgents = agents.filter((agent: NewsAgent) => {
      // Check if today is an active day
      const activeDays = agent.active_days || ["seg", "ter", "qua", "qui", "sex"];
      if (!activeDays.includes(currentDay)) return false;

      // Check execution times if specified
      const executionTimes = agent.execution_times || [];
      if (executionTimes.length > 0) {
        // Only run if current hour matches one of the execution times
        return executionTimes.some(time => time.startsWith(currentHour.split(':')[0]));
      }

      // If no execution times specified, run once per day (at 08:00)
      return currentHour === "08:00";
    });

    log.info("eligible_agents", { count: eligibleAgents.length, total: agents.length });

    const results: { agentId: string; agentName: string; articlesCreated: number; errors: string[] }[] = [];

    for (const agent of eligibleAgents) {
      const agentResult = {
        agentId: agent.id,
        agentName: agent.name,
        articlesCreated: 0,
        errors: [] as string[],
      };

      try {
        log.info("processing_agent", { agentId: agent.id, name: agent.name });

        // Collect news from RSS feeds and topics
        const allNews: NewsItem[] = [];

        // Fetch from RSS feeds first
        if (agent.rss_feeds && agent.rss_feeds.length > 0) {
          const rssNews = await fetchRSSFeeds(agent.rss_feeds, agent.news_per_day || 3);
          allNews.push(...rssNews);
        }

        // Search by topics if we need more news
        if (allNews.length < (agent.news_per_day || 1) && agent.topics && agent.topics.length > 0) {
          for (const topic of agent.topics.slice(0, 2)) {
            const topicNews = await searchGoogleNews(topic, agent.language || "pt-BR", agent.country || "BR");
            allNews.push(...topicNews);
            if (allNews.length >= (agent.news_per_day || 1)) break;
          }
        }

        // Deduplicate by title
        const uniqueNews = allNews.filter((item, index, self) =>
          index === self.findIndex(t => t.title === item.title)
        ).slice(0, agent.news_per_day || 1);

        log.info("news_collected", { agentId: agent.id, count: uniqueNews.length });

        // Process each news item
        for (const newsItem of uniqueNews) {
          try {
            // Rewrite the news using MAA compliance
            const rewritten = await rewriteNewsItem(newsItem, agent, AI_API_KEY);
            
            if (!rewritten || rewritten.originality_score < 80) {
              agentResult.errors.push(`Low originality for: ${newsItem.title}`);
              continue;
            }

            // ALWAYS generate image - use AI prompt from rewrite or default cinematic prompt
            let featuredImageUrl: string | null = null;
            const imagePrompt = rewritten.image_prompt 
              || `Professional, cinematic, hyper-realistic editorial photo for news article: "${rewritten.title}". Shot with Canon EOS R5, 85mm lens, natural Golden Hour lighting, 8K resolution, 16:9 aspect ratio.`;
            
            // Save article first, then generate image via edge function
            const { data: article, error: articleError } = await supabase
              .from("articles")
              .insert({
                user_id: agent.user_id,
                project_id: agent.project_id,
                keyword: newsItem.title.slice(0, 100),
                title: rewritten.title,
                content: rewritten.content,
                excerpt: rewritten.excerpt,
                slug: rewritten.slug,
                featured_image_url: null,
                image_prompt: imagePrompt,
                type: "blog",
                status: "generating",
                word_count: rewritten.content?.split(/\s+/).length || 0,
                config: {
                  type: "news_agent",
                  agent_id: agent.id,
                  source_url: newsItem.link,
                  source_name: newsItem.source,
                  originality_score: rewritten.originality_score,
                  credits: rewritten.credits,
                },
              })
              .select()
              .single();

            if (articleError) {
              agentResult.errors.push(`DB error: ${articleError.message}`);
              continue;
            }

            // Generate image via generate-image edge function
            try {
              await supabase.functions.invoke("generate-image", {
                body: { articleId: article.id, prompt: imagePrompt },
              });
              log.info("image_generated_for_agent_article", { articleId: article.id });
            } catch (imgErr) {
              log.warn("image_generation_failed", { articleId: article.id, error: imgErr instanceof Error ? imgErr.message : 'unknown' });
            }

            // Update status to ready/draft
            await supabase.from("articles").update({
              status: agent.auto_publish ? "ready" : "draft",
            }).eq("id", article.id);

            if (articleError) {
              agentResult.errors.push(`DB error: ${articleError.message}`);
              continue;
            }

            // Save to agent_news table for tracking
            await supabase.from("agent_news").insert({
              agent_id: agent.id,
              user_id: agent.user_id,
              title: rewritten.title,
              original_title: newsItem.title,
              content: rewritten.content,
              source_url: newsItem.link,
              source_name: newsItem.source,
              article_id: article.id,
              status: agent.auto_publish ? "generated" : "pending",
              generated_at: new Date().toISOString(),
            });

            agentResult.articlesCreated++;
            log.info("article_created", { agentId: agent.id, articleId: article.id });

            // Auto-publish to WordPress if enabled
            if (agent.auto_publish && agent.project_id) {
              const { data: project } = await supabase
                .from("projects")
                .select("*")
                .eq("id", agent.project_id)
                .single();

              if (project?.wordpress_url && project?.wordpress_app_password) {
                const baseUrl = project.wordpress_url.replace(/\/$/, "").replace(/\/wp-json(\/.*)?$/, "");
                const isPluginAuth = project.wordpress_username === "__CFRDM_PLUGIN__";

                try {
                  if (isPluginAuth) {
                    const publishResponse = await fetch(`${baseUrl}/wp-json/cfrdm/v1/articles`, {
                      method: "POST",
                      headers: {
                        "X-CFRDM-API-Key": project.wordpress_app_password,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        title: rewritten.title,
                        content: rewritten.content,
                        excerpt: rewritten.excerpt,
                        slug: rewritten.slug,
                        status: agent.publish_status || "draft",
                        cfrdm_id: article.id,
                      }),
                    });

                    if (publishResponse.ok) {
                      const publishData = await publishResponse.json();
                      if (publishData.success) {
                        await supabase.from("articles").update({
                          status: "published",
                          published_at: new Date().toISOString(),
                          published_url: publishData.data?.link,
                        }).eq("id", article.id);

                        await supabase.from("agent_news").update({
                          status: "published",
                          published_at: new Date().toISOString(),
                        }).eq("article_id", article.id);

                        log.info("article_published", { articleId: article.id });
                      }
                    }
                  }
                } catch (publishError) {
                  log.warn("publish_error", { error: publishError instanceof Error ? publishError.message : "unknown" });
                }
              }
            }
          } catch (itemError) {
            agentResult.errors.push(`Processing error: ${itemError instanceof Error ? itemError.message : "unknown"}`);
          }
        }

        // Update agent stats
        await supabase.from("news_agents").update({
          last_run_at: new Date().toISOString(),
          articles_generated: (agent.articles_generated || 0) + agentResult.articlesCreated,
          last_error: agentResult.errors.length > 0 ? agentResult.errors.join("; ") : null,
        }).eq("id", agent.id);

      } catch (agentError) {
        agentResult.errors.push(`Agent error: ${agentError instanceof Error ? agentError.message : "unknown"}`);
        await supabase.from("news_agents").update({
          last_error: agentError instanceof Error ? agentError.message : "Unknown error",
        }).eq("id", agent.id);
      }

      results.push(agentResult);
    }

    const totalCreated = results.reduce((sum, r) => sum + r.articlesCreated, 0);
    log.info("execution_complete", { 
      agentsProcessed: results.length, 
      totalArticlesCreated: totalCreated 
    });
    log.requestEnd(200, Date.now() - startTime);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        totalArticlesCreated: totalCreated,
        results,
        request_id: requestId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.error("execution_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        request_id: requestId,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
