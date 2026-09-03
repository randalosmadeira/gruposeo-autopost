import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type WordProfile = "short" | "medium" | "long" | "very-long";
interface ArticleConfig {
  keyword: string;
  title?: string;
  secondaryKeywords?: string;
  wordCount?: WordProfile;
  tone?: string;
  pointOfView?: string;
  language?: string;
  type?: "blog" | "sales" | "review" | "comparison";
  contentType?: string;
  segment?: string;
  goal?: string;
  intentType?: string;
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  targetAudience?: string;
  painPoints?: string;
  differentials?: string;
  ctaObjective?: string;
  additionalInfo?: string;
  includeFaq?: boolean;
  faqCount?: number;
  includeTable?: boolean;
  includeList?: boolean;
  includeConclusion?: boolean;
  includeMetaDescription?: boolean;
  seoOptimization?: boolean;
  humanizeContent?: boolean;
  realtimeData?: boolean;
  customInstructions?: string;
  internalLinks?: Array<{ anchor: string; url: string }>;
  sourcesContext?: string;
  projectId?: string;
  projectConfig?: Record<string, string | undefined>;
}

type Band = { label: string; min: number; max: number; purpose: string };

const REVIEW_MARKER = /\[(?:VERIFICAR|VALIDAR|CONFIRMAR|RECONSULTAR)\b[^\]\r\n]{0,300}\]/i;
const SOURCE_SIGNAL = /^ZICA_NEEDS_PRIMARY_SOURCE\s*:\s*(.+)$/im;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function sse(content: string, provider: string, model: string) {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
  return new Response(payload, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-AI-Provider": provider,
      "X-AI-Model": model,
    },
  });
}

function bandFor(value?: WordProfile): Band {
  switch (value) {
    case "short": return { label: "300 a 500 palavras", min: 300, max: 500, purpose: "bloco curto, transacional ou resposta ultraespecífica" };
    case "long": return { label: "1.400 a 2.000 palavras", min: 1400, max: 2000, purpose: "artigo aprofundado, sem preencher espaço artificialmente" };
    case "very-long": return { label: "2.500 a 4.000 palavras", min: 2500, max: 4000, purpose: "conteúdo pilar/cornerstone que realmente exija profundidade" };
    default: return { label: "1.000 a 1.500 palavras", min: 1000, max: 1500, purpose: "artigo padrão ou tópico vertical" };
  }
}

function countWords(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/<!--[\s\S]*?-->/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function buildPrompt(config: ArticleConfig, band: Band) {
  const links = (config.internalLinks || []).slice(0, 12).map((item) => `${item.anchor}: ${item.url}`).join("\n");
  const projectContext = Object.entries(config.projectConfig || {}).filter(([, value]) => Boolean(value)).map(([key, value]) => `${key}: ${value}`).join("\n");

  return `Produza somente conteúdo editorial final publicável, sem explicar o processo interno e sem inserir mensagens de revisão no corpo.

ASSUNTO PRINCIPAL: ${config.keyword}
TÍTULO SUGERIDO: ${config.title || "crie um título claro, específico e fiel ao assunto"}
IDIOMA: ${config.language || "pt-BR"}
TOM: ${config.tone || "profissional e acessível"}
PONTO DE VISTA: ${config.pointOfView || "natural para a intenção"}
TIPO: ${config.type || "blog"}
PERFIL DE EXTENSÃO: ${band.label}
FINALIDADE DA FAIXA: ${band.purpose}
OBJETIVO: ${config.goal || "informar com precisão"}
INTENÇÃO: ${config.intentType || "informational"}
SEGMENTO: ${config.segment || "general"}
PALAVRAS-CHAVE SECUNDÁRIAS: ${config.secondaryKeywords || ""}

REGRAS GEO/AEO INTERNAS DO ZICA.AI:
1. Densidade informacional e precisão valem mais que volume bruto.
2. Não repita ideias para atingir contagem de palavras.
3. Abra o primeiro parágrafo com resposta objetiva à intenção principal.
4. O título do WordPress será o único H1. No corpo use somente H2 e H3 semanticamente claros.
5. Quando um H2/H3 representar pergunta ou intenção objetiva, inicie com Answer Capsule de aproximadamente 25 a 45 palavras e depois aprofunde.
6. Inclua dados, percentuais, anos, estatísticas, leis, decisões ou estudos somente quando estiverem sustentados pelas fontes/contexto fornecidos. Nunca invente números ou autoridades.
7. ${config.includeTable ? "Use tabela comparativa quando houver elementos realmente comparáveis e dados suficientes." : "Tabela é opcional e só deve aparecer se acrescentar clareza."}
8. ${config.includeList === false ? "Não force listas." : "Use listas em passos, requisitos, documentos, critérios, riscos ou sínteses quando melhorarem a leitura."}
9. ${config.includeFaq === false ? "Não inclua FAQ." : `Inclua FAQ somente se houver perguntas úteis e respondíveis pelo conteúdo, com até ${config.faqCount || 5} itens.`}
10. Não use keyword stuffing, alegações sem fonte ou texto genérico de preenchimento.
11. Não escreva comentários técnicos TITLE_SEO, META_DESCRIPTION, JSON, prompts, TODOs ou qualquer metadado interno no corpo. Título SEO e meta description são produzidos por outra etapa do pipeline.

REGRAS FACTUAIS E DE PUBLICAÇÃO:
- Não invente fatos, números, decisões, estudos, citações, pessoas, leis ou fontes.
- É PROIBIDO escrever [VERIFICAR], [VALIDAR], [CONFIRMAR], [RECONSULTAR], “revisão humana”, “consultar fonte antes de publicar” ou equivalentes no conteúdo final.
- Se uma informação acessória não puder ser comprovada pelo contexto disponível, simplesmente omita essa informação.
- Se uma fonte primária ausente for indispensável para sustentar a tese central do artigo, NÃO produza o artigo. Retorne somente: ZICA_NEEDS_PRIMARY_SOURCE: seguido de uma descrição objetiva da fonte que falta.
- Conteúdo jurídico sobre lei, ato normativo, jurisprudência, prazo oficial ou política pública atual exige fonte primária quando a afirmação depender dela.
- Preserve conformidade jurídica, publicitária e editorial aplicável ao conteúdo.
- ${config.includeConclusion === false ? "Não force conclusão." : "Finalize com síntese objetiva e CTA coerente, sem promessa de resultado."}

CONTEXTO DA ORGANIZAÇÃO:
${projectContext || "Não informado."}

LINKS INTERNOS DISPONÍVEIS:
${links || "Nenhum informado."}

FONTES/CONTEXTO FORNECIDO:
${config.sourcesContext || "Nenhuma fonte adicional fornecida."}

INSTRUÇÕES ADICIONAIS:
${config.customInstructions || config.additionalInfo || "Nenhuma."}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Autorização necessária", request_id: requestId }, 401);

    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "");
    if (!supabaseUrl || !anonKey) return json({ error: "Backend incompleto", request_id: requestId }, 500);

    const token = authHeader.slice(7);
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sessão inválida", request_id: requestId }, 401);

    const body = await req.json().catch(() => ({}));
    const config = (body?.config || body) as ArticleConfig;
    if (!config?.keyword?.trim()) return json({ error: "keyword é obrigatório", request_id: requestId }, 400);

    const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "");
    const admin = serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
    let preferredProvider: "openai" | "anthropic" | undefined;
    if (admin) {
      const { data: settings } = await admin.from("user_settings").select("ai_provider").eq("user_id", authData.user.id).maybeSingle();
      const provider = String(settings?.ai_provider || "").toLowerCase();
      if (provider === "openai" || provider === "anthropic") preferredProvider = provider;
    }

    const band = bandFor(config.wordCount);
    const prompt = buildPrompt(config, band);
    const orchestrator = await getOrchestratorForUser(authData.user.id);
    let generation = await orchestrator.callWithMeta("article_generation", [
      { role: "system", content: "Você é o redator editorial principal do Zica.ai. Entregue somente conteúdo publicável ou o sinal ZICA_NEEDS_PRIMARY_SOURCE quando uma fonte primária for indispensável." },
      { role: "user", content: prompt },
    ], { preferredProvider, maxTokens: 32000, temperature: 0.35 });

    let content = generation.content.trim();
    const initialSourceSignal = content.match(SOURCE_SIGNAL);
    if (initialSourceSignal || REVIEW_MARKER.test(content)) {
      return json({
        error: "Fonte primária necessária antes da geração/publicação.",
        code: "primary_source_required",
        detail: initialSourceSignal?.[1]?.trim() || "O modelo detectou uma afirmação que exige verificação em fonte primária.",
        retryable: false,
        request_id: requestId,
      }, 409);
    }

    let words = countWords(content);
    if (words < Math.floor(band.min * 0.85) && band.min >= 1000) {
      const expanded = await orchestrator.callWithMeta("content_editing", [
        { role: "system", content: "Aprofunde sem inventar fatos, sem repetir ideias e sem alterar a tese central. Não insira marcadores de revisão, comentários técnicos ou metadados no corpo." },
        { role: "user", content: `Faixa editorial: ${band.label}. O rascunho possui ${words} palavras. Acrescente apenas explicações, critérios, exemplos hipotéticos claramente identificados, listas ou comparações sustentadas pelo próprio contexto. Se uma fonte primária indispensável estiver ausente, retorne somente ZICA_NEEDS_PRIMARY_SOURCE: <fonte necessária>.\n\nRASCUNHO:\n${content}` },
      ], { preferredProvider: generation.provider, maxTokens: 32000, temperature: 0.2 });
      const expandedContent = expanded.content.trim();
      const expandedSourceSignal = expandedContent.match(SOURCE_SIGNAL);
      if (expandedSourceSignal || REVIEW_MARKER.test(expandedContent)) {
        return json({
          error: "Fonte primária necessária antes da geração/publicação.",
          code: "primary_source_required",
          detail: expandedSourceSignal?.[1]?.trim() || "A revisão editorial detectou uma afirmação que exige fonte primária.",
          retryable: false,
          request_id: requestId,
        }, 409);
      }
      if (countWords(expandedContent) > words) {
        content = expandedContent;
        words = countWords(content);
        generation = expanded;
      }
    }

    console.log(`[generate-article] request=${requestId} provider=${generation.provider} model=${generation.model} words=${words} band=${band.min}-${band.max}`);
    return sse(content, generation.provider, generation.model);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro interno", request_id: requestId }, 500);
  }
});
