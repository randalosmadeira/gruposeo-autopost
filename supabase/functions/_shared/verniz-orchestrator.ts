/**
 * ZicaJuris Orchestrator v1.0 - Verniz DNA Engine
 * 
 * Detecção automática de nicho, compliance, gatilho emocional e ângulo de análise.
 * Integra o DNA "Madeira Sem Verniz" em toda geração de conteúdo.
 */

// =================== NICHE DETECTION ===================

export interface NichoDetection {
  nicho: string;
  compliance: string;
  disclaimers: string[];
  tomPadrao: string;
  povPadrao: string;
  tamanhoIdeal: string;
}

const NICHO_KEYWORDS: Record<string, string[]> = {
  juridico: ['advocacia', 'advogado', 'lei', 'processo', 'tribunal', 'justiça', 'direito', 'jurídico', 'stf', 'stj', 'oab', 'petição', 'recurso', 'sentença', 'honorários'],
  saude: ['médico', 'saúde', 'tratamento', 'doença', 'sintoma', 'hospital', 'clínica', 'diagnóstico', 'medicina', 'paciente', 'terapia', 'cirurgia', 'exame'],
  beleza: ['estética', 'beleza', 'procedimento', 'rejuvenescimento', 'pele', 'botox', 'preenchimento', 'micropigmentação', 'harmonização', 'laser'],
  tecnologia: ['app', 'software', 'código', 'tech', 'tecnologia', 'inteligência artificial', 'programação', 'sistema', 'plataforma', 'digital', 'startup'],
  marketing: ['vendas', 'marketing', 'roi', 'leads', 'conversão', 'tráfego', 'seo', 'campanha', 'funil', 'estratégia', 'branding'],
  fintech: ['banco', 'investimento', 'crédito', 'finança', 'pix', 'empréstimo', 'conta', 'cartão', 'rendimento', 'ação', 'bolsa'],
  ecommerce: ['loja', 'produto', 'compra', 'e-commerce', 'frete', 'carrinho', 'checkout', 'marketplace', 'estoque', 'dropshipping'],
  b2b_saas: ['saas', 'b2b', 'enterprise', 'crm', 'erp', 'cloud', 'api', 'integração', 'automação', 'gestão'],
  educacao: ['curso', 'certificação', 'ensino', 'aprendizado', 'escola', 'faculdade', 'mec', 'educação', 'professor', 'aluno'],
};

const NICHO_COMPLIANCE: Record<string, { compliance: string; disclaimers: string[]; tom: string; pov: string; tamanho: string }> = {
  juridico: {
    compliance: 'OAB/Res. 02/2015',
    disclaimers: ['Consulte um advogado para seu caso específico.', 'Este conteúdo tem caráter informativo e não substitui consultoria jurídica.'],
    tom: 'profissional', pov: '3p_singular', tamanho: 'grande',
  },
  saude: {
    compliance: 'CFM/ANVISA',
    disclaimers: ['Este conteúdo não substitui orientação médica profissional.', 'Procure um profissional de saúde para diagnóstico e tratamento.'],
    tom: 'informativo', pov: '3p_singular', tamanho: 'medio',
  },
  beleza: {
    compliance: 'ANVISA/Vigilância',
    disclaimers: ['Resultados podem variar de pessoa para pessoa.', 'Procure profissionais qualificados e com registro.'],
    tom: 'amigavel', pov: '2p_singular', tamanho: 'medio',
  },
  tecnologia: {
    compliance: 'LGPD',
    disclaimers: ['Dados tratados conforme a LGPD.'],
    tom: 'informativo', pov: '2p_singular', tamanho: 'grande',
  },
  marketing: {
    compliance: 'Geral',
    disclaimers: [],
    tom: 'transacional', pov: '2p_singular', tamanho: 'medio',
  },
  fintech: {
    compliance: 'BACEN/CVM',
    disclaimers: ['Não constitui recomendação de investimento.', 'Rentabilidade passada não garante resultados futuros.'],
    tom: 'profissional', pov: 'impessoal', tamanho: 'grande',
  },
  ecommerce: {
    compliance: 'CDC',
    disclaimers: ['Confira condições atualizadas no site oficial.'],
    tom: 'transacional', pov: '2p_singular', tamanho: 'medio',
  },
  b2b_saas: {
    compliance: 'LGPD',
    disclaimers: ['Dados tratados conforme a LGPD.'],
    tom: 'profissional', pov: '2p_singular', tamanho: 'grande',
  },
  educacao: {
    compliance: 'MEC',
    disclaimers: ['Verifique reconhecimento junto ao MEC.'],
    tom: 'encorajador', pov: '2p_singular', tamanho: 'grande',
  },
};

// =================== EMOTIONAL TRIGGER DETECTION ===================

export interface GatilhoEmocional {
  gatilho: string;
  emoji: string;
}

const GATILHO_KEYWORDS: Record<string, { keywords: string[]; emoji: string }> = {
  serio: { keywords: ['dados', 'oficial', 'lei', 'norma', 'resolução', 'regulamento', 'decreto'], emoji: '📰' },
  humor: { keywords: ['viral', 'meme', 'hilário', 'gafe', 'bizarro', 'engraçado'], emoji: '😄' },
  preocupacao: { keywords: ['alerta', 'risco', 'cuidado', 'perigo', 'atenção', 'urgente'], emoji: '⚠️' },
  revolta: { keywords: ['escândalo', 'fraude', 'corrupção', 'absurdo', 'indignação'], emoji: '😡' },
  angustia: { keywords: ['morte', 'tragédia', 'perda', 'vítima', 'acidente'], emoji: '😢' },
  sarcasmo: { keywords: ['ironia', 'contradição', 'hipocrisia', 'paradoxo'], emoji: '😏' },
  satira: { keywords: ['política', 'crítica', 'charge', 'sátira'], emoji: '🎭' },
  felicidade: { keywords: ['conquista', 'sucesso', 'aprovação', 'vitória', 'celebração'], emoji: '😊' },
  comemoracao: { keywords: ['recorde', 'premiação', 'campeão', 'medalha'], emoji: '🎉' },
  duvida: { keywords: ['incerteza', 'previsão', 'cenário', 'perspectiva', 'futuro'], emoji: '🤔' },
  misterio: { keywords: ['investigação', 'desaparecimento', 'segredo', 'enigma'], emoji: '🔮' },
};

// =================== ANGLE DETECTION ===================

export interface AnguloAnalise {
  angulo: string;
  descricao: string;
  adicionaConteudo: string;
}

const ANGULO_KEYWORDS: Record<string, { keywords: string[]; descricao: string; adiciona: string }> = {
  impacto_brasil: { keywords: ['internacional', 'eua', 'europa', 'china', 'global', 'mundial'], descricao: 'Impacto no Brasil', adiciona: '+40% contexto brasileiro' },
  analise_juridica: { keywords: ['legislação', 'processo', 'direito', 'tribunal', 'lei'], descricao: 'Análise Jurídica', adiciona: 'Implicações legais detalhadas' },
  visao_consumidor: { keywords: ['produto', 'serviço', 'preço', 'consumidor', 'compra'], descricao: 'Visão do Consumidor', adiciona: 'Impacto no bolso do leitor' },
  tendencia_mercado: { keywords: ['setor', 'mercado', 'economia', 'indústria', 'crescimento'], descricao: 'Tendência de Mercado', adiciona: 'Projeções e cenários' },
  opiniao_especialista: { keywords: ['técnico', 'especializado', 'estudo', 'pesquisa', 'análise'], descricao: 'Opinião de Especialista', adiciona: 'Análise técnica aprofundada' },
};

// =================== DETECTION FUNCTIONS ===================

export function detectarNicho(text: string): NichoDetection {
  const lower = text.toLowerCase();
  let bestNicho = 'geral';
  let bestScore = 0;

  for (const [nicho, keywords] of Object.entries(NICHO_KEYWORDS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestNicho = nicho;
    }
  }

  const config = NICHO_COMPLIANCE[bestNicho] || {
    compliance: 'Geral', disclaimers: [], tom: 'profissional', pov: '2p_singular', tamanho: 'medio',
  };

  return {
    nicho: bestNicho,
    compliance: config.compliance,
    disclaimers: config.disclaimers,
    tomPadrao: config.tom,
    povPadrao: config.pov,
    tamanhoIdeal: config.tamanho,
  };
}

export function detectarGatilho(text: string): GatilhoEmocional {
  const lower = text.toLowerCase();
  let bestGatilho = 'serio';
  let bestScore = 0;

  for (const [gatilho, { keywords, emoji }] of Object.entries(GATILHO_KEYWORDS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestGatilho = gatilho;
    }
  }

  return {
    gatilho: bestGatilho,
    emoji: GATILHO_KEYWORDS[bestGatilho]?.emoji || '📰',
  };
}

export function detectarAngulo(text: string): AnguloAnalise {
  const lower = text.toLowerCase();
  let bestAngulo = 'visao_consumidor';
  let bestScore = 0;

  for (const [angulo, { keywords, descricao, adiciona }] of Object.entries(ANGULO_KEYWORDS)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestAngulo = angulo;
    }
  }

  const config = ANGULO_KEYWORDS[bestAngulo];
  return {
    angulo: bestAngulo,
    descricao: config?.descricao || 'Análise Geral',
    adicionaConteudo: config?.adiciona || '',
  };
}

// =================== VERNIZ DNA PROMPT ===================

export interface VernizConfig {
  nichoDetectado: NichoDetection;
  gatilho: GatilhoEmocional;
  angulo: AnguloAnalise;
  empresaNome?: string;
  empresaTelefone?: string;
  empresaEndereco?: string;
  empresaWhatsapp?: string;
  socialInstagram?: string;
  socialYoutube?: string;
  socialLinkedin?: string;
  socialTwitter?: string;
  socialTiktok?: string;
  socialGoogleMaps?: string;
  socialLinktree?: string;
  ctaComunidade?: string;
  ctaConclusao?: string;
  ctaLeads?: string;
}

export function buildVernizDNASection(config: VernizConfig): string {
  const { nichoDetectado, gatilho, angulo } = config;

  let section = `
## 🧬 DNA "MADEIRA SEM VERNIZ" - APLICAR OBRIGATORIAMENTE

### Filosofia Central:
"Informação de verdade, sem firula. O leitor tem que entender, não ficar impressionado com palavras difíceis."

### Regras de Escrita OBRIGATÓRIAS:

**🎯 LEGIBILIDADE FLESCH 70-100 (OBRIGATÓRIO):**
- Sentenças de no MÁXIMO 15-18 palavras em média
- Use palavras curtas e comuns (2-3 sílabas no máximo)
- Um semi-analfabeto deve conseguir ler e entender o conteúdo
- Score Flesch abaixo de 70 = REPROVAR e reescrever

**LINGUAGEM DO DIA-A-DIA:**
- ❌ "O jurisdicionado deve impetrar" → ✅ "Você precisa entrar com"
- ❌ "A implementação do procedimento" → ✅ "Como fazer na prática"
- ❌ "Outrossim, cumpre salientar" → ✅ "Além disso"
- ❌ "Alavancar resultados" → ✅ "Aumentar vendas"
- ❌ "Sinergia entre áreas" → ✅ "Trabalho em equipe"
- ❌ "Paradigma" → ✅ "Modelo" ou "Padrão"
- ❌ "Prerrogativa" → ✅ "Direito"
- ❌ "Fulcral" → ✅ "Importante"

**META-DESCRIPTION OBRIGATÓRIA:**
- NUNCA entregar conteúdo sem meta-description
- Sempre gerar <!-- META_DESCRIPTION: ... --> com 145-160 caracteres

**LINKS EXTERNOS OBRIGATÓRIOS (mínimo 2):**
- Sempre incluir 2-3 links para fontes oficiais (.gov, .edu, instituições)
- Formato: <a href="URL" target="_blank" rel="noopener noreferrer">texto</a>

**DESMITIFICAR O SISTEMA:**
- Explique COMO funciona, não apenas O QUE é
- Mostre os bastidores que ninguém conta
- Use padrões: "O que ninguém te conta é que...", "Na prática, o que acontece de verdade é..."
- Para conceitos complexos, use analogias do cotidiano

**ESTRUTURA DE EXPLICAÇÃO para termos técnicos:**
[TERMO] (em português claro: [explicação])
Na prática, isso significa que [consequência real para o leitor].
💡 Exemplo do dia a dia: [analogia com situação comum]

**TOM CONSULTIVO-PRÓXIMO:**
- Como se estivesse explicando para um amigo inteligente
- Frases-gatilho: "Olha, na real...", "Vou ser direto com você:", "Se tivesse que te dar um conselho:"

### REGRA 80/20 - LEI 9.610/98:
- **20% BASE ORIGINAL**: Dados, citações diretas com aspas, fatos verificáveis
- **80% REESCRITA**: Análise, contexto, linguagem própria, comparações, exemplos

### PROIBIÇÕES ABSOLUTAS:
1. ❌ Palavras vazias: "incrível", "revolucionário", "o melhor", "único"
2. ❌ Promessas irreais: "garantido", "100% seguro", "sem risco"
3. ❌ Termos técnicos SEM explicar
4. ❌ Parágrafos > 4 linhas
5. ❌ Iniciar com "De acordo com" ou "Segundo"
6. ❌ CTAs genéricos: "clique aqui", "saiba mais"

## 🎯 DETECÇÃO AUTOMÁTICA APLICADA

**Nicho**: ${nichoDetectado.nicho} | **Compliance**: ${nichoDetectado.compliance}
**Gatilho Emocional**: ${gatilho.gatilho} ${gatilho.emoji}
**Ângulo de Análise**: ${angulo.descricao} (${angulo.adicionaConteudo})`;

  // Add disclaimers
  if (nichoDetectado.disclaimers.length > 0) {
    section += `\n\n### DISCLAIMERS OBRIGATÓRIOS (incluir no final do artigo):`;
    nichoDetectado.disclaimers.forEach(d => {
      section += `\n- "${d}"`;
    });
  }

  // Add company data
  if (config.empresaNome || config.empresaTelefone) {
    section += `\n\n### DADOS DA EMPRESA (usar em CTAs personalizados):`;
    if (config.empresaNome) section += `\n- **Empresa**: ${config.empresaNome}`;
    if (config.empresaTelefone) section += `\n- **Telefone**: ${config.empresaTelefone}`;
    if (config.empresaWhatsapp) section += `\n- **WhatsApp**: ${config.empresaWhatsapp}`;
    if (config.empresaEndereco) section += `\n- **Endereço**: ${config.empresaEndereco}`;
  }

  // Add social media links for Link Juice & SEO
  const socialLinks: string[] = [];
  if (config.socialInstagram) socialLinks.push(`Instagram: ${config.socialInstagram}`);
  if (config.socialYoutube) socialLinks.push(`YouTube: ${config.socialYoutube}`);
  if (config.socialLinkedin) socialLinks.push(`LinkedIn: ${config.socialLinkedin}`);
  if (config.socialTwitter) socialLinks.push(`X/Twitter: ${config.socialTwitter}`);
  if (config.socialTiktok) socialLinks.push(`TikTok: ${config.socialTiktok}`);
  if (config.socialGoogleMaps) socialLinks.push(`Google Maps: ${config.socialGoogleMaps}`);
  if (config.socialLinktree) socialLinks.push(`Links: ${config.socialLinktree}`);

  if (socialLinks.length > 0) {
    section += `\n\n### 📱 REDES SOCIAIS (inserir como Link Juice estratégico):`;
    socialLinks.forEach(l => { section += `\n- ${l}`; });
    section += `\n\n**REGRAS DE INSERÇÃO DE REDES SOCIAIS:**`;
    section += `\n- Inserir 1-2 links sociais contextualmente relevantes ao longo do artigo`;
    section += `\n- Usar como CTA de engajamento: "Acompanhe no Instagram", "Inscreva-se no canal"`;
    section += `\n- Google Maps: usar em CTAs de contato/localização`;
    section += `\n- Links agregadores: usar como CTA final "Veja todos os nossos canais"`;
    section += `\n- Formato: <a href="URL" target="_blank" rel="noopener noreferrer">texto âncora</a>`;
  }

  // Add CTA strategy
  if (config.ctaComunidade || config.ctaConclusao || config.ctaLeads) {
    section += `\n\n### 🎯 ESTRATÉGIA DE CTAs OBRIGATÓRIOS:`;
    if (config.ctaComunidade) {
      section += `\n\n**CTA COMUNIDADE** (inserir no meio do artigo, após seção de maior valor):`;
      section += `\n"${config.ctaComunidade}"`;
    }
    if (config.ctaConclusao) {
      section += `\n\n**CTA CONCLUSÃO** (inserir obrigatoriamente no fechamento):`;
      section += `\n"${config.ctaConclusao}"`;
    }
    if (config.ctaLeads) {
      section += `\n\n**CTA LEADS** (inserir após seções sobre erros comuns ou problemas frequentes):`;
      section += `\n"${config.ctaLeads}"`;
    }
  }

  return section;
}

// =================== FULL ORCHESTRATOR ===================

export interface OrchestrationResult {
  vernizSection: string;
  nichoDetectado: NichoDetection;
  gatilho: GatilhoEmocional;
  angulo: AnguloAnalise;
}

export function orchestrate(
  title: string,
  keyword: string,
  projectConfig?: {
    nicho?: string;
    compliance_rules?: string;
    empresa_nome?: string;
    empresa_telefone?: string;
    empresa_endereco?: string;
    empresa_whatsapp?: string;
    social_instagram?: string;
    social_youtube?: string;
    social_linkedin?: string;
    social_twitter?: string;
    social_tiktok?: string;
    social_google_maps?: string;
    social_linktree?: string;
    cta_comunidade?: string;
    cta_conclusao?: string;
    cta_leads?: string;
  }
): OrchestrationResult {
  const fullText = `${title} ${keyword}`;
  
  // Use project nicho if set, otherwise detect
  let nichoDetectado = detectarNicho(fullText);
  if (projectConfig?.nicho && projectConfig.nicho !== 'auto') {
    const overrideConfig = NICHO_COMPLIANCE[projectConfig.nicho];
    if (overrideConfig) {
      nichoDetectado = {
        nicho: projectConfig.nicho,
        compliance: projectConfig.compliance_rules || overrideConfig.compliance,
        disclaimers: overrideConfig.disclaimers,
        tomPadrao: overrideConfig.tom,
        povPadrao: overrideConfig.pov,
        tamanhoIdeal: overrideConfig.tamanho,
      };
    }
  }

  const gatilho = detectarGatilho(fullText);
  const angulo = detectarAngulo(fullText);

  const vernizSection = buildVernizDNASection({
    nichoDetectado,
    gatilho,
    angulo,
    empresaNome: projectConfig?.empresa_nome,
    empresaTelefone: projectConfig?.empresa_telefone,
    empresaEndereco: projectConfig?.empresa_endereco,
    empresaWhatsapp: projectConfig?.empresa_whatsapp,
    socialInstagram: projectConfig?.social_instagram,
    socialYoutube: projectConfig?.social_youtube,
    socialLinkedin: projectConfig?.social_linkedin,
    socialTwitter: projectConfig?.social_twitter,
    socialTiktok: projectConfig?.social_tiktok,
    socialGoogleMaps: projectConfig?.social_google_maps,
    socialLinktree: projectConfig?.social_linktree,
    ctaComunidade: projectConfig?.cta_comunidade,
    ctaConclusao: projectConfig?.cta_conclusao,
    ctaLeads: projectConfig?.cta_leads,
  });

  return { vernizSection, nichoDetectado, gatilho, angulo };
}

// Export all available nichos for frontend
export const NICHOS_DISPONIVEIS = [
  { value: 'auto', label: 'Detecção Automática', description: 'O sistema detecta o nicho baseado no conteúdo' },
  { value: 'juridico', label: 'Jurídico / Advocacia', description: 'Compliance OAB/Res. 02/2015' },
  { value: 'saude', label: 'Saúde / Medicina', description: 'Compliance CFM/ANVISA' },
  { value: 'beleza', label: 'Beleza / Estética', description: 'Compliance ANVISA/Vigilância' },
  { value: 'tecnologia', label: 'Tecnologia', description: 'Compliance LGPD' },
  { value: 'marketing', label: 'Marketing Digital', description: 'Geral' },
  { value: 'fintech', label: 'Finanças / Fintech', description: 'Compliance BACEN/CVM' },
  { value: 'ecommerce', label: 'E-commerce', description: 'Compliance CDC' },
  { value: 'b2b_saas', label: 'B2B / SaaS', description: 'Compliance LGPD' },
  { value: 'educacao', label: 'Educação', description: 'Compliance MEC' },
];
