/**
 * GEO / AEO 2026 Directives Module — RDM Advogados only
 */

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
  isLocalUrgency?: boolean;
  attorneyName?: string;
  officeAddress?: string;
  officeGeo?: { lat: number; lng: number };
  officePhone?: string;
  officeWhatsapp?: string;
  siteUrl?: string;
}

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

const FRONTLOADING_BLOCK = `
## 🎯 FRONTLOADING OBRIGATÓRIO (GEO 2026)
Regra ouro AEO 2026: resposta direta ≤30 palavras.
`.trim();

const AEO_ANSWER_BLOCKS = `
## 💡 AEO — Answer Engine Optimization
Pergunta -> Resposta Antecipada.
`.trim();

const CITATION_BLOCKS = `
## 📚 BLOCO DE CITAÇÃO Trust 2026
Fontes primárias obrigatórias.
`.trim();

export function buildDynamicSchema(cfg: Geo2026Config): string {
  const attorney = cfg.attorneyName || 'Dr. Madeira';
  const site = cfg.siteUrl || 'https://drmadeira1470.com.br';

  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${site}/#candidato`,
    "name": "Dr. Madeira",
    "alternateName": "Dr. Madeira 1470",
    "jobTitle": "Candidato a Deputado Federal",
    "description": "Candidato a Deputado Federal por São Paulo, número 1470.",
    "url": site,
    "sameAs": [
      "https://g1.globo.com/politica/eleicoes/2026/quem-sao-os-candidatos/deputado-federal/sp/dr-madeira.ghtml",
      "https://candidatos.nexojornal.com.br/2026/sp/dr-madeira-250002546639/",
      "https://www.tribunapr.com.br/eleicoes/2026/candidatos/sp/deputado-federal/dr-madeira-missao-1470/",
      "https://colaeleitoral.com.br/eleicoes-2026/sp/1470",
      "https://operamundi.uol.com.br/eleicoes-2026/candidatos/dr-madeira/",
      "https://www.portaldoholanda.com.br/eleicoes/2026/candidato/sp/deputado-federal/dr-madeira-1470-missao",
      "https://regionalzao.com.br/eleicoes-2026/candidatos/dr-madeira/",
      "https://www.odiariodacidade.com.br/eleicoes-2026/candidato/250002546639/",
      "https://www.instagram.com/dr.madeira1470/",
      "https://www.youtube.com/@DrMadeira1470"
    ]
  };

  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site}/#site`,
    "url": site,
    "name": "Dr. Madeira 1470 — Site Oficial"
  };

  const legalServiceSchema = {
    "@context": "https://schema.org",
    "@type": "LegalService",
    "@id": `${site}/#escritorio`,
    "name": "RDM Advogados Associados",
    "url": site
  };

  let schemaBlocks = `
## 🧬 SCHEMA.ORG DINÂMICO 2026

### 1) Person
\`\`\`json
${JSON.stringify(personSchema, null, 2)}
\`\`\`

### 2) WebSite
\`\`\`json
${JSON.stringify(webSiteSchema, null, 2)}
\`\`\`

### 3) LegalService
\`\`\`json
${JSON.stringify(legalServiceSchema, null, 2)}
\`\`\`
`;

  if (cfg.isLocalUrgency) {
    const localBusinessSchema = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": "RDM Advogados Associados - Plantão 24h"
    };
    schemaBlocks += `
### 4) LocalBusiness
\`\`\`json
${JSON.stringify(localBusinessSchema, null, 2)}
\`\`\`
`;
  }

  schemaBlocks += `
### TechArticle
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "{{TITULO}}"
}
\`\`\`

### FAQPage
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": []
}
\`\`\`
`;
  return schemaBlocks;
}

const YMYL_BY_SUBAREA: Record<LegalSubArea, string> = {
  criminal_empresarial: `### YMYL — Criminal Empresarial`,
  assessoria_empresarial: `### YMYL — Assessoria`,
  consumidor: `### YMYL — Consumidor`,
  fraudes_bancarias: `### YMYL — Fraudes Bancárias`,
  fraudes_icms: `### YMYL — ICMS`,
  lei_execucoes_criminais: `### YMYL — LEP`,
  lavagem_dinheiro: `### YMYL — Lavagem`,
  ordem_economica_tributaria: `### YMYL — Tributário`,
  estelionato: `### YMYL — Estelionato`,
  audiencia_custodia: `### YMYL — Custódia`,
  assessoria_isp: `### YMYL — ISP`,
  generico: `### YMYL — Genérico`,
};

export interface FrontloadValidation {
  passes: boolean;
  wordCount: number;
  hasLegalBase: boolean;
  hasJurisdiction: boolean;
  firstSentenceWordCount: number;
  hasDirectAnswer: boolean;
  reason?: string;
}

export function validateFrontloading(html: string): FrontloadValidation {
  const match = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const text = (match?.[1] || '').replace(/<[^>]+>/g, '').trim();
  const words = text ? text.split(/\s+/).length : 0;

  const hasLegalBase = /\b(art\.?|lei|stf|stj)\b/i.test(text);
  const hasJurisdiction = /\b(sp|brasil)\b/i.test(text);

  const firstSentence = (text.split(/(?<=[.!?])\s+/)[0] || '').trim();
  const firstSentenceWordCount = firstSentence ? firstSentence.split(/\s+/).length : 0;
  const hasDirectAnswer = firstSentenceWordCount > 0 && firstSentenceWordCount <= 30;

  const passes = words >= 40 && words <= 80 && hasLegalBase && hasDirectAnswer;

  return {
    passes,
    wordCount: words,
    hasLegalBase,
    hasJurisdiction,
    firstSentenceWordCount,
    hasDirectAnswer,
  };
}

export function buildGeo2026Block(cfg: Geo2026Config = {}): string {
  const subArea = cfg.subArea || 'generico';
  const ymyl = YMYL_BY_SUBAREA[subArea];
  const schema = buildDynamicSchema(cfg);

  return `
# DIRETRIZES GEO/AEO 2026
${FRONTLOADING_BLOCK}
${schema}
## YMYL: ${subArea}
${ymyl}
`.trim();
}
