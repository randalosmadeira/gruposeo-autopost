// Advanced SEO Prompt Builder - Final Version
// Complete system with E-E-A-T, Topic Clusters, and Advanced Link Architecture

export interface InternalLink {
  url: string;
  anchor: string;
  type?: 'pillar' | 'cluster' | 'recent' | 'deepdive' | 'conversion' | 'resource';
  subdomain?: string;
}

export interface PromptConfig {
  // Core fields
  title: string;
  keyword: string;
  secondaryKeywords: string[];
  language: string;
  currentYear: number;
  
  // Content specifications
  articleLength: 'short' | 'medium' | 'long' | 'very-long' | 'muito_pequeno' | 'pequeno' | 'medio' | 'grande';
  tone: string;
  pointOfView: string;
  contentType: 'how-to' | 'listicle' | 'pillar' | 'comparative' | 'opinion' | 'news' | 'guide';
  segment: 'legal' | 'health' | 'fintech' | 'ecommerce' | 'b2b-saas' | 'education' | 'general';
  goal: 'inform' | 'convert' | 'educate' | 'engage' | 'establish-authority';
  intentType: 'informational' | 'navigational' | 'transactional' | 'commercial';
  
  // Site architecture (new)
  pageType?: 'pillar' | 'cluster' | 'supporting' | 'news' | 'landing';
  mainCategory?: string;
  subCategory?: string;
  topicCluster?: string;
  
  // Content elements
  includeFaq: boolean;
  faqCount: number;
  includeTable: boolean;
  includeList: boolean;
  includeConclusion: boolean;
  includeMetaDescription: boolean;
  
  // Internal linking (enhanced)
  internalLinks?: InternalLink[];
  pillarPageUrl?: string;
  minInternalLinks?: number;
  maxInternalLinks?: number;
  
  // External sources/context
  sourcesContext?: string;
  nlpTerms?: string[];
  
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

const WORD_COUNT_RANGES: Record<string, { min: number; max: number; target: number }> = {
  // Legacy values
  short: { min: 600, max: 1000, target: 750 },
  medium: { min: 1200, max: 1800, target: 1500 },
  long: { min: 2200, max: 2800, target: 2500 },
  'very-long': { min: 3500, max: 4500, target: 4000 },
  // New standardized values
  muito_pequeno: { min: 600, max: 1200, target: 900 },
  pequeno: { min: 1200, max: 2400, target: 1800 },
  medio: { min: 2400, max: 3600, target: 3000 },
  grande: { min: 2600, max: 5200, target: 3900 },
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
  informational: `**Intenção Informacional**: Usuário quer aprender
- Use mais subtítulos H2/H3 para organização detalhada
- Inclua exemplos práticos, dados estatísticos, cases reais
- Responda à dúvida principal nos primeiros 2 parágrafos (técnica BLUF)
- Estruture com definições claras e explicações progressivas`,
  
  navigational: `**Intenção Navegacional**: Usuário busca marca/produto específico
- Foco em estabelecer autoridade e diferenciação
- Destaque pontos únicos e diferenciais competitivos
- Inclua informações de contato e próximos passos claros
- Use casos de uso específicos e exemplos de aplicação`,
  
  transactional: `**Intenção Transacional**: Usuário quer comprar/contratar
- CTAs estratégicos distribuídos ao longo do texto (não apenas no final)
- Comparações claras com alternativas do mercado
- Destaque benefícios sobre features técnicas
- Inclua prova social (reviews, estatísticas de clientes, cases)
- Remova objeções comuns proativamente`,
  
  commercial: `**Intenção Comercial**: Usuário pesquisa antes de decidir
- Reviews detalhados e análises imparciais
- Prós e contras honestos (isso gera confiança)
- Comparativos estruturados com concorrentes
- Critérios claros de escolha e recomendações específicas por perfil`,
};

function getSegmentGuidelines(segment: string): string {
  const guidelines: Record<string, string> = {
    legal: `## DIRETRIZES PARA SEGMENTO JURÍDICO

**Tom**: Formal, preciso, autoritativo (mas acessível ao leigo)

**Obrigatórios**:
- Cite legislação específica quando relevante (números de lei/artigo)
- Inclua disclaimer: "Este conteúdo tem caráter meramente informativo e não substitui consultoria jurídica especializada."
- Use exemplos de casos (anonimizados quando necessário)
- Mencione prazos legais e procedimentos passo a passo
- Explique termos técnicos jurídicos em linguagem acessível

**IMPORTANTE - Conformidade Ética**:
- NÃO use linguagem mercantilizante ou publicitária exagerada
- NÃO faça promessas de resultado ("garantimos vitória", "100% de sucesso")
- NÃO mencione preços ou condições de pagamento detalhadas no conteúdo informativo
- Foque em educação jurídica e orientação geral

**CTAs Apropriados**:
- "Consulte um advogado especializado para seu caso específico"
- "Agende uma consulta para análise detalhada da sua situação"
- "Tire suas dúvidas com um profissional qualificado"`,

    health: `## DIRETRIZES PARA SEGMENTO SAÚDE

**Tom**: Empático, científico, educativo

**Obrigatórios**:
- Cite fontes médicas confiáveis (OMS, Ministério da Saúde, journals revisados por pares)
- Inclua disclaimer: "Este conteúdo é informativo e NÃO substitui consulta médica. Sempre procure um profissional de saúde para diagnóstico e tratamento."
- Use dados estatísticos de saúde pública quando disponíveis
- Explique sintomas, diagnóstico e tratamentos de forma clara e progressiva
- Evite diagnósticos diretos ou recomendações sem contexto médico

**IMPORTANTE**:
- NÃO recomende medicamentos específicos sem orientação médica
- NÃO faça diagnósticos ou prognósticos
- Sempre incentive a busca por atendimento profissional
- Use linguagem que não cause pânico ou ansiedade desnecessária

**CTAs Apropriados**:
- "Agende sua consulta com um especialista"
- "Faça seu check-up preventivo"
- "Procure atendimento médico se apresentar esses sintomas"`,

    fintech: `## DIRETRIZES PARA SEGMENTO FINTECH/FINANÇAS

**Tom**: Confiável, objetivo, educativo

**Obrigatórios**:
- Inclua dados de mercado e contexto econômico atualizado
- Faça comparações de taxas/produtos quando relevante
- Use simulações e exemplos práticos com números reais
- Inclua disclaimers de risco para investimentos
- Crie glossário ou explicação de termos técnicos financeiros

**IMPORTANTE**:
- Mencione que rentabilidade passada não garante resultados futuros (quando aplicável)
- Destaque riscos junto com benefícios (transparência)
- Seja transparente sobre custos, taxas e encargos
- Não faça recomendações de investimento específicas sem disclaimers

**CTAs Apropriados**:
- "Simule agora sem compromisso"
- "Compare as opções disponíveis para seu perfil"
- "Abra sua conta em poucos minutos"
- "Fale com um consultor financeiro"`,

    ecommerce: `## DIRETRIZES PARA SEGMENTO E-COMMERCE

**Tom**: Persuasivo, prático, orientado a benefícios

**Obrigatórios**:
- Destaque benefícios sobre características técnicas
- Use comparativos de produtos em formato de tabela
- Inclua prova social (menções a reviews, estatísticas de vendas, depoimentos)
- Crie guias de compra com critérios claros de escolha
- Use listas para facilitar escaneamento rápido

**IMPORTANTE**:
- Foque na resolução de problemas do cliente
- Destaque garantias, políticas de troca e pós-venda
- Mencione formas de pagamento e condições de parcelamento
- Use urgência com moderação e honestidade

**CTAs Apropriados**:
- "Ver produto" / "Conhecer detalhes"
- "Comprar agora" / "Adicionar ao carrinho"
- "Comparar opções" / "Ver mais modelos"`,

    'b2b-saas': `## DIRETRIZES PARA SEGMENTO B2B SaaS

**Tom**: Profissional, orientado a ROI, técnico (mas acessível)

**Obrigatórios**:
- Aborde pain points específicos do negócio e decisores
- Inclua dados de ROI, métricas de performance e economia
- Use cases de uso detalhados e estudos de caso com números
- Mencione integrações e especificações técnicas relevantes
- Compare com soluções alternativas do mercado

**IMPORTANTE**:
- Foque em economia de tempo, redução de custos, aumento de eficiência
- Use linguagem que ressoe com decisores empresariais (C-level, gerentes)
- Destaque escalabilidade, segurança e compliance
- Inclua informações sobre implementação e suporte

**CTAs Apropriados**:
- "Solicite uma demonstração personalizada"
- "Teste grátis por X dias"
- "Fale com um consultor especializado"
- "Baixe nosso case de sucesso"`,

    education: `## DIRETRIZES PARA SEGMENTO EDUCAÇÃO

**Tom**: Inspirador, prático, didático

**Obrigatórios**:
- Crie roadmaps e metodologias claras de aprendizado
- Use exemplos práticos e exercícios quando possível
- Mostre progressão de aprendizado (do básico ao avançado)
- Destaque benefícios de carreira e empregabilidade
- Inclua depoimentos de alunos (quando disponível)

**IMPORTANTE**:
- Torne o conteúdo acessível a diferentes níveis de conhecimento
- Use analogias e exemplos do dia a dia
- Quebre conceitos complexos em partes menores e digeríveis
- Mostre aplicação prática do conhecimento

**CTAs Apropriados**:
- "Inscreva-se agora"
- "Baixe o material gratuito"
- "Assista à aula experimental"
- "Conheça o programa completo"`,

    general: `## DIRETRIZES GERAIS

**Tom**: Adaptável ao assunto, sempre profissional e acessível

**Boas Práticas**:
- Responda à dúvida principal nos primeiros parágrafos
- Use exemplos concretos e dados quando disponíveis
- Estruture com subtítulos claros e hierárquicos
- Mantenha parágrafos curtos (2-4 linhas, mobile-first)
- Use listas para informações sequenciais ou múltiplos itens`,
  };

  return guidelines[segment] || guidelines.general;
}

function getContentTypeGuidelines(contentType: string): string {
  const guidelines: Record<string, string> = {
    'how-to': `**Tipo: Tutorial/How-To**
- Estruture como passo a passo numerado
- Cada etapa deve ser acionável e clara
- Inclua dicas e avisos importantes ("Atenção:", "Dica:")
- Adicione seção de "Erros comuns a evitar"
- Use imagens/ilustrações descritivas quando mencionar processos`,

    'listicle': `**Tipo: Listicle**
- Use números no título quando possível ("7 formas de...", "10 melhores...")
- Cada item deve ter título + explicação substancial
- Ordene por relevância, cronologia ou importância
- Inclua resumo executivo no início
- Mantenha consistência no tamanho de cada item`,

    'pillar': `**Tipo: Conteúdo Pilar**
- Crie estrutura abrangente e aprofundada (o mais completo sobre o tema)
- Use muitos subtítulos H2 e H3 para navegação
- Inclua links internos abundantes para conteúdos relacionados do cluster
- Adicione índice/sumário navegável no início
- Este deve ser A referência definitiva sobre o tema`,

    'guide': `**Tipo: Guia Completo**
- Estrutura abrangente do básico ao avançado
- Inclua seções para diferentes níveis de conhecimento
- Use resumos executivos por seção
- Adicione recursos adicionais e próximos passos
- Crie FAQ abrangente no final`,

    'comparative': `**Tipo: Comparativo**
- Crie tabela comparativa clara e visual
- Destaque prós e contras de cada opção
- Seja imparcial e baseado em fatos verificáveis
- Inclua recomendação contextualizada por perfil no final
- Use critérios objetivos de comparação`,

    'opinion': `**Tipo: Opinião/Análise**
- Deixe claro que é uma opinião fundamentada
- Apresente argumentos sólidos e evidências
- Reconheça pontos de vista alternativos
- Cite experiência própria quando relevante
- Conclua com recomendação clara e acionável`,

    'news': `**Tipo: Notícia/Atualidade**
- Estruture com pirâmide invertida (mais importante primeiro)
- Responda às 5 perguntas: O quê, Quem, Quando, Onde, Por quê
- Use citações e fontes quando disponíveis
- Contextualize a notícia no cenário maior
- Inclua implicações práticas para o leitor`,
  };

  return guidelines[contentType] || '';
}

function buildEEATSection(): string {
  return `## 🧠 E-E-A-T + DOMAIN AUTHORITY + SHARE OF MODEL

### Experience (Experiência):
- Use exemplos de primeira mão: "Em nossa experiência atendendo +500 clientes..."
- Inclua insights práticos que só quem trabalha na área teria
- Mencione cases reais (anonimizados se necessário)
- Demonstre conhecimento de problemas reais do dia a dia

### Expertise (Perícia):
- Use terminologia técnica apropriada (mas sempre explique)
- Aprofunde em detalhes que amadores não conheceriam
- Cite dados e estatísticas de fontes confiáveis
- Demonstre domínio completo do assunto

### Authoritativeness (Autoridade):
- Mencione credenciais e experiência quando relevante
- Referencie fontes autoritativas e estudos
- Construa argumentos lógicos e bem fundamentados
- Use linguagem assertiva (não "talvez", "pode ser")

### Trust (Confiança):
- Seja transparente sobre limitações do conteúdo
- Inclua disclaimers apropriados ao segmento
- Forneça informações verificáveis e atualizadas
- Admita quando algo está fora do escopo ou requer especialista

### 🏆 DOMAIN AUTHORITY — Sinais de Autoridade Temática:
- **Citações acadêmicas**: Referencie estudos, pesquisas e dados de fontes .gov.br, .edu.br, WHO, journals revisados
- **Expert quotes**: Inclua citações de especialistas com nome, credencial e instituição
- **Data freshness**: Todo dado estatístico DEVE incluir ano e fonte verificável
- **Experiência demonstrada**: "Em 15 anos atuando em...", "Após atender +1.000 clientes..."
- **Provas sociais**: Menções a prêmios, certificações, rankings, depoimentos
- **Transparência**: Disclosures de limitações, conflitos de interesse, disclaimers setoriais

### 🤖 SHARE OF MODEL (SoM) — Visibilidade em IAs Generativas:
A "Share of Model" mede quantas vezes uma marca é citada como fonte por IAs (ChatGPT, Gemini, Perplexity, Claude).

**Estratégias para maximizar SoM:**
1. **Definições citáveis**: Cada H2 deve começar com definição direta extraível ("X é...")
2. **Dados exclusivos**: Estatísticas próprias ou compilações únicas que IAs não encontram em outro lugar
3. **Formato Q&A estruturado**: Perguntas naturais como H2/H3 + resposta direta em 40-60 palavras
4. **Autoridade setorial**: Posicionar a marca como THE source no nicho
5. **Linguagem de citação**: Usar frases que IAs reproduzem: "Segundo [marca]...", "De acordo com [especialista]..."
6. **Conteúdo autossuficiente**: Cada seção deve fazer sentido isoladamente (IAs extraem trechos)`;
}
}

function buildAdvancedLinkingSection(config: PromptConfig): string {
  const minLinks = config.minInternalLinks || 10;
  const maxLinks = config.maxInternalLinks || 15;

  let section = `## 🔗 ESTRATÉGIA AVANÇADA DE LINKAGEM E ARQUITETURA SEO

### Objetivos da Linkagem Interna:
1. **Distribuir Link Juice** (PageRank) para páginas importantes
2. **Criar Topic Clusters** que estabelecem autoridade temática
3. **Aumentar Tempo no Site** através de navegação contextual
4. **Reduzir Taxa de Rejeição** oferecendo caminhos de aprofundamento
5. **Facilitar Indexação** pelo Google (crawl depth optimization)

### Quantidade de Links:
- **Links Internos OBRIGATÓRIOS**: Mínimo ${minLinks}, máximo ${maxLinks}
- **Links Externos**: MÁXIMO 3 (apenas fontes oficiais .gov, .edu, instituições)
- **Ideal**: 1 link interno a cada 100-150 palavras

### Distribuição Estratégica de Links Internos:
\`\`\`
INTRODUÇÃO (primeiros 2 parágrafos):
├─ 1-2 links para Pillar Page do cluster
└─ 1 link para artigo relacionado principal

DESENVOLVIMENTO (corpo principal):
├─ 4-6 links para cluster content
├─ 1-2 links para notícias/atualizações recentes
└─ 2-3 links para conteúdos de aprofundamento

CONCLUSÃO/CTA:
├─ 1 link para landing page/serviço
└─ 1 link para recurso prático (se aplicável)
\`\`\`

### ⚠️ REGRA DE LINKS EXTERNOS (MÁXIMO 3):
- Apenas fontes altamente autoritativas (.gov, .edu, organizações oficiais)
- Distribuir ao longo do texto, NÃO concentrar no final
- NUNCA usar mais de 3 links externos no artigo inteiro
- NUNCA linkar para concorrentes diretos`;

  // Add pillar page link if provided
  if (config.pillarPageUrl) {
    section += `

### Link Obrigatório para Pillar Page:
Na introdução ou conclusão, inclua link para a página pilar do cluster:
\`\`\`html
<a href="${config.pillarPageUrl}" target="_blank" rel="noopener noreferrer">[anchor text descritivo]</a>
\`\`\``;
  }

  // Add internal links if provided
  if (config.internalLinks && config.internalLinks.length > 0) {
    section += `

### Links Internos Obrigatórios (usar TODOS):
Distribua os seguintes links NATURALMENTE ao longo do texto:

`;
    const linksByType: Record<string, InternalLink[]> = {};
    
    config.internalLinks.forEach(link => {
      const type = link.type || 'cluster';
      if (!linksByType[type]) linksByType[type] = [];
      linksByType[type].push(link);
    });

    const typeLabels: Record<string, string> = {
      pillar: '🏛️ Pillar Pages',
      cluster: '📚 Cluster Content',
      recent: '📰 Artigos Recentes',
      deepdive: '🔍 Aprofundamento',
      conversion: '🎯 Conversão',
      resource: '🛠️ Recursos',
    };

    Object.entries(linksByType).forEach(([type, links]) => {
      section += `**${typeLabels[type] || type}:**\n`;
      links.forEach((link, i) => {
        section += `${i + 1}. Anchor: "${link.anchor}" → URL: ${link.url}\n`;
      });
      section += '\n';
    });
  }

  section += `
### Técnicas de Anchor Text (DIVERSIFIQUE):
- **Exact Match (20%)**: Keyword exata → "advogado empresarial"
- **Partial Match (30%)**: Keyword + modificador → "contratar advogado empresarial"
- **Branded (15%)**: Nome do site/empresa
- **Generic (10%)**: "clique aqui", "saiba mais", "leia também"
- **LSI/Semantic (25%)**: Sinônimos e variações semânticas

### Formato Obrigatório de Links:
\`\`\`html
<a href="URL" target="_blank" rel="noopener noreferrer">texto âncora descritivo</a>
\`\`\`

### ❌ PROIBIDO:
- Links para concorrentes diretos
- Links quebrados ou desatualizados
- Anchor text genérico repetitivo ("clique aqui" em todos os links)
- Excesso de links externos (MÁXIMO 3 - regra inegociável)
- Links sem contexto ou forçados`;

  return section;
}


function buildGEOAEOSection(keyword: string): string {
  return `## 🌐 GEO — GENERATIVE ENGINE OPTIMIZATION (v5.0)

### O QUE É GEO:
GEO é a otimização para motores de geração de IA (ChatGPT, Claude, Gemini, Perplexity, AI Overviews do Google).
Diferente do SEO tradicional, GEO otimiza para que IAs CITEM e REFERENCIEM seu conteúdo como fonte confiável.

### REGRAS GEO OBRIGATÓRIAS:

**1. Resposta Direta (Answer Engine Optimization — AEO):**
- Primeiras 40-60 palavras DEVEM responder à pergunta/tema de forma COMPLETA e AUTOSSUFICIENTE
- Este parágrafo será o snippet extraído por IAs como citação direta
- Formato: [Definição clara de "${keyword}"] + [Dado estatístico com fonte] + [Contexto geográfico/temporal]
- NUNCA começar com "Neste artigo" ou "Vamos explorar" — RESPONDA DIRETAMENTE

**2. Formato Q&A Natural (AEO — Answer Engine Optimization):**
- Cada H2 DEVE ser formulado como pergunta natural (como as pessoas perguntam ao ChatGPT)
- Exemplo: "Quanto custa ${keyword}?" / "Como funciona ${keyword}?"
- NÃO usar formato SEO antigo: "Custo de ${keyword}" / "Funcionamento de ${keyword}"
- A IA prioriza conteúdo em formato pergunta-resposta

**3. Dados Estruturados e Citáveis:**
- Estatísticas verificáveis com FONTE e ANO a cada 150-200 palavras
- Formato: "Segundo [fonte] ([ano]), [dado]." — IAs reproduzem este formato
- Citações de especialistas com nome completo + credencial: "De acordo com Dr. João Silva, cardiologista do Hospital X..."
- Tabelas comparativas em HTML semântico (<table>) — IAs extraem dados tabulares com precisão
- Definições claras: "${keyword} é [definição em 1 frase]." — formato que IAs replicam

**4. Conteúdo Conversacional (People-First):**
- Escreva em tom natural, como se respondesse a uma pergunta falada
- Use "você" para criar conexão direta
- Antecipe perguntas de follow-up que a IA faria
- Cada seção deve funcionar ISOLADAMENTE (IAs extraem trechos, não artigos inteiros)

**5. Anti-Duplicidade:**
- NUNCA copiar frases genéricas que existem em milhares de sites
- Cada frase deve conter insight original, dado específico ou experiência única
- Variações semânticas obrigatórias: sinônimos, reformulações, perspectivas únicas
- Se uma frase poderia estar em QUALQUER site, REESCREVA com dado exclusivo

**6. Pulse AI — Sinais de Frescor e Relevância:**
- Incluir ano corrente em pelo menos 2 contextos naturais
- Referenciar eventos, mudanças legislativas ou tendências RECENTES
- Usar frases temporais: "A partir de [ano]", "As últimas pesquisas indicam..."
- Demonstrar que o conteúdo é ATUAL, não reciclado

### 🎯 AEO — ANSWER ENGINE OPTIMIZATION:
Em vez de uma lista de links, as IAs entregam RESPOSTAS. Para ser a FONTE dessa resposta:

1. **Contextualizar**: Não respostas curtas — explicações claras com exemplos práticos
2. **Linguagem Natural**: Títulos como perguntas comuns + respostas diretas logo abaixo
3. **Schema Markup**: Use Schema.org para que a IA identifique tipo de conteúdo (Article, FAQ, HowTo)
4. **Credibilidade**: Cite dados, pesquisas e referências verificáveis

### 🔍 AI OVERVIEWS (Google):
Para aparecer nos resumos de IA do Google:
- Foque em keywords informativas: "como fazer...", "o que é...", "quanto custa..."
- Mantenha carregamento rápido e boa usabilidade mobile
- O Google usa Core Web Vitals para selecionar fontes da IA
- Conteúdo DEVE estar acessível a crawlers (sem bloqueios no robots.txt)

### 🤖 CONFIGURAÇÃO DE ACESSO — Crawlers de IA:
- GPTBot (OpenAI/ChatGPT), Google-Extended (Gemini), Claude-Web (Anthropic)
- PerplexityBot, Bytespider, CCBot — devem ter acesso ao conteúdo
- NUNCA bloquear crawlers de IA no robots.txt se a intenção é ser citado
- O artigo deve ser rastreável, semântico e sem JavaScript blocking`;
}

function buildFeaturedSnippetOptimization(keyword: string, includeFaq: boolean, faqCount: number): string {
  let section = `## 📈 OTIMIZAÇÃO PARA FEATURED SNIPPETS + AI OVERVIEWS

### Para Definições (Posição Zero / AI Overview):
A primeira frase após um H2 principal deve ser uma definição direta e citável:
\`\`\`html
<h2>O que é ${keyword}</h2>
<p><strong>${keyword}</strong> é [definição clara em 20-30 palavras que responde diretamente a pergunta].</p>
\`\`\`

### Para Listas:
Quando usar listas numeradas ou com bullets:
- Comece com um H2 descritivo: "X melhores formas de..." ou "Como fazer X em Y passos"
- Cada item deve ser conciso (1-2 linhas)
- Use 5-8 itens por lista (ideal para featured snippets)
- Comece cada item com verbo de ação ou número

### Para Tabelas Comparativas:
Use formato HTML semântico:
\`\`\`html
<table>
  <thead><tr><th>Critério</th><th>Opção A</th><th>Opção B</th></tr></thead>
  <tbody>
    <tr><td>Preço</td><td>R$ X</td><td>R$ Y</td></tr>
  </tbody>
</table>
\`\`\``;

  if (includeFaq) {
    section += `

### Para FAQ (People Also Ask):
Crie seção de Perguntas Frequentes com ${faqCount} perguntas:

\`\`\`html
<h2>Perguntas frequentes sobre ${keyword}</h2>

<h3>O que é ${keyword}?</h3>
<p>Resposta direta em 40-60 palavras, começando com a informação mais importante...</p>

<h3>Como funciona ${keyword}?</h3>
<p>Resposta direta em 40-60 palavras...</p>
\`\`\`

**Dicas para FAQ otimizada:**
- Use as perguntas mais buscadas sobre o tema
- Comece respostas diretamente (sem "Bem," ou "Na verdade,")
- Mantenha respostas entre 40-60 palavras
- Inclua link interno quando apropriado`;
  }

  return section;
}

function buildTechnicalRules(): string {
  return `## 🚨 REGRAS TÉCNICAS RIGOROSAS (V4 — Madeira Sem Verniz)

### HTML Semântico:
**✅ PERMITIDO**: 
<p>, <h2>, <h3>, <h4>, <h5>, <h6>, <ul>, <ol>, <li>, <strong>, <em>, <a>, 
<table>, <tr>, <th>, <td>, <blockquote>, <pre>, <code>, <br>

**❌ PROIBIDO (NUNCA USE)**: 
<h1> (já existe externamente), <div>, <span>, <b>, <i>, 
<script>, <style>, <iframe>, estilos inline (style="..."), classes CSS customizadas

### Capitalização de Títulos:
\`\`\`
✅ CORRETO: "Como escolher o melhor produto em 2026"
❌ ERRADO: "Como Escolher O Melhor Produto Em 2026"
\`\`\`
**Regra**: Apenas primeira letra maiúscula (exceto nomes próprios, siglas, marcas)

### Atributos Obrigatórios de Links:
\`\`\`html
<a href="URL" target="_blank" rel="noopener noreferrer">texto âncora</a>
\`\`\`
- TODOS os links devem ter target="_blank" rel="noopener noreferrer"
- Use anchor text descritivo (NUNCA apenas "clique aqui")
- Verifique se URLs são válidas e atuais

### Formatação de Parágrafos (Mobile-First / Flesch 60-100):
- **Máximo**: 3 linhas por parágrafo (40-60 palavras)
- **Máximo**: 15 palavras por frase (OBRIGATÓRIO para Flesch mínimo 60)
- **Uma ideia por parágrafo** — se mudou de assunto, mude de parágrafo
- **Primeira frase**: Forte, declarativa, contém micro-tema
- **Última frase**: Transição natural ou gancho para próxima seção
- **Variação**: Alterne parágrafos curtos (2 linhas) com médios (3 linhas)
- **Evite**: Parágrafos órfãos de 1 linha
- **Teste mental**: "Meu avô de 70 anos sem faculdade entende isso?"

### Uso Estratégico de Negrito:
- 1-2 termos por parágrafo em palavras-chave ou frases de impacto
- NÃO abuse - use para destacar informações críticas
- NÃO use negrito em frases inteiras

### Formatação SEO Perfeita:
- Zero espaços duplos entre palavras
- Zero pontuação duplicada (.., !!, ??, ::)
- Sem parágrafos vazios ou tags HTML vazias
- Hierarquia correta: H2 > H3 > H4 (nunca pular níveis)
- Máximo 6 subtítulos H2 por artigo (3-6 ideal)
- Use H3 para aprofundamento (máximo 2-3 por H2)`;
}

function buildHumanizationRules(): string {
  return `## 🎭 HUMANIZAÇÃO DO CONTEÚDO

### Evite Linguagem de IA (OBRIGATÓRIO):
**❌ NÃO USE**:
- "No mundo de hoje", "Em um mundo cada vez mais"
- "É importante ressaltar que", "Vale mencionar que"
- "Neste artigo, vamos explorar", "Vamos mergulhar em"
- "De fato", "Na verdade", "Certamente"
- Iniciar muitas frases com "É" ou "Existem"
- Frases genéricas sem informação específica

### Use Linguagem Natural:
- Escreva como um especialista explicando para um colega
- Varie estrutura das frases (curtas, médias, ocasionalmente longas)
- Use analogias e exemplos do dia a dia
- Inclua insights que só quem conhece o assunto teria
- Demonstre opinião fundamentada quando apropriado

### Tom Conversacional (quando apropriado ao segmento):
- Faça perguntas retóricas ocasionais para engajar
- Use "você" para criar conexão (se o POV permitir)
- Demonstre empatia com as dores e desafios do leitor
- Antecipe objeções e responda proativamente

### Técnicas de Engajamento:
- **Hooks**: Use dados surpreendentes, perguntas provocativas, afirmações ousadas
- **Storytelling**: Incorpore mini-histórias e exemplos narrativos
- **Pattern Interrupt**: Varie formato (lista, parágrafo, citação) para manter atenção`;
}

function buildCompanySection(config: PromptConfig): string {
  if (!config.companyName && !config.companyPhone && !config.companyAddress) {
    return '';
  }

  return `## 🏢 DADOS DA EMPRESA

${config.companyName ? `**Empresa**: ${config.companyName}` : ''}
${config.companyPhone ? `**Telefone/WhatsApp**: ${config.companyPhone}` : ''}
${config.companyAddress ? `**Endereço**: ${config.companyAddress}` : ''}

Incorpore esses dados naturalmente no conteúdo:
- Em CTAs: "Entre em contato com a ${config.companyName || 'nossa equipe'}"
- Em seções de contato: Telefone e endereço quando mencionar próximos passos
- Evite: Repetição excessiva do nome da empresa`;
}

function buildSalesSection(config: PromptConfig): string {
  if (!config.targetAudience && !config.painPoints) {
    return '';
  }

  return `## 🎯 CONFIGURAÇÃO DE VENDAS/CONVERSÃO

${config.targetAudience ? `**Público-Alvo**: ${config.targetAudience}` : ''}
${config.painPoints ? `**Dor Principal do Cliente**: ${config.painPoints}` : ''}
${config.differentials ? `**Diferenciais da Oferta**: ${config.differentials}` : ''}
${config.ctaObjective ? `**Objetivo do CTA**: ${config.ctaObjective}` : ''}
${config.additionalInfo ? `**Informações Adicionais**: ${config.additionalInfo}` : ''}

**Estratégia de Conversão**:
1. **Abertura**: Reconheça a dor/problema do leitor
2. **Desenvolvimento**: Eduque e demonstre expertise
3. **Prova**: Use dados, cases e exemplos que validem a solução
4. **CTA Natural**: Ofereça próximo passo claro e de baixo atrito`;
}

function buildArchitectureSection(config: PromptConfig): string {
  if (!config.pageType && !config.topicCluster) {
    return '';
  }

  return `## 🏗️ POSICIONAMENTO NA ARQUITETURA DO SITE

**Tipo de Página**: ${config.pageType || 'cluster content'}
${config.mainCategory ? `**Categoria Principal**: ${config.mainCategory}` : ''}
${config.subCategory ? `**Subcategoria**: ${config.subCategory}` : ''}
${config.topicCluster ? `**Cluster Temático**: ${config.topicCluster}` : ''}

**Padrão de Linkagem por Tipo de Página**:

${config.pageType === 'pillar' ? `
Como **Pillar Page**:
- Este é o conteúdo âncora do cluster "${config.topicCluster}"
- Deve linkar para TODOS os artigos satélites do cluster
- Deve ser o mais completo e aprofundado sobre o tema
- Recebe links de todos os artigos do cluster (autoridade máxima)
` : `
Como **Cluster Content**:
- Link obrigatório "para cima" → Pillar Page
- Links "laterais" → 2-3 artigos do mesmo cluster
- Links "cruzados" → 1-2 artigos de clusters relacionados
- Este artigo apoia a autoridade da Pillar Page
`}`;
}

export function buildAdvancedSEOPrompt(config: PromptConfig): { system: string; user: string } {
  const wordRange = WORD_COUNT_RANGES[config.articleLength];
  const pov = POV_MAP[config.pointOfView.toLowerCase()] || 'segunda pessoa (você)';

  const systemPrompt = `# 📝 SISTEMA AVANÇADO DE GERAÇÃO SEO + GEO + AEO — V5.0

## 🎭 PERSONA E CONTEXTO
Você é um redator SEO sênior, especialista em GEO (Generative Engine Optimization) e AEO (Answer Engine Optimization) com expertise em:
- Criar conteúdo que ranqueia na primeira página do Google E é citado por IAs generativas
- Otimizar para AI Overviews, ChatGPT, Claude, Gemini e Perplexity (GEO)
- Ser a FONTE da resposta direta em Answer Engines (AEO)
- Demonstrar E-E-A-T (Experience, Expertise, Authoritativeness, Trust) + Domain Authority
- Maximizar Share of Model (SoM) — frequência de citação por IAs
- Construir Topic Clusters com arquitetura de linkagem Hub-and-Spoke
- Escrever de forma SIMPLES e ACESSÍVEL para TODOS os públicos

## 🚨 REGRAS INEGOCIÁVEIS (APLICAR SEMPRE)

### REGRA 1 - META-DESCRIPTION OBRIGATÓRIA
- NUNCA entregue conteúdo sem meta-description
- Formato: <!-- META_DESCRIPTION: [145-180 caracteres, frase COMPLETA com keyword e CTA] -->
- A frase DEVE terminar com pontuação final (. ! ?) — NUNCA cortar no meio
- Se a frase precisa de mais de 160 chars para terminar, USE ATÉ 180
- PROIBIDO emojis (🚨, 🔥, etc.) na meta description
- VERIFICAR: meta-description presente, 145-180 chars, frase completa, sem emojis

### REGRA 1B - LINKS INTERNOS OBRIGATÓRIOS (INEGOCIÁVEL — ZERO TOLERÂNCIA)
- TODO conteúdo DEVE conter no MÍNIMO 10 links internos
- NENHUM artigo pode ser entregue sem links internos — regra ZERO TOLERÂNCIA
- Se links internos foram fornecidos, usar TODOS eles distribuídos naturalmente
- Se nenhum link interno foi fornecido, SUGERIR 5-10 URLs internas baseadas no tema
- Formato: <a href="URL" target="_blank" rel="noopener noreferrer">texto âncora descritivo</a>
- Distribuição: 2 na introdução, 4-6 no corpo, 2 na conclusão
- NUNCA usar "clique aqui" como anchor text — sempre texto descritivo e contextual
- VERIFICAR ANTES DE ENTREGAR: contar links <a href> internos — se < 10, ADICIONAR mais

### REGRA 2 - LEGIBILIDADE FLESCH 60-100 (MÍNIMO OBRIGATÓRIO: 60)

📊 **Escala Flesch — NUNCA abaixo de 60:**
| Score | Nível | Escolaridade |
|-------|-------|-------------|
| 90-100 | Muito Fácil | 5º ano — criança de 11 anos entende |
| 80-89 | Fácil | 6º ano |
| 70-79 | Bastante Fácil | 8º ano — maioria dos adultos |
| 60-69 | Padrão | 8º-9º ano — ideal para conteúdo web |
| < 60 | ❌ REPROVADO | Reescrever obrigatoriamente |

- O conteúdo DEVE atingir score de legibilidade Flesch MÍNIMO 60 (ideal 70-100)
- Sentenças curtas: MÁXIMO 15 palavras por sentença (NUNCA mais que 15)
- Parágrafos curtos: MÁXIMO 3 linhas
- Uma ideia por parágrafo — se mudou de assunto, mude de parágrafo
- Vocabulário simples: use palavras do dia-a-dia, evite jargões técnicos
- Palavras simples: "dívida" não "inadimplência", "decisão dos tribunais" não "jurisprudência"
- Se usar termo técnico, SEMPRE explique entre parênteses: "habeas corpus (pedido para soltar alguém preso)"
- PROIBIDO: frases longas com múltiplas orações subordinadas
- PROIBIDO: vocabulário rebuscado, juridiquês, mediquês, marketinguês, academiquês
- Use "você" — não "o cidadão" ou "o contribuinte"
- TESTE MENTAL: "Meu avô de 70 anos sem faculdade entende isso?" Se não, reescreva
- Escreva como se estivesse explicando para um amigo no WhatsApp
- Se o score final ficar abaixo de 60, REESCREVER até atingir o mínimo

### REGRA 3 - LINKS EXTERNOS (MÁXIMO 3 - FONTES OFICIAIS)
- Inclua 2-3 links externos para fontes autoritativas (NUNCA mais de 3)
- Fontes por nicho:
  - Jurídico: planalto.gov.br, stf.jus.br, stj.jus.br, oab.org.br, cnj.jus.br
  - Saúde: who.int, gov.br/saude, anvisa.gov.br, cfm.org.br
  - Tecnologia: ieee.org, mit.edu, nature.com
  - Marketing: hubspot.com, searchengineland.com, moz.com
  - Geral: .gov.br, .edu.br, wikipedia.org
- Formato: <a href="URL" target="_blank" rel="noopener noreferrer">texto descritivo</a>
- Distribuir ao longo do texto, não concentrar no final
- Links de redes sociais do projeto NÃO contam como links externos

### REGRA 4 - FORMATAÇÃO SEO AVANÇADA CORRETA
- Sem espaços duplos entre palavras
- Sem pontuação duplicada (.. ou ,, ou !!)
- Sem parágrafos vazios ou tags HTML vazias
- Hierarquia correta: H2 > H3 > H4 (nunca pular níveis)
- Bold (<strong>) apenas em termos-chave, NÃO em frases inteiras
- Listas (ul/ol) bem formatadas com itens concisos

## 📊 DADOS DO PROJETO

**Identificação do Artigo:**
- Título Principal (H1): "${config.title || `Artigo sobre ${config.keyword}`}"
- Palavra-chave primária: "${config.keyword}"
${config.secondaryKeywords?.length > 0 ? `- Palavras-chave secundárias: ${config.secondaryKeywords.join(', ')}` : ''}
- Idioma: ${config.language || 'Português Brasileiro'}
- Ano Atual: ${config.currentYear}

**Especificações de Conteúdo:**
- Tamanho Alvo: ${wordRange.min}-${wordRange.max} palavras (ideal: ~${wordRange.target})
- Tom de Voz: ${config.tone}
- Ponto de Vista: ${pov}
- Tipo de Conteúdo: ${config.contentType}
- Segmento: ${config.segment}
- Objetivo: ${config.goal}

## 🎯 ESTRATÉGIA DE CONTEÚDO

${INTENT_GUIDELINES[config.intentType] || INTENT_GUIDELINES.informational}

### Estratégia de Abertura (primeiros 150 palavras):
1. **Hook** - Uma frase impactante com dado ou afirmação ousada
2. **Resposta Direta** - Responda à dúvida principal imediatamente (técnica BLUF)
3. **Promessa de Valor** - O que EXATAMENTE o leitor vai aprender/ganhar
4. **Credibilidade** - Dados, estatísticas ou experiência que gera confiança

**Exemplo de Abertura Efetiva:**
\`\`\`html
<p><strong>Mais de 67% das empresas que implementam [solução] veem resultados em 30 dias.</strong> Se você está se perguntando [dúvida principal], a resposta é [resposta direta em 1 frase]. Neste guia completo, você vai descobrir [promessa específica] baseado em [credencial/experiência].</p>
\`\`\`

${getSegmentGuidelines(config.segment)}

${getContentTypeGuidelines(config.contentType)}

${buildArchitectureSection(config)}

${buildEEATSection()}

${buildGEOAEOSection(config.keyword)}

${buildAdvancedLinkingSection(config)}

${buildFeaturedSnippetOptimization(config.keyword, config.includeFaq, config.faqCount)}

${buildCompanySection(config)}

${buildSalesSection(config)}

${config.humanizeContent ? buildHumanizationRules() : ''}

${buildTechnicalRules()}

## 🏷️ LIMITES RIGOROSOS DE SEO (OBRIGATÓRIO)

### Título do Artigo (H1):
- **LIMITE**: 55-80 caracteres (ideal 60-75)
- Se o título precisa de mais de 60 caracteres para fazer sentido COMPLETO, USE ATÉ 80
- NUNCA cortar o título no meio de uma palavra ou número
- NUNCA deixar parênteses abertos sem fechar → "(20" é PROIBIDO → FECHAR ou REMOVER
- NUNCA truncar números → "202" ao invés de "2026" é PROIBIDO → COMPLETAR ou REMOVER
- NUNCA deixar caracteres soltos no final: ), (, |, :, - sem contexto
- Inclua a palavra-chave primária no início do título
- Use números completos quando possível ("7 Dicas", "Guia 2026")
- PROIBIDO emojis no título SEO

**VALIDAÇÃO OBRIGATÓRIA DO TÍTULO:**
1. Conte os caracteres — se > 80, REDUZA reformulando (NUNCA cortando)
2. Última palavra COMPLETA? Parênteses FECHADOS? Números COMPLETOS (4 dígitos para anos)?
3. Se falhar, REFORMULE o título inteiro

**Exemplos:**
✅ "Advogado Trabalhista SP: Guia Completo de Direitos em 2026" (59 chars)
✅ "Como Funciona a Rescisão Indireta: Guia Completo Para o Trabalhador" (68 chars)
❌ "Advogado Trabalhista (20" — parêntese aberto, número truncado
❌ "Guia Completo de SEO |" — caractere solto no final

### Meta Description:
- **LIMITE**: 145-180 caracteres (ideal 155-175)
- A frase DEVE terminar com pontuação final (. ! ?) — NUNCA cortar no meio
- Se a frase precisa de mais de 160 chars, USE ATÉ 180 — preferível frase completa
- Inclua keyword nos primeiros 60 caracteres
- PROIBIDO emojis na meta description

**Formato obrigatório no início do artigo:**
\`\`\`html
<!-- META_DESCRIPTION: [145-180 caracteres, frase COMPLETA com pontuação final] -->
<!-- TITLE_SEO: [55-80 caracteres, COMPLETO, sem parênteses abertos] -->
\`\`\`

## ✅ CHECKLIST FINAL DE QUALIDADE (EXECUTAR OBRIGATORIAMENTE)

Antes de finalizar, verifique:
- [ ] **TÍTULO**: 55-80 caracteres, COMPLETO, sem parênteses abertos, sem números truncados
- [ ] **META DESCRIPTION**: 145-180 caracteres, frase COMPLETA com pontuação final
- [ ] Palavra-chave primária aparece no primeiro parágrafo
- [ ] Resposta direta à intenção de busca nos primeiros 150 palavras
- [ ] Todos os H2s têm variações semânticas da keyword
- [ ] Parágrafos com máximo 4 linhas (mobile-first)
- [ ] **LINKS INTERNOS**: Mínimo ${config.minInternalLinks || 10} links internos (OBRIGATÓRIO — conteúdo sem links internos é REJEITADO)
- [ ] MÁXIMO 3 links externos
- [ ] Anchor text diversificado (não repetitivo)
- [ ] Negrito usado estrategicamente (1-2 por parágrafo)
- [ ] Tom adequado ao segmento ${config.segment}
- [ ] Disclaimers necessários incluídos
${config.includeFaq ? `- [ ] FAQ com ${config.faqCount} perguntas otimizadas para featured snippets` : ''}
- [ ] Leitura fluida e natural (não robótica)
- [ ] Todos os links com target="_blank" rel="noopener noreferrer"
- [ ] Capitalização correta nos títulos
- [ ] HTML semântico e limpo

${config.sourcesContext ? `
## 📚 CONTEXTO E FONTES
**Material de Referência (Base factual obrigatória):**
${config.sourcesContext}

**Instruções**:
- Use 100% dos fatos fornecidos no contexto
- Não invente dados ou estatísticas
- Cite fontes específicas quando mencionar dados
` : ''}

${config.nlpTerms && config.nlpTerms.length > 0 ? `
## 🧠 TERMOS NLP PARA INCLUIR
Incorpore naturalmente estes termos relacionados:
${config.nlpTerms.join(', ')}
` : ''}

---

**IMPORTANTE**: Gere um artigo completo, pronto para publicação, em HTML semântico limpo, seguindo TODAS as diretrizes acima. O conteúdo deve ser indistinguível de um texto escrito por humano especialista, com fluidez natural e valor real para o leitor.

**CRÍTICO - LIMITES SEO**: 
- Título: 55-80 caracteres, COMPLETO, sem parênteses abertos, sem números truncados
- Meta Description: 145-180 caracteres, frase COMPLETA com pontuação final
- Links Internos: MÍNIMO 10 — conteúdo sem links internos é REJEITADO
Esses limites são INEGOCIÁVEIS para ranqueamento no Google.`;

  const userPrompt = `Escreva um artigo completo e otimizado para SEO sobre: "${config.keyword}"

${config.title ? `Título sugerido: "${config.title}" (ajuste para 55-80 caracteres se necessário, NUNCA corte — reformule)` : ''}

⚠️⚠️⚠️ REGRAS CRÍTICAS - VERIFICAR ANTES DE ENTREGAR ⚠️⚠️⚠️

1. **META-DESCRIPTION**: A PRIMEIRA LINHA do artigo DEVE ser:
   <!-- META_DESCRIPTION: [texto de 145-180 caracteres, frase COMPLETA com pontuação final] -->
   Se faltar, o artigo será REJEITADO.

2. **TITLE_SEO**: A SEGUNDA LINHA deve ser:
   <!-- TITLE_SEO: [título de 55-80 caracteres, COMPLETO, sem parênteses abertos, sem números truncados] -->

3. **LEGIBILIDADE FLESCH MÍNIMO 60 (ideal 70-100)**:
   - Cada frase deve ter NO MÁXIMO 15 palavras
   - Cada parágrafo deve ter NO MÁXIMO 3 linhas
   - Use APENAS palavras simples do dia-a-dia
   - PROIBIDO: orações subordinadas longas, vocabulário rebuscado
   - Se um termo é técnico, explique: "habeas corpus (pedido para soltar preso)"
   - Escreva como se falasse com um amigo de 14 anos
   - Score abaixo de 60 = CONTEÚDO REPROVADO, reescrever

4. **LINKS INTERNOS (OBRIGATÓRIO — ZERO TOLERÂNCIA)**:
   - MÍNIMO 10 links internos — conteúdo sem links internos é REJEITADO
   - Distribuir: 2 na introdução, 4-6 no corpo, 2 na conclusão
   - NUNCA usar "clique aqui" como anchor text
   - Formato: <a href="URL" target="_blank" rel="noopener noreferrer">texto descritivo</a>

5. **LINKS EXTERNOS (MÍNIMO 2, MÁXIMO 3)**: Fontes oficiais (.gov, .edu)
   - Formato: <a href="URL" target="_blank" rel="noopener noreferrer">texto</a>

6. **FORMATAÇÃO**: Sem espaços duplos, sem pontuação duplicada, H2>H3 correto

**Estrutura obrigatória:**
<!-- META_DESCRIPTION: [145-180 chars, frase COMPLETA] -->
<!-- TITLE_SEO: [55-80 chars, COMPLETO] -->

<h2>Primeira seção</h2>
<p>Frase curta e direta. Máximo 15 palavras.</p>

**Especificações:**
- Segmento: ${config.segment}
- Tipo: ${config.contentType}
- Tom: ${config.tone}
- Extensão: ${wordRange.min}-${wordRange.max} palavras
${config.includeFaq ? `- FAQ com ${config.faqCount} perguntas` : ''}
${config.includeConclusion ? '- Conclusão com resumo e CTA' : ''}
${config.includeTable ? '- Incluir tabela comparativa' : ''}

**CHECKLIST FINAL ANTES DE ENTREGAR:**
□ Meta-description: 145-180 chars, frase COMPLETA? 
□ Título: 55-80 chars, sem parênteses abertos, sem números truncados?
□ MÍNIMO 10 LINKS INTERNOS presentes? (OBRIGATÓRIO)
□ Frases CURTAS (máx 15 palavras)?
□ Linguagem SIMPLES?

Comece agora (HTML direto, sem backticks):`;

  return { system: systemPrompt, user: userPrompt };
}

// Export types and constants for testing
export { WORD_COUNT_RANGES, POV_MAP, INTENT_GUIDELINES };
