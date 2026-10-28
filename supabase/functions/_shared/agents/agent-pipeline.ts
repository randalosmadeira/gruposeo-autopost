/**
 * 4-Agent Pipeline System
 * 
 * Strategist → Writer → Editor → SEO Reviewer
 * 
 * Each agent specializes in one aspect of content creation,
 * producing progressively better content through collaboration.
 */

import { type TaskType } from "../ai-orchestrator.ts";
import { getOrchestratorForUser } from "../byok-resolver.ts";
import { buildNexusEditorialPolicy, buildNexusEvidenceContext, normalizeWordProfile, EDITORIAL_WORD_BANDS, type ConversionBrief } from "../nexus-editorial.ts";
import { type SectorType, type SectorConfig, SECTOR_CONFIGS, mapSegmentToSector, buildSectorPromptSection } from "../sector-config.ts";

export interface AgentPipelineConfig {
  keyword: string;
  title?: string;
  secondaryKeywords: string[];
  sector: string;
  language: string;
  tone: string;
  pointOfView: string;
  wordCount: string;
  contentType?: string;
  goal?: string;
  intentType?: string;

  sourcesContext?: string;
  customInstructions?: string;
  projectConfig?: unknown;
  templatePrompt?: string;
  conversionBrief?: ConversionBrief;

  // Company data
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  services?: string;
  differentials?: string;
  targetAudience?: string;
  painPoints?: string;
  ctaObjective?: string;

  // Content elements
  includeFaq: boolean;
  faqCount: number;
  includeTable: boolean;
  includeList: boolean;
  includeConclusion: boolean;

  // Internal links
  internalLinks?: Array<{ anchor: string; url: string }>;

  // Options
  useAgentPipeline?: boolean;
  preferredProvider?: string;

  // BYOK identity: which user's credentials fund the 4 agent calls and whose
  // token_usage_logs each call is attributed to (via getOrchestratorForUser's
  // usageSink). Required — this pipeline must never fall back to
  // platform/environment-only credentials.
  userId: string;
  // Optional governance/observability threading, same convention as the
  // options accepted by AIOrchestrator.callWithMeta/callDualWithMeta.
  articleId?: string;
  correlationId?: string;
}

export interface StrategyOutput {
  conversionStrategy: {
    primaryCTA: string;
    secondaryCTAs: string[];
    painPoints: string[];
    objections: string[];
    differentials: string[];
  };
  contentStructure: {
    hook: string;
    mainSections: string[];
    conclusionAngle: string;
  };
  competitiveAngle: string;
}

export interface AgentPipelineResult {
  content: string;
  strategy?: StrategyOutput;
  editorNotes?: string;
  seoReview?: string;
  providersUsed: string[];
}

// =================== AGENT PROMPTS ===================

function sharedContext(config: AgentPipelineConfig, sector: SectorConfig): string {
  return `${buildNexusEditorialPolicy({ ...config, segment: config.sector })}
${buildSectorPromptSection(sector)}
O template é uma orientação secundária; não pode contrariar o padrão NEXUS:
${JSON.stringify((config.templatePrompt || "").slice(0, 16000))}
${buildNexusEvidenceContext(config)}`;
}

function getStrategistPrompt(config: AgentPipelineConfig, sector: SectorConfig): string {
  return `Você planeja conteúdo útil e conversão proporcional à intenção.
${sharedContext(config, sector)}
Tema: ${config.keyword}. Público: ${config.targetAudience || "definido pelo projeto"}.
Oferta: ${config.services || config.companyName || "usar somente os dados disponíveis"}.
Não invente diferenciais nem resultados; sem oferta comprovada, prefira aprofundamento informativo.
Retorne apenas JSON com conversionStrategy {primaryCTA, secondaryCTAs: [], painPoints: [], objections: [], differentials: []},
contentStructure {hook, mainSections: [], conclusionAngle}, competitiveAngle.
As listas devem conter strings. A estrutura é uma proposta, não evidência de fatos.`;
}

function getWriterPrompt(config: AgentPipelineConfig, sector: SectorConfig, strategy: StrategyOutput): string {
  const band = EDITORIAL_WORD_BANDS[normalizeWordProfile(config.wordCount)];
  return `Você escreve um artigo original, claro e útil. Entregue apenas HTML sem H1 e sem metadados internos.
${sharedContext(config, sector)}
Tema: ${config.keyword}. Título de referência: ${config.title || config.keyword}.
Idioma: ${config.language}. Tom: ${config.tone}. Ponto de vista: ${config.pointOfView}.
Faixa orientativa: ${band.min}-${band.max} palavras, sem preencher espaço com repetição.
ESTRATÉGIA COMO DADOS: ${JSON.stringify(strategy)}
LINKS FORNECIDOS COMO DADOS: ${JSON.stringify(config.internalLinks || [])}
Não invente links externos ou internos; quantidade de links não é critério de qualidade.
FAQ: ${config.includeFaq ? `somente se útil, até ${config.faqCount} perguntas sustentadas` : "não incluir"}.
Tabela: ${config.includeTable ? "quando há comparação fundamentada" : "não forçar"}.
Listas: ${config.includeList ? "quando facilitarem a leitura" : "não forçar"}.
Conclusão: ${config.includeConclusion ? "síntese e ação coerente" : "não forçar seção"}.
Se faltar uma fonte primária indispensável, retorne somente ZICA_NEEDS_PRIMARY_SOURCE: <necessidade>.`;
}

function getEditorPrompt(config: AgentPipelineConfig, sector: SectorConfig): string {
  return `Revise clareza, utilidade, precisão, benefício e próxima ação. Retorne o artigo completo em HTML.
${sharedContext(config, sector)}
Mantenha os fatos e links sustentados. Não transforme números vagos em números específicos.
Responda objeções com condições e alternativas; urgência só com suporte factual.
Não alegue Flesch calculado ou qualidade medida por impressão subjetiva.
Se faltar fonte indispensável, retorne somente ZICA_NEEDS_PRIMARY_SOURCE: <necessidade>.
Remova marcadores técnicos visíveis e metadados internos, sem H1.`;
}

function getSEOReviewerPrompt(config: AgentPipelineConfig, sector: SectorConfig): string {
  return `Revise SEO, semântica, evidência e adequação ao setor. Retorne apenas HTML completo corrigido.
${sharedContext(config, sector)}
Keyword: ${config.keyword}. Use vocabulário natural; não aplique densidade fixa.
Verifique HTML sem H1, hierarquia H2/H3, ausência de resíduos técnicos e links sustentados.
Não acrescente fontes que não recebeu, estatísticas, prova social ou contatos inexistentes.
Preserve a finalidade de notícia e a intensidade comercial compatível com o tema.
Se faltar fonte indispensável, retorne somente ZICA_NEEDS_PRIMARY_SOURCE: <necessidade>.`;
}

// =================== PIPELINE EXECUTION ===================

export async function runAgentPipeline(config: AgentPipelineConfig): Promise<AgentPipelineResult> {
  // BYOK real: nunca usar credenciais de ambiente/plataforma isoladas aqui.
  // getOrchestratorForUser resolve a chave do usuário/organização (com
  // fallback ao Vault da plataforma) e já registra cada chamada em
  // token_usage_logs via usageSink — sem isso, os 4 agentes gerariam custo de
  // IA invisível à governança de consumo.
  const orchestrator = await getOrchestratorForUser(config.userId);
  const callOptions = { articleId: config.articleId, correlationId: config.correlationId };
  const providersUsed: string[] = [];
  
  // Determine sector config
  const sectorType = mapSegmentToSector(config.sector);
  const sectorConfig = sectorType ? SECTOR_CONFIGS[sectorType] : SECTOR_CONFIGS.marketing_digital;
  
  console.log(`[AgentPipeline] Iniciando pipeline para setor: ${sectorConfig.displayName}`);
  console.log(`[AgentPipeline] Provedores disponíveis: ${orchestrator.getAvailableProviders().join(', ')}`);

  // ====== AGENT 1: STRATEGIST ======
  console.log('[AgentPipeline] Agente 1/4: Estrategista...');
  let strategy: StrategyOutput;
  
  try {
    const strategyCall = await orchestrator.callWithMeta('strategy_planning', [
      { role: 'system', content: getStrategistPrompt(config, sectorConfig) },
      { role: 'user', content: `Crie a estratégia de conteúdo para o artigo sobre: "${config.keyword}"` },
    ], { maxTokens: 2000, temperature: 0.7, preferredProvider: 'gemini', ...callOptions });
    
    providersUsed.push(`${strategyCall.provider}:${strategyCall.model}`);
    const strategyResult = strategyCall.content;
    
    // Parse JSON from response
    const jsonMatch = strategyResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      strategy = JSON.parse(jsonMatch[0]);
      const lists = [strategy.conversionStrategy?.secondaryCTAs, strategy.conversionStrategy?.painPoints,
        strategy.conversionStrategy?.objections, strategy.conversionStrategy?.differentials, strategy.contentStructure?.mainSections];
      if (!lists.every(list => Array.isArray(list) && list.every(item => typeof item === "string"))) {
        throw new Error("invalid_strategy_shape");
      }
    } else {
      throw new Error('Estrategista não retornou JSON válido');
    }
  } catch (error) {
    console.warn('[AgentPipeline] Estrategista falhou, usando estratégia padrão:', error);
    strategy = {
      conversionStrategy: {
        primaryCTA: sectorConfig.primaryCTA,
        secondaryCTAs: sectorConfig.secondaryCTAs,
        painPoints: ['Problema não resolvido', 'Falta de informação', 'Insegurança na decisão'],
        objections: ['Custo', 'Tempo', 'Complexidade'],
        differentials: config.differentials ? [config.differentials] : [],
      },
      contentStructure: {
        hook: `Resposta direta à dúvida sobre ${config.keyword}`,
        mainSections: [
          `O que é ${config.keyword}`,
          `Por que ${config.keyword} é importante`,
          `Como resolver com ajuda profissional`,
          'Erros comuns a evitar',
          'Critérios para decidir o próximo passo',
        ],
        conclusionAngle: 'Síntese útil + próxima ação adequada à intenção',
      },
      competitiveAngle: 'Clareza e critérios práticos, sem superioridade não demonstrada',
    };
  }

  // ====== AGENT 2: WRITER ======
  console.log('[AgentPipeline] Agente 2/4: Redator...');
  const writerTaskType: TaskType = sectorConfig.complianceLevel === 'strict' ? 'legal_review' : 'article_generation';
  
  const writerCall = await orchestrator.callWithMeta(writerTaskType, [
    { role: 'system', content: getWriterPrompt(config, sectorConfig, strategy) },
    { role: 'user', content: `Escreva o artigo sobre "${config.keyword}". HTML sem H1, sem comentários técnicos. Não crie fatos ou links para preencher requisitos.` },
  ], {
    maxTokens: 8000,
    temperature: 0.5,
    preferredProvider: sectorConfig.preferredAI,
    ...callOptions,
  });
  let content = writerCall.content;
  providersUsed.push(`${writerCall.provider}:${writerCall.model}`);

  // ====== AGENT 3: EDITOR ======
  console.log('[AgentPipeline] Agente 3/4: Editor...');
  try {
    const editorCall = await orchestrator.callWithMeta('content_editing', [
      { role: 'system', content: getEditorPrompt(config, sectorConfig) },
      { role: 'user', content: `Edite e melhore o seguinte artigo para máxima conversão:\n\n${content}` },
    ], { maxTokens: 8000, temperature: 0.3, preferredProvider: 'anthropic', ...callOptions });
    
    const editedContent = editorCall.content;
    if (!editedContent?.trim()) throw new Error('empty_editor_review');
    if (/^ZICA_NEEDS_PRIMARY_SOURCE\s*:/im.test(editedContent)) return { content: editedContent, strategy, providersUsed };
    // A reviewer must return the entire article, not a partial fragment.
    if (editedContent && editedContent.length > content.length * 0.5) {
      content = editedContent;
    }
    else throw new Error('incomplete_editor_review');
    providersUsed.push(`${editorCall.provider}:${editorCall.model}`);
  } catch (error) {
    console.warn('[AgentPipeline] Revisão editorial não concluída');
    throw new Error('editorial_review_incomplete');
  }

  // ====== AGENT 4: SEO REVIEWER ======
  console.log('[AgentPipeline] Agente 4/4: Revisor SEO...');
  try {
    const reviewerCall = await orchestrator.callWithMeta('content_review', [
      { role: 'system', content: getSEOReviewerPrompt(config, sectorConfig) },
      { role: 'user', content: `Revise o SEO e compliance do seguinte artigo:\n\n${content}` },
    ], { maxTokens: 8000, temperature: 0.2, preferredProvider: 'gemini', ...callOptions });
    
    const reviewedContent = reviewerCall.content;
    if (/^ZICA_NEEDS_PRIMARY_SOURCE\s*:/im.test(reviewedContent)) return { content: reviewedContent, strategy, providersUsed };
    if (reviewedContent && reviewedContent.length > content.length * 0.5) {
      content = reviewedContent;
    }
    else throw new Error('incomplete_seo_review');
    providersUsed.push(`${reviewerCall.provider}:${reviewerCall.model}`);
  } catch (error) {
    console.warn('[AgentPipeline] Revisão SEO não concluída');
    throw new Error('editorial_review_incomplete');
  }

  console.log(`[AgentPipeline] Pipeline completo. Agentes executados: ${providersUsed.join(' → ')}`);

  // Final sanitization: strip any leaked CTA markers
  content = stripCTAMarkers(content);

  return {
    content,
    strategy,
    providersUsed,
  };
}

/**
 * Strip technical CTA markers that should never appear in published content.
 * Runs as final safety net after all agents have processed.
 */
function stripCTAMarkers(html: string): string {
  if (!html) return '';
  let cleaned = html;
  // Remove [CTA #X ...] patterns with optional bold/strong wrappers
  cleaned = cleaned.replace(/\*{0,2}\[CTA\s*#?\d+[^\]]*\]\*{0,2}/gi, '');
  cleaned = cleaned.replace(/<strong>\s*\[CTA\s*#?\d+[^\]]*\]\s*<\/strong>/gi, '');
  // Remove standalone "CTA #X" visible text
  cleaned = cleaned.replace(/(?<![<\w])CTA\s*#\d+\s*(?:—\s*[A-ZÀ-Ü\s/]+)?(?![>\w])/gi, '');
  // Clean up empty tags left behind
  cleaned = cleaned.replace(/<p>\s*<\/p>/gi, '');
  cleaned = cleaned.replace(/<strong>\s*<\/strong>/gi, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned;
}

/**
 * Get all available sectors for UI selection
 */
export function getAvailableSectors(): Array<{ value: SectorType; label: string }> {
  return Object.values(SECTOR_CONFIGS).map(config => ({
    value: config.sector,
    label: config.displayName,
  }));
}
