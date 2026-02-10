/**
 * 4-Agent Pipeline System
 * 
 * Strategist → Writer → Editor → SEO Reviewer
 * 
 * Each agent specializes in one aspect of content creation,
 * producing progressively better content through collaboration.
 */

import { AIOrchestrator, getOrchestrator, type AIMessage, type TaskType } from "../ai-orchestrator.ts";
import { type SectorConfig, SECTOR_CONFIGS, mapSegmentToSector, buildSectorPromptSection } from "../sector-config.ts";

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

function getStrategistPrompt(config: AgentPipelineConfig, sectorConfig: SectorConfig): string {
  return `Você é um ESTRATEGISTA DE CONTEÚDO COMERCIAL especializado em converter leitores em leads.

SUA MISSÃO:
Analisar a keyword e o setor para criar uma estratégia de conteúdo que:
1. VENDA o serviço de forma consultiva (não agressiva)
2. EDUQUE enquanto posiciona a empresa como autoridade
3. REMOVA OBJEÇÕES antes que o leitor as tenha
4. GUIE para a CONVERSÃO de forma natural

ENTRADAS:
- Keyword: "${config.keyword}"
- Setor: ${sectorConfig.displayName} (${sectorConfig.sector})
- Compliance: ${sectorConfig.complianceBody || 'N/A'} (${sectorConfig.complianceLevel})
${config.companyName ? `- Empresa: ${config.companyName}` : ''}
${config.differentials ? `- Diferenciais: ${config.differentials}` : ''}
${config.targetAudience ? `- Público-alvo: ${config.targetAudience}` : ''}

CTAs APROVADOS para este setor:
- "${sectorConfig.primaryCTA}"
${sectorConfig.secondaryCTAs.map(c => `- "${c}"`).join('\n')}

PALAVRAS PROIBIDAS: ${sectorConfig.forbiddenWords.join(', ')}

SAÍDA (JSON):
{
  "conversionStrategy": {
    "primaryCTA": "CTA principal alinhado ao setor",
    "secondaryCTAs": ["CTA alternativo 1", "CTA alternativo 2"],
    "painPoints": ["Dor 1 do público", "Dor 2", "Dor 3"],
    "objections": ["Objeção comum 1", "Objeção 2"],
    "differentials": ["Diferencial 1", "Diferencial 2"]
  },
  "contentStructure": {
    "hook": "Gancho inicial que prende atenção",
    "mainSections": ["Seção que aborda dor X", "Seção que mostra solução Y"],
    "conclusionAngle": "Ângulo de fechamento para conversão"
  },
  "competitiveAngle": "O que diferencia este conteúdo dos concorrentes"
}

Retorne APENAS o JSON, sem explicações adicionais.`;
}

function getWriterPrompt(config: AgentPipelineConfig, sectorConfig: SectorConfig, strategy: StrategyOutput): string {
  const wordRanges: Record<string, { min: number; max: number }> = {
    short: { min: 600, max: 1000 }, medium: { min: 1200, max: 1800 },
    long: { min: 2200, max: 2800 }, 'very-long': { min: 3500, max: 4500 },
    muito_pequeno: { min: 600, max: 1200 }, pequeno: { min: 1200, max: 2400 },
    medio: { min: 2400, max: 3600 }, grande: { min: 2600, max: 5200 },
  };
  const wordRange = wordRanges[config.wordCount] || wordRanges.medium;
  
  const povMap: Record<string, string> = {
    nos: 'primeira pessoa do plural (nós)', voce: 'segunda pessoa (você)',
    ele: 'terceira pessoa', primeira: 'primeira pessoa (eu)',
    segunda: 'segunda pessoa (você)', terceira: 'terceira pessoa',
  };
  const pov = povMap[config.pointOfView] || 'segunda pessoa (você)';

  return `Você é um REDATOR COMERCIAL ESPECIALISTA que escreve para VENDER SEM PARECER VENDEDOR.

FILOSOFIA DE ESCRITA:
- Cada parágrafo deve ter um PROPÓSITO de conversão
- Use a técnica AIDA: Atenção → Interesse → Desejo → Ação
- Inclua PROVA SOCIAL em cada seção (números, cases, estatísticas)
- REMOVA OBJEÇÕES antes que o leitor as pense
- CTAs distribuídos naturalmente, não apenas no final

ESPECIFICAÇÕES:
- Keyword: "${config.keyword}"
- Setor: ${sectorConfig.displayName}
- Tom: ${config.tone}
- Ponto de vista: ${pov}
- Idioma: ${config.language}
- Extensão: ${wordRange.min}-${wordRange.max} palavras

${buildSectorPromptSection(sectorConfig)}

ESTRATÉGIA DE CONTEÚDO (definida pelo Estrategista):
- Hook: ${strategy.contentStructure.hook}
- Seções: ${strategy.contentStructure.mainSections.join(' | ')}
- Fechamento: ${strategy.contentStructure.conclusionAngle}
- CTA Principal: ${strategy.conversionStrategy.primaryCTA}
- Dores do público: ${strategy.conversionStrategy.painPoints.join(', ')}
- Objeções a remover: ${strategy.conversionStrategy.objections.join(', ')}
- Ângulo competitivo: ${strategy.competitiveAngle}

${config.internalLinks && config.internalLinks.length > 0 ? `
LINKS INTERNOS OBRIGATÓRIOS:
${config.internalLinks.map((l, i) => `${i + 1}. Anchor: "${l.anchor}" → URL: ${l.url}`).join('\n')}
Todos com target="_blank" rel="noopener noreferrer"
` : ''}

ESTRUTURA OBRIGATÓRIA:
1. <!-- META_DESCRIPTION: [máx 160 chars] -->
2. <!-- TITLE_SEO: [máx 60 chars] -->
3. <h1>Título</h1>
4. ABERTURA (2 parágrafos): Gancho emocional/estatística + validação
5. DESENVOLVIMENTO: 5-7 H2, cada um resolvendo UMA dor
6. Micro-CTAs após cada seção
${config.includeFaq ? `7. FAQ com ${config.faqCount} perguntas` : ''}
${config.includeTable ? '8. Pelo menos uma tabela comparativa' : ''}
${config.includeConclusion ? '9. Conclusão com resumo + CTA principal' : ''}

PROIBIÇÕES:
- Começar com "Neste artigo vamos falar sobre..."
- Parágrafos maiores que 4 linhas
- Seções sem propósito de conversão
- CTAs genéricos ("Entre em contato")

FORMATO: HTML semântico puro (sem markdown, sem backticks).
Tags permitidas: <p>, <h2>, <h3>, <h4>, <ul>, <ol>, <li>, <strong>, <em>, <a>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <blockquote>

Escreva o artigo completo agora:`;
}

function getEditorPrompt(): string {
  return `Você é um EDITOR DE CONVERSÃO que transforma textos bons em textos que VENDEM.

SUA MISSÃO:
1. INTENSIFICAR a conexão emocional
2. SIMPLIFICAR linguagem complexa
3. FORTALECER CTAs
4. ADICIONAR urgência ética
5. MELHORAR o fluxo de leitura

CHECKLIST DE EDIÇÃO:

## Abertura
- O primeiro parágrafo prende atenção em 5 segundos?
- O leitor se identifica com o problema apresentado?
- Há promessa clara de valor?

## Corpo
- Cada seção resolve uma dor específica?
- Há prova social (números, cases) em cada seção?
- Os parágrafos têm no máximo 3-4 linhas?
- Há transições suaves entre seções?

## Persuasão
- Objeções foram antecipadas e removidas?
- Benefícios estão acima de features?
- Há escassez ou urgência ética?
- CTAs são específicos e acionáveis?

## Fechamento
- Resumo reforça a transformação prometida?
- CTA final é impossível de ignorar?
- Há múltiplas formas de contato?

TÉCNICAS DE MELHORIA:
- Features → Benefícios: "Sistema 24h" → "Resolva seu problema a qualquer hora"
- Números vagos → Específicos: "muitos clientes" → "mais de 500 clientes em 3 anos"
- Voz passiva → Ativa
- Parágrafos longos → Quebrados

IMPORTANTE: Retorne o artigo COMPLETO editado em HTML. Mantenha a estrutura, melhore a persuasão.
NÃO adicione comentários sobre as mudanças. Retorne APENAS o HTML editado.`;
}

function getSEOReviewerPrompt(keyword: string, sectorConfig: SectorConfig): string {
  return `Você é um REVISOR DE QUALIDADE SEO E COMPLIANCE para o setor ${sectorConfig.displayName}.

CHECKLIST TÉCNICO SEO:

## Keyword "${keyword}"
- Keyword principal no H1? (OBRIGATÓRIO)
- Keyword nos primeiros 100 palavras? (OBRIGATÓRIO)
- Densidade entre 1-2%?
- Keywords secundárias distribuídas?

## Estrutura
- Apenas 1 H1?
- Hierarquia correta (H2 > H3)?
- Meta description com keyword e CTA? (máx 160 chars)
- TITLE_SEO com keyword? (máx 60 chars)
- Links internos inseridos naturalmente?
- Todos os links com target="_blank" rel="noopener noreferrer"?

## Legibilidade
- Parágrafos curtos (máx 4 linhas)?
- Uso adequado de bullet points?
- FAQ com respostas diretas?

## COMPLIANCE ${sectorConfig.complianceBody || 'GERAL'}
${sectorConfig.forbiddenWords.map(w => `- NÃO contém "${w}"?`).join('\n')}
${sectorConfig.requiredDisclaimer ? `- Disclaimer presente: "${sectorConfig.requiredDisclaimer}"` : ''}

INSTRUÇÕES:
1. Revise o artigo fornecido
2. Corrija problemas encontrados
3. Retorne o artigo CORRIGIDO em HTML completo
4. NÃO adicione comentários. Retorne APENAS o HTML corrigido.`;
}

// =================== PIPELINE EXECUTION ===================

export async function runAgentPipeline(config: AgentPipelineConfig): Promise<AgentPipelineResult> {
  const orchestrator = getOrchestrator();
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
    const strategyResult = await orchestrator.call('strategy_planning', [
      { role: 'system', content: getStrategistPrompt(config, sectorConfig) },
      { role: 'user', content: `Crie a estratégia de conteúdo para o artigo sobre: "${config.keyword}"` },
    ], { maxTokens: 2000, temperature: 0.7, preferredProvider: 'gemini' });
    
    providersUsed.push('strategist');
    
    // Parse JSON from response
    const jsonMatch = strategyResult.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      strategy = JSON.parse(jsonMatch[0]);
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
        differentials: [config.differentials || 'Experiência e especialização'],
      },
      contentStructure: {
        hook: `Estatística impactante sobre ${config.keyword}`,
        mainSections: [
          `O que é ${config.keyword}`,
          `Por que ${config.keyword} é importante`,
          `Como resolver com ajuda profissional`,
          'Erros comuns a evitar',
          'Por que nos escolher',
        ],
        conclusionAngle: 'Resumo + urgência ética + CTA',
      },
      competitiveAngle: 'Conteúdo mais prático e consultivo que os concorrentes',
    };
  }

  // ====== AGENT 2: WRITER ======
  console.log('[AgentPipeline] Agente 2/4: Redator...');
  const writerTaskType: TaskType = sectorConfig.complianceLevel === 'strict' ? 'legal_review' : 'article_generation';
  
  let content = await orchestrator.call(writerTaskType, [
    { role: 'system', content: getWriterPrompt(config, sectorConfig, strategy) },
    { role: 'user', content: `Escreva o artigo completo sobre "${config.keyword}" seguindo a estratégia definida. HTML puro, sem backticks.` },
  ], { 
    maxTokens: 8000, 
    temperature: 0.7,
    preferredProvider: sectorConfig.preferredAI,
  });
  providersUsed.push('writer');

  // ====== AGENT 3: EDITOR ======
  console.log('[AgentPipeline] Agente 3/4: Editor...');
  try {
    const editedContent = await orchestrator.call('content_editing', [
      { role: 'system', content: getEditorPrompt() },
      { role: 'user', content: `Edite e melhore o seguinte artigo para máxima conversão:\n\n${content}` },
    ], { maxTokens: 8000, temperature: 0.3, preferredProvider: 'anthropic' });
    
    // Only use edited content if it's substantial
    if (editedContent && editedContent.length > content.length * 0.5) {
      content = editedContent;
    }
    providersUsed.push('editor');
  } catch (error) {
    console.warn('[AgentPipeline] Editor falhou, mantendo versão do redator:', error);
  }

  // ====== AGENT 4: SEO REVIEWER ======
  console.log('[AgentPipeline] Agente 4/4: Revisor SEO...');
  try {
    const reviewedContent = await orchestrator.call('content_review', [
      { role: 'system', content: getSEOReviewerPrompt(config.keyword, sectorConfig) },
      { role: 'user', content: `Revise o SEO e compliance do seguinte artigo:\n\n${content}` },
    ], { maxTokens: 8000, temperature: 0.2, preferredProvider: 'gemini' });
    
    if (reviewedContent && reviewedContent.length > content.length * 0.5) {
      content = reviewedContent;
    }
    providersUsed.push('seo_reviewer');
  } catch (error) {
    console.warn('[AgentPipeline] Revisor SEO falhou, mantendo versão do editor:', error);
  }

  console.log(`[AgentPipeline] Pipeline completo. Agentes executados: ${providersUsed.join(' → ')}`);

  return {
    content,
    strategy,
    providersUsed,
  };
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
