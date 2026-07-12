/**
 * GEO / AEO 2026 Directives Module — RDM Advogados only
 *
 * Injects 2026-era optimization rules for Generative Engine Optimization (GEO)
 * and Answer Engine Optimization (AEO): frontloading, AEO Answer Blocks,
 * verifiable citation blocks every ~200 words, and dynamic Schema.org packs
 * (LegalService + Attorney + TechArticle + FaqPage + Legislation + LocalBusiness).
 *
 * Sources referenced: Google I/O 2026 (AI Overviews + Gemini 3.5 Flash),
 * OpenAI ChatGPT Search citation model, Anthropic Claude long-doc analysis,
 * SynthID trust markers, YMYL guidelines.
 *
 * Wiring: called from brand-seo-geo.buildRDMPrompt only. Zero impact on
 * Elas Tracy / Grupo SEO / generic brand paths.
 */

// ==================== TIPOS ====================

export type LegalSubArea =
  | 'criminal_empresarial'
  | 'assessoria_empresarial'
  | 'consumidor'
  | 'fraudes_bancarias'
  | 'fraudes_icms'
  | 'lei_execucoes_criminais'
  | 'lavagem_dinheiro'
  | 'ordem_economica_tributaria'
  | 'estelionato'
  | 'audiencia_custodia'
  | 'assessoria_isp'
  | 'generico';

export type ContentIntent = 'pain' | 'desire' | 'proof' | 'decision';

export interface Geo2026Config {
  subArea?: LegalSubArea;
  intent?: ContentIntent;
  isLocalUrgency?: boolean; // plantão / custódia
  attorneyName?: string;    // Dr. Rândalos Madeira
  officeAddress?: string;
  officeGeo?: { lat: number; lng: number };
  officePhone?: string;
  officeWhatsapp?: string;
  siteUrl?: string;
}

// ==================== DETECÇÃO DE SUB-ÁREA ====================

const SUBAREA_KEYWORDS: Record<Exclude<LegalSubArea, 'generico'>, string[]> = {
  criminal_empresarial: ['penal empresarial', 'colarinho branco', 'crime empresarial', 'defesa criminal empresa'],
  assessoria_empresarial: ['assessoria empresarial', 'consultoria jurídica', 'compliance empresarial', 'holding'],
  consumidor: ['consumidor', 'cdc', 'procon', 'direito do consumidor'],
  fraudes_bancarias: ['fraude bancária', 'golpe bancário', 'engenharia social', 'phishing bancário', 'pix indevido'],
  fraudes_icms: ['fraude icms', 'icms', 'sonegação', 'autuação fiscal', 'sefaz'],
  lei_execucoes_criminais: ['lep', 'execução penal', 'progressão de regime', 'livramento condicional'],
  lavagem_dinheiro: ['lavagem de dinheiro', 'lavagem de capitais', 'coaf', 'ocultação de bens'],
  ordem_economica_tributaria: ['ordem econômica', 'crime tributário', 'sonegação fiscal', 'crime contra ordem tributária'],
  estelionato: ['estelionato', '171', 'fraude', 'golpe'],
  audiencia_custodia: ['audiência de custódia', 'flagrante', 'plantão criminal', 'preso em flagrante'],
  assessoria_isp: ['provedor de internet', 'isp', 'anatel', 'marco civil', 'lgpd provedor'],
};

export function detectLegalSubArea(text: string): LegalSubArea {
  const t = (text || '').toLowerCase();
  for (const [area, kws] of Object.entries(SUBAREA_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) return area as LegalSubArea;
  }
  return 'generico';
}

// ==================== BLOCO FRONTLOADING ====================

const FRONTLOADING_BLOCK = `
## 🎯 FRONTLOADING OBRIGATÓRIO (GEO 2026)

**Regra crítica:** 65-69% das buscas terminam em AI Overview (zero-clique). O §1 é o único conteúdo que a IA vai citar. Ele DEVE valer sozinho.

### Estrutura obrigatória do §1 (40-60 palavras):
1. **Resposta direta** à pergunta/tema (frase 1, tempo verbal presente).
2. **Dado técnico verificável** (artigo de lei + número, tribunal + ano, ou estatística oficial com fonte).
3. **Contexto jurisdicional** (São Paulo, tribunal competente, ou base legal).

### Formato canônico:
\`\`\`html
<p class="lead-answer" data-geo="frontload">
  [Resposta técnica em 1 frase]. [Base legal: art. X da Lei Y/AAAA ou tribunal + ano]. [Contexto SP/federal].
</p>
\`\`\`

### ❌ PROIBIDO no §1:
- Introdução genérica ("Nos dias atuais…", "Cada vez mais…")
- Pergunta retórica
- Emoção antes de resposta técnica
- CTA ou link
- Menção ao próprio escritório
`.trim();

// ==================== BLOCO AEO ANSWER BLOCKS ====================

const AEO_ANSWER_BLOCKS = `
## 💡 AEO — Answer Engine Optimization (H2 = Pergunta → Resposta em 2 frases)

Cada H2 DEVE ser uma **pergunta natural completa** (não fragmento SEO antigo). Logo após o H2, **antes de qualquer outro parágrafo**, incluir um **AEO Answer Block** com a resposta em exatamente 2 frases (30-50 palavras).

### Formato canônico:
\`\`\`html
<h2>Como funciona a audiência de custódia em São Paulo?</h2>
<p class="aeo-answer" data-aeo="answer-block">
  A audiência de custódia é realizada em até 24h após a prisão em flagrante e verifica a legalidade do ato pelo juiz (art. 310 do CPP). Em São Paulo, ocorre no DIPO ou na comarca do fato, com defensor obrigatório.
</p>
<!-- só então: parágrafos com aprofundamento, tabela, jurisprudência etc. -->
\`\`\`

### Regras:
- **1 AEO Answer Block por H2**, sem exceção.
- Resposta técnica primeiro, contexto depois.
- Sem hedge ("depende do caso", "pode variar") no answer block — hedge vai no parágrafo seguinte.
- Nunca começar com "Bem," / "Vamos entender" / "É importante saber".
`.trim();

// ==================== BLOCO CITAÇÕES VERIFICÁVEIS ====================

const CITATION_BLOCKS = `
## 📚 BLOCO DE CITAÇÃO A CADA 200 PALAVRAS (Trust 2026)

Modelos como GPT-5.5, Claude e Gemini 3.5 Flash **priorizam conteúdo com proveniência rastreável**. A cada ~200 palavras, inserir uma citação estruturada com **fonte + credencial + data**.

### Formato canônico:
\`\`\`html
<cite class="verified-source"
      data-source-url="https://www.planalto.gov.br/ccivil_03/leis/lXXXX.htm"
      data-source-type="legislation"
      data-credential="Lei Federal"
      data-date="1988-10-05">
  Art. 5º, LXIII da Constituição Federal
</cite>
\`\`\`

### Tipos aceitos em \`data-source-type\`:
- \`legislation\` — leis, decretos (planalto.gov.br, senado.gov.br)
- \`jurisprudence\` — decisões STF/STJ/TJ (buscar id do processo)
- \`official_data\` — IBGE, CNJ, DIEESE, TCU
- \`academic\` — periódicos jurídicos com ISSN
- \`regulatory\` — resoluções OAB, ANATEL, Bacen, CVM

### ❌ PROIBIDO:
- Blogs de opinião como fonte primária.
- Wikipedia.
- Fonte sem data.
- Citar decisão sem indicar tribunal + ano.
`.trim();

// ==================== SCHEMA DINÂMICO ====================

export function buildDynamicSchema(cfg: Geo2026Config): string {
  const attorney = cfg.attorneyName || 'Dr. Rândalos Madeira';
  const address = cfg.officeAddress || 'Av. Paulista, São Paulo/SP';
  const phone = cfg.officePhone || '';
  const site = cfg.siteUrl || '';
  const geo = cfg.officeGeo;
  const local = cfg.isLocalUrgency;

  const legalService = {
    '@context': 'https://schema.org',
    '@type': 'LegalService',
    name: 'RDM Advogados Associados',
    provider: {
      '@type': 'Attorney',
      name: attorney,
      memberOf: { '@type': 'Organization', name: 'OAB' },
    },
    areaServed: [
      'São Paulo',
      'Direito Penal Empresarial',
      'Direito Tributário',
      'Direito do Consumidor',
      'Direito Digital',
    ],
    address: { '@type': 'PostalAddress', streetAddress: address, addressLocality: 'São Paulo', addressRegion: 'SP', addressCountry: 'BR' },
    ...(phone ? { telephone: phone } : {}),
    ...(site ? { url: site } : {}),
    ...(local
      ? {
          '@type': ['LegalService', 'LocalBusiness'],
          openingHoursSpecification: {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            opens: '00:00',
            closes: '23:59',
          },
          ...(geo ? { geo: { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lng } } : {}),
        }
      : {}),
  };

  return `
## 🧬 SCHEMA.ORG DINÂMICO 2026 (JSON-LD obrigatório)

Injetar os seguintes blocos JSON-LD **fora do <article>**, dentro de <script type="application/ld+json"> no <head> da página:

### 1) LegalService + Attorney${local ? ' + LocalBusiness (plantão)' : ''}
\`\`\`json
${JSON.stringify(legalService, null, 2)}
\`\`\`

### 2) TechArticle (para o conteúdo técnico deste artigo)
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "{{TITULO_DO_ARTIGO}}",
  "author": { "@type": "Person", "name": "${attorney}" },
  "publisher": { "@type": "Organization", "name": "RDM Advogados Associados" },
  "datePublished": "{{ISO_DATE_HOJE}}",
  "dateModified": "{{ISO_DATE_HOJE}}",
  "proficiencyLevel": "Expert",
  "dependencies": "Direito brasileiro"
}
\`\`\`

### 3) FAQPage (mínimo 5 perguntas — obrigatório)
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "{{PERGUNTA}}", "acceptedAnswer": { "@type": "Answer", "text": "{{RESPOSTA_40_60_PALAVRAS}}" } }
  ]
}
\`\`\`

### 4) Legislation (uma entrada por lei citada no artigo)
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "Legislation",
  "name": "Lei X.XXX/AAAA",
  "legislationIdentifier": "{{numero_lei}}",
  "legislationJurisdiction": "BR",
  "legislationDate": "AAAA-MM-DD",
  "url": "https://www.planalto.gov.br/..."
}
\`\`\`
`.trim();
}

// ==================== BLOCO YMYL POR SUB-ÁREA ====================

const YMYL_BY_SUBAREA: Record<LegalSubArea, string> = {
  criminal_empresarial: `
### YMYL — Criminal Empresarial / Colarinho Branco
- **Dor primária:** medo de prisão, perda de patrimônio, destruição de reputação.
- **§1 obrigatório:** o que fazer AGORA em caso de busca e apreensão / condução coercitiva.
- **Base legal a citar:** CPP arts. 240-250, Lei 12.850/2013 (Organização Criminosa), Lei 9.613/1998 (Lavagem).
- **Tom:** segurança institucional + sigilo. Zero tom sensacionalista.
- **Compliance:** NUNCA prometer arquivamento, absolvição ou revogação de prisão.`,
  assessoria_empresarial: `
### YMYL — Assessoria Jurídica Empresarial
- **Desejo primário:** estancar prejuízo, evitar responsabilização solidária dos sócios.
- **Frontload:** decisão STJ/STF recente + tese aplicável.
- **Base legal:** Lei 6.404/76, Lei 11.101/2005 (Recuperação), CTN.
- **Adicionar:** estudo de caso anonimizado com valor omitido (compliance OAB).`,
  consumidor: `
### YMYL — Direito do Consumidor
- **Dor primária:** prejuízo financeiro, sensação de impotência frente a grandes empresas.
- **Base legal:** CDC (Lei 8.078/1990), Súmulas STJ aplicáveis.
- **Frontload:** direito garantido + prazo decadencial/prescricional.`,
  fraudes_bancarias: `
### YMYL — Fraudes Bancárias / Engenharia Social
- **Dor primária:** prejuízo imediato, urgência de recuperação.
- **Base legal:** Súmula 479 STJ, Resolução BCB 4.658/2018, art. 14 CDC.
- **Frontload:** o que fazer nas primeiras 24h após golpe (BO + notificação ao banco + MPT).`,
  fraudes_icms: `
### YMYL — Fraudes de ICMS
- **Desejo primário:** evitar autuação milionária, proteger CNPJ.
- **Base legal:** Lei Complementar 87/1996 (Kandir), decretos estaduais SP, Súmulas CARF/TIT.
- **Frontload:** distinguir autuação fiscal de crime tributário (Lei 8.137/1990).`,
  lei_execucoes_criminais: `
### YMYL — Lei de Execuções Criminais (LEP)
- **Base legal:** Lei 7.210/1984 e alterações, Súmulas STJ 526/533/535.
- **Frontload:** requisito temporal + subjetivo do benefício pleiteado.`,
  lavagem_dinheiro: `
### YMYL — Lavagem de Dinheiro
- **Base legal:** Lei 9.613/1998 (com alterações 12.683/2012), Resolução COAF 44/2021.
- **Frontload:** conceito de ocultação + fases (colocação, ocultação, integração).
- **Compliance:** jamais sugerir estratégias para evasão.`,
  ordem_economica_tributaria: `
### YMYL — Crimes Contra Ordem Econômica/Tributária
- **Base legal:** Lei 8.137/1990, Lei 8.176/1991, Súmula Vinculante 24 STF.
- **Frontload:** dolo específico + esgotamento da via administrativa.`,
  estelionato: `
### YMYL — Estelionato
- **Base legal:** art. 171 CP + Lei 14.155/2021 (estelionato digital §2º-A).
- **Frontload:** representação da vítima como condição de procedibilidade (§5º).`,
  audiencia_custodia: `
### YMYL — Audiência de Custódia (URGÊNCIA LOCAL)
- **Base legal:** Resolução CNJ 213/2015, art. 310 CPP, CADH art. 7.5.
- **Frontload:** prazo de 24h + presença obrigatória de defensor + poderes do juiz.
- **⚠️ OBRIGATÓRIO:** LocalBusiness Schema com openingHours 24/7 + telephone + geo. Botão WhatsApp above-the-fold.`,
  assessoria_isp: `
### YMYL — Provedores de Internet (ISPs)
- **Base legal:** Marco Civil da Internet (Lei 12.965/2014), LGPD (Lei 13.709/2018), Regulamento ANATEL SCM.
- **Frontload:** responsabilidade civil subjetiva (art. 19 MCI) vs. objetiva em vazamento de dados (LGPD art. 42).`,
  generico: `
### YMYL — Jurídico Genérico
- Aplicar OAB 205/2021 estritamente.
- Toda tese com base legal + tribunal + ano.`,
};

// ==================== BLOCO INTENT MAPPING ====================

const INTENT_MAPPING = `
## 🧠 INTENT MAPPING 2026 — Dor → Desejo → Prova → Decisão

Cada artigo mapeia a jornada da persona em 4 movimentos:

1. **DOR** (§1-§2): frontload técnico + reconhecimento explícito do risco.
2. **DESEJO** (meio do artigo): o resultado juridicamente possível (sem prometer!).
3. **PROVA** (blocos <cite>): base legal + jurisprudência + dado oficial.
4. **DECISÃO** (final): próximo passo prático (buscar advogado, reunir documentos, prazo).

Incluir a meta-tag:
\`\`\`html
<meta name="audience-intent" content="pain|desire|proof|decision">
\`\`\`
`.trim();

// ==================== BLOCO TRUST / SYNTHID-LIKE ====================

const TRUST_MARKERS = `
## ✅ TRUST MARKERS 2026 (SynthID-like Provenance)

Toda página gerada precisa das seguintes meta-tags de proveniência no <head>:

\`\`\`html
<meta name="author" content="{{ATTORNEY_NAME}}">
<meta name="reviewed-by" content="RDM Advogados Associados — OAB/SP">
<meta name="content-type" content="editorial-legal-ymyl">
<meta property="article:published_time" content="{{ISO_DATE}}">
<meta property="article:modified_time" content="{{ISO_DATE}}">
<meta property="article:author" content="{{ATTORNEY_URL}}">
<link rel="canonical" href="{{CANONICAL_URL}}">
\`\`\`

Isto sinaliza a GPT-5.5, Gemini 3.5 Flash, Claude 3.5+ e Perplexity que o conteúdo tem revisão humana qualificada — pré-requisito para citação em respostas YMYL.
`.trim();

// ==================== VALIDADOR DE FRONTLOADING ====================

export interface FrontloadValidation {
  passes: boolean;
  wordCount: number;
  hasLegalBase: boolean;
  hasJurisdiction: boolean;
  reason?: string;
}

/**
 * Valida se o primeiro parágrafo do HTML atende ao padrão GEO 2026.
 * Chame após geração; se `passes=false`, force regeneração.
 */
export function validateFrontloading(html: string): FrontloadValidation {
  const match = html.match(/<p[^>]*(?:lead-answer|class="lead[^"]*")[^>]*>([\s\S]*?)<\/p>/i)
    || html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const text = (match?.[1] || '').replace(/<[^>]+>/g, '').trim();
  const words = text ? text.split(/\s+/).length : 0;

  const hasLegalBase = /\b(art\.?|artigo|lei|s[uú]mula|resolu[çc][ãa]o|decreto|c[ó]digo|cpc|cpp|cf|cdc|clt)\b/i.test(text)
    || /\b\d+\/\d{4}\b/.test(text)
    || /\b(stf|stj|tst|tjsp|tj-sp|carf)\b/i.test(text);
  const hasJurisdiction = /\b(s[ãa]o paulo|sp|brasil|federal|estadual|municipal)\b/i.test(text);

  const passes = words >= 40 && words <= 80 && hasLegalBase;

  return {
    passes,
    wordCount: words,
    hasLegalBase,
    hasJurisdiction,
    reason: !passes
      ? `Frontload inválido: ${words} palavras (esperado 40-60), base_legal=${hasLegalBase}, jurisdição=${hasJurisdiction}`
      : undefined,
  };
}

// ==================== BUILDER PRINCIPAL ====================

/**
 * Bloco completo GEO/AEO 2026 para injeção no prompt RDM.
 * Chamado por brand-seo-geo.buildRDMPrompt().
 */
export function buildGeo2026Block(cfg: Geo2026Config = {}): string {
  const subArea = cfg.subArea || 'generico';
  const ymyl = YMYL_BY_SUBAREA[subArea];
  const schema = buildDynamicSchema(cfg);

  return `
# ============================================
# 🚀 DIRETRIZES GEO/AEO 2026 — RDM ADVOGADOS
# ============================================

**Contexto operacional 2026:**
- 65-69% das buscas terminam em AI Overview (Gemini 3.5 Flash) — **tráfego zero-clique**.
- GPT-5.5 (ChatGPT Search) cita marcas com proveniência rastreável.
- Claude 3.5+ sintetiza melhor conteúdos com sumário estrutural inicial.
- Meta AI e Perplexity priorizam Schema.org + <cite> + \`article:author\`.
- **Objetivo real do artigo:** ser CITADO pela IA, não ranquear no top-10.

${FRONTLOADING_BLOCK}

${AEO_ANSWER_BLOCKS}

${CITATION_BLOCKS}

${INTENT_MAPPING}

${TRUST_MARKERS}

${schema}

## 🎯 YMYL — Sub-área detectada: **${subArea}**
${ymyl}

## ⚖️ COMPLIANCE OAB 205/2021 (não-negociável)
- NUNCA prometer resultado (arquivamento, absolvição, ganho de causa).
- NUNCA mencionar valor de causa/honorário.
- NUNCA identificar cliente/caso concreto.
- SEMPRE incluir: "Este conteúdo é informativo e não substitui consulta jurídica individualizada."

## 📋 CHECKLIST FINAL DE GERAÇÃO (auto-validar antes de responder)
- [ ] §1 tem 40-60 palavras + base legal (art./lei/tribunal) + jurisdição.
- [ ] Cada H2 é pergunta natural completa.
- [ ] Cada H2 tem AEO Answer Block (\`<p class="aeo-answer">\`, 2 frases, 30-50 palavras).
- [ ] A cada ~200 palavras há \`<cite class="verified-source">\` com fonte + tipo + data.
- [ ] Schema JSON-LD emitido em bloco separado (LegalService + TechArticle + FAQPage + Legislation${cfg.isLocalUrgency ? ' + LocalBusiness' : ''}).
- [ ] FAQ tem no mínimo 5 perguntas com respostas de 40-60 palavras.
- [ ] Zero markdown no corpo do artigo (só HTML semântico).
- [ ] Compliance OAB 205/2021 respeitado.
- [ ] Disclaimer informativo presente ao final.
`.trim();
}
