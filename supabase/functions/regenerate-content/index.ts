import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RegenerateRequest {
  type: "title" | "content" | "excerpt" | "image";
  keyword: string;
  currentTitle?: string;
  currentContent?: string;
  language?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, keyword, currentTitle, currentContent, language = "pt-BR" }: RegenerateRequest = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let prompt = "";
    let systemPrompt = "";
    let useImageModel = false;

    switch (type) {
      case "title":
        systemPrompt = `Você é um especialista em SEO e copywriting. Gere títulos atraentes e otimizados para buscadores.`;
        prompt = `Crie um título SEO otimizado em ${language} para um artigo sobre: "${keyword}".

Regras:
- Máximo 60 caracteres
- Inclua a palavra-chave principal
- Seja atraente e gere curiosidade
- Use números quando apropriado

Retorne APENAS o título, sem aspas ou explicações.`;
        break;

      case "excerpt":
        systemPrompt = `Você é um especialista em SEO. Gere meta descrições persuasivas e otimizadas.`;
        prompt = `Crie uma meta descrição em ${language} para um artigo com título: "${currentTitle || keyword}".

Regras:
- Entre 150-160 caracteres
- Inclua a palavra-chave "${keyword}"
- Seja persuasivo e inclua call-to-action
- Desperte curiosidade

Retorne APENAS a meta descrição, sem aspas ou explicações.`;
        break;

      case "content":
        systemPrompt = `Você é um redator SEO especialista em criar conteúdo de alta qualidade.`;
        prompt = `Reescreva e melhore o seguinte conteúdo sobre "${keyword}" em ${language}:

${currentContent?.slice(0, 2000) || "Conteúdo vazio"}

Regras:
- Mantenha a estrutura de headers (H2, H3)
- Melhore a legibilidade
- Otimize para SEO
- Mantenha o tamanho similar

Retorne o conteúdo em HTML.`;
        break;

      case "image":
        useImageModel = true;
        prompt = `Generate a professional, high-quality featured image for a blog article about: "${keyword}". 
Style: Modern, clean, professional photography or illustration. 
Aspect ratio: 16:9 landscape format suitable for blog featured image.
No text or watermarks.`;
        break;
    }

    if (useImageModel) {
      // Use image generation model
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Insufficient credits." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error("Image generation failed");
      }

      const data = await response.json();
      const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      return new Response(JSON.stringify({ result: imageUrl, type: "image" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Use text model
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Insufficient credits." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error("Text generation failed");
      }

      const data = await response.json();
      const result = data.choices?.[0]?.message?.content?.trim();

      return new Response(JSON.stringify({ result, type }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("regenerate-content error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
