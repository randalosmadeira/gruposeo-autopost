import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { callAIStream } from "../_shared/gemini.ts";
import { BEHAVIORAL_DIRECTIVES } from "../_shared/behavioral-directives.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { keyword, template, config, projectId } = await req.json();

    if (!keyword || !config?.candidateName) {
      return new Response(
        JSON.stringify({ error: "Palavra-chave e nome do candidato são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build social media block
    const socialLinks: string[] = [];
    const sm = config.socialMedia || {};
    if (sm.instagram) socialLinks.push(`Instagram: ${sm.instagram}`);
    if (sm.youtube) socialLinks.push(`YouTube: ${sm.youtube}`);
    if (sm.twitter) socialLinks.push(`Twitter/X: ${sm.twitter}`);
    if (sm.facebook) socialLinks.push(`Facebook: ${sm.facebook}`);
    if (sm.tiktok) socialLinks.push(`TikTok: ${sm.tiktok}`);
    if (sm.website) socialLinks.push(`Site: ${sm.website}`);
    if (sm.whatsapp) socialLinks.push(`WhatsApp: ${sm.whatsapp}`);

    const brandDirective =
      config.brandStyle === "madeira-neles"
        ? `Use o tom "MADEIRA NELES 🪵🔥" — combativo, direto, anti-establishment, linguagem do trabalhador. Bordão: "Madeiraaa Nelesss!". Gradiente visual: laranja #FF4500 para preto.`
        : config.brandStyle === "madeira-sem-verniz"
        ? `Use o tom "MADEIRA SEM VERNIZ" — transparente, anti-guru, sem papas na língua, acessível. Foco na verdade sem filtros.`
        : `Combine "MADEIRA NELES 🪵🔥" (combativo, atitude) com "MADEIRA SEM VERNIZ" (transparente, direto). Alterne entre os dois estilos ao longo do artigo para máximo impacto.`;

    const toneMap: Record<string, string> = {
      coloquial: "Coloquial, como se estivesse falando com o povo na rua. Linguagem simples, exemplos do dia a dia.",
      "popular-direto": "Popular e direto, sem rodeios. Fala a língua do trabalhador com firmeza.",
      combativo: "Combativo e incisivo. Tom de quem não aceita injustiça e luta pelo povo.",
    };

    const phaseDirective =
      config.campaignPhase === "pre-campanha"
        ? `FASE: PRÉ-CAMPANHA — NÃO peça votos diretamente. Foque em apresentar o histórico, bandeiras, propostas e construir autoridade. Use linguagem de "possível candidato" ou "liderança".`
        : `FASE: CAMPANHA OFICIAL — Pode incluir pedido de voto explícito, número do candidato e partido. Intensifique a urgência e o call-to-action eleitoral.`;

    const templatePrompts: Record<string, string> = {
      "authority-article": `Crie um ARTIGO DE AUTORIDADE ELEITORAL completo sobre "${keyword}" para ${config.candidateName}.
O artigo deve posicionar o candidato como referência absoluta no tema, citando projetos de lei, bandeiras, realizações e propostas concretas.`,
      "social-viral": `Crie um PACOTE DE CONTEÚDO VIRAL para redes sociais sobre "${keyword}" para ${config.candidateName}.
Inclua: 1) Hook viral (primeira frase impactante), 2) Copy para Instagram/Facebook, 3) Thread para Twitter/X, 4) Roteiro para Reels/TikTok, 5) Descrição para YouTube.`,
      "legislative-project": `Crie um artigo detalhado sobre PROJETO DE LEI / PROPOSTA LEGISLATIVA relacionado a "${keyword}" de ${config.candidateName}.
Analise o impacto social, beneficiários, comparação com legislação existente e argumentos técnicos.`,
      "community-agenda": `Crie um artigo sobre PAUTA COMUNITÁRIA "${keyword}" conectando às propostas de ${config.candidateName}.
Aborde demandas locais de ${config.city}/${config.state}, dados do bairro/região e soluções concretas.`,
      "debate-position": `Crie um ARTIGO DE POSICIONAMENTO E DEBATE sobre "${keyword}" refletindo a visão de ${config.candidateName}.
Tom opinativo forte, argumentos sólidos, dados que sustentem a posição e resposta a críticas.`,
      "track-record": `Crie um artigo de HISTÓRICO E REALIZAÇÕES de ${config.candidateName} relacionado a "${keyword}".
Retrospectiva com dados concretos, depoimentos, comparações antes/depois e provas sociais.`,
    };

    const systemPrompt = `${BEHAVIORAL_DIRECTIVES}

MÓDULO: GERADOR DE CONTEÚDO ELEITORAL — CAMPANHA POLÍTICA
==========================================================

${brandDirective}

${phaseDirective}

TOM: ${toneMap[config.contentTone] || toneMap.coloquial}

DADOS DO CANDIDATO:
- Nome: ${config.candidateName}
- Partido: ${config.politicalParty || "Não informado"}
- Cargo: ${config.candidateRole}
- Cidade/Estado: ${config.city || "Não informado"}/${config.state || "Não informado"}
- Slogan: ${config.slogan || "Não informado"}

BIOGRAFIA:
${config.biography || "Não fornecida"}

BANDEIRAS E PAUTAS:
${config.flagsAndCauses || "Não informadas"}

PROJETOS DE LEI / PROPOSTAS:
${config.legislativeProjects || "Não informados"}

REALIZAÇÕES:
${config.achievements || "Não informadas"}

REDES SOCIAIS (inserir estrategicamente no conteúdo):
${socialLinks.length > 0 ? socialLinks.join("\n") : "Nenhuma configurada"}

REGRAS OBRIGATÓRIAS:
1. MÍNIMO 2.800 PALAVRAS — artigo completo e profundo
2. Tom 100% COLOQUIAL — como se falasse com o povo na rua
3. HTML semântico puro — H1, H2, H3, listas, tabelas, blockquotes
4. SEO máximo — meta title 55-65 chars, meta description 150-160 chars
5. Schema JSON-LD Article obrigatório no final
6. Inserir redes sociais do candidato como CTAs estratégicos ao longo do texto
7. Incluir FAQPage Schema com 5+ perguntas relevantes
8. Subtítulos (H2/H3) como perguntas naturais para AEO/Featured Snippets
9. Dados e estatísticas verificáveis a cada 200 palavras
10. E-E-A-T: Experience, Expertise, Authoritativeness, Trustworthiness
11. NUNCA inventar dados ou estatísticas — cite fontes reais
12. Se pré-campanha: NÃO pedir voto diretamente
13. Incluir seção de destaque com as BANDEIRAS do candidato em formato de tabela
14. CTA final direcionando para as redes sociais e site do candidato
15. Incluir BreadcrumbList Schema
16. Slug SEO-friendly, sem acentos, máx 60 caracteres`;

    const userPrompt = templatePrompts[template] || templatePrompts["authority-article"];

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const stream = await callAIStream(messages, {
      maxTokens: 65536,
      temperature: 0.6,
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Electoral content error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
