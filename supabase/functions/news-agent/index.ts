
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { callGemini } from "../_shared/gemini.ts";

const FUNCTION_NAME = "news-agent";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NewsSearchResult {
  title: string;
  link: string;
  snippet: string;
  source: string;
  date?: string;
}

async function fetchRSSFeeds(feedUrls: string[], limit: number = 10): Promise<NewsSearchResult[]> {
  if (!feedUrls || feedUrls.length === 0) return [];
  
  const items: NewsSearchResult[] = [];
  
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
            snippet: descMatch ? (descMatch[1] || descMatch[2] || '').replace(/<[^>]+>/g, '').trim() : '',
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

async function searchNews(topic: string, language: string, country: string): Promise<NewsSearchResult[]> {
  const query = encodeURIComponent(topic);
  const googleNewsUrl = `https://news.google.com/rss/search?q=${query}&hl=${language}&gl=${country}&ceid=${country}:${language.split('-')[0]}`;
  
  try {
    const response = await fetch(googleNewsUrl);
    const xmlText = await response.text();
    
    const items: NewsSearchResult[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xmlText)) !== null && items.length < 10) {
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

async function generateArticle(
  newsItem: NewsSearchResult,
  topic: string,
  language: string,
  promptTemplate: string
): Promise<string | null> {
  const systemPrompt = `Você é um jornalista profissional especializado em ${topic}. 
Escreva artigos informativos, bem estruturados e otimizados para SEO.
Use linguagem ${language === 'pt-BR' ? 'português brasileiro' : language}.
Formato do artigo: ${promptTemplate === 'news_article' ? 'notícia jornalística' : 'artigo de blog'}.

🚨 REGRA INEGOCIÁVEL - LEGIBILIDADE FLESCH 60-100:
| Score | Nível | Escolaridade |
|-------|-------|-------------|
| 90-100 | Muito Fácil | 5º ano — criança de 11 anos entende |
| 70-80 | Bastante Fácil | 8º ano — maioria dos adultos |
| 60-70 | Padrão | 8º-9º ano — ideal para conteúdo web |
| < 60 | ❌ REPROVADO | Reescrever obrigatoriamente |

- Sentenças curtas: MÁXIMO 15 palavras por sentença
- Parágrafos curtos: MÁXIMO 3-4 linhas
- Vocabulário SIMPLES: palavras do dia-a-dia
- Se usar termo técnico, SEMPRE explique entre parênteses
- Escreva como se explicasse para um amigo de 14 anos`;

  const userPrompt = `Baseado nesta notícia, escreva um artigo completo e original:

Título original: ${newsItem.title}
Fonte: ${newsItem.source}
Resumo: ${newsItem.snippet}

Instruções:
1. Crie um título SEO-friendly único (máx 60 chars)
2. Escreva uma introdução envolvente
3. Desenvolva o conteúdo em 3-5 parágrafos (frases curtas, máx 15 palavras cada)
4. Inclua seção FAQ com 3 perguntas
5. Adicione uma conclusão com CTA
6. Use subtítulos H2 e H3
7. Não copie o texto original, reescreva com suas próprias palavras
8. Linguagem simples: Flesch ≥ 60 OBRIGATÓRIO

Formato de saída em HTML semântico.`;

  try {
    const content = await callGemini(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: "flash", maxTokens: 4000 }
    );

    return content || null;
  } catch (error) {
    console.error('Error generating article:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log.requestStart(req.method);

    // ========== AUTHENTICATION ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log.authFailure("missing_or_invalid_header");
      return new Response(
        JSON.stringify({ error: "Autorização necessária" }),
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
      log.authFailure(authError?.message || "user_not_found");
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    log.authSuccess(user.id);
    // ========== END AUTHENTICATION ==========

    const { action, agentId, topics, rssFeeds, language, country, promptTemplate, limit } = await req.json();

    // Action: fetch RSS feeds
    if (action === "fetch_rss") {
      if (!rssFeeds || rssFeeds.length === 0) {
        return new Response(JSON.stringify({ error: "rssFeeds array is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const items = await fetchRSSFeeds(rssFeeds, limit || 10);
      
      log.info("rss_fetch_complete", { feeds: rssFeeds.length, items: items.length });
      log.requestEnd(200, Date.now() - startTime);
      return new Response(JSON.stringify({ news: items }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "search") {
      const allNews: NewsSearchResult[] = [];
      
      // If RSS feeds provided, fetch from them first
      if (rssFeeds && rssFeeds.length > 0) {
        const rssItems = await fetchRSSFeeds(rssFeeds, limit || 10);
        allNews.push(...rssItems);
      }
      
      // Then search by topics
      for (const topic of (topics || [])) {
        const news = await searchNews(topic, language || "pt-BR", country || "BR");
        allNews.push(...news);
      }
      
      const uniqueNews = allNews.filter((item, index, self) =>
        index === self.findIndex(t => t.title === item.title)
      ).slice(0, limit || 10);

      log.info("search_complete", { topics_count: topics?.length || 0, rss_feeds: rssFeeds?.length || 0, results: uniqueNews.length });
      log.requestEnd(200, Date.now() - startTime);
      return new Response(JSON.stringify({ news: uniqueNews }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate") {
      const { newsItem, topic } = await req.json();
      
      const article = await generateArticle(
        newsItem,
        topic,
        language || "pt-BR",
        promptTemplate || "news_article"
      );

      if (!article) {
        log.error("generation_failed", { topic });
        throw new Error("Failed to generate article");
      }

      log.info("article_generated", { topic });
      log.requestEnd(200, Date.now() - startTime);
      return new Response(JSON.stringify({ article }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "run") {
      const results: { title: string; content: string; source: string }[] = [];
      
      for (const topic of topics.slice(0, 3)) {
        const news = await searchNews(topic, language || "pt-BR", country || "BR");
        
        if (news.length > 0) {
          const selectedNews = news[0];
          
          const article = await generateArticle(
            selectedNews,
            topic,
            language || "pt-BR",
            promptTemplate || "news_article"
          );

          if (article) {
            results.push({
              title: selectedNews.title,
              content: article,
              source: selectedNews.link,
            });
          }
        }
        
        if (results.length >= (limit || 1)) break;
      }

      log.info("run_complete", { generated: results.length });
      log.requestEnd(200, Date.now() - startTime);
      return new Response(JSON.stringify({ 
        success: true, 
        generated: results.length,
        articles: results 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log.warn("invalid_action", { action });
    log.requestEnd(400, Date.now() - startTime);
    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    log.error("news_agent_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    if (errorMessage.includes("Rate limit")) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
