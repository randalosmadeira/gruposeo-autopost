import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface NewsSearchResult {
  title: string;
  link: string;
  snippet: string;
  source: string;
  date?: string;
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
  promptTemplate: string,
  apiKey: string
): Promise<string | null> {
  const systemPrompt = `Você é um jornalista profissional especializado em ${topic}. 
Escreva artigos informativos, bem estruturados e otimizados para SEO.
Use linguagem ${language === 'pt-BR' ? 'português brasileiro' : language}.
Formato do artigo: ${promptTemplate === 'news_article' ? 'notícia jornalística' : 'artigo de blog'}.`;

  const userPrompt = `Baseado nesta notícia, escreva um artigo completo e original:

Título original: ${newsItem.title}
Fonte: ${newsItem.source}
Resumo: ${newsItem.snippet}

Instruções:
1. Crie um título SEO-friendly único
2. Escreva uma introdução envolvente
3. Desenvolva o conteúdo em 3-5 parágrafos
4. Adicione uma conclusão
5. Use subtítulos H2 e H3 quando apropriado
6. Não copie o texto original, reescreva com suas próprias palavras

Formato de saída em Markdown.`;

  try {
    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('Error generating article:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== AUTHENTICATION ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // ========== END AUTHENTICATION ==========

    const AI_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!AI_API_KEY) {
      throw new Error("AI API key is not configured");
    }

    const { action, agentId, topics, language, country, promptTemplate, limit } = await req.json();

    if (action === "search") {
      const allNews: NewsSearchResult[] = [];
      
      for (const topic of topics) {
        const news = await searchNews(topic, language || "pt-BR", country || "BR");
        allNews.push(...news);
      }
      
      const uniqueNews = allNews.filter((item, index, self) =>
        index === self.findIndex(t => t.title === item.title)
      ).slice(0, limit || 10);

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
        promptTemplate || "news_article",
        AI_API_KEY
      );

      if (!article) {
        throw new Error("Failed to generate article");
      }

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
            promptTemplate || "news_article",
            AI_API_KEY
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

      return new Response(JSON.stringify({ 
        success: true, 
        generated: results.length,
        articles: results 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("News agent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
