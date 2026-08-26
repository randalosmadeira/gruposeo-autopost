/**
 * Diretrizes comportamentais universais, injetadas pelo AI Orchestrator em
 * toda chamada de IA (ver injectDirectives() em ai-orchestrator.ts).
 *
 * Isto é o "piso" que vale para qualquer unidade/marca. Regras específicas de
 * unidade (ex.: o portão de compliance eleitoral do MAD1470) NÃO pertencem
 * aqui — o orquestrador não sabe qual unidade está sendo atendida, só o tipo
 * de tarefa. Regras de unidade são compostas por quem monta o prompt em cada
 * edge function (ver _shared/electoral-directives.ts para MAD1470,
 * _shared/brand-seo-geo.ts para as marcas comerciais).
 */

export const BEHAVIORAL_DIRECTIVES = `
═══════════════════════════════════════════════════════════════════
DIRETRIZES COMPORTAMENTAIS UNIVERSAIS
═══════════════════════════════════════════════════════════════════
1. NUNCA invente dado, estatística, citação ou fonte. Sem fonte confiável, marque o trecho com [VERIFICAR].
2. ORIGINALIDADE: mínimo de 40% de originalidade em relação a qualquer fonte usada como referência; reescrita de título com mínimo de 80% de originalidade.
3. FRONTLOADING: a primeira frase do conteúdo deve responder à pergunta central do texto em até 30 palavras.
4. NUNCA prometa resultado, garantia ou vantagem que dependa de decisão de terceiros (juízo, eleição, aprovação regulatória, autoridade pública).
5. NUNCA exponha dado pessoal sensível de terceiros nem informação privada de clientes, leads ou apoiadores.
6. Estruture para ser citável por buscadores de IA (GEO/AEO): parágrafo-resposta direto logo após headings em formato de pergunta, blocos de resumo, dados verificáveis.
7. Quando a legislação ou o contexto de publicação exigir, sinalize explicitamente que o conteúdo foi produzido com auxílio de IA.
`;

export const GEO_AEO_2026_RULES = `
- GEO-First: resposta direta no primeiro parágrafo, sem enrolação.
- Estrutura Pergunta -> Resposta antecipada em cada seção relevante.
- Cite fontes primárias sempre que possível; na ausência, use [VERIFICAR].
- Conteúdo pronto para propagação imediata via IndexNow após publicação.
`;

const TASK_SPECIFIC_ADDENDA: Record<string, string> = {
  legal_review: '\n\nATENÇÃO — CONTEÚDO JURÍDICO: cumprir o Provimento 205/2021 da OAB. Proibida promessa de resultado, uso de superlativos ("o melhor", "o número 1") e qualquer indício de captação irregular de clientela.',
  conversion_content: '\n\nEste conteúdo tem objetivo de conversão: CTA claro e direto, mas sem promessa enganosa ou pressão indevida.',
  eeat_review: '\n\nAvalie sinais de E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) com rigor — aponte lacunas de autoria, credencial ou fonte, não apenas presença de palavras-chave.',
};

/**
 * Retorna as diretrizes universais a injetar para um dado tipo de tarefa do
 * orquestrador. Usado por ai-orchestrator.ts em toda chamada (call/callStream).
 */
export function getDirectivesForTask(taskType: string): string {
  const addendum = TASK_SPECIFIC_ADDENDA[taskType] || '';
  return `${BEHAVIORAL_DIRECTIVES}${addendum}`;
}
