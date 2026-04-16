import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { callAIStream } from "../_shared/gemini.ts";
import { BEHAVIORAL_DIRECTIVES } from "../_shared/behavioral-directives.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// --- Prompt builder helpers (keep index.ts lean) ---

function buildVideoBlock(config: any): string {
  const vids = config.videoUrls || { youtube: [], instagram: [] };
  const ytUrls = (vids.youtube || []).filter((u: string) => u.trim());
  const igUrls = (vids.instagram || []).filter((u: string) => u.trim());
  if (ytUrls.length === 0 && igUrls.length === 0) return '';

  let block = `\nVÍDEOS PARA EMBED OBRIGATÓRIO NO ARTIGO:`;
  if (ytUrls.length > 0) {
    block += `\nYouTube (inserir como iframe responsivo com lazy loading):`;
    ytUrls.forEach((url: string, i: number) => {
      const videoId = extractYouTubeId(url);
      block += `\n${i + 1}. ${url}`;
      if (videoId) {
        block += `\n   Embed: <div class="video-embed" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;margin:2rem 0"><iframe src="https://www.youtube.com/embed/${videoId}" style="position:absolute;top:0;left:0;width:100%;height:100%" frameborder="0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen loading="lazy" title="Vídeo do candidato"></iframe></div>`;
      }
    });
  }
  if (igUrls.length > 0) {
    block += `\nInstagram (inserir como blockquote embed com link):`;
    igUrls.forEach((url: string, i: number) => {
      block += `\n${i + 1}. ${url}`;
      block += `\n   Embed: <blockquote class="instagram-media" data-instgrm-permalink="${url}" data-instgrm-version="14" style="max-width:540px;margin:2rem auto;border:1px solid hsl(0,0%,85%);border-radius:12px;padding:16px"><a href="${url}" target="_blank" rel="noopener noreferrer">Ver publicação no Instagram</a></blockquote>`;
    });
    block += `\n   Script (inserir antes de </body>): <script async src="//www.instagram.com/embed.js"></script>`;
  }
  return block;
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function buildVideoSchemaBlock(config: any): string {
  const vids = config.videoUrls || { youtube: [], instagram: [] };
  const ytUrls = (vids.youtube || []).filter((u: string) => u.trim());
  if (ytUrls.length === 0) return '';

  return `\nVIDEO SCHEMA JSON-LD OBRIGATÓRIO (incluir para cada vídeo YouTube):
Gerar um schema VideoObject para cada vídeo com: name, description, thumbnailUrl, uploadDate, contentUrl, embedUrl.
Exemplo:
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "Título do vídeo sobre ${config.candidateName}",
  "description": "Descrição relevante conectando ao tema do artigo",
  "thumbnailUrl": "https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg",
  "uploadDate": "${new Date().toISOString().split('T')[0]}",
  "embedUrl": "https://www.youtube.com/embed/VIDEO_ID"
}`;
}

function buildIndexingDirectives(): string {
  return `
TÉCNICAS AVANÇADAS DE INDEXAÇÃO E VISIBILIDADE (OBRIGATÓRIAS):
================================================================

A) INDEXAÇÃO MÁXIMA POR MOTORES DE BUSCA:
- Meta tags obrigatórias no início do artigo (como comentário HTML):
  <!-- meta_title: [55-65 chars com keyword principal] -->
  <!-- meta_description: [150-160 chars com keyword nos primeiros 60 chars, frase completa] -->
  <!-- slug: [slug-seo-friendly-sem-acentos-max-60-chars] -->
  <!-- canonical: [URL canônica do artigo] -->
  <!-- robots: index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1 -->
- Incluir tag <meta name="googlebot" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
- Open Graph completo: og:title, og:description, og:image, og:type=article, og:locale=pt_BR
- Twitter Card: twitter:card=summary_large_image, twitter:title, twitter:description

B) INDEXAÇÃO POR IA (AEO - Answer Engine Optimization):
- LEAD AUTOSSUFICIENTE: primeiras 40-60 palavras devem responder ao tema de forma completa e extraível por ChatGPT, Claude, Gemini, Perplexity
- Subtítulos H2/H3 como PERGUNTAS NATURAIS que IAs usam como fonte de resposta
- Incluir seção "Resumo Rápido" ou "TL;DR" no topo com bullets diretos
- Dados estruturados em tabelas HTML semânticas (<table> com <thead>, <tbody>) para extração por modelos de linguagem
- Citações de especialistas em <blockquote cite="fonte"> para E-E-A-T
- Listas ordenadas e não-ordenadas para fragmentação de respostas por IAs

C) INDEXNOW / BING / MOTORES ALTERNATIVOS:
- Incluir no final do artigo: <!-- indexnow:priority=1.0 changefreq=daily -->
- Estrutura de dados BreadcrumbList Schema para navegação hierárquica
- SpeakableSpecification Schema para assistentes de voz (Alexa, Google Assistant)
- Artigo deve ser "self-contained" — sem dependência de links externos para compreensão

D) RICH SNIPPETS E FEATURED SNIPPETS:
- Incluir seção FAQ com FAQPage Schema (5+ perguntas com respostas completas)
- Parágrafos de resposta direta (40-60 palavras) logo após cada H2 para Position Zero
- Tabelas comparativas com dados numéricos para Table Featured Snippets
- Listas numeradas para "How-to" snippets quando aplicável
- HowTo Schema quando houver instruções passo-a-passo

E) VÍDEOS E RICH MEDIA PARA INDEXAÇÃO:
- Vídeos do YouTube devem ser inseridos com iframe responsivo + lazy loading
- Cada vídeo DEVE ter VideoObject Schema JSON-LD
- Inserir vídeos estrategicamente: 1 no primeiro terço, 1 no meio, 1 próximo ao final
- Reels/Posts do Instagram inseridos como embeds nativos
- Texto ao redor do vídeo deve contextualizar e citar o conteúdo do vídeo
- Incluir transcrição resumida ou descrição do vídeo para indexação textual
- Alt text descritivo em todas as imagens referenciadas

F) SINAIS DE AUTORIDADE PARA CITAÇÃO POR IAS:
- Incluir data de publicação e última atualização no formato ISO 8601
- Author Schema com nome, credentials e sameAs (links sociais)
- NewsArticle ou Article Schema com datePublished, dateModified, author, publisher
- Incluir seção "Fontes e Referências" no final com links verificáveis
- Usar <cite> para citações de leis, projetos e documentos oficiais
- Incluir markup semântico: <article>, <section>, <aside>, <figure>, <figcaption>
- Mencionar "Atualizado em ${new Date().toLocaleDateString('pt-BR')}" no conteúdo`;
}

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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
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

    // Social media block
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

    const targetCities = config.targetCities || [];
    const citiesBlock = targetCities.length > 0
      ? `\nCIDADES-ALVO (segmentação geográfica obrigatória):\n${targetCities.join(', ')}\n- Mencione a cidade principal no título, H1 e nos primeiros 100 palavras\n- Use termos de busca locais: "candidato deputado federal [cidade] 2026"\n- Referencie problemas, demandas e características específicas da região\n- Inclua LocalBusiness Schema com a cidade`
      : '';

    const topics = config.campaignTopics || [];
    const topicsBlock = topics.length > 0
      ? `\nPAUTAS PRIORITÁRIAS DO CANDIDATO:\n${topics.map((t: string) => `- ${t}`).join('\n')}\n- Conecte CADA pauta com propostas concretas do candidato\n- Use dados e estatísticas da região sobre cada tema`
      : '';

    const competitorBlock = config.competitors
      ? `\nANÁLISE DE CONCORRENTES:\n${config.competitors}\n\nDIFERENCIAIS DO CANDIDATO:\n${config.differentials || 'Não informados'}\n- Compare sutilmente com concorrentes sem ataques pessoais\n- Destaque os diferenciais concretos do candidato\n- Use a pergunta "em quem votar" como gancho SEO`
      : '';

    // Video embedding blocks
    const videoBlock = buildVideoBlock(config);
    const videoSchemaBlock = buildVideoSchemaBlock(config);
    const indexingDirectives = buildIndexingDirectives();

    const templatePrompts: Record<string, string> = {
      "authority-article": `Crie um ARTIGO DE AUTORIDADE ELEITORAL completo sobre "${keyword}" para ${config.candidateName}.
O artigo deve posicionar o candidato como referência absoluta no tema, citando projetos de lei, bandeiras, realizações e propostas concretas.
${targetCities.length > 0 ? `Foco geográfico: ${targetCities[0]}` : ''}
OBRIGATÓRIO: Inserir vídeos do candidato (se fornecidos) como prova social e autoridade.`,

      "social-viral": `Crie um PACOTE DE CONTEÚDO VIRAL para redes sociais sobre "${keyword}" para ${config.candidateName}.
Inclua: 1) Hook viral (primeira frase impactante), 2) Copy para Instagram/Facebook, 3) Thread para Twitter/X, 4) Roteiro para Reels/TikTok, 5) Descrição para YouTube.
Referencie os vídeos existentes do candidato como material de apoio.`,

      "legislative-project": `Crie um artigo detalhado sobre PROJETO DE LEI / PROPOSTA LEGISLATIVA relacionado a "${keyword}" de ${config.candidateName}.
Analise o impacto social, beneficiários, comparação com legislação existente e argumentos técnicos.
Inclua vídeos do candidato explicando o projeto (se disponíveis).`,

      "community-agenda": `Crie um artigo sobre PAUTA COMUNITÁRIA "${keyword}" conectando às propostas de ${config.candidateName}.
Aborde demandas locais de ${targetCities.length > 0 ? targetCities[0] : config.city || 'São Paulo'}/${config.state}, dados do bairro/região e soluções concretas.
Incorpore vídeos do candidato na comunidade (se fornecidos).`,

      "debate-position": `Crie um ARTIGO DE POSICIONAMENTO E DEBATE sobre "${keyword}" refletindo a visão de ${config.candidateName}.
Tom opinativo forte, argumentos sólidos, dados que sustentem a posição e resposta a críticas.
Use vídeos de debates/entrevistas do candidato como referência.`,

      "track-record": `Crie um artigo de HISTÓRICO E REALIZAÇÕES de ${config.candidateName} relacionado a "${keyword}".
Retrospectiva com dados concretos, depoimentos, comparações antes/depois e provas sociais.
Insira vídeos de cobertura de realizações do candidato.`,

      "city-targeted": `Crie um ARTIGO SEGMENTADO POR CIDADE sobre "${keyword}" para ${config.candidateName} focado em ${targetCities.length > 0 ? targetCities[0] : config.city || 'São Paulo'}.
OBRIGATÓRIO:
- Título com nome da cidade + cargo + 2026
- H1 otimizado para busca local
- Dados demográficos e problemas específicos da cidade
- Propostas concretas para a cidade
- Termos: "candidato a ${config.candidateRole.replace('-', ' ')} ${targetCities.length > 0 ? targetCities[0] : config.city} 2026"
- "em quem votar para ${config.candidateRole.replace('-', ' ')} ${targetCities.length > 0 ? targetCities[0] : config.city}"
- Vídeos do candidato na cidade (se disponíveis)`,

      "competitor-comparison": `Crie um ARTIGO COMPARATIVO ELEITORAL sobre "${keyword}" posicionando ${config.candidateName} como a melhor opção.
OBRIGATÓRIO:
- Responda à pergunta: "Em quem votar para ${config.candidateRole.replace('-', ' ')} em ${targetCities.length > 0 ? targetCities[0] : 'São Paulo'} nas eleições 2026?"
- Tabela comparativa de propostas
- Análise ponto a ponto das bandeiras
- Posicione ${config.candidateName} com destaque nos diferenciais
- Inclua vídeos que comprovem a atuação do candidato
${config.competitors ? `\nConcorrentes mencionados: ${config.competitors}` : ''}
${config.differentials ? `\nDiferenciais: ${config.differentials}` : ''}`,
    };

    const systemPrompt = `${BEHAVIORAL_DIRECTIVES}

MÓDULO: GERADOR DE CONTEÚDO ELEITORAL — CAMPANHA POLÍTICA 2026
================================================================

${brandDirective}

${phaseDirective}

TOM: ${toneMap[config.contentTone] || toneMap.coloquial}

DADOS DO CANDIDATO:
- Nome: ${config.candidateName}
- Partido: ${config.politicalParty || "Não informado"}
- Cargo: ${config.candidateRole.replace('-', ' ')}
- Cidade/Estado: ${config.city || "Não informado"}/${config.state || "SP"}
- Slogan: ${config.slogan || "Não informado"}

BIOGRAFIA:
${config.biography || "Não fornecida"}

BANDEIRAS E PAUTAS:
${config.flagsAndCauses || "Não informadas"}
${topicsBlock}

PROJETOS DE LEI / PROPOSTAS:
${config.legislativeProjects || "Não informados"}

REALIZAÇÕES:
${config.achievements || "Não informadas"}
${competitorBlock}
${citiesBlock}

REDES SOCIAIS (inserir estrategicamente no conteúdo):
${socialLinks.length > 0 ? socialLinks.join("\n") : "Nenhuma configurada"}
${videoBlock}
${videoSchemaBlock}

${indexingDirectives}

PALAVRAS-CHAVE SEO OBRIGATÓRIAS A INCLUIR NO ARTIGO:
- "candidato a ${config.candidateRole.replace('-', ' ')} 2026 SP"
- "em quem votar para ${config.candidateRole.replace('-', ' ')} 2026"
- "melhores candidatos ${config.candidateRole.replace('-', ' ')} São Paulo"
- "eleições 2026 ${config.candidateRole.replace('-', ' ')} estado de São Paulo"
- "${config.candidateName} ${config.candidateRole.replace('-', ' ')}"
${targetCities.length > 0 ? `- "candidato ${config.candidateRole.replace('-', ' ')} ${targetCities[0]} 2026"\n- "${config.candidateName} ${targetCities[0]}"` : ''}

REGRAS OBRIGATÓRIAS:
1. MÍNIMO 2.800 PALAVRAS — artigo completo e profundo
2. Tom 100% COLOQUIAL — como se falasse com o povo na rua
3. HTML semântico puro — <article>, <section>, H1, H2, H3, listas, tabelas, blockquotes, <figure>, <figcaption>
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
16. Slug SEO-friendly, sem acentos, máx 60 caracteres
17. Incluir perguntas "em quem votar", "quem são os candidatos", "melhor candidato" como H2/H3
18. Se houver cidades-alvo, incluir o nome da cidade no título e no H1
19. VÍDEOS: Inserir embeds de YouTube/Instagram fornecidos com VideoObject Schema
20. LEAD AUTOSSUFICIENTE: primeiras 40-60 palavras devem ser extraíveis por IAs como resposta completa
21. Incluir seção "Resumo Rápido" com bullets no topo do artigo
22. SpeakableSpecification Schema para assistentes de voz
23. Open Graph e Twitter Card completos como comentários HTML no início
24. Incluir "Fontes e Referências" no final do artigo
25. Incluir Author Schema com sameAs para redes sociais do candidato`;

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
