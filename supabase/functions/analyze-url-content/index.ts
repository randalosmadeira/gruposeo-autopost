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
  originalTitle: string;
  preservedTitle: string;
  content: string;
  source: string;
  suggestedNiche: string;
  suggestedAngle: string;
  originalKeyword: string;
  suggestedKeyword: string;
  secondaryKeywords: string[];
  summary: string;
  mainTopics: string[];
  targetAudience: string;
  publishingStrategy: string;
  seoPreservation: {
    titleMatchPercent: number;
    keywordMatchPercent: number;
    indexTerms: string[];
  };
}

async function fetchUrlContent(url: string): Promise<{ html: string; title: string }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
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
      'migalhas.com.br': 'Migalhas',
    };

    return domainNames[hostname] || hostname.charAt(0).toUpperCase() + hostname.slice(1).replace(/\.[^.]+$/, '');
  } catch {
    return 'Fonte desconhecida';
  }
}

async function analyzeWithGemini(
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

  const prompt = `Você é um especialista em análise de conteúdo jornalístico, SEO avançado e preservação de indexabilidade.
Sua tarefa é analisar uma notícia e fornecer recomendações que PRESERVEM 95% do potencial de indexação do título e palavras-chave originais.

## REGRAS CRÍTICAS DE PRESERVAÇÃO SEO:

### 1. TÍTULO - Preservação de 95%
- Extraia o título EXATO da notícia original
- Crie um "preservedTitle" que MANTENHA as mesmas palavras-chave principais na MESMA ordem
- Apenas pequenas variações são permitidas (artigos, preposições, pontuação)
- O título deve ranquear para as MESMAS buscas no Google, Bing, ChatGPT, Claude e Gemini

### 2. PALAVRA-CHAVE - Correspondência Exata
- Identifique a keyword principal EXATA usada pelo autor original (geralmente no título e primeiro parágrafo)
- Mantenha a mesma estrutura de frase-chave (ex: "advogado trabalhista SP" não deve virar "advocacia trabalhista")
- Preserve termos técnicos, nomes próprios e expressões de busca exatas

### 3. TERMOS DE INDEXAÇÃO
- Liste TODOS os termos que fazem este conteúdo indexável nas buscas
- Inclua: nomes de pessoas, empresas, lugares, datas, números, termos técnicos
- Estes termos devem aparecer no conteúdo reescrito para manter indexabilidade

${nicheContext}

TÍTULO ORIGINAL: ${title}
FONTE: ${source}

CONTEÚDO:
${content.substring(0, 6000)}

---

Retorne um JSON com esta estrutura:

{
  "title": "título original EXATO extraído da notícia",
  "originalTitle": "título original completo sem modificação",
  "preservedTitle": "título reescrito mantendo 95% das palavras-chave na mesma ordem (máx 60 chars)",
  "content": "texto completo extraído e limpo (máximo 4000 caracteres)",
  "source": "${source}",
  "suggestedNiche": "advocacia|saude|beleza|tecnologia|marketing|geral",
  "suggestedAngle": "ângulo de análise específico para agregar valor original",
  "originalKeyword": "palavra-chave EXATA identificada no conteúdo original",
  "suggestedKeyword": "mesma keyword ou variação mínima (95% similar)",
  "secondaryKeywords": ["keyword2", "keyword3", "keyword4"],
  "summary": "resumo em 2-3 frases",
  "mainTopics": ["tópico1", "tópico2", "tópico3"],
  "targetAudience": "público-alvo ideal",
  "publishingStrategy": "estratégia de publicação",
  "seoPreservation": {
    "titleMatchPercent": 95,
    "keywordMatchPercent": 95,
    "indexTerms": ["termo1", "termo2", "termo3", "nome próprio", "data", "número"]
  }
}

IMPORTANTE:
- O "preservedTitle" deve ranquear para as MESMAS buscas que o original
- A "suggestedKeyword" deve ter 95%+ de correspondência com a "originalKeyword"
- Os "indexTerms" são cruciais para manter visibilidade em motores de busca e IAs
- Retorne APENAS JSON válido, sem markdown`;


  // Use Gemini 2.0 Flash model
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
    const errorText = await response.text();
    console.error("Gemini API error:", response.status, errorText);
    throw new Error(`Erro na API Gemini: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Check for API errors in response
  if (data.error) {
    console.error("Gemini response error:", data.error);
    throw new Error(`Erro Gemini: ${data.error.message || JSON.stringify(data.error)}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error("Empty Gemini response:", JSON.stringify(data));
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
    console.error("Failed to parse Gemini response:", text);
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

    // Get Gemini API key from environment (set via Supabase secrets)
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiKey) {
      console.error("GEMINI_API_KEY not found in environment");
      return new Response(
        JSON.stringify({ error: "Chave de API Gemini não configurada no servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch and extract content from URL
    console.log("Fetching URL:", url);
    const { html, title } = await fetchUrlContent(url);
    const content = extractMainContent(html);
    const source = extractSourceName(url);

    console.log("Extracted content length:", content.length, "chars");

    if (!content || content.length < 100) {
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair conteúdo suficiente da URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analyze with Gemini
    console.log("Analyzing content with Gemini API...");
    const analysis = await analyzeWithGemini(
      content,
      title,
      source,
      projectNiche,
      projectName,
      geminiKey
    );

    console.log("Analysis completed successfully");

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
