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

// =================== VERNIZ DNA MATRIX (Nicho × Gatilho) ===================

export type VernizNicheType = 'geral' | 'advocacia' | 'saude' | 'beleza' | 'tecnologia' | 'marketing';
export type VernizTriggerType = 'serio' | 'humor' | 'preocupacao' | 'revolta' | 'angustia' | 'sarcasmo' | 'satira' | 'felicidade' | 'comemoracao' | 'duvida' | 'misterio';

interface VernizDNAEntry {
  tone: string;
  vocabulary: string[];
  cta: string;
  imageStyle: string;
}

/**
 * Matriz 6×11 — Nicho × Gatilho Emocional
 * Define tom, vocabulário, CTA e estilo de imagem por combinação.
 */
export const VERNIZ_DNA_MATRIX: Record<VernizNicheType, Record<VernizTriggerType, VernizDNAEntry>> = {
  geral: {
    serio: { tone: "Formal e factual", vocabulary: ["determina", "estabelece", "conforme"], cta: "Acompanhe as atualizações", imageStyle: "tons sóbrios, azul-marinho, ambiente formal" },
    humor: { tone: "Leve e acessível", vocabulary: ["inusitado", "surpreende", "plot twist"], cta: "Compartilhe essa curiosidade", imageStyle: "cores vibrantes, expressões cômicas" },
    preocupacao: { tone: "Cauteloso e orientador", vocabulary: ["alerta", "atenção", "risco"], cta: "Fique atento às mudanças", imageStyle: "tons amarelos/laranjas, rostos pensativos" },
    revolta: { tone: "Denúncia fundamentada", vocabulary: ["absurdo", "inaceitável", "escândalo"], cta: "Compartilhe para que mais pessoas saibam", imageStyle: "contrastes fortes, tons vermelhos" },
    angustia: { tone: "Empático e sensível", vocabulary: ["drama", "tragédia", "apelo"], cta: "Saiba como ajudar", imageStyle: "tons escuros, silhuetas" },
    sarcasmo: { tone: "Questionador e mordaz", vocabulary: ["claro que sim", "como sempre", "surpreendente"], cta: "Tire suas próprias conclusões", imageStyle: "expressões irônicas" },
    satira: { tone: "Crítica social elegante", vocabulary: ["em um país onde", "mais uma vez"], cta: "Reflexão que vale o compartilhamento", imageStyle: "cenários absurdos estilizados" },
    felicidade: { tone: "Otimista e celebratório", vocabulary: ["conquista", "vitória", "avanço"], cta: "Celebre essa conquista", imageStyle: "cores quentes, sorrisos, luz natural" },
    comemoracao: { tone: "Festivo e orgulhoso", vocabulary: ["celebra", "recorde", "inédito"], cta: "Parabéns a todos os envolvidos", imageStyle: "dourado, troféus, confetes" },
    duvida: { tone: "Investigativo e reflexivo", vocabulary: ["será que", "ninguém explica", "controvérsia"], cta: "O que você acha? Comente", imageStyle: "lupa, documentos, sombras" },
    misterio: { tone: "Suspense e instigante", vocabulary: ["enigma", "sem resposta", "revelação"], cta: "Descubra o que ninguém está contando", imageStyle: "névoa, silhuetas, portas entreabertas" },
  },
  advocacia: {
    serio: { tone: "Técnico-institucional", vocabulary: ["conforme legislação", "jurisprudência consolidada", "entendimento do STF"], cta: "Consulte um advogado especializado", imageStyle: "martelo jurídico, balança da justiça, tons azul-marinho" },
    humor: { tone: "Didático leve", vocabulary: ["acredite se quiser", "a lei prevê que", "surpreendentemente legal"], cta: "Conheça seus direitos", imageStyle: "ilustração conceitual jurídica" },
    preocupacao: { tone: "Alerta jurídico preventivo", vocabulary: ["risco legal", "pode ser penalizado", "atenção ao prazo"], cta: "Não perca seus direitos — consulte um advogado", imageStyle: "relógio, documentos, tons de alerta" },
    revolta: { tone: "Denúncia jurídica fundamentada", vocabulary: ["afronta à constituição", "violação de direitos", "impunidade"], cta: "Não aceite — conheça seus direitos", imageStyle: "punho cerrado, constituição, tons vermelhos escuros" },
    angustia: { tone: "Defesa humanizada", vocabulary: ["desespero jurídico", "sem amparo legal", "clamor por justiça"], cta: "Busque orientação jurídica agora", imageStyle: "silhueta em tribunal, tons sombrios" },
    sarcasmo: { tone: "Crítica jurídica afiada", vocabulary: ["a justiça é cega — literalmente", "mais uma decisão surpreendente"], cta: "Entenda o que isso significa na prática", imageStyle: "balança desequilibrada, expressão irônica" },
    satira: { tone: "Paródia jurídica inteligente", vocabulary: ["no país da jurisprudência criativa", "lei para inglês ver"], cta: "Reflexão jurídica para compartilhar", imageStyle: "caricatura de tribunal" },
    felicidade: { tone: "Conquista de direitos", vocabulary: ["vitória judicial", "direito garantido", "marco jurídico"], cta: "Conheça essa conquista", imageStyle: "martelo jurídico dourado, sorrisos" },
    comemoracao: { tone: "Marco legal celebratório", vocabulary: ["decisão histórica", "precedente inédito", "avanço legislativo"], cta: "Uma vitória para todos os brasileiros", imageStyle: "tribunal iluminado, bandeira" },
    duvida: { tone: "Investigação jurídica", vocabulary: ["lacuna legal", "interpretação controversa", "divergência doutrinária"], cta: "Consulte um especialista para seu caso", imageStyle: "códigos jurídicos, lupa, interrogação" },
    misterio: { tone: "Caso jurídico instigante", vocabulary: ["processo sigiloso", "decisão oculta", "o que não foi publicado"], cta: "Acompanhe os desdobramentos", imageStyle: "pasta sigilosa, sombras no tribunal" },
  },
  saude: {
    serio: { tone: "Médico-informativo baseado em evidências", vocabulary: ["estudo comprova", "evidência científica", "protocolo clínico"], cta: "Consulte seu médico", imageStyle: "jaleco branco, estetoscópio, tons azul-claros" },
    humor: { tone: "Saúde descomplicada", vocabulary: ["calma que tem solução", "não é o fim do mundo", "respira fundo"], cta: "Cuide-se com leveza", imageStyle: "ilustração médica alegre" },
    preocupacao: { tone: "Alerta médico preventivo", vocabulary: ["atenção redobrada", "sintomas de alerta", "procure atendimento"], cta: "Agende uma consulta preventiva", imageStyle: "tons amarelos, termômetro, atenção" },
    revolta: { tone: "Denúncia sanitária", vocabulary: ["descaso com a saúde", "sistema falha", "pacientes abandonados"], cta: "Exija seus direitos como paciente", imageStyle: "hospital lotado, tons vermelhos" },
    angustia: { tone: "Empatia médica profunda", vocabulary: ["sofrimento silencioso", "luta diária", "esperança de tratamento"], cta: "Você não está sozinho — busque ajuda", imageStyle: "mãos que acolhem, tons suaves" },
    sarcasmo: { tone: "Crítica ao sistema de saúde", vocabulary: ["saúde de primeiro mundo", "fila de apenas 6 meses"], cta: "Informe-se e cobre mudanças", imageStyle: "contraste hospital público/privado" },
    satira: { tone: "Saúde com ironia inteligente", vocabulary: ["no país do SUS criativo", "remédio mais eficaz: paciência"], cta: "Ria para não chorar — e cuide-se", imageStyle: "ilustração satírica médica" },
    felicidade: { tone: "Avanço médico celebratório", vocabulary: ["cura descoberta", "tratamento revolucionário", "esperança renovada"], cta: "Descubra como se beneficiar", imageStyle: "laboratório iluminado, sorrisos" },
    comemoracao: { tone: "Marco na saúde", vocabulary: ["vacina aprovada", "recorde de transplantes", "erradicação histórica"], cta: "Uma conquista para a humanidade", imageStyle: "confetes em hospital, equipe médica" },
    duvida: { tone: "Investigação médica", vocabulary: ["estudo controverso", "dados conflitantes", "pesquisa questiona"], cta: "Consulte seu médico sobre esse tema", imageStyle: "microscópio, dados, interrogação" },
    misterio: { tone: "Descoberta médica instigante", vocabulary: ["doença rara", "caso sem explicação", "medicina não sabe"], cta: "Acompanhe as pesquisas", imageStyle: "laboratório escuro, microscópio" },
  },
  beleza: {
    serio: { tone: "Estético-científico", vocabulary: ["dermatologicamente testado", "ativo comprovado", "protocolo estético"], cta: "Agende sua avaliação", imageStyle: "clínica estética clean, tons brancos e rosé" },
    humor: { tone: "Beauty fun", vocabulary: ["glow up real", "skincare não é frescura", "beleza sem drama"], cta: "Experimente e nos conte!", imageStyle: "cores pastel, expressões divertidas" },
    preocupacao: { tone: "Alerta estético responsável", vocabulary: ["cuidado com", "procedimento arriscado", "verifique a qualificação"], cta: "Consulte um dermatologista antes", imageStyle: "tons de alerta suaves, pele com zoom" },
    revolta: { tone: "Denúncia estética", vocabulary: ["procedimento clandestino", "risco à saúde", "profissional não habilitado"], cta: "Denuncie e se proteja", imageStyle: "contraste antes/depois negativo, tons vermelhos" },
    angustia: { tone: "Autoestima e acolhimento", vocabulary: ["insegurança", "pressão estética", "aceitação"], cta: "Você é mais do que aparência", imageStyle: "espelho, reflexo, tons suaves" },
    sarcasmo: { tone: "Beauty critic", vocabulary: ["mais um milagre em frasco", "promessa de 10 anos mais jovem"], cta: "Não caia em promessas milagrosas", imageStyle: "produto com etiqueta irônica" },
    satira: { tone: "Humor beauty inteligente", vocabulary: ["rotina de 47 passos", "tendência que ninguém pediu"], cta: "Ria e cuide da sua pele", imageStyle: "caricatura beauty" },
    felicidade: { tone: "Glow celebratório", vocabulary: ["resultado incrível", "autoestima renovada", "tendência que funciona"], cta: "Descubra como conseguir esse resultado", imageStyle: "pele radiante, luz natural, dourado" },
    comemoracao: { tone: "Beauty milestone", vocabulary: ["inovação premiada", "tratamento revolucionário"], cta: "Conheça a novidade", imageStyle: "troféu beauty, embalagem premium" },
    duvida: { tone: "Beauty investigativo", vocabulary: ["funciona mesmo?", "mito ou verdade", "a ciência diz que"], cta: "Descubra a verdade", imageStyle: "lupa sobre produto, interrogação" },
    misterio: { tone: "Segredo beauty revelado", vocabulary: ["ingrediente secreto", "poucos sabem", "revelação exclusiva"], cta: "Descubra o que funciona de verdade", imageStyle: "frasco misterioso, névoa suave" },
  },
  tecnologia: {
    serio: { tone: "Tech analítico", vocabulary: ["dados demonstram", "benchmark confirma", "adoção enterprise"], cta: "Implemente na sua operação", imageStyle: "dashboard, código, tons azuis tech" },
    humor: { tone: "Tech descontraído", vocabulary: ["bug vira feature", "AI não dominou o mundo ainda", "404 not found na vida real"], cta: "Compartilhe com seu dev favorito", imageStyle: "memes tech estilizados" },
    preocupacao: { tone: "Alerta tech responsável", vocabulary: ["vulnerabilidade crítica", "dados expostos", "risco de privacidade"], cta: "Proteja seus dados agora", imageStyle: "cadeado aberto, tela vermelha" },
    revolta: { tone: "Denúncia tech", vocabulary: ["big tech abusa", "monopólio digital", "dados vendidos"], cta: "Exija transparência", imageStyle: "correntes digitais, tons vermelhos" },
    angustia: { tone: "Impacto tech humano", vocabulary: ["empregos ameaçados", "dependência digital", "solidão conectada"], cta: "Reflita sobre seu uso de tecnologia", imageStyle: "humano vs máquina, tons frios" },
    sarcasmo: { tone: "Tech critic afiado", vocabulary: ["mais uma revolução que muda tudo", "desta vez a IA é diferente"], cta: "Veja os dados reais", imageStyle: "hype vs realidade" },
    satira: { tone: "Tech humor inteligente", vocabulary: ["no Vale do Silício da esperança", "startup de startup"], cta: "Ria antes que automatizem o humor", imageStyle: "robô em situação absurda" },
    felicidade: { tone: "Inovação celebratória", vocabulary: ["marco histórico", "revolução", "futuro chegou"], cta: "Explore a nova tecnologia", imageStyle: "foguete, chips, luz neon positiva" },
    comemoracao: { tone: "Tech milestone", vocabulary: ["recorde de processamento", "lançamento épico", "adoção massiva"], cta: "O futuro é agora", imageStyle: "palco de lançamento, confetes digitais" },
    duvida: { tone: "Tech investigativo", vocabulary: ["promete mas entrega?", "dados não batem", "benchmark questionável"], cta: "Analise antes de adotar", imageStyle: "gráficos com interrogação" },
    misterio: { tone: "Tech enigmático", vocabulary: ["projeto secreto", "patente revelada", "o que estão escondendo"], cta: "Acompanhe os bastidores da tech", imageStyle: "servidor escuro, código misterioso" },
  },
  marketing: {
    serio: { tone: "Data-driven estratégico", vocabulary: ["ROI comprova", "métricas indicam", "benchmark setorial"], cta: "Otimize sua estratégia agora", imageStyle: "dashboard analítico, gráficos, tons profissionais" },
    humor: { tone: "Marketing descomplicado", vocabulary: ["funilzinho maroto", "lead qualificado (finalmente)", "CTA irrecusável"], cta: "Teste e nos conte o resultado", imageStyle: "funil colorido, emojis profissionais" },
    preocupacao: { tone: "Alerta de mercado", vocabulary: ["orçamento em risco", "métrica no vermelho", "mercado instável"], cta: "Revise sua estratégia hoje", imageStyle: "gráfico em queda, tons amarelos" },
    revolta: { tone: "Denúncia de mercado", vocabulary: ["golpe do marketing fácil", "guru vendendo fumaça", "promessa vazia"], cta: "Exija resultados reais", imageStyle: "gráfico falso vs real, tons vermelhos" },
    angustia: { tone: "Crise de marketing", vocabulary: ["campanha fracassou", "budget cortado", "equipe reduzida"], cta: "Encontre saída com estratégia", imageStyle: "escritório vazio, gráficos negativos" },
    sarcasmo: { tone: "Anti-guru", vocabulary: ["mais uma promessa de 6 dígitos", "hack infalível número 847"], cta: "Veja o que os dados dizem de verdade", imageStyle: "guru vs realidade, split screen" },
    satira: { tone: "Marketing humor ácido", vocabulary: ["persona imaginária perfeita", "jornada do cliente de 47 touchpoints"], cta: "Simplifique antes de complicar", imageStyle: "funil absurdamente complexo" },
    felicidade: { tone: "Resultado celebratório", vocabulary: ["meta batida", "ROAS recorde", "crescimento exponencial"], cta: "Replique essa estratégia", imageStyle: "dashboard no verde, confetes" },
    comemoracao: { tone: "Marketing milestone", vocabulary: ["case de sucesso", "premiação", "benchmark do setor"], cta: "Inspire-se nesse resultado", imageStyle: "troféu, dashboard premiado" },
    duvida: { tone: "Marketing investigativo", vocabulary: ["funciona mesmo?", "dados manipulados?", "será hype?"], cta: "Analise antes de investir", imageStyle: "lupa sobre gráfico, interrogação" },
    misterio: { tone: "Estratégia oculta", vocabulary: ["o que ninguém conta", "algoritmo secreto", "estratégia revelada"], cta: "Descubra o que os líderes fazem diferente", imageStyle: "porta-de-sala-de-estratégia" },
  },
};

// Map orchestrator nicho names to VERNIZ_DNA matrix keys
const NICHO_TO_VERNIZ: Record<string, VernizNicheType> = {
  juridico: 'advocacia',
  advocacia: 'advocacia',
  saude: 'saude',
  beleza: 'beleza',
  tecnologia: 'tecnologia',
  marketing: 'marketing',
  geral: 'geral',
  fintech: 'geral',
  ecommerce: 'marketing',
  b2b_saas: 'tecnologia',
  educacao: 'geral',
};

/**
 * Resolve the VERNIZ_DNA entry for a given nicho + gatilho combination.
 * Returns tone, vocabulary, CTA and imageStyle.
 */
export function resolveVernizDNA(nicho: string, gatilho: string): VernizDNAEntry | null {
  const mappedNicho = NICHO_TO_VERNIZ[nicho] || 'geral';
  const mappedTrigger = (gatilho || 'serio') as VernizTriggerType;
  return VERNIZ_DNA_MATRIX[mappedNicho]?.[mappedTrigger] || null;
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

**🎯 LEGIBILIDADE FLESCH 60-100 (OBRIGATÓRIO - MÍNIMO 60):**

📊 **Escala Flesch (referência obrigatória):**
| Score | Nível | Escolaridade |
|-------|-------|-------------|
| 90-100 | Muito Fácil | 5º ano — criança de 11 anos entende |
| 80-89 | Fácil | 6º ano |
| 70-79 | Bastante Fácil | 8º ano — maioria dos adultos |
| 60-69 | Padrão | 8º-9º ano — inglês simples, ideal para web |
| < 60 | ❌ REPROVADO | Reescrever obrigatoriamente |

- Sentenças de no MÁXIMO 15-18 palavras em média
- Use palavras curtas e comuns (2-3 sílabas no máximo)
- Um semi-analfabeto deve conseguir ler e entender o conteúdo
- Score Flesch abaixo de 60 = REPROVAR e reescrever
- NUNCA entregar conteúdo com Flesch abaixo de 60

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

  // Inject VERNIZ_DNA matrix tone/vocabulary/CTA/imageStyle
  const dnaEntry = resolveVernizDNA(nichoDetectado.nicho, gatilho.gatilho);
  if (dnaEntry) {
    section += `\n\n### 🎨 VERNIZ DNA ATIVO (${nichoDetectado.nicho} × ${gatilho.gatilho}):`;
    section += `\n- **Tom**: "${dnaEntry.tone}"`;
    section += `\n- **Vocabulário-chave**: ${dnaEntry.vocabulary.join(', ')}`;
    section += `\n- **CTA padrão do gatilho**: "${dnaEntry.cta}"`;
    section += `\n- **Estilo de imagem**: ${dnaEntry.imageStyle}`;
    section += `\n\n**REGRA**: Adapte TODO o conteúdo ao tom "${dnaEntry.tone}" e use o vocabulário-chave naturalmente.`;
  }
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
    section += `\n\n### 📱 REDES SOCIAIS - CITAR TODAS OBRIGATORIAMENTE:`;
    socialLinks.forEach(l => { section += `\n- ${l}`; });
    section += `\n\n**REGRAS DE INSERÇÃO DE REDES SOCIAIS (OBRIGATÓRIO):**`;
    section += `\n- TODAS as redes sociais listadas acima DEVEM ser citadas no artigo`;
    section += `\n- Criar seção "Acompanhe nossos canais" ou "Siga-nos" antes da conclusão`;
    section += `\n- Distribuir CTAs sociais ao longo do texto quando contextualmente relevante:`;
    section += `\n  • Instagram: "Acompanhe dicas diárias no nosso Instagram"`;
    section += `\n  • YouTube: "Assista nossos vídeos explicativos no YouTube"`;
    section += `\n  • LinkedIn: "Conecte-se conosco no LinkedIn"`;
    section += `\n  • TikTok: "Veja conteúdos rápidos no TikTok"`;
    section += `\n  • Google Maps: "Encontre nosso escritório/loja no Google Maps"`;
    section += `\n  • Linktree: "Acesse todos os nossos links"`;
    section += `\n- Formato: <a href="URL" target="_blank" rel="noopener noreferrer">texto âncora</a>`;
    section += `\n- NÃO contar links de redes sociais como "links externos" (são links de autoridade da marca)`;
  }

  // Add 5-CTA strategy (RDM Standard)
  const hasCtas = config.ctaComunidade || config.ctaConclusao || config.ctaLeads;
  const hasCompany = config.empresaNome || config.empresaEndereco;
  const siteUrl = config.socialLinktree || '';

  if (hasCtas || hasCompany) {
    section += `\n\n### 🎯 CTAs ESTRATÉGICOS (renderizar como HTML natural — SEM rótulos técnicos):`;
    section += `\n\n⚠️ **REGRA ABSOLUTA**: NUNCA exibir rótulos como "[CTA #1]", "[CTA #2]", "[CTA #3]", "[CTA #4]", "[CTA #5]", "CTA", "CALL TO ACTION" ou qualquer marcador técnico no texto final.`;
    section += `\nOs CTAs devem ser renderizados como blocos HTML visuais naturais (blockquote, div, parágrafo com link) — o leitor NUNCA deve saber que é um "CTA".`;
    section += `\nSe aparecer "[CTA" em qualquer parte do artigo final, é um ERRO GRAVE.`;

    // CTA de urgência (após introdução/gancho)
    section += `\n\n**Bloco de urgência** (inserir APÓS os 2 primeiros parágrafos como <blockquote> ou <div>):`;
    section += `\nConteúdo sugerido:`;
    if (config.ctaLeads) section += `\n- ${config.ctaLeads}`;
    if (config.empresaNome) section += `\n- Link: <a href="${siteUrl}">Fale agora com um especialista</a>`;
    if (config.empresaEndereco) section += `\n- Endereço: ${config.empresaEndereco}`;

    // CTA de autoridade (após corpo principal)
    section += `\n\n**Bloco de autoridade** (inserir após seção de maior valor técnico como <blockquote>):`;
    if (config.empresaNome) {
      section += `\nCriar uma citação de autoridade na voz da empresa ${config.empresaNome}`;
      if (config.empresaEndereco) section += `\n- ${config.empresaEndereco}`;
    }

    // CTA de lead/avaliação (após erros comuns)
    if (config.ctaLeads) {
      section += `\n\n**Bloco de avaliação gratuita** (inserir após seção de erros comuns como <div> estilizado):`;
      section += `\nConteúdo: ${config.ctaLeads}`;
      section += `\n- Resposta rápida • Sem compromisso • Atendimento humano`;
      section += `\n- Link: <a href="${siteUrl}">Avaliar meu caso gratuitamente</a>`;
    }

    // CTA de comunidade e redes sociais
    if (config.ctaComunidade) {
      section += `\n\n**Bloco de redes sociais** (inserir antes da conclusão como seção com links):`;
      section += `\nTítulo sugerido: "${config.ctaComunidade}"`;
      if (config.socialInstagram) section += `\n- Instagram: <a href="${config.socialInstagram}">@perfil</a>`;
      if (config.socialYoutube) section += `\n- YouTube: <a href="${config.socialYoutube}">Canal</a>`;
      if (config.socialTiktok) section += `\n- TikTok: <a href="${config.socialTiktok}">@perfil</a>`;
      if (config.socialLinkedin) section += `\n- LinkedIn: <a href="${config.socialLinkedin}">Perfil</a>`;
      if (config.socialTwitter) section += `\n- X: <a href="${config.socialTwitter}">@perfil</a>`;
      if (config.socialLinktree) section += `\n- Links: <a href="${config.socialLinktree}">Todos os links</a>`;
    }

    // CTA de fechamento
    if (config.ctaConclusao) {
      section += `\n\n**Bloco de fechamento** (inserir no final do artigo como <div> ou <blockquote>):`;
      section += `\nConteúdo: ${config.ctaConclusao}`;
      if (config.empresaEndereco) section += `\n- Endereço: ${config.empresaEndereco}`;
      if (config.socialGoogleMaps) section += `\n- Google Maps: <a href="${config.socialGoogleMaps}">Ver no mapa</a>`;
      section += `\n- Link: <a href="${siteUrl}">Resolver agora</a>`;
    }
  }

  // Add writing prohibitions (RDM Standard)
  section += `\n\n### ❌ PROIBIÇÕES ABSOLUTAS DE ESCRITA:`;
  section += `\n- NUNCA começar com "Neste artigo vamos explorar..."`;
  section += `\n- NUNCA usar "Vale ressaltar que..." ou "Cabe mencionar..."`;
  section += `\n- NUNCA escrever parágrafos com mais de 4 linhas`;
  section += `\n- NUNCA usar placeholders como "(URL_DA_SUA_PAGINA)" — use as URLs reais do projeto`;
  section += `\n- NUNCA deixar o artigo sem pelo menos 3 CTAs`;
  section += `\n- NUNCA começar com definição: "X é uma área que..."`;
  section += `\n- NUNCA usar "Este guia vai te mostrar..."`;
  section += `\n- NUNCA iniciar com "De acordo com" ou "Segundo"`;

  // Add article structure guidelines
  section += `\n\n### 📋 ESTRUTURA OBRIGATÓRIA DO ARTIGO:`;
  section += `\n1. **GANCHO** (2 parágrafos): Começar com a dor/situação REAL do leitor`;
  section += `\n2. **CONTEXTO**: Validar que o problema é sério com dado ou lei`;
  section += `\n3. Bloco de urgência (HTML natural, sem rótulo)`;
  section += `\n4. **CORPO PRINCIPAL**: H2s como perguntas do leitor + listas + boxes de atenção`;
  section += `\n5. Bloco de autoridade (HTML natural, sem rótulo)`;
  section += `\n6. **APROFUNDAMENTO**: Prazos, variações, jurisprudência`;
  section += `\n7. Bloco de avaliação (HTML natural, sem rótulo)`;
  section += `\n8. **ERROS COMUNS**: 3-5 erros que fazem perder direitos`;
  section += `\n9. Bloco de redes sociais (HTML natural, sem rótulo)`;
  section += `\n10. **FAQ**: Mínimo 5 perguntas`;
  section += `\n11. Bloco de fechamento (HTML natural, sem rótulo)`;
  section += `\n\n⚠️ LEMBRETE FINAL: NUNCA exibir "[CTA #1]", "[CTA #2]", "[CTA #3]", "[CTA #4]", "[CTA #5]" ou qualquer rótulo técnico visível no artigo.`;

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
