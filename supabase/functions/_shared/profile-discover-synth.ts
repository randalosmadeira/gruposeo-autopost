/**
 * Síntese da "Descoberta do negócio": transforma o que o leitor VIU no site em um perfil pré-montado.
 *
 * Função pura (sem rede, sem Deno, sem React): roda no navegador e nos testes.
 * Regras:
 *  - Cada sugestão carrega a EVIDÊNCIA (onde foi vista) e a CONFIANÇA (alta, média, baixa). Nada é gravado sozinho: o cliente confirma.
 *  - Só sai valor aceito pela validação oficial do Perfil (mesmas regras do formulário). Se não passar, a sugestão não existe.
 *  - Onde o site não mostra a informação, o campo fica de fora e aparece em "lacunas": nada é inventado nem estimado.
 */
import { HOME_KIND_TEXT, classifySocial, type PageFacts, type SiteMapResult } from './profile-discover-core.ts';
import { FIELD_BY_KEY, type FieldValue } from './profile-registry.ts';
import { validateValue } from './profile-model.ts';

export type Confidence = 'alta' | 'media' | 'baixa';
export type InferenceGroup = 'identidade' | 'publico' | 'regiao' | 'presenca' | 'conteudo' | 'marca';
export interface Evidence { url?: string; note: string }
export interface Inference { key: string; label: string; value: FieldValue; confidence: Confidence; evidence: Evidence[]; group: InferenceGroup }
export interface Check { key: string; label: string; status: 'ok' | 'warn' | 'fail' | 'info'; detail: string }
export interface Opportunity { id: string; severity: 'alta' | 'media' | 'baixa' | 'info'; title: string; detail: string; action: string }
export interface SectionStat { section: string; label: string; count: number; latest: string | null; kind: 'blog' | 'paginas' | 'outros' }
export interface Contacts { phones: string[]; emails: string[]; whatsapp: string[]; maps: string[]; address: string | null; openingHours: string[] }
export interface Discovery {
  version: string;
  generatedAt: string;
  /** 'ok' = site lido; 'nao_publicado' = o endereço existe mas não tem site (listagem, página padrão, vazio); 'fora_do_ar' = não respondeu */
  siteState: 'ok' | 'nao_publicado' | 'fora_do_ar';
  siteStateNote: string | null;
  site: { origin: string; host: string; registrable: string };
  stats: { pagesRead: number; pagesFailed: number; sitemapUrls: number; elapsedMs: number; homeOk: boolean };
  inferences: Inference[];
  gaps: Array<{ key: string; label: string; why: string }>;
  contacts: Contacts;
  structure: {
    sections: SectionStat[]; subdomains: string[]; blog: { found: boolean; url: string | null; articles: number; lastPublished: string | null; daysSince: number | null };
    sitemapFiles: Array<{ kind: string; count: number }>;
  };
  social: Record<string, string>;
  checks: Check[];
  opportunities: Opportunity[];
  stack: string[];
  logo: string | null;
  brandColors: string[];
  followUps: string[];
}

// ------------------------------------------------------------------------------------------------------------ utilidades
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const labelOf = (key: string) => FIELD_BY_KEY[key]?.label ?? key;
const day = 86_400_000;

function strongText(p: PageFacts): string {
  const j = p.jsonld.flatMap((n) => [n.name, n.description, ...(n.serviceType || []), ...(n.areaServed || []), n.address?.locality, n.address?.region]);
  return [p.title, p.description, p.ogSiteName, ...p.h1, ...p.h2, ...p.nav.map((n) => n.text), ...j].filter(Boolean).join(' \n ');
}
const corpusOf = (pages: PageFacts[]) => ({
  strong: pages.map(strongText).join(' \n '),
  body: pages.map((p) => p.excerpt).join(' \n '),
});

function countMatches(re: RegExp, text: string): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

// ------------------------------------------------------------------------------------------------------------ segmento
const SEGMENT_WORDS: Record<string, RegExp> = {
  Advocacia: /advogad|advocaci|direito (?:criminal|penal|civil|trabalh|do consumidor|de familia|previdenc|tribut|empresar|imobili|eleitoral)|\boab\b|escritorio de advocacia|juridic|tribunal|processo judicial|defesa criminal/g,
  Medicina: /medic[oa]\b|medicina|clinica medica|consulta medica|\bcrm\b|hospital|cardiolog|dermatolog|ortoped|pediatr|ginecolog|oftalmolog|psiquiatr|exames? laboratoria/g,
  Odontologia: /dentist|odontolog|implante dent|ortodont|clareamento dent|\bcro\b|lente de contato dental|canal dent/g,
  Psicologia: /psicolog|psicoterap|terapia|\bcrp\b|psicanalis|neuropsicolog/g,
  Contabilidade: /contabil|contador|\bcrc\b|imposto de renda|abertura de empresa|departamento pessoal|simples nacional|escrituracao/g,
  'Imobiliária': /imobiliaria|imoveis|corretor de imoveis|\bcreci\b|aluguel|apartamentos? a venda|lancamentos? imobiliario|financiamento imobiliario/g,
  'Estética e beleza': /estetica|beleza|depilacao|botox|harmonizacao|salao de beleza|limpeza de pele|sobrancelha|cilios|manicure|cabeleireir|spa\b/g,
  'Marketing e agência': /agencia de (?:marketing|publicidade|propaganda)|marketing digital|trafego pago|gestao de redes|social media|\bseo\b|branding|growth/g,
  'Mídia e notícias': /ultimas noticias|reportagem|jornalismo|portal de noticias|redacao|editoria|\bnoticias\b|materia publicada/g,
  'Política e eleições': /deputad|vereador|candidat|campanha eleitoral|mandato|partido politico|senador|prefeit/g,
  'Educação': /curso|escola|faculdade|matricula|aulas?\b|vestibular|ensino|aluno|graduacao|pos-graduacao|\bead\b|treinamento/g,
  'Varejo e e-commerce': /adicionar ao carrinho|comprar agora|frete|carrinho|loja virtual|produtos em destaque|parcel(?:e|amento) em|ofertas?\b|\bsku\b|checkout/g,
};
const SEGMENT_SCHEMA: Record<string, string> = {
  LegalService: 'Advocacia', Attorney: 'Advocacia', Physician: 'Medicina', MedicalClinic: 'Medicina', MedicalBusiness: 'Medicina', Hospital: 'Medicina', Dentist: 'Odontologia',
  AccountingService: 'Contabilidade', RealEstateAgent: 'Imobiliária', BeautySalon: 'Estética e beleza', HealthAndBeautyBusiness: 'Estética e beleza', DaySpa: 'Estética e beleza',
  NewsMediaOrganization: 'Mídia e notícias', NewsArticle: 'Mídia e notícias', EducationalOrganization: 'Educação', School: 'Educação', CollegeOrUniversity: 'Educação', Course: 'Educação',
  Store: 'Varejo e e-commerce', Product: 'Varejo e e-commerce', OnlineStore: 'Varejo e e-commerce', Person: '',
};
const SUBAREAS: Record<string, Array<[string, RegExp]>> = {
  Advocacia: [
    ['Direito Criminal', /criminal|penal|habeas|inquerito|flagrante|prisao|defesa criminal/g], ['Direito do Consumidor', /consumidor|plano de saude|negativacao|golpe|pix|fraude bancaria/g],
    ['Direito Trabalhista', /trabalhist|rescisao|horas extras|\bclt\b|reclamacao trabalhista/g], ['Direito de Família', /familia|divorcio|guarda|pensao alimenticia|inventario/g],
    ['Direito Previdenciário', /previdenci|\binss\b|aposentadoria|beneficio/g], ['Direito Empresarial', /empresarial|societari|recuperacao judicial|contrato empresarial/g],
    ['Direito Tributário', /tributari|planejamento fiscal|execucao fiscal/g], ['Direito Civil', /direito civil|indenizacao|responsabilidade civil|danos morais/g],
    ['Direito Imobiliário', /imobiliari|usucapiao|locacao|despejo/g], ['Direito de Trânsito e CNH', /transito|\bcnh\b|habilitacao|suspensao da cnh|multas de transito/g],
    ['Direito Eleitoral', /eleitoral|propaganda eleitoral/g], ['Direito Digital e LGPD', /direito digital|\blgpd\b|protecao de dados/g],
  ],
  Medicina: [['Dermatologia', /dermatolog/g], ['Cardiologia', /cardiolog/g], ['Ortopedia', /ortoped/g], ['Pediatria', /pediatr/g], ['Ginecologia', /ginecolog/g], ['Oftalmologia', /oftalmolog/g], ['Psiquiatria', /psiquiatr/g], ['Clínica geral', /clinica geral|clinico geral/g], ['Endocrinologia e nutrologia', /endocrin|nutrolog/g], ['Cirurgia plástica', /cirurgia plastica/g]],
  Odontologia: [['Implantes', /implante/g], ['Ortodontia', /ortodont|aparelho/g], ['Clareamento', /clareamento/g], ['Lentes de contato dental', /lentes? de contato/g], ['Endodontia', /canal|endodont/g], ['Periodontia', /periodont|gengiva/g], ['Odontopediatria', /odontopediatr/g]],
  'Estética e beleza': [['Depilação a laser', /depilacao/g], ['Harmonização facial', /harmonizacao/g], ['Botox e preenchimento', /botox|preenchimento/g], ['Limpeza de pele', /limpeza de pele/g], ['Sobrancelhas e cílios', /sobrancelha|cilios/g], ['Massagem e corporal', /massagem|corporal/g], ['Cabelo', /cabelo|cabeleireir|coloracao|escova/g], ['Unhas', /unhas|manicure/g]],
  Contabilidade: [['Abertura de empresa', /abertura de empresa|abrir empresa/g], ['Imposto de renda', /imposto de renda|\birpf\b/g], ['Departamento pessoal', /departamento pessoal|folha de pagamento/g], ['Contabilidade fiscal', /fiscal|tributari/g], ['BPO financeiro', /bpo|financeiro/g]],
  'Marketing e agência': [['SEO', /\bseo\b|otimizacao para buscadores/g], ['Tráfego pago', /trafego pago|google ads|meta ads/g], ['Redes sociais', /redes sociais|social media|instagram/g], ['Criação de sites', /criacao de sites|desenvolvimento de sites|site institucional/g], ['Branding e design', /branding|identidade visual|design/g], ['E-mail e CRM', /e-?mail marketing|\bcrm\b|automacao/g]],
  Psicologia: [['Terapia individual', /terapia individual|psicoterapia/g], ['Terapia de casal', /casal/g], ['Psicologia infantil', /infantil|crianca/g], ['TCC', /\btcc\b|cognitivo-comportamental/g], ['Neuropsicologia', /neuropsicolog/g]],
  'Imobiliária': [['Venda de imóveis', /venda|comprar/g], ['Aluguel', /aluguel|alugar|locacao/g], ['Lançamentos', /lancamento/g], ['Administração de condomínios', /condominio|administracao de condominios/g], ['Avaliação de imóveis', /avaliacao/g]],
  'Educação': [['Cursos online', /\bead\b|online/g], ['Graduação', /graduacao|faculdade/g], ['Idiomas', /idioma|ingles|espanhol/g], ['Preparatórios', /preparatorio|vestibular|concurso/g]],
};

function detectSegment(pages: PageFacts[]): { segment: string; confidence: Confidence; evidence: Evidence[] } | null {
  const { strong, body } = corpusOf(pages);
  const S = fold(strong);
  const B = fold(body);
  const score: Record<string, number> = {};
  for (const [seg, re] of Object.entries(SEGMENT_WORDS)) score[seg] = 3 * countMatches(new RegExp(re.source, 'g'), S) + countMatches(new RegExp(re.source, 'g'), B);
  const bySchema: string[] = [];
  for (const p of pages) for (const n of p.jsonld) for (const t of n.types) { const seg = SEGMENT_SCHEMA[t]; if (seg) { score[seg] = (score[seg] || 0) + 12; bySchema.push(t); } }
  const ranked = Object.entries(score).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < 6) return null;
  const [seg, top] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  const confidence: Confidence = bySchema.length && top >= 18 ? 'alta' : top >= 20 && top >= second * 2 ? 'alta' : top >= 10 && top > second * 1.3 ? 'media' : 'baixa';
  const ev: Evidence[] = [{ note: `Termos do segmento aparecem com força em títulos, menus e textos das ${pages.length} páginas lidas.`, url: pages[0]?.url }];
  if (bySchema.length) ev.push({ note: `Dados estruturados do site declaram: ${[...new Set(bySchema)].slice(0, 3).join(', ')}.`, url: pages[0]?.url });
  return { segment: seg, confidence, evidence: ev };
}

function detectSubareas(segment: string, pages: PageFacts[]): Array<{ name: string; score: number }> {
  const list = SUBAREAS[segment];
  if (!list) return [];
  const { strong, body } = corpusOf(pages);
  const S = fold(strong);
  const B = fold(body);
  return list
    .map(([name, re]) => ({ name, score: 3 * countMatches(new RegExp(re.source, 'g'), S) + countMatches(new RegExp(re.source, 'g'), B) }))
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

// ------------------------------------------------------------------------------------------------------------ nome
function detectName(pages: PageFacts[]): { name: string; confidence: Confidence; evidence: Evidence[] } | null {
  const home = pages[0];
  if (!home) return null;
  const ORG = ['Organization', 'LocalBusiness', 'LegalService', 'Attorney', 'ProfessionalService', 'Corporation', 'MedicalClinic', 'Dentist', 'Store', 'NewsMediaOrganization', 'EducationalOrganization', 'AccountingService', 'RealEstateAgent', 'BeautySalon', 'WebSite'];
  for (const p of pages) for (const n of p.jsonld) if (n.name && n.types.some((t) => ORG.includes(t))) return { name: cap(n.name, 120), confidence: 'alta', evidence: [{ url: p.url, note: `Nome declarado nos dados estruturados (${n.types[0]}).` }] };
  const og = pages.map((p) => p.ogSiteName).find(Boolean);
  if (og) return { name: cap(og, 120), confidence: 'alta', evidence: [{ url: home.url, note: 'Nome do site (og:site_name).' }] };
  // marca = trecho do título que se repete em várias páginas
  const split = (t: string) => t.split(/\s[|–—\-·•]\s|\s[|–—]\s?/).map((x) => x.trim()).filter((x) => x.length >= 2);
  const counts = new Map<string, number>();
  for (const p of pages) if (p.title) for (const part of new Set(split(p.title))) counts.set(part, (counts.get(part) || 0) + 1);
  const rep = [...counts.entries()].filter(([, c]) => c >= 2 && pages.length >= 3).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0];
  if (rep) return { name: cap(rep[0], 120), confidence: 'media', evidence: [{ url: home.url, note: `O trecho "${cap(rep[0], 40)}" se repete no título de ${rep[1]} páginas.` }] };
  if (home.title) { const parts = split(home.title); const pick = parts.length > 1 ? parts[parts.length - 1] : parts[0]; return { name: cap(pick, 120), confidence: 'baixa', evidence: [{ url: home.url, note: 'Tirado do título da página inicial.' }] }; }
  return null;
}

// ------------------------------------------------------------------------------------------------------------ regiões
const UF: Record<string, string> = {
  'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM', 'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF', 'Espírito Santo': 'ES', 'Goiás': 'GO', 'Maranhão': 'MA',
  'Mato Grosso do Sul': 'MS', 'Mato Grosso': 'MT', 'Minas Gerais': 'MG', 'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR', 'Pernambuco': 'PE', 'Piauí': 'PI', 'Rio de Janeiro': 'RJ',
  'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR', 'Santa Catarina': 'SC', 'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO',
};
const SIGLAS = new Set(Object.values(UF));
const CITIES: Array<[string, string]> = [
  ['São Paulo', 'SP'], ['Guarulhos', 'SP'], ['Osasco', 'SP'], ['Santo André', 'SP'], ['São Bernardo do Campo', 'SP'], ['São Caetano do Sul', 'SP'], ['Diadema', 'SP'], ['Mauá', 'SP'], ['Barueri', 'SP'],
  ['Campinas', 'SP'], ['Santos', 'SP'], ['Sorocaba', 'SP'], ['Ribeirão Preto', 'SP'], ['São José dos Campos', 'SP'], ['Jundiaí', 'SP'], ['Mogi das Cruzes', 'SP'], ['Itaquaquecetuba', 'SP'], ['Taboão da Serra', 'SP'],
  ['Rio de Janeiro', 'RJ'], ['Niterói', 'RJ'], ['Belo Horizonte', 'MG'], ['Contagem', 'MG'], ['Uberlândia', 'MG'], ['Curitiba', 'PR'], ['Londrina', 'PR'], ['Maringá', 'PR'], ['Porto Alegre', 'RS'],
  ['Florianópolis', 'SC'], ['Joinville', 'SC'], ['Blumenau', 'SC'], ['Salvador', 'BA'], ['Recife', 'PE'], ['Fortaleza', 'CE'], ['Brasília', 'DF'], ['Goiânia', 'GO'], ['Manaus', 'AM'], ['Belém', 'PA'],
  ['Vitória', 'ES'], ['Natal', 'RN'], ['Maceió', 'AL'], ['João Pessoa', 'PB'], ['Teresina', 'PI'], ['São Luís', 'MA'], ['Cuiabá', 'MT'], ['Campo Grande', 'MS'], ['Aracaju', 'SE'], ['Porto Velho', 'RO'],
  ['Palmas', 'TO'], ['Macapá', 'AP'], ['Boa Vista', 'RR'], ['Rio Branco', 'AC'],
];
const AREAS = ['Zona Leste', 'Zona Norte', 'Zona Sul', 'Zona Oeste', 'Tatuapé', 'Mooca', 'Penha', 'Itaquera', 'Santana', 'Vila Mariana', 'Pinheiros', 'Moema', 'Lapa', 'Santo Amaro', 'Vila Prudente', 'Ipiranga', 'Tucuruvi', 'Jabaquara', 'Butantã', 'Brooklin', 'Itaim Bibi', 'Bela Vista', 'Liberdade', 'Consolação', 'Barra Funda', 'Vila Maria', 'Vila Matilde', 'São Miguel Paulista', 'Guaianases', 'Cidade Tiradentes', 'Freguesia do Ó', 'Pirituba', 'Jaçanã', 'Vila Formosa', 'Anália Franco', 'Vila Carrão'];

const wordRe = (name: string) => new RegExp(`(?<![\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu');
interface Hit { name: string; score: number; urls: string[] }

function scanNames(pages: PageFacts[], names: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const name of names) {
    const re = wordRe(name);
    let score = 0;
    const urls: string[] = [];
    for (const p of pages) {
      const s = 3 * countMatches(re, strongText(p)) + countMatches(re, p.excerpt);
      if (s > 0) { score += s; urls.push(p.url); }
    }
    if (score > 0) hits.push({ name, score, urls });
  }
  return hits.sort((a, b) => b.score - a.score);
}

interface Regions {
  lines: string[];
  states: string[];
  cities: Hit[];
  areas: Hit[];
  reach: 'city' | 'state' | 'states' | 'national' | 'international' | null;
  confidence: Confidence;
  evidence: Evidence[];
}

function detectRegions(pages: PageFacts[]): Regions | null {
  if (!pages.length) return null;
  const allText = pages.map((p) => `${strongText(p)} ${p.excerpt}`).join(' \n ');
  const cityHits = scanNames(pages, CITIES.map(([c]) => c)).filter((h) => h.score >= 2).slice(0, 10);
  const areaHits = scanNames(pages, AREAS).filter((h) => h.score >= 2).slice(0, 8);
  const stateHits = scanNames(pages, Object.keys(UF)).filter((h) => h.score >= 3);
  const states = new Set<string>();
  for (const h of stateHits) states.add(UF[h.name]);
  for (const h of cityHits) { const uf = CITIES.find(([c]) => c === h.name)?.[1]; if (uf) states.add(uf); }
  // "Cidade - UF" / "Cidade/UF" / "Cidade, UF"
  const cityUfRaw = new Map<string, { uf: string; n: number }>();
  for (const m of allText.matchAll(/([A-ZÀ-Ú][\p{L}]+(?:\s(?:d[aeo]s?\s)?[A-ZÀ-Ú][\p{L}]+){0,3})\s*(?:[-–/,]\s*)([A-Z]{2})\b/gu)) {
    if (!SIGLAS.has(m[2]) || m[1].length < 4 || /^(CEP|Rua|Avenida|Av)\b/i.test(m[1])) continue;
    states.add(m[2]);
    const known = CITIES.find(([c]) => m[1].endsWith(c));
    const name = known ? known[0] : m[1];
    const cur = cityUfRaw.get(name);
    cityUfRaw.set(name, { uf: m[2], n: (cur?.n || 0) + 1 });
  }
  // cidade desconhecida só vale se aparecer mais de uma vez (evita "Localização São Paulo" e frases soltas)
  const cityUf = new Map<string, string>();
  for (const [name, v] of cityUfRaw) if (CITIES.some(([c]) => c === name) || v.n >= 2) cityUf.set(name, v.uf);
  // dados estruturados: endereço e área atendida
  const schemaPlaces: string[] = [];
  for (const p of pages) for (const n of p.jsonld) {
    if (n.address?.locality) { schemaPlaces.push(n.address.locality); if (n.address.region && SIGLAS.has(n.address.region.toUpperCase())) states.add(n.address.region.toUpperCase()); }
    for (const a of n.areaServed || []) schemaPlaces.push(a);
  }
  const foldAll = fold(allText);
  const national = /todo o brasil|todo territorio nacional|em todo o pais|atendimento nacional|atendemos todo o brasil|todos os estados|brasil inteiro|100% online|atendimento online para todo/.test(foldAll);
  const stateWide = /estado de sao paulo|todo o estado|em todo o estado|interior e capital/.test(foldAll);
  const intl = pages.some((p) => p.hreflang.some((l) => !/^pt/.test(l) && l !== 'x-default')) || /worldwide|international|internacional|exterior/.test(foldAll.slice(0, 20000));

  const lines: string[] = [];
  const seen = new Set<string>();
  const push = (l: string) => { const k = fold(l.replace(/\s*\(.*\)\s*$/, '')); if (!seen.has(k)) { seen.add(k); lines.push(l); } };
  const canon = (place: string) => { const hit = CITIES.find(([c]) => fold(c) === fold(place)); return hit ? `${hit[0]} (${hit[1]})` : cap(place, 60); };
  for (const p of schemaPlaces.slice(0, 8)) push(canon(p));
  for (const h of cityHits) { const uf = CITIES.find(([c]) => c === h.name)?.[1]; push(uf ? `${h.name} (${uf})` : h.name); }
  for (const [c, uf] of [...cityUf.entries()].slice(0, 5)) if (!lines.some((l) => fold(l).startsWith(fold(c)))) push(`${c} (${uf})`);
  for (const h of areaHits) push(h.name);
  if (stateWide && states.size === 1) push(`Estado de ${[...stateHits].map((h) => h.name)[0] || [...states][0]}`);
  for (const h of stateHits) if (!lines.some((l) => fold(l).includes(fold(h.name)))) push(h.name);
  if (national) push('Brasil (atendimento nacional)');

  let reach: Regions['reach'] = null;
  if (intl && states.size === 0 && !national) reach = 'international';
  else if (national || states.size >= 4) reach = 'national';
  else if (states.size >= 2) reach = 'states';
  else if (states.size === 1 && (stateWide || cityHits.length + cityUf.size >= 3)) reach = 'state';
  else if (states.size === 1 || cityHits.length || schemaPlaces.length) reach = 'city';
  if (!lines.length && !reach) return null;
  const confidence: Confidence = schemaPlaces.length || cityHits.length >= 2 || national ? 'media' : 'baixa';
  const ev: Evidence[] = [];
  if (schemaPlaces.length) ev.push({ note: `Endereço ou área atendida nos dados estruturados: ${schemaPlaces.slice(0, 3).join(', ')}.`, url: pages[0].url });
  for (const h of [...cityHits, ...areaHits].slice(0, 4)) ev.push({ note: `"${h.name}" aparece em ${h.urls.length} página(s) lida(s).`, url: h.urls[0] });
  if (national) ev.push({ note: 'O site diz que atende todo o país ou online.', url: pages[0].url });
  return { lines: lines.slice(0, 14), states: [...states], cities: cityHits, areas: areaHits, reach, confidence, evidence: ev };
}

// ------------------------------------------------------------------------------------------------------------ público e tom
function detectCustomerType(pages: PageFacts[]): { value: string[]; confidence: Confidence; evidence: Evidence[] } | null {
  const T = fold(pages.map((p) => `${strongText(p)} ${p.excerpt}`).join(' \n '));
  const b2b = countMatches(/para (?:sua )?empresa|para empresas|pessoa juridica|\bcnpj\b|corporativ|\bb2b\b|negocios|empresarial|industria|fornecedor/g, T);
  const b2c = countMatches(/pessoa fisica|para voce|sua familia|consumidor|\bseu (?:caso|problema|direito|sonho)\b|paciente|cliente final|\bb2c\b|nossos pacientes|sua saude|seu filho/g, T);
  const b2g = countMatches(/licitaca|orgao publico|prefeitura|governo|administracao publica|pregao/g, T);
  const out: string[] = [];
  if (b2c >= 2) out.push('B2C');
  if (b2b >= 3) out.push('B2B');
  if (b2g >= 2) out.push('B2G');
  if (!out.length) return null;
  return { value: out, confidence: out.length === 1 && (b2c >= 5 || b2b >= 6) ? 'media' : 'baixa', evidence: [{ url: pages[0]?.url, note: `Sinais encontrados no texto: ${b2c} de pessoas, ${b2b} de empresas${b2g ? `, ${b2g} de governo` : ''}.` }] };
}

const TONE: Array<[string, RegExp]> = [
  ['Acolhedor', /acolh|cuidado|estamos aqui|ao seu lado|voce nao esta sozinho|humaniz|com carinho|escuta/g],
  ['Técnico', /tecnic|jurisprudencia|resolucao|norma|artigo \d|lei n|evidencia cientifica|protocolo/g],
  ['Direto', /fale agora|solicite|chame no whatsapp|ligue|orcamento gratis|agende agora|entre em contato/g],
  ['Institucional', /nossa historia|nossa missao|valores|desde (?:19|20)\d{2}|fundad|quem somos|sobre nos/g],
  ['Descontraído', /bora|galera|show de bola|facilitamos|sem complicacao|descomplic/g],
  ['Autoridade', /especialista|referencia|anos de experiencia|premiad|mais de \d+|lider|reconhecid|pioneir/g],
];
function detectTone(pages: PageFacts[]): { value: string[]; evidence: Evidence[] } | null {
  const T = fold(pages.map((p) => `${strongText(p)} ${p.excerpt}`).join(' \n '));
  const scored = TONE.map(([name, re]) => ({ name, n: countMatches(new RegExp(re.source, 'g'), T) })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 3);
  if (!scored.length) return null;
  return { value: scored.map((s) => s.name), evidence: [{ url: pages[0]?.url, note: `Expressões típicas: ${scored.map((s) => `${s.name} (${s.n})`).join(', ')}.` }] };
}

// ------------------------------------------------------------------------------------------------------------ estrutura
const BLOG_SECTION = /^(blog|artigos?|noticias?|posts?|conteudo|conteudos|insights|imprensa|novidades|materias|dicas|publicacoes|(blog datado))$/i;
const SECTION_LABEL: Record<string, string> = { '(raiz)': 'Página inicial', '(blog datado)': 'Blog (URLs com data)', '(outros)': 'Outros' };
const sectionLabel = (s: string) => SECTION_LABEL[s] || s.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

function buildStructure(map: SiteMapResult, now: number): Discovery['structure'] {
  const sections: SectionStat[] = map.sitemap.sections.map((s) => ({
    section: s.section, label: sectionLabel(s.section), count: s.count, latest: s.latest,
    kind: BLOG_SECTION.test(fold(s.section)) ? 'blog' : s.count >= 1 ? 'paginas' : 'outros',
  }));
  const blogSections = sections.filter((s) => s.kind === 'blog');
  const articles = Math.max(map.sitemap.postUrls, blogSections.reduce((n, s) => n + s.count, 0));
  const dates = blogSections.map((s) => s.latest).filter((x): x is string => !!x).sort();
  const lastPublished = dates.length ? dates[dates.length - 1] : (map.sitemap.postUrls && map.sitemap.newest ? map.sitemap.newest : null);
  const daysSince = lastPublished ? Math.max(0, Math.floor((now - Date.parse(lastPublished)) / day)) : null;
  const blogUrl = blogSections[0] ? `${map.origin}/${blogSections[0].section.startsWith('(') ? '' : blogSections[0].section}`.replace(/\/$/, '') : null;
  return {
    sections: sections.slice(0, 14), subdomains: map.subdomains.filter((h) => h !== map.host),
    blog: { found: articles > 0 || blogSections.length > 0, url: blogUrl, articles, lastPublished, daysSince },
    sitemapFiles: map.sitemap.files.map((f) => ({ kind: f.kind, count: f.count })),
  };
}

// ------------------------------------------------------------------------------------------------------------ contatos
function buildContacts(pages: PageFacts[]): Contacts {
  const phones = new Set<string>();
  const emails = new Set<string>();
  const wa = new Set<string>();
  const maps = new Set<string>();
  let address: string | null = null;
  const hours: string[] = [];
  for (const p of pages) {
    p.phones.forEach((x) => phones.add(x));
    p.emails.filter((e) => !/\.(png|jpe?g|webp|gif)$/i.test(e) && !/(wixpress|sentry|example\.)/i.test(e)).forEach((x) => emails.add(x));
    p.whatsapp.forEach((x) => wa.add(x));
    p.maps.forEach((x) => maps.add(x));
    for (const n of p.jsonld) {
      if (n.telephone) phones.add(n.telephone.replace(/[^\d+]/g, ''));
      if (n.email) emails.add(n.email.toLowerCase());
      if (!address && n.address && (n.address.street || n.address.locality)) address = [n.address.street, n.address.locality, n.address.region, n.address.postal].filter(Boolean).join(', ');
      for (const h of n.openingHours || []) if (hours.length < 5 && !hours.includes(h)) hours.push(h);
    }
  }
  if (!address) {
    for (const p of pages) {
      const cep = p.ceps[0];
      if (!cep) continue;
      const i = p.excerpt.indexOf(cep);
      if (i > 0) { address = cap(p.excerpt.slice(Math.max(0, i - 110), i + 9).replace(/^[^A-ZÀ-Ú0-9]+/, '').trim(), 160); break; }
    }
  }
  return { phones: [...phones].slice(0, 5), emails: [...emails].slice(0, 5), whatsapp: [...wa].slice(0, 3), maps: [...maps].slice(0, 2), address, openingHours: hours };
}

// ------------------------------------------------------------------------------------------------------------ checagens técnicas e oportunidades
function buildChecks(map: SiteMapResult, pages: PageFacts[], structure: Discovery['structure'], regions: Regions | null, social: Record<string, string>): { checks: Check[]; opportunities: Opportunity[] } {
  const checks: Check[] = [];
  const opps: Opportunity[] = [];
  const home = pages[0];
  const c = (key: string, label: string, status: Check['status'], detail: string) => checks.push({ key, label, status, detail });
  const o = (id: string, severity: Opportunity['severity'], title: string, detail: string, action: string) => opps.push({ id, severity, title, detail, action });

  c('site', 'Site responde', home ? 'ok' : 'fail', home ? `A página inicial abriu em ${home.ttfbMs} ms (tempo até o primeiro byte, medido do nosso servidor).` : (map.homeError || 'A página inicial não abriu.'));
  if (!home) o('site_fora', 'alta', 'Não consegui abrir a página inicial', map.homeError || 'O site não respondeu.', 'Confira se o endereço está certo e se o site está no ar; depois reanalise.');
  if (home) {
    c('velocidade', 'Resposta do servidor', home.ttfbMs < 800 ? 'ok' : home.ttfbMs < 1800 ? 'warn' : 'fail', `${home.ttfbMs} ms até o primeiro byte.`);
    if (home.ttfbMs >= 1800) o('servidor_lento', 'media', 'Servidor lento', `A página inicial levou ${home.ttfbMs} ms para começar a responder.`, 'Revise hospedagem e cache: velocidade influencia ranqueamento e conversão.');
  }
  c('sitemap', 'Sitemap', map.sitemap.found ? 'ok' : 'fail', map.sitemap.found ? `${map.sitemap.urls.toLocaleString('pt-BR')} endereços em ${map.sitemap.files.length} arquivo(s)${map.sitemap.truncated ? ' (leitura limitada)' : ''}.` : 'Nenhum sitemap encontrado nos endereços comuns nem no robots.txt.');
  if (!map.sitemap.found) o('sem_sitemap', 'alta', 'Sem sitemap', 'Sem a lista de páginas, buscadores e IAs descobrem o conteúdo mais devagar.', 'Gere o sitemap (Rank Math ou Yoast fazem isso) e declare no robots.txt.');
  c('robots', 'robots.txt', !map.robots.found ? 'warn' : map.robots.disallowAll ? 'fail' : 'ok', !map.robots.found ? 'Não encontrado.' : map.robots.disallowAll ? 'Bloqueia o site inteiro para os buscadores.' : 'Encontrado e liberando o site.');
  if (map.robots.disallowAll) o('robots_bloqueia', 'alta', 'O robots.txt bloqueia o site inteiro', 'Com "Disallow: /" o site some do Google.', 'Remova a regra de bloqueio geral.');
  const blocked = Object.entries(map.robots.aiBots).filter(([, s]) => s.startsWith('bloqueado')).map(([b]) => b);
  c('robos_ia', 'Robôs de IA (ChatGPT, Claude, Perplexity…)', blocked.length ? 'warn' : map.robots.found ? 'ok' : 'info', blocked.length ? `Bloqueados: ${blocked.join(', ')}.` : map.robots.found ? 'Nenhum robô de IA bloqueado.' : 'Sem robots.txt: valem as regras padrão.');
  if (blocked.length) o('ia_bloqueada', 'media', 'Robôs de IA bloqueados', `Bloqueados: ${blocked.join(', ')}. As IAs não conseguem citar o site.`, 'Se quer ser citado pelas IAs, libere esses robôs. Se foi proposital, ignore.');
  c('llms', 'llms.txt (resumo do site para IAs)', map.llms.found ? 'ok' : 'warn', map.llms.found ? 'Publicado.' : 'Não encontrado.');
  if (!map.llms.found) o('sem_llms', 'baixa', 'Sem llms.txt', 'É o arquivo que resume o negócio e os links principais para as IAs.', 'A Zica pode gerar o llms.txt a partir deste perfil quando você confirmar.');

  // dados estruturados
  const types = new Set(pages.flatMap((p) => p.jsonld.flatMap((n) => n.types)));
  const entity = ['Organization', 'LocalBusiness', 'LegalService', 'Attorney', 'ProfessionalService', 'MedicalClinic', 'Dentist', 'Store', 'NewsMediaOrganization', 'EducationalOrganization', 'AccountingService', 'RealEstateAgent', 'BeautySalon', 'Corporation'].filter((t) => types.has(t));
  c('schema', 'Dados estruturados (schema)', entity.length ? 'ok' : types.size ? 'warn' : 'fail', entity.length ? `Entidade declarada: ${entity.slice(0, 3).join(', ')}. Outros tipos: ${[...types].filter((t) => !entity.includes(t)).slice(0, 4).join(', ') || 'nenhum'}.` : types.size ? `Só tipos genéricos (${[...types].slice(0, 4).join(', ')}); falta declarar quem é a empresa.` : 'Nenhum dado estruturado encontrado.');
  if (!entity.length) o('sem_entidade', 'alta', 'O site não declara quem é a empresa (schema)', 'Sem Organization/LocalBusiness, buscadores e IAs têm que adivinhar nome, endereço e redes.', 'Gerar o schema da empresa a partir do perfil confirmado.');
  if (home && !types.has('WebSite')) o('sem_website_schema', 'baixa', 'Sem schema WebSite', 'Ajuda o nome do site a aparecer correto nos resultados.', 'Adicionar WebSite com o nome do negócio.');
  if (structure.blog.found && pages.length > 3 && !['Article', 'BlogPosting', 'NewsArticle'].some((t) => types.has(t))) o('sem_article_schema', 'media', 'Artigos sem schema Article', 'Os artigos lidos não declaram autor, data e título estruturados.', 'Aplicar Article/BlogPosting com autor e data nos artigos.');
  if (!types.has('FAQPage') && pages.length > 3) o('sem_faq', 'baixa', 'Nenhuma página com FAQ estruturado', 'Perguntas e respostas bem marcadas são muito citadas por IAs.', 'Criar FAQs a partir das dúvidas reais dos clientes.');

  // qualidade das páginas lidas
  const content = pages.filter((p) => p.status === 200);
  const n = content.length;
  if (n) {
    const withDesc = content.filter((p) => p.description && p.description.length >= 50).length;
    c('descricoes', 'Meta description', withDesc === n ? 'ok' : withDesc >= n * 0.6 ? 'warn' : 'fail', `${withDesc} de ${n} páginas lidas têm descrição adequada.`);
    if (withDesc < n) o('sem_descricao', withDesc < n * 0.6 ? 'media' : 'baixa', `${n - withDesc} página(s) sem meta description`, 'A descrição é o texto que aparece no resultado de busca.', 'Escrever descrições únicas de 120 a 160 caracteres.');
    const oneH1 = content.filter((p) => p.h1.length === 1).length;
    c('h1', 'Um título principal (H1) por página', oneH1 === n ? 'ok' : oneH1 >= n * 0.7 ? 'warn' : 'fail', `${oneH1} de ${n} páginas têm exatamente um H1.`);
    if (oneH1 < n) o('h1', 'media', `${n - oneH1} página(s) com H1 ausente ou repetido`, 'Cada página precisa de um título principal claro.', 'Ajustar para um H1 por página, com a palavra-chave da página.');
    const longTitle = content.filter((p) => (p.title || '').length > 65).length;
    c('titulos', 'Títulos de página', longTitle ? 'warn' : 'ok', longTitle ? `${longTitle} título(s) com mais de 65 caracteres (cortam no Google).` : 'Todos cabem no resultado de busca.');
    const noCanon = content.filter((p) => !p.canonical).length;
    c('canonical', 'Canonical', noCanon ? 'warn' : 'ok', noCanon ? `${noCanon} de ${n} sem URL canônica.` : 'Presente em todas as páginas lidas.');
    const thin = content.filter((p, i) => i > 0 && p.words < 300).length;
    c('conteudo_fino', 'Profundidade do conteúdo', thin ? 'warn' : 'ok', thin ? `${thin} página(s) com menos de 300 palavras.` : 'Páginas lidas têm texto suficiente.');
    if (thin) o('conteudo_fino', 'media', `${thin} página(s) com pouco texto`, 'Páginas muito curtas raramente ranqueiam ou são citadas por IAs.', 'Aprofundar com perguntas e respostas reais do cliente.');
    const noindex = content.filter((p) => p.noindex).length;
    if (noindex) { c('noindex', 'Páginas bloqueadas por noindex', 'warn', `${noindex} página(s) lida(s) pedem para não serem indexadas.`); o('noindex', 'media', `${noindex} página(s) com noindex`, 'Páginas com noindex não aparecem no Google.', 'Confirme se é proposital.'); }
    c('mobile', 'Preparado para celular', content.every((p) => p.viewport) ? 'ok' : 'warn', content.every((p) => p.viewport) ? 'Todas declaram viewport móvel.' : 'Alguma página não declara viewport móvel.');
  }

  // conteúdo e presença
  c('blog', 'Blog e artigos', structure.blog.found ? (structure.blog.daysSince !== null && structure.blog.daysSince > 180 ? 'warn' : 'ok') : 'warn', structure.blog.found ? `${structure.blog.articles.toLocaleString('pt-BR')} artigo(s)${structure.blog.lastPublished ? `; último publicado em ${structure.blog.lastPublished.split('-').reverse().join('/')}` : ''}.` : 'Nenhuma seção de blog ou artigos encontrada.');
  if (!structure.blog.found) o('sem_blog', 'alta', 'Sem blog ou área de artigos', 'Conteúdo recorrente é o principal motor de SEO, GEO e AEO.', 'Planejar a primeira onda de artigos com o Planejador de Autoridade.');
  else if (structure.blog.daysSince !== null && structure.blog.daysSince > 180) o('blog_parado', 'media', `Blog sem publicação há ${structure.blog.daysSince} dias`, 'Sites parados perdem frescor e espaço nas respostas das IAs.', 'Retomar um calendário de publicações.');
  const socialKeys = Object.keys(social);
  c('redes', 'Redes sociais ligadas ao site', socialKeys.length >= 3 ? 'ok' : socialKeys.length ? 'warn' : 'fail', socialKeys.length ? `Encontradas: ${socialKeys.join(', ')}.` : 'Nenhum link de rede social encontrado.');
  if (!socialKeys.length) o('sem_redes', 'media', 'O site não aponta para redes sociais', 'Perfis ligados ao site ajudam a confirmar a identidade da marca.', 'Informe os perfis; o schema passa a listá-los (sameAs).');
  const gbp = pages.some((p) => p.maps.length);
  c('gbp', 'Link para o Google Maps / Meu Negócio', gbp ? 'ok' : 'info', gbp ? 'O site liga ao Google Maps.' : 'Nenhum link para o Google Maps encontrado.');
  if (!gbp && regions && regions.cities.length) o('sem_maps', 'baixa', 'O site não liga ao perfil do Google Meu Negócio', 'Para negócio local, o mapa e as avaliações pesam muito.', 'Informe o link do perfil no Google para a Zica auditar.');
  if (regions && home && regions.cities.length + regions.areas.length >= 1 && content.filter((p) => regions.cities.some((h) => h.urls.includes(p.url))).length < Math.min(2, n)) o('seo_local', 'media', 'Poucas páginas falam das regiões atendidas', 'A cidade ou região aparece em poucas páginas lidas.', 'Criar páginas por região e serviço (SEO local).');
  const hasContact = pages.some((p) => p.whatsapp.length || p.phones.length);
  c('contato', 'Contato direto', hasContact ? 'ok' : 'warn', hasContact ? 'Telefone ou WhatsApp encontrado.' : 'Nenhum telefone ou WhatsApp clicável encontrado.');
  if (!hasContact) o('sem_contato', 'media', 'Sem telefone ou WhatsApp visível', 'Quem decide rápido quer falar na hora.', 'Colocar botão de WhatsApp e telefone clicável nas páginas principais.');
  if (pages.some((p) => p.hreflang.length)) c('hreflang', 'Idiomas (hreflang)', 'info', `Idiomas declarados: ${[...new Set(pages.flatMap((p) => p.hreflang))].join(', ')}.`);

  const order = { alta: 0, media: 1, baixa: 2, info: 3 } as const;
  opps.sort((a, b) => order[a.severity] - order[b.severity]);
  return { checks, opportunities: opps };
}

// ------------------------------------------------------------------------------------------------------------ montagem
/** Endereço sem site (listagem do servidor, página padrão, vazio) ou fora do ar: não há o que ler. Resultado honesto, sem inventar nada. */
function withoutSite(map: SiteMapResult, now: number): Discovery {
  const published = map.homeKind !== 'fora_do_ar';
  const note = map.homeError || HOME_KIND_TEXT[map.homeKind];
  const inferences: Inference[] = [];
  if (published) {
    const checked = validateValue(FIELD_BY_KEY.sitestat, 'Em construção');
    if (checked.ok && checked.value) inferences.push({ key: 'sitestat', label: labelOf('sitestat'), value: checked.value, confidence: 'media', evidence: [{ url: `${map.origin}/`, note }], group: 'presenca' });
  }
  const gaps = ['businessName', 'seg', 'sector', 'offer', 'tipo', 'regions', 'reach', 'audience', 'competitors', 'conceito', 'dor']
    .map((key) => ({ key, label: labelOf(key), why: 'Não há site para ler: este dado vem do conceito que você conta à Zica.' }));
  return {
    version: map.version, generatedAt: new Date(now).toISOString(), siteState: published ? 'nao_publicado' : 'fora_do_ar', siteStateNote: note,
    site: { origin: map.origin, host: map.host, registrable: map.registrable },
    stats: { pagesRead: 0, pagesFailed: 0, sitemapUrls: 0, elapsedMs: map.elapsedMs, homeOk: false },
    inferences, gaps,
    contacts: { phones: [], emails: [], whatsapp: [], maps: [], address: null, openingHours: [] },
    structure: { sections: [], subdomains: [], blog: { found: false, url: null, articles: 0, lastPublished: null, daysSince: null }, sitemapFiles: [] },
    social: {}, checks: [{ key: 'site', label: 'Site responde', status: 'fail', detail: note }],
    opportunities: [{
      id: published ? 'site_nao_publicado' : 'site_fora', severity: 'alta',
      title: published ? 'Este endereço ainda não tem site publicado' : 'Não consegui abrir o site',
      detail: note,
      action: published ? 'Vamos montar o conceito do negócio com a Zica (conversa guiada) e, com o perfil pronto, construir o site e a primeira onda de conteúdo.' : 'Confira se o endereço está certo e se o site está no ar; depois reanalise.',
    }],
    stack: [], logo: null, brandColors: [],
    followUps: [
      'Quero montar o conceito do meu negócio do zero: por onde começamos?',
      'Que segmento, público e regiões você sugere para um negócio com este nome?',
      'Quais seriam as páginas essenciais do site e os primeiros 10 artigos?',
    ],
  };
}

export function synthesize(map: SiteMapResult, readPages: PageFacts[], failed = 0, now = Date.now()): Discovery {
  if (!map.home) return withoutSite(map, now);
  const pages = [...(map.home ? [map.home] : []), ...readPages.filter((p) => p.url !== map.home?.url)];
  const structure = buildStructure(map, now);
  const contacts = buildContacts(pages);
  const social: Record<string, string> = {};
  for (const p of pages) for (const [k, v] of Object.entries(p.socials)) if (!social[k]) social[k] = v;
  for (const p of pages) for (const n of p.jsonld) for (const u of n.sameAs || []) { const c = classifySocial(u); if (c && !social[c.key]) social[c.key] = c.url; }

  const inferences: Inference[] = [];
  const gaps: Discovery['gaps'] = [];
  const add = (key: string, value: FieldValue | null | undefined, confidence: Confidence, evidence: Evidence[], group: InferenceGroup) => {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return;
    const def = FIELD_BY_KEY[key];
    if (!def) return;
    const checked = validateValue(def, value);
    if (!checked.ok || checked.value === null) return;
    inferences.push({ key, label: labelOf(key), value: checked.value, confidence, evidence: evidence.slice(0, 5), group });
  };
  const gap = (key: string, why: string) => { if (!inferences.some((i) => i.key === key)) gaps.push({ key, label: labelOf(key), why }); };

  const home = pages[0];
  const name = detectName(pages);
  if (name) add('businessName', name.name, name.confidence, name.evidence, 'identidade');
  const seg = detectSegment(pages);
  if (seg) add('seg', seg.segment, seg.confidence, seg.evidence, 'identidade');
  const subs = seg ? detectSubareas(seg.segment, pages) : [];
  if (subs.length) add('sector', subs.map((s) => s.name).join(', '), 'media', [{ url: home?.url, note: `Assuntos que mais aparecem no site: ${subs.slice(0, 5).map((s) => s.name).join(', ')}.` }], 'identidade');
  else {
    const labels = (home?.nav || []).map((n) => n.text).filter((t) => t.length >= 4 && !/^(contato|sobre|blog|quem somos|home|fale|equipe|noticias|notícias|depoimentos|artigos)/i.test(t)).slice(0, 6);
    if (labels.length >= 2) add('sector', labels.join(', '), 'baixa', [{ url: home?.url, note: 'Itens do menu principal do site.' }], 'identidade');
  }
  const offer = home?.description && home.description.length >= 40 ? home.description : (home?.jsonld.map((n) => n.description).find((d) => d && d.length >= 40) || null);
  if (offer) add('offer', cap(offer, 400), 'media', [{ url: home?.url, note: 'Descrição que o próprio site usa para se apresentar.' }], 'identidade');
  add('entityType', seg?.segment === 'Mídia e notícias' ? 'portal' : 'company', 'baixa', [{ note: 'Padrão: empresa. Troque se for marca, produto ou portal.' }], 'identidade');
  const cnpj = pages.flatMap((p) => p.cnpjs.map((c) => ({ c, url: p.url })))[0];
  if (cnpj) add('cnpj', cnpj.c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'), 'alta', [{ url: cnpj.url, note: 'CNPJ visto no rodapé ou em página institucional; os dígitos verificadores conferem.' }], 'identidade');
  if (contacts.address) add('endereco', contacts.address, 'media', [{ url: home?.url, note: 'Endereço encontrado nos dados estruturados ou ao lado de um CEP.' }], 'regiao');

  const type = detectCustomerType(pages);
  if (type) add('tipo', type.value, type.confidence, type.evidence, 'publico');
  const tone = detectTone(pages);
  if (tone) add('tom', tone.value, 'baixa', tone.evidence, 'publico');
  const regions = detectRegions(pages);
  if (regions) {
    if (regions.lines.length) add('regions', regions.lines.join('\n'), regions.confidence, regions.evidence, 'regiao');
    if (regions.reach) add('reach', regions.reach, regions.confidence === 'media' ? 'baixa' : 'baixa', [...regions.evidence.slice(0, 2), { note: `${regions.states.length} estado(s) detectado(s): ${regions.states.join(', ') || 'nenhum'}.` }], 'regiao');
  }
  const langs = new Set<string>();
  for (const p of pages) { const l = (p.lang || '').toLowerCase(); if (l.startsWith('pt')) langs.add('Português'); else if (l.startsWith('en')) langs.add('Inglês'); else if (l.startsWith('es')) langs.add('Espanhol'); else if (l.startsWith('fr')) langs.add('Francês'); }
  if (langs.size) add('language', [...langs], 'alta', [{ url: home?.url, note: 'Idioma declarado no código das páginas (lang).' }], 'regiao');

  // audiência: rascunho montado só com o que foi encontrado
  if (subs.length || offer) {
    const who = type?.value.includes('B2B') && !type.value.includes('B2C') ? 'Empresas' : type?.value.includes('B2B') ? 'Pessoas e empresas' : 'Pessoas';
    const need = subs.length ? `que procuram ${subs.slice(0, 3).map((s) => s.name.toLowerCase()).join(', ')}` : 'que procuram o que o site oferece';
    const where = regions?.lines.length ? ` em ${regions.lines.slice(0, 3).join(', ')}` : '';
    add('audience', `${who} ${need}${where}. (Rascunho montado a partir do site: ajuste com a sua visão do cliente ideal.)`, 'baixa', [{ note: 'Rascunho montado só com o que o site mostra; ninguém foi consultado.' }], 'publico');
  }

  // presença
  add('sitestat', 'Tenho site', 'alta', [{ url: home?.url, note: 'O site abriu.' }], 'presenca');
  const siteLines = [map.origin, ...structure.subdomains.map((h) => `https://${h}`)];
  add('sites', [...new Set(siteLines)].slice(0, 6).join('\n'), 'alta', [{ url: home?.url, note: structure.subdomains.length ? `Subdomínios encontrados no sitemap e nos links: ${structure.subdomains.slice(0, 4).join(', ')}.` : 'Endereço analisado.' }], 'presenca');
  if (map.sitemap.found) { add('sitemap', 'yes', 'alta', [{ note: `${map.sitemap.urls.toLocaleString('pt-BR')} endereços encontrados.` }], 'presenca'); add('sitemapUrl', map.sitemap.files[0]?.url || `${map.origin}/sitemap.xml`, 'alta', [{ note: 'Primeiro arquivo de sitemap lido.' }], 'presenca'); add('pages', `${map.sitemap.urls.toLocaleString('pt-BR')} (sitemap)`, 'alta', [{ note: 'Contagem real do sitemap, não estimativa.' }], 'presenca'); }
  else add('sitemap', 'no', 'media', [{ note: 'Nenhum sitemap encontrado nos endereços comuns.' }], 'presenca');
  add('hasArticles', structure.blog.found ? 'yes' : 'no', structure.blog.found ? 'alta' : 'media', [{ note: structure.blog.found ? `${structure.blog.articles} artigo(s) em seções de conteúdo.` : 'Nenhuma seção de blog ou artigos encontrada.' }], 'conteudo');
  if (structure.blog.url) add('blog', structure.blog.url, 'media', [{ note: 'Maior seção de artigos do sitemap.' }], 'conteudo');
  const SOCIAL_KEYS = ['instagram', 'facebook', 'linkedin', 'x', 'tiktok', 'youtube', 'kwai'];
  for (const k of SOCIAL_KEYS) if (social[k]) add(k, social[k], 'alta', [{ url: home?.url, note: 'Link para o perfil encontrado no site.' }], 'presenca');
  if (contacts.whatsapp[0]) add('cta', `Conversar no WhatsApp: ${contacts.whatsapp[0]}`, 'media', [{ url: home?.url, note: 'Botão de WhatsApp encontrado no site.' }], 'presenca');

  // marca
  const colors = [...new Set([home?.themeColor, ...pages.flatMap((p) => p.cssColors)].filter((x): x is string => !!x))].slice(0, 4);
  colors.slice(0, 2).forEach((hex, i) => add(i === 0 ? 'c1' : 'c2', hex, 'baixa', [{ url: home?.url, note: 'Cor declarada no tema do site.' }], 'marca'));
  const logo = home?.jsonld.map((n) => n.logo).find(Boolean) || home?.ogImage || null;

  for (const key of ['businessName', 'seg', 'sector', 'offer', 'tipo', 'regions', 'reach', 'audience', 'competitors']) {
    if (key === 'competitors') gap(key, 'O site não lista concorrentes. A Zica pode sugerir com base no mercado e nas buscas; você confirma.');
    else if (key === 'regions') gap(key, 'O site não deixa claro onde atende. Conte para onde o negócio atende.');
    else if (key === 'tipo') gap(key, 'Não deu para saber se vende para pessoas ou empresas.');
    else gap(key, 'O site não trouxe esse dado com clareza.');
  }
  gap('dor', 'A dor do cliente só você (ou as conversas com clientes) conhece. A Zica pode ajudar a descrever.');
  gap('conceito', 'O conceito da marca costuma não estar escrito no site. A Zica pode ajudar a formular.');

  const { checks, opportunities } = buildChecks(map, pages, structure, regions, social);
  const stack = [...new Set(pages.flatMap((p) => p.stack))].slice(0, 8);
  const region1 = regions?.lines[0] ? ` em ${regions.lines[0]}` : '';
  const followUps = [
    `Quem são os 5 principais concorrentes de ${name?.name || 'meu negócio'}${region1}?`,
    'Quais perguntas meus clientes fazem antes de contratar? Liste as 10 mais comuns.',
    `Sugira regiões e cidades que vale priorizar${seg ? ` para ${seg.segment.toLowerCase()}` : ''}.`,
    'Escreva o conceito da marca em 3 frases com base no que o site já diz.',
    'Quais são as maiores objeções de quem pensa em contratar e como respondê-las?',
  ];

  return {
    version: map.version, generatedAt: new Date(now).toISOString(), siteState: 'ok', siteStateNote: null,
    site: { origin: map.origin, host: map.host, registrable: map.registrable },
    stats: { pagesRead: pages.length, pagesFailed: failed, sitemapUrls: map.sitemap.urls, elapsedMs: map.elapsedMs, homeOk: !!map.home },
    inferences, gaps, contacts, structure, social, checks, opportunities, stack,
    logo, brandColors: colors, followUps,
  };
}

/** valores a gravar no perfil: só o que o cliente aceitou. Formato aceito por `profile_save` (mesmo do formulário). */
export function changesFrom(accepted: Array<{ key: string; value: FieldValue }>): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const a of accepted) out[a.key] = a.value;
  return out;
}
