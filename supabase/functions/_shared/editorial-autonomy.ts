export const EDITORIAL_NICHES = [
  "geral",
  "advocacia",
  "saude",
  "beleza",
  "tecnologia",
  "marketing",
] as const;

export const EDITORIAL_ANGLE_IDS = [
  "impacto_brasil",
  "analise_juridica",
  "visao_consumidor",
  "tendencia_mercado",
  "opiniao_especialista",
  "explicador_servico",
] as const;

export const EDITORIAL_TRIGGERS = [
  "serious",
  "humor",
  "concern",
  "outrage",
  "anguish",
  "sarcasm",
  "satire",
  "happiness",
  "celebration",
  "doubt",
  "mystery",
] as const;

export const EDITORIAL_LENGTHS = ["short", "medium", "long", "very-long"] as const;

export type EditorialNiche = typeof EDITORIAL_NICHES[number];
export type EditorialAngleId = typeof EDITORIAL_ANGLE_IDS[number];
export type EditorialTrigger = typeof EDITORIAL_TRIGGERS[number];
export type EditorialLength = typeof EDITORIAL_LENGTHS[number];
export type EditorialRisk = "low" | "medium" | "high" | "critical";

export interface RecentEditorialDecision {
  niche?: string | null;
  analysisAngleId?: string | null;
  analysisAngle?: string | null;
  emotionalTrigger?: string | null;
  articleLength?: string | null;
  keyword?: string | null;
  sourceName?: string | null;
  createdAt?: string | null;
}

export interface RepostBatchContext {
  scheduleId?: string | null;
  agentId?: string | null;
  sourceType?: "manual" | "rss" | "agent" | "portal" | string;
  queuePosition?: number | null;
  queueSize?: number | null;
  feedName?: string | null;
  recentDecisions?: RecentEditorialDecision[];
}

export interface EditorialAutonomyInput {
  title?: string;
  sourceUrl: string;
  sourceName?: string;
  sourceContent?: string;
  projectName?: string;
  projectDescription?: string;
  projectNiche?: string;
  projectTone?: string;
  projectComplianceRules?: string;
  keywordHint?: string;
  nicheHint?: string;
  analysisAngleHint?: string;
  articleLengthHint?: string;
  emotionalTriggerHint?: string;
  batchContext?: RepostBatchContext;
}

export interface EditorialDecision {
  niche: EditorialNiche;
  analysisAngleId: EditorialAngleId;
  analysisAngle: string;
  articleLength: EditorialLength;
  emotionalTrigger: EditorialTrigger;
  emotionalIntensity: "low" | "medium" | "high";
  keyword: string;
  tone: string;
  riskLevel: EditorialRisk;
  requiresHumanReview: boolean;
  confidence: number;
  reasoningSummary: string;
  diversityNotes: string[];
  promptAddendum: string;
  selectionSource: "ai" | "manual" | "fallback";
}

export interface WordBand {
  label: string;
  min: number;
  max: number;
}

const SENSITIVE_PATTERN = /\b(morte|morreu|óbito|obito|homic[ií]dio|suic[ií]dio|estupro|abuso|viol[eê]ncia|agress[aã]o|crian[cç]a|adolescente|menor|pris[aã]o|preso|crime|v[ií]tima|desastre|trag[eé]dia|doen[cç]a grave|c[aâ]ncer|cirurgia|medicamento|sa[uú]de|processo penal|tribunal|senten[cç]a|ac[oó]rd[aã]o|jurisprud[eê]ncia)\b/i;
const POSITIVE_PATTERN = /\b(vit[oó]ria|conquista|premia[cç][aã]o|aprovad[oa]|celebra[cç][aã]o|recorde positivo|crescimento|avan[cç]o confirmado)\b/i;
const CONSUMER_PATTERN = /\b(consumidor|cliente|compra|produto|servi[cç]o|banco|financiamento|juros|fraude|golpe|ve[ií]culo|im[oó]vel|plano de sa[uú]de)\b/i;
const LEGAL_PATTERN = /\b(lei|artigo|tribunal|stf|stj|tst|trf|tj|decis[aã]o|senten[cç]a|ac[oó]rd[aã]o|jurisprud[eê]ncia|processo|recurso|habeas corpus|direito|jur[ií]dico)\b/i;
const HEALTH_PATTERN = /\b(sa[uú]de|medicina|m[eé]dico|hospital|doen[cç]a|tratamento|cirurgia|medicamento|paciente|ans|anvisa)\b/i;
const BEAUTY_PATTERN = /\b(est[eé]tica|beleza|cosm[eé]tico|procedimento est[eé]tico|harmoniza[cç][aã]o|cirurgia pl[aá]stica)\b/i;
const TECH_PATTERN = /\b(tecnologia|intelig[eê]ncia artificial|software|aplicativo|plataforma|digital|cibern[eé]tico|dados|privacidade|internet|telecom)\b/i;
const MARKETING_PATTERN = /\b(marketing|seo|tr[aá]fego|m[ií]dia|publicidade|campanha|convers[aã]o|lead|marca|vendas)\b/i;

function normalizeText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function includesValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return values.includes(String(value) as T[number]);
}

export function normalizeArticleLength(value: unknown): EditorialLength {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "extra-long" || normalized === "extra_long" || normalized === "complete" || normalized === "completo") return "very-long";
  if (normalized === "very-long" || normalized === "long" || normalized === "medium" || normalized === "short") return normalized;
  return "medium";
}

export function wordBandFor(value: unknown): WordBand {
  const length = normalizeArticleLength(value);
  if (length === "short") return { label: "1.200 a 1.800 palavras", min: 1200, max: 1800 };
  if (length === "long") return { label: "3.600 a 5.200 palavras", min: 3600, max: 5200 };
  if (length === "very-long") return { label: "5.200 a 7.000 palavras, apenas quando a fonte e a complexidade sustentarem conteúdo pilar", min: 5200, max: 7000 };
  return { label: "2.400 a 3.600 palavras", min: 2400, max: 3600 };
}

export function normalizeNiche(value: unknown, content = ""): EditorialNiche {
  const combined = `${normalizeText(value)} ${content}`;
  const hint = normalizeText(value).toLowerCase();
  if (hint === "advocacia" || hint.includes("jur") || LEGAL_PATTERN.test(combined)) return "advocacia";
  if (hint === "saude" || hint.includes("saúde") || HEALTH_PATTERN.test(combined)) return "saude";
  if (hint === "beleza" || hint.includes("estética") || BEAUTY_PATTERN.test(combined)) return "beleza";
  if (hint === "tecnologia" || hint.includes("tech") || TECH_PATTERN.test(combined)) return "tecnologia";
  if (hint === "marketing" || MARKETING_PATTERN.test(combined)) return "marketing";
  return "geral";
}

function defaultAngleFor(niche: EditorialNiche, content: string): { id: EditorialAngleId; text: string } {
  if (niche === "advocacia" || LEGAL_PATTERN.test(content)) {
    return { id: "analise_juridica", text: "Análise jurídica prática, limites da decisão e consequências para pessoas e empresas no Brasil" };
  }
  if (CONSUMER_PATTERN.test(content)) {
    return { id: "visao_consumidor", text: "Impactos concretos para o consumidor, riscos, direitos e medidas preventivas" };
  }
  if (niche === "tecnologia" || niche === "marketing") {
    return { id: "tendencia_mercado", text: "Tendência de mercado, efeitos no Brasil, riscos operacionais e próximos movimentos" };
  }
  return { id: "impacto_brasil", text: "Impacto no Brasil, contexto verificável, efeitos práticos e pontos que ainda exigem confirmação" };
}

function extractKeyword(input: EditorialAutonomyInput) {
  const hinted = normalizeText(input.keywordHint);
  if (hinted) return hinted.slice(0, 160);
  const title = normalizeText(input.title || input.sourceContent?.split("\n")[0]);
  const stop = new Set(["para", "com", "sem", "sobre", "entre", "após", "apos", "como", "mais", "menos", "uma", "uns", "das", "dos", "que", "por", "pela", "pelo", "notícia", "noticia"]);
  const words = title.split(/\s+/).map((word) => word.replace(/[^\p{L}\p{N}-]/gu, "")).filter((word) => word.length > 2 && !stop.has(word.toLowerCase()));
  return words.slice(0, 7).join(" ").slice(0, 160) || "notícia em análise";
}

function recentFrequency(input: EditorialAutonomyInput, field: keyof RecentEditorialDecision, value: string) {
  const rows = input.batchContext?.recentDecisions || [];
  return rows.slice(0, 5).filter((row) => normalizeText(row[field]).toLowerCase() === value.toLowerCase()).length;
}

export function fallbackEditorialDecision(input: EditorialAutonomyInput): EditorialDecision {
  const content = `${normalizeText(input.title)} ${normalizeText(input.sourceContent)}`;
  const niche = normalizeNiche(input.nicheHint || input.projectNiche, content);
  const sensitive = SENSITIVE_PATTERN.test(content);
  const positive = POSITIVE_PATTERN.test(content) && !sensitive;
  const angle = defaultAngleFor(niche, content);
  const sourceWords = normalizeText(input.sourceContent).split(/\s+/).filter(Boolean).length;
  const legalDepth = LEGAL_PATTERN.test(content);
  const articleLength: EditorialLength = sourceWords > 2200 || legalDepth ? "long" : sourceWords < 350 ? "short" : "medium";
  const emotionalTrigger: EditorialTrigger = sensitive ? "serious" : positive ? "happiness" : CONSUMER_PATTERN.test(content) ? "concern" : "doubt";
  const riskLevel: EditorialRisk = sensitive && legalDepth ? "high" : sensitive ? "medium" : "low";
  const keyword = extractKeyword(input);
  const diversityNotes: string[] = [];
  if (recentFrequency(input, "emotionalTrigger", emotionalTrigger) >= 3) diversityNotes.push("Gatilho repetido por necessidade temática; variar imagem e abertura sem alterar os fatos.");
  if (recentFrequency(input, "analysisAngleId", angle.id) >= 3) diversityNotes.push("Ângulo recorrente; variar perguntas, exemplos e estrutura editorial.");

  return {
    niche,
    analysisAngleId: angle.id,
    analysisAngle: angle.text,
    articleLength,
    emotionalTrigger,
    emotionalIntensity: sensitive ? "medium" : "low",
    keyword,
    tone: input.projectTone || (sensitive ? "sério, técnico, acessível e não sensacionalista" : "informativo, claro e objetivo"),
    riskLevel,
    requiresHumanReview: riskLevel === "high" || riskLevel === "critical",
    confidence: 62,
    reasoningSummary: "Decisão de contingência baseada no tema, sensibilidade, densidade da fonte e histórico recente do rol.",
    diversityNotes,
    promptAddendum: "Preserve precisão factual, diferencie fatos de hipóteses e não intensifique emoções além do que a fonte sustenta.",
    selectionSource: "fallback",
  };
}

export function buildEditorialDecisionPrompt(input: EditorialAutonomyInput) {
  const recent = (input.batchContext?.recentDecisions || []).slice(0, 8).map((row, index) => ({
    order: index + 1,
    niche: row.niche || null,
    angle: row.analysisAngleId || row.analysisAngle || null,
    trigger: row.emotionalTrigger || null,
    length: row.articleLength || null,
    keyword: row.keyword || null,
    source: row.sourceName || null,
  }));

  return `Você é o Agente de Política Editorial do Zica.ai. Sua tarefa é escolher, para UMA repostagem do rol, o nicho, o ângulo, o tamanho, o gatilho emocional, a palavra-chave e o tom. A decisão deve ser aplicada ao artigo e à imagem, não apenas sugerida.

OBJETIVOS:
1. Maximizar utilidade, precisão, diversidade editorial, SEO e GEO sem copiar a estrutura da fonte.
2. Evitar repetição mecânica dentro do rol de repostagens.
3. Escolher tamanho conforme complexidade e quantidade de evidência, nunca para inflar texto.
4. Tratar conteúdo jurídico, saúde, violência, morte, menores, crimes e tragédias sem humor, sarcasmo, sátira ou comemoração.
5. Gatilho emocional orienta enquadramento e imagem, mas jamais autoriza sensacionalismo, manipulação, medo artificial ou invenção.
6. Marcar requiresHumanReview=true quando houver alto risco jurídico, médico, eleitoral, acusação não confirmada, menor, violência grave ou fonte primária insuficiente.
7. Use os campos do operador apenas como pistas. Você pode corrigi-los quando o conteúdo ou o histórico do rol indicar opção melhor.
8. Não revele raciocínio interno. reasoningSummary deve ser uma justificativa operacional de no máximo 280 caracteres.

VALORES PERMITIDOS:
- niche: ${EDITORIAL_NICHES.join(", ")}
- analysisAngleId: ${EDITORIAL_ANGLE_IDS.join(", ")}
- articleLength: ${EDITORIAL_LENGTHS.join(", ")}
- emotionalTrigger: ${EDITORIAL_TRIGGERS.join(", ")}
- emotionalIntensity: low, medium, high
- riskLevel: low, medium, high, critical

PROJETO:
- nome: ${normalizeText(input.projectName) || "não informado"}
- descrição: ${normalizeText(input.projectDescription).slice(0, 1200) || "não informada"}
- nicho do projeto: ${normalizeText(input.projectNiche) || "não informado"}
- tom do projeto: ${normalizeText(input.projectTone) || "não informado"}
- regras de compliance: ${normalizeText(input.projectComplianceRules).slice(0, 1200) || "não informadas"}

FONTE:
- título: ${normalizeText(input.title) || "não informado"}
- veículo: ${normalizeText(input.sourceName) || "não informado"}
- URL: ${input.sourceUrl}
- conteúdo: ${normalizeText(input.sourceContent).slice(0, 12000)}

PISTAS DO OPERADOR:
- nicheHint: ${normalizeText(input.nicheHint) || "auto"}
- analysisAngleHint: ${normalizeText(input.analysisAngleHint) || "auto"}
- articleLengthHint: ${normalizeText(input.articleLengthHint) || "auto"}
- emotionalTriggerHint: ${normalizeText(input.emotionalTriggerHint) || "auto"}
- keywordHint: ${normalizeText(input.keywordHint) || "auto"}

CONTEXTO DO ROL:
${JSON.stringify({
  scheduleId: input.batchContext?.scheduleId || null,
  agentId: input.batchContext?.agentId || null,
  sourceType: input.batchContext?.sourceType || "manual",
  queuePosition: input.batchContext?.queuePosition || null,
  queueSize: input.batchContext?.queueSize || null,
  feedName: input.batchContext?.feedName || null,
  recent,
})}

Retorne SOMENTE JSON válido:
{
  "niche": "geral",
  "analysisAngleId": "impacto_brasil",
  "analysisAngle": "descrição específica do ângulo para esta notícia",
  "articleLength": "medium",
  "emotionalTrigger": "serious",
  "emotionalIntensity": "low",
  "keyword": "palavra-chave principal",
  "tone": "tom editorial",
  "riskLevel": "low",
  "requiresHumanReview": false,
  "confidence": 0,
  "reasoningSummary": "justificativa operacional curta",
  "diversityNotes": ["ação de diversidade"],
  "promptAddendum": "instrução específica para o redator e para o gerador de imagem"
}`;
}

export function normalizeEditorialDecision(
  raw: Partial<EditorialDecision> | Record<string, unknown> | null | undefined,
  input: EditorialAutonomyInput,
  source: EditorialDecision["selectionSource"] = "ai",
): EditorialDecision {
  const fallback = fallbackEditorialDecision(input);
  const content = `${normalizeText(input.title)} ${normalizeText(input.sourceContent)}`;
  const sensitive = SENSITIVE_PATTERN.test(content);
  const rawNiche = (raw as Record<string, unknown> | null)?.niche;
  const rawAngleId = (raw as Record<string, unknown> | null)?.analysisAngleId ?? (raw as Record<string, unknown> | null)?.analysis_angle_id;
  const rawAngle = (raw as Record<string, unknown> | null)?.analysisAngle ?? (raw as Record<string, unknown> | null)?.analysis_angle;
  const rawLength = (raw as Record<string, unknown> | null)?.articleLength ?? (raw as Record<string, unknown> | null)?.article_length;
  const rawTrigger = (raw as Record<string, unknown> | null)?.emotionalTrigger ?? (raw as Record<string, unknown> | null)?.emotional_trigger;
  const rawIntensity = (raw as Record<string, unknown> | null)?.emotionalIntensity ?? (raw as Record<string, unknown> | null)?.emotional_intensity;
  const rawRisk = (raw as Record<string, unknown> | null)?.riskLevel ?? (raw as Record<string, unknown> | null)?.risk_level;
  const rawReview = (raw as Record<string, unknown> | null)?.requiresHumanReview ?? (raw as Record<string, unknown> | null)?.requires_human_review;
  const rawSummary = (raw as Record<string, unknown> | null)?.reasoningSummary ?? (raw as Record<string, unknown> | null)?.reasoning_summary;
  const rawNotes = (raw as Record<string, unknown> | null)?.diversityNotes ?? (raw as Record<string, unknown> | null)?.diversity_notes;
  const rawAddendum = (raw as Record<string, unknown> | null)?.promptAddendum ?? (raw as Record<string, unknown> | null)?.prompt_addendum;

  const niche = normalizeNiche(rawNiche || fallback.niche, content);
  const defaultAngle = defaultAngleFor(niche, content);
  const analysisAngleId = includesValue(EDITORIAL_ANGLE_IDS, rawAngleId) ? rawAngleId : defaultAngle.id;
  const analysisAngle = normalizeText(rawAngle) || defaultAngle.text;
  const articleLength = normalizeArticleLength(rawLength || fallback.articleLength);
  let emotionalTrigger = includesValue(EDITORIAL_TRIGGERS, rawTrigger) ? rawTrigger : fallback.emotionalTrigger;
  if (sensitive && ["humor", "sarcasm", "satire", "happiness", "celebration"].includes(emotionalTrigger)) emotionalTrigger = "serious";
  const emotionalIntensity = ["low", "medium", "high"].includes(String(rawIntensity)) ? String(rawIntensity) as EditorialDecision["emotionalIntensity"] : fallback.emotionalIntensity;
  const riskLevel = ["low", "medium", "high", "critical"].includes(String(rawRisk)) ? String(rawRisk) as EditorialRisk : fallback.riskLevel;
  const keyword = normalizeText((raw as Record<string, unknown> | null)?.keyword) || fallback.keyword;
  const tone = normalizeText((raw as Record<string, unknown> | null)?.tone) || fallback.tone;
  const confidence = clamp((raw as Record<string, unknown> | null)?.confidence, 0, 100, fallback.confidence);
  const requiresHumanReview = Boolean(rawReview) || riskLevel === "high" || riskLevel === "critical";
  const diversityNotes = Array.isArray(rawNotes) ? rawNotes.map(normalizeText).filter(Boolean).slice(0, 6) : fallback.diversityNotes;

  return {
    niche,
    analysisAngleId,
    analysisAngle: analysisAngle.slice(0, 600),
    articleLength,
    emotionalTrigger,
    emotionalIntensity,
    keyword: keyword.slice(0, 160),
    tone: tone.slice(0, 300),
    riskLevel,
    requiresHumanReview,
    confidence,
    reasoningSummary: (normalizeText(rawSummary) || fallback.reasoningSummary).slice(0, 280),
    diversityNotes,
    promptAddendum: (normalizeText(rawAddendum) || fallback.promptAddendum).slice(0, 1200),
    selectionSource: source,
  };
}
