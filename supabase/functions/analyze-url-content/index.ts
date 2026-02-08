import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AnalyzeRequest {
  url: string;
  projectNiche?: string;
  projectName?: string;
}

interface AnalysisResult {
  title: string;
  content: string;
  source: string;
  suggestedNiche: string;
  suggestedAngle: string;
  suggestedKeyword: string;
  summary: string;
  mainTopics: string[];
  targetAudience: string;
  publishingStrategy: string;
}

async function fetchUrlContent(url: string): Promise<{ html: string; title: string }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ContentAnalyzer/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Não foi possível acessar a URL: ${response.status}`);
  }

  const html = await response.text();
  
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  return { html, title };
}

function extractMainContent(html: string): string {
  // Remove scripts, styles, nav, header, footer, aside
  let content = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Try to extract article content first
  const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    content = articleMatch[1];
  } else {
    // Try main content
    const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      content = mainMatch[1];
    } else {
      // Try common content divs
      const contentMatch = content.match(/<div[^>]*(?:class|id)="[^"]*(?:content|post|entry|article)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (contentMatch) {
        content = contentMatch[1];
      }
    }
  }

  // Remove remaining HTML tags and clean up
  content = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return content.substring(0, 8000); // Limit content size
}

function extractSourceName(url: string): string {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname.replace('www.', '');
    
    // Map known domains to names
    const domainNames: Record<string, string> = {
      'g1.globo.com': 'G1',
      'uol.com.br': 'UOL',
      'folha.uol.com.br': 'Folha de São Paulo',
      'estadao.com.br': 'Estadão',
      'oglobo.globo.com': 'O Globo',
      'exame.com': 'Exame',
      'conjur.com.br': 'Conjur',
      'infomoney.com.br': 'InfoMoney',
      'valor.globo.com': 'Valor Econômico',
      'tecmundo.com.br': 'TecMundo',
      'tecnoblog.net': 'Tecnoblog',
    };

    return domainNames[hostname] || hostname.charAt(0).toUpperCase() + hostname.slice(1).replace(/\.[^.]+$/, '');
  } catch {
    return 'Fonte desconhecida';
  }
}

async function analyzeWithAI(
  content: string,
  title: string,
  source: string,
  projectNiche: string | undefined,
  projectName: string | undefined,
  apiKey: string
): Promise<AnalysisResult> {
  const nicheContext = projectNiche 
    ? `O projeto WordPress de destino é do nicho "${projectNiche}"${projectName ? ` (${projectName})` : ''}.` 
    : '';

  const prompt = `Você é um especialista em análise de conteúdo jornalístico e SEO.
Analise a seguinte notícia e forneça recomendações para repostagem.

${nicheContext}

TÍTULO ORIGINAL: ${title}
FONTE: ${source}

CONTEÚDO:
${content.substring(0, 5000)}

---

Analise o conteúdo e retorne um JSON com:

{
  "title": "título original extraído",
  "content": "texto completo extraído e limpo da notícia (máximo 3000 caracteres)",
  "source": "${source}",
  "suggestedNiche": "advocacia|saude|beleza|tecnologia|marketing|geral - baseado no conteúdo${projectNiche ? ` e alinhamento com ${projectNiche}` : ''}",
  "suggestedAngle": "Sugestão de ângulo de análise específico para repostagem (ex: 'Impacto para consumidores brasileiros', 'Análise das implicações jurídicas')",
  "suggestedKeyword": "palavra-chave principal sugerida para SEO",
  "summary": "Resumo executivo em 2-3 frases do que a notícia trata",
  "mainTopics": ["tópico1", "tópico2", "tópico3"],
  "targetAudience": "Descrição do público-alvo ideal para este conteúdo",
  "publishingStrategy": "Recomendação de como e quando publicar este conteúdo repostado"
}

IMPORTANTE: 
- Retorne APENAS o JSON válido, sem markdown ou explicações
- O suggestedAngle deve ser específico e único, não genérico
- Considere o nicho do projeto WordPress se informado`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4000,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Gemini error:", error);
    throw new Error(`Erro na API de IA: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Resposta vazia da IA");
  }

  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("Falha ao processar resposta da IA");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: AnalyzeRequest = await req.json();
    const { url, projectNiche, projectName } = body;

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's API key
    const { data: settings } = await supabase
      .from("user_settings")
      .select("gemini_api_key, openai_api_key")
      .eq("user_id", user.id)
      .single();

    const geminiKey = settings?.gemini_api_key || Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
      return new Response(
        JSON.stringify({ error: "Chave de API de IA não configurada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch and extract content from URL
    console.log("Fetching URL:", url);
    const { html, title } = await fetchUrlContent(url);
    const content = extractMainContent(html);
    const source = extractSourceName(url);

    if (!content || content.length < 100) {
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair conteúdo suficiente da URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analyze with AI
    console.log("Analyzing content with AI...");
    const analysis = await analyzeWithAI(
      content,
      title,
      source,
      projectNiche,
      projectName,
      geminiKey
    );

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        url,
        extractedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error analyzing URL:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
