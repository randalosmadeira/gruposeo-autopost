import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VariationsRequest {
  articleId?: string;
  title: string;
  content: string;
  excerpt?: string;
  niche?: string;
  platforms: Array<'linkedin' | 'instagram' | 'twitter' | 'newsletter' | 'whatsapp'>;
}

interface ContentVariation {
  platform: string;
  content: string;
  characterCount: number;
  hashtags?: string[];
  callToAction?: string;
}

const platformConfigs = {
  linkedin: {
    name: 'LinkedIn',
    maxLength: 3000,
    style: 'profissional, insightful, com emojis moderados',
    format: 'post com parágrafos curtos, bullets opcionais, sem hashtags excessivas',
    cta: 'engajamento profissional (comentários, compartilhamentos)',
  },
  instagram: {
    name: 'Instagram',
    maxLength: 2200,
    style: 'visual, inspiracional, com emojis',
    format: 'parágrafos curtos, espaçamento visual, 20-30 hashtags no final',
    cta: 'salvar, compartilhar, seguir',
  },
  twitter: {
    name: 'Twitter/X',
    maxLength: 280,
    style: 'direto, impactante, provocativo',
    format: 'thread de 3-5 tweets numerados',
    cta: 'retweet, responder, seguir',
  },
  newsletter: {
    name: 'Newsletter',
    maxLength: 5000,
    style: 'pessoal, educativo, storytelling',
    format: 'assunto atraente + corpo com seções, bullets e CTA claro',
    cta: 'responder email, clicar em link, encaminhar',
  },
  whatsapp: {
    name: 'WhatsApp',
    maxLength: 1000,
    style: 'conversacional, direto, com emojis',
    format: 'mensagem curta e objetiva, formatação simples',
    cta: 'responder, compartilhar, clicar em link',
  },
};

async function generateWithGemini(
  apiKey: string,
  title: string,
  content: string,
  excerpt: string,
  niche: string,
  platforms: string[]
): Promise<ContentVariation[]> {
  const platformPrompts = platforms.map(p => {
    const config = platformConfigs[p as keyof typeof platformConfigs];
    return `
## ${config.name}
- Máximo: ${config.maxLength} caracteres
- Tom: ${config.style}
- Formato: ${config.format}
- CTA esperado: ${config.cta}
`;
  }).join('\n');

  const prompt = `Você é um especialista em social media e copywriting. 
Transforme o artigo abaixo em versões otimizadas para cada plataforma.

ARTIGO ORIGINAL:
Título: ${title}
Resumo: ${excerpt || 'Não fornecido'}
Nicho: ${niche || 'geral'}

Conteúdo:
${content.substring(0, 3000)}

---

PLATAFORMAS E REQUISITOS:
${platformPrompts}

---

INSTRUÇÕES:
1. Mantenha a essência e mensagem principal
2. Adapte linguagem e formato para cada plataforma
3. Use emojis apropriados ao contexto
4. Inclua hashtags relevantes onde aplicável
5. Adicione CTAs naturais

RESPONDA EM JSON VÁLIDO com este formato exato:
{
  "variations": [
    {
      "platform": "nome_da_plataforma",
      "content": "conteúdo adaptado",
      "characterCount": 123,
      "hashtags": ["hashtag1", "hashtag2"],
      "callToAction": "texto do CTA"
    }
  ]
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8000,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Gemini error:", error);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No response from Gemini");
  }

  try {
    const parsed = JSON.parse(text);
    return parsed.variations || [];
  } catch {
    // Try to extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.variations || [];
    }
    throw new Error("Failed to parse Gemini response");
  }
}

async function generateWithOpenAI(
  apiKey: string,
  title: string,
  content: string,
  excerpt: string,
  niche: string,
  platforms: string[]
): Promise<ContentVariation[]> {
  const platformPrompts = platforms.map(p => {
    const config = platformConfigs[p as keyof typeof platformConfigs];
    return `${config.name}: max ${config.maxLength} chars, tom ${config.style}, formato ${config.format}`;
  }).join('\n');

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é um especialista em social media e copywriting brasileiro. 
Transforme artigos em versões otimizadas para diferentes plataformas.
Responda APENAS em JSON válido.`,
        },
        {
          role: "user",
          content: `Transforme este artigo:

Título: ${title}
Resumo: ${excerpt || 'Não fornecido'}
Nicho: ${niche || 'geral'}
Conteúdo: ${content.substring(0, 3000)}

Plataformas:
${platformPrompts}

Responda em JSON:
{
  "variations": [
    {
      "platform": "nome",
      "content": "conteúdo adaptado com emojis e formatação",
      "characterCount": 123,
      "hashtags": ["tag1"],
      "callToAction": "CTA"
    }
  ]
}`,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("OpenAI error:", error);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("No response from OpenAI");
  }

  const parsed = JSON.parse(text);
  return parsed.variations || [];
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
        JSON.stringify({ error: "Unauthorized" }),
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
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: VariationsRequest = await req.json();
    const { articleId, title, content, excerpt, niche, platforms } = body;

    if (!title || !content || !platforms?.length) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: title, content, platforms" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's API keys
    const { data: settings } = await supabase
      .from("user_settings")
      .select("gemini_api_key, openai_api_key")
      .eq("user_id", user.id)
      .single();

    const geminiKey = settings?.gemini_api_key || Deno.env.get("GEMINI_API_KEY");
    const openaiKey = settings?.openai_api_key || Deno.env.get("OPENAI_API_KEY");

    if (!geminiKey && !openaiKey) {
      return new Response(
        JSON.stringify({ error: "No AI API key configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let variations: ContentVariation[] = [];

    // Try Gemini first, fallback to OpenAI
    try {
      if (geminiKey) {
        variations = await generateWithGemini(
          geminiKey,
          title,
          content,
          excerpt || '',
          niche || 'geral',
          platforms
        );
      } else {
        throw new Error("No Gemini key, trying OpenAI");
      }
    } catch (geminiError) {
      console.log("Gemini failed, trying OpenAI:", geminiError);
      if (openaiKey) {
        variations = await generateWithOpenAI(
          openaiKey,
          title,
          content,
          excerpt || '',
          niche || 'geral',
          platforms
        );
      } else {
        throw geminiError;
      }
    }

    // Ensure character counts are accurate
    variations = variations.map(v => ({
      ...v,
      characterCount: v.content?.length || 0,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        variations,
        articleId,
        generatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating variations:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
