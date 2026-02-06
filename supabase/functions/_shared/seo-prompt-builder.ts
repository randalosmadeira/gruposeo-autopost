// Advanced SEO Prompt Builder - Modular System
// Based on comprehensive SEO analysis and E-E-A-T optimization

export interface PromptConfig {
  // Core fields
  title: string;
  keyword: string;
  secondaryKeywords: string[];
  language: string;
  currentYear: number;
  
  // Content specifications
  articleLength: 'short' | 'medium' | 'long' | 'very-long';
  tone: string;
  pointOfView: string;
  contentType: 'how-to' | 'listicle' | 'pillar' | 'comparative' | 'opinion' | 'news';
  segment: 'legal' | 'health' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'education' | 'general';
  goal: 'inform' | 'convert' | 'educate' | 'engage';
  intentType: 'informational' | 'navigational' | 'transactional' | 'commercial';
  
  // Content elements
  includeFaq: boolean;
  faqCount: number;
  includeTable: boolean;
  includeList: boolean;
  includeConclusion: boolean;
  includeMetaDescription: boolean;
  
  // Internal linking
  internalLinks?: Array<{ anchor: string; url: string }>;
  
  // External sources/context
  sourcesContext?: string;
  
  // Company data (for sales pages)
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  
  // Sales-specific
  targetAudience?: string;
  painPoints?: string;
  differentials?: string;
  ctaObjective?: string;
  additionalInfo?: string;
  
  // SEO options
  seoOptimization: boolean;
  humanizeContent: boolean;
  realtimeData: boolean;
}

const WORD_COUNT_RANGES = {
  short: { min: 600, max: 1000, target: 750 },
  medium: { min: 1200, max: 1800, target: 1500 },
  long: { min: 2200, max: 2800, target: 2500 },
  'very-long': { min: 3500, max: 4500, target: 4000 },
};

const POV_MAP: Record<string, string> = {
  'nos': 'primeira pessoa do plural (nós)',
  'primeira': 'primeira pessoa do singular (eu)',
  'voce': 'segunda pessoa (você)',
  'segunda': 'segunda pessoa (você)',
  'terceira': 'terceira pessoa (ele/ela)',
  'ele': 'terceira pessoa',
};

const INTENT_GUIDELINES: Record<string, string> = {
  informational: `
**Intenção Informacional**: Usuário quer aprender
- Use mais subtítulos H2/H3 para organização
- Inclua exemplos práticos e dados estatísticos
- Responda a dúvida principal nos primeiros 2 parágrafos
- Estruture com definições claras e explicações detalhadas`,
  
  navigational: `
**Intenção Navegacional**: Usuário busca marca/produto específico
- Foco em estabelecer autoridade e credibilidade
- Destaque diferenciais e pontos únicos
- Inclua informações de contato e próximos passos
- Use casos de uso e exemplos de aplicação`,
  
  transactional: `
**Intenção Transacional**: Usuário quer comprar/contratar
- CTAs estratégicos distribuídos ao longo do texto
- Comparações claras com alternativas
- Destaque benefícios sobre features
- Prova social (reviews, estatísticas, cases)`,
  
  commercial: `
**Intenção Comercial**: Usuário pesquisa antes de decidir
- Reviews detalhados e imparciais
- Prós e contras honestos
- Comparativos com concorrentes
- Critérios de escolha e recomendações`,
};

function getSegmentGuidelines(segment: string): string {
  const guidelines: Record<string, string> = {
    legal: `
## DIRETRIZES PARA SEGMENTO JURÍDICO

**Tom**: Formal, preciso, autoritativo (mas acessível ao leigo)

**Obrigatórios**:
- Cite legislação específica quando relevante (números de lei/artigo)
- Inclua disclaimer: "Este conteúdo tem caráter meramente informativo e não substitui consultoria jurídica especializada."
- Use exemplos de casos (anonimizados quando necessário)
- Mencione prazos legais e procedimentos passo a passo
- Evite jargão excessivo - explique termos técnicos

**IMPORTANTE - Conformidade OAB (Resolução 02/2015)**:
- NÃO use linguagem mercantilizante ou publicitária exagerada
- NÃO faça promessas de resultado ("garantimos vitória")
- NÃO mencione preços ou condições de pagamento detalhadas
- Foque em educação jurídica e orientação geral

**CTAs Apropriados**:
- "Consulte um advogado especializado para seu caso específico"
- "Agende uma consulta para análise detalhada"
- "Tire suas dúvidas com um profissional qualificado"`,

    health: `
## DIRETRIZES PARA SEGMENTO SAÚDE

**Tom**: Empático, científico, educativo

**Obrigatórios**:
- Cite fontes médicas confiáveis (OMS, Ministério da Saúde, journals revisados por pares)
- Inclua disclaimer: "Este conteúdo é informativo e NÃO substitui consulta médica. Sempre procure um profissional de saúde para diagnóstico e tratamento."
- Use dados estatísticos de saúde pública quando disponíveis
- Explique sintomas, diagnóstico e tratamentos de forma clara
- Evite diagnósticos diretos ou recomendações sem contexto médico

**IMPORTANTE**:
- NÃO recomende medicamentos específicos sem orientação médica
- NÃO faça diagnósticos ou prognósticos
- Sempre incentive a busca por atendimento profissional

**CTAs Apropriados**:
- "Agende sua consulta com um especialista"
- "Faça seu check-up preventivo"
- "Procure atendimento médico se apresentar esses sintomas"`,

    fintech: `
## DIRETRIZES PARA SEGMENTO FINTECH/FINANÇAS

**Tom**: Confiável, objetivo, educativo

**Obrigatórios**:
- Inclua dados de mercado e contexto econômico
- Faça comparações de taxas/produtos quando relevante
- Use simulações e exemplos práticos com números reais
- Inclua disclaimers de risco para investimentos
- Crie glossário de termos técnicos financeiros

**IMPORTANTE**:
- Mencione que rentabilidade passada não garante resultados futuros (quando aplicável)
- Destaque riscos junto com benefícios
- Seja transparente sobre custos e taxas

**CTAs Apropriados**:
- "Simule agora sem compromisso"
- "Compare as opções disponíveis"
- "Abra sua conta em poucos minutos"`,

    ecommerce: `
## DIRETRIZES PARA SEGMENTO E-COMMERCE

**Tom**: Persuasivo, prático, orientado a benefícios

**Obrigatórios**:
- Destaque benefícios sobre características técnicas
- Use comparativos de produtos em formato de tabela
- Inclua prova social (menções a reviews, estatísticas de vendas)
- Crie guias de compra com critérios claros
- Use listas para facilitar escaneamento

**IMPORTANTE**:
- Foque na resolução de problemas do cliente
- Destaque garantias e políticas de troca
- Mencione formas de pagamento e condições

**CTAs Apropriados**:
- "Ver produto" / "Conhecer detalhes"
- "Comprar agora" / "Adicionar ao carrinho"
- "Comparar opções"`,

    'b2b-saas': `
## DIRETRIZES PARA SEGMENTO B2B SaaS

**Tom**: Profissional, orientado a ROI, técnico (mas acessível)

**Obrigatórios**:
- Aborde pain points específicos do negócio
- Inclua dados de ROI e métricas de performance
- Use cases de uso e estudos de caso
- Mencione integrações e especificações técnicas
- Compare com soluções alternativas do mercado

**IMPORTANTE**:
- Foque em economia de tempo, redução de custos, aumento de eficiência
- Use linguagem que ressoe com decisores empresariais
- Destaque escalabilidade e segurança

**CTAs Apropriados**:
- "Solicite uma demonstração"
- "Teste grátis por X dias"
- "Fale com um consultor especializado"`,

    education: `
## DIRETRIZES PARA SEGMENTO EDUCAÇÃO

**Tom**: Inspirador, prático, didático

**Obrigatórios**:
- Crie roadmaps e metodologias claras
- Use exemplos práticos e exercícios quando possível
- Mostre progressão de aprendizado
- Destaque benefícios de carreira
- Inclua depoimentos de alunos (quando disponível)

**IMPORTANTE**:
- Torne o conteúdo acessível a diferentes níveis de conhecimento
- Use analogias e exemplos do dia a dia
- Quebre conceitos complexos em partes menores

**CTAs Apropriados**:
- "Inscreva-se agora"
- "Baixe o material gratuito"
- "Assista à aula experimental"`,

    general: `
## DIRETRIZES GERAIS

**Tom**: Adaptável ao assunto, sempre profissional e acessível

**Boas Práticas**:
- Responda à dúvida principal nos primeiros parágrafos
- Use exemplos concretos e dados quando disponíveis
- Estruture com subtítulos claros
- Mantenha parágrafos curtos (2-4 linhas)
- Use listas para informações sequenciais ou múltiplos itens`,
  };

  return guidelines[segment] || guidelines.general;
}

function getContentTypeGuidelines(contentType: string): string {
  const guidelines: Record<string, string> = {
    'how-to': `
**Tipo: Tutorial/How-To**
- Estruture como passo a passo numerado
- Cada etapa deve ser acionável e clara
- Inclua dicas e avisos importantes
- Adicione seção de "Erros comuns a evitar"`,

    'listicle': `
**Tipo: Listicle**
- Use números no título quando possível
- Cada item deve ter título + explicação
- Ordene por relevância ou cronologia
- Inclua resumo executivo no início`,

    'pillar': `
**Tipo: Conteúdo Pilar**
- Crie estrutura abrangente e aprofundada
- Use muitos subtítulos H2 e H3
- Inclua links internos para conteúdos relacionados
- Adicione índice/sumário no início
- Este deve ser o conteúdo mais completo sobre o tema`,

    'comparative': `
**Tipo: Comparativo**
- Crie tabela comparativa clara
- Destaque prós e contras de cada opção
- Seja imparcial e baseado em fatos
- Inclua recomendação contextualizada no final`,

    'opinion': `
**Tipo: Opinião/Análise**
- Deixe claro que é uma opinião fundamentada
- Apresente argumentos e evidências
- Reconheça pontos de vista alternativos
- Conclua com recomendação clara`,

    'news': `
**Tipo: Notícia/Atualidade**
- Estruture com pirâmide invertida (mais importante primeiro)
- Responda às 5 perguntas: O quê, Quem, Quando, Onde, Por quê
- Use citações quando disponíveis
- Contextualize a notícia no cenário maior`,
  };

  return guidelines[contentType] || '';
}

function buildEEATSection(): string {
  return `
## 🧠 E-E-A-T: DEMONSTRANDO EXPERIÊNCIA E AUTORIDADE

### Experience (Experiência):
- Use exemplos de primeira mão quando possível
- Inclua insights práticos que demonstrem conhecimento real
- Mencione cases e situações reais (anonimizados se necessário)

### Expertise (Perícia):
- Use terminologia técnica apropriada (mas explique quando necessário)
- Aprofunde em detalhes que demonstrem conhecimento especializado
- Cite dados e estatísticas de fontes confiáveis

### Authoritativeness (Autoridade):
- Mencione credenciais e experiência quando relevante
- Referencie fontes autoritativas e estudos
- Construa argumentos lógicos e bem fundamentados

### Trust (Confiança):
- Seja transparente sobre limitações do conteúdo
- Inclua disclaimers apropriados ao segmento
- Forneça informações verificáveis e atualizadas`;
}

function buildFeaturedSnippetOptimization(keyword: string, includeFaq: boolean, faqCount: number): string {
  let section = `
## 📈 OTIMIZAÇÃO PARA FEATURED SNIPPETS

### Para Definições (Posição Zero):
A primeira frase após um H2 principal deve ser uma definição direta:
- Formato: "${keyword} é [definição clara em 20-30 palavras]."

### Para Listas:
Quando usar listas numeradas ou com bullets:
- Comece com um H2 descritivo do tipo "X melhores formas de..." ou "Como fazer X em Y passos"
- Cada item deve ser conciso (1-2 linhas)
- Limite de 5-8 itens por lista`;

  if (includeFaq) {
    section += `

### Para FAQ (People Also Ask):
Crie seção de Perguntas Frequentes com ${faqCount} perguntas:
- Use formato pergunta-resposta direta
- Cada resposta deve ter 40-60 palavras
- Comece respostas com a informação mais importante
- Use as perguntas mais buscadas sobre o tema`;
  }

  return section;
}

function buildTechnicalRules(): string {
  return `
## 🚨 REGRAS TÉCNICAS RIGOROSAS

### HTML Semântico:
**PERMITIDO**: <p>, <h2>, <h3>, <h4>, <ul>, <ol>, <li>, <strong>, <em>, <a>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <blockquote>, <figure>, <figcaption>

**PROIBIDO**: <h1> (já existe externamente), <script>, <style>, <iframe>, inline styles

### Capitalização de Títulos:
✅ CORRETO: "Como escolher o melhor produto em 2026"
❌ ERRADO: "Como Escolher O Melhor Produto Em 2026"
Regra: Apenas primeira letra maiúscula (exceto nomes próprios, siglas, marcas)

### Atributos de Links:
TODOS os links devem ter: target="_blank" rel="noopener noreferrer"
Use anchor text descritivo (nunca "clique aqui")

### Formatação de Parágrafos:
- Máximo 4 linhas por parágrafo (mobile-first)
- Primeira frase: forte e declarativa
- Última frase: transição ou gancho para próxima seção
- Varie entre parágrafos curtos (2 linhas) e médios (4 linhas)

### Uso de Negrito:
- 1-2 por parágrafo em palavras-chave ou frases de impacto
- NÃO abuse - use estrategicamente`;
}

function buildHumanizationRules(): string {
  return `
## 🎭 HUMANIZAÇÃO DO CONTEÚDO

### Evite Linguagem de IA:
- NÃO use: "No mundo de hoje", "Em um mundo cada vez mais", "É importante ressaltar"
- NÃO use: "Neste artigo, vamos explorar", "Vamos mergulhar em"
- NÃO comece frases com "É" repetidamente
- NÃO use frases genéricas ou vazias

### Use Linguagem Natural:
- Escreva como um especialista explicando para um colega
- Varie estrutura das frases (curtas, médias, ocasionalmente longas)
- Use analogias e exemplos do dia a dia
- Inclua insights que só quem conhece o assunto teria

### Tom Conversacional (quando apropriado):
- Faça perguntas retóricas ocasionais
- Use "você" para criar conexão (se o POV permitir)
- Demonstre empatia com as dores do leitor`;
}

function buildInternalLinksSection(links?: Array<{ anchor: string; url: string }>): string {
  if (!links || links.length === 0) {
    return '';
  }

  return `
## 🔗 LINKS INTERNOS OBRIGATÓRIOS

Distribua os seguintes links NATURALMENTE ao longo do texto:
${links.map((link, i) => `${i + 1}. Anchor: "${link.anchor}" → URL: ${link.url}`).join('\n')}

**Regras de Linkagem**:
- Distribua uniformemente (não concentre em uma seção)
- Use o anchor text fornecido ou variação semântica próxima
- Contextualize o link de forma natural na frase
- Formato: <a href="URL" target="_blank" rel="noopener noreferrer">anchor</a>`;
}

function buildCompanySection(config: PromptConfig): string {
  if (!config.companyName && !config.companyPhone && !config.companyAddress) {
    return '';
  }

  return `
## 🏢 DADOS DA EMPRESA

${config.companyName ? `**Empresa**: ${config.companyName}` : ''}
${config.companyPhone ? `**Telefone/WhatsApp**: ${config.companyPhone}` : ''}
${config.companyAddress ? `**Endereço**: ${config.companyAddress}` : ''}

Incorpore esses dados naturalmente no conteúdo quando fizer sentido, especialmente em CTAs e seções de contato.`;
}

function buildSalesSection(config: PromptConfig): string {
  if (!config.targetAudience && !config.painPoints) {
    return '';
  }

  return `
## 🎯 CONFIGURAÇÃO DE VENDAS

${config.targetAudience ? `**Público-Alvo**: ${config.targetAudience}` : ''}
${config.painPoints ? `**Dor Principal do Cliente**: ${config.painPoints}` : ''}
${config.differentials ? `**Diferenciais da Oferta**: ${config.differentials}` : ''}
${config.ctaObjective ? `**Objetivo do CTA**: ${config.ctaObjective}` : ''}
${config.additionalInfo ? `**Informações Adicionais**: ${config.additionalInfo}` : ''}

Use essas informações para criar conteúdo persuasivo que:
1. Ressoe com as dores do público-alvo
2. Destaque os diferenciais de forma natural
3. Direcione para o objetivo do CTA`;
}

export function buildAdvancedSEOPrompt(config: PromptConfig): { system: string; user: string } {
  const wordRange = WORD_COUNT_RANGES[config.articleLength];
  const pov = POV_MAP[config.pointOfView.toLowerCase()] || 'segunda pessoa (você)';

  const systemPrompt = `# 📝 SISTEMA AVANÇADO DE GERAÇÃO DE ARTIGOS SEO

## 🎭 PERSONA E CONTEXTO
Você é um redator SEO sênior especializado em criar conteúdo que:
- Ranqueia na primeira página do Google
- Mantém usuários engajados (baixo bounce rate)
- Converte leitores em leads/clientes
- Demonstra E-E-A-T (Experience, Expertise, Authoritativeness, Trust)

## 📊 DADOS DO PROJETO
**Artigo:**
- Título Principal (H1): "${config.title || `Artigo sobre ${config.keyword}`}"
- Palavra-chave primária: "${config.keyword}"
${config.secondaryKeywords?.length > 0 ? `- Palavras-chave secundárias: ${config.secondaryKeywords.join(', ')}` : ''}
- Idioma: ${config.language || 'Português Brasileiro'}
- Ano Atual: ${config.currentYear}

**Especificações:**
- Tamanho Alvo: ${wordRange.min}-${wordRange.max} palavras (ideal: ~${wordRange.target})
- Tom de Voz: ${config.tone}
- Ponto de Vista: ${pov}
- Tipo de Conteúdo: ${config.contentType}
- Segmento: ${config.segment}
- Objetivo: ${config.goal}

## 🎯 ESTRATÉGIA DE CONTEÚDO

${INTENT_GUIDELINES[config.intentType] || INTENT_GUIDELINES.informational}

### Estratégia de Abertura (primeiros 150 palavras):
1. **Hook** - Uma frase impactante que prenda atenção
2. **Resposta Direta** - Responda à dúvida principal imediatamente (técnica BLUF)
3. **Promessa de Valor** - O que o leitor vai aprender/ganhar
4. **Credibilidade Sutil** - Dados ou contexto que gera confiança

${getSegmentGuidelines(config.segment)}

${getContentTypeGuidelines(config.contentType)}

${buildEEATSection()}

${buildFeaturedSnippetOptimization(config.keyword, config.includeFaq, config.faqCount)}

${buildInternalLinksSection(config.internalLinks)}

${buildCompanySection(config)}

${buildSalesSection(config)}

${config.humanizeContent ? buildHumanizationRules() : ''}

${buildTechnicalRules()}

## ✅ CHECKLIST DE QUALIDADE

Antes de finalizar, verifique:
- [ ] Palavra-chave primária aparece no primeiro parágrafo
- [ ] Todos os H2s têm variações semânticas da keyword
- [ ] Parágrafos com máximo 4 linhas
- [ ] Negrito usado estrategicamente (não em excesso)
- [ ] Tom adequado ao segmento ${config.segment}
- [ ] Disclaimers necessários incluídos (se aplicável)
${config.includeFaq ? `- [ ] FAQ com ${config.faqCount} perguntas otimizadas` : ''}
- [ ] Leitura fluida e natural (não robótica)
- [ ] Todos os links com target="_blank" rel="noopener noreferrer"
- [ ] Capitalização correta nos títulos (apenas primeira letra maiúscula)
- [ ] HTML semântico e limpo

${config.sourcesContext ? `
## 📚 CONTEXTO E FONTES
**Material de Referência (Base factual obrigatória):**
${config.sourcesContext}

**Instruções de Uso das Fontes:**
- Use 100% dos fatos fornecidos no contexto
- Não invente dados ou estatísticas
- Cite fontes específicas quando mencionar dados
` : ''}

---

**IMPORTANTE**: Gere um artigo completo, pronto para publicação, em HTML semântico limpo, seguindo TODAS as diretrizes acima. O conteúdo deve ser indistinguível de um texto escrito por humano especialista, com fluidez natural e valor real para o leitor.`;

  const userPrompt = `Escreva um artigo completo e otimizado para SEO sobre: "${config.keyword}"

${config.title ? `Título do artigo: "${config.title}"` : ''}

Estrutura esperada:
1. Introdução engajadora que responda à dúvida principal nos primeiros 2 parágrafos
2. Seções organizadas com subtítulos H2/H3 (5-7 seções principais)
3. Conteúdo detalhado, útil e acionável em cada seção
${config.includeTable ? '4. Pelo menos uma tabela comparativa ou informativa' : ''}
${config.includeList ? '5. Listas organizadas (numeradas ou bullets) quando apropriado' : ''}
${config.includeFaq ? `6. Seção FAQ com ${config.faqCount} perguntas frequentes otimizadas para featured snippets` : ''}
${config.includeConclusion ? '7. Conclusão com resumo dos pontos principais e CTA claro' : ''}
${config.includeMetaDescription ? '8. Meta description otimizada (150-160 caracteres) no início' : ''}

Lembre-se:
- Segmento: ${config.segment} (aplique as diretrizes específicas)
- Tom: ${config.tone}
- Extensão: ${wordRange.min}-${wordRange.max} palavras

Comece agora:`;

  return { system: systemPrompt, user: userPrompt };
}

// Export for testing
export { WORD_COUNT_RANGES, POV_MAP, INTENT_GUIDELINES };
