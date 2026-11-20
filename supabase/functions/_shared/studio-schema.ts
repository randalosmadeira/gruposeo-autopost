/**
 * Schema em UM grafo só para páginas do Estúdio (JSON-LD), sem duplicar o que o site já emite.
 *
 * Corrige o que a auditoria da RDM (20/11/2026) achou: 8 ou mais @id para a mesma entidade, Article duplicado, autor genérico, sem BreadcrumbList,
 * home sem sameAs/logo/areaServed, horário e telefone conflitantes. Aqui:
 *  - UMA entidade (@id `${origem}/#organization`); o tipo vem do segmento (LegalService, MedicalBusiness...) ou LocalBusiness/Organization;
 *  - WebPage (ou CollectionPage no hub), Service (quando a página fala de um serviço), BreadcrumbList (mesma hierarquia da URL), Article só no guia,
 *    FAQPage só se o FAQ existe NA PÁGINA (informativo: o Google aposentou o rich result de FAQ em 05/2026);
 *  - sameAs só do Perfil (https), logo do Perfil, telefone do Perfil, horário só se vier em formato de schema (senão fica de fora: nada de chute);
 *  - areaServed só do que o projeto declara; inLanguage do idioma da página; autor só se for pessoa real cadastrada;
 *  - com plugin de SEO ativo (Rank Math, Yoast, AIOSEO, SEOPress), WebPage, trilha, Article e organização ficam COM ELE; o Estúdio emite só Service/FAQPage.
 * Sem rede, sem IA.
 */
import type { PageType, ProfileFacts, StudioPageDoc } from './studio-types.ts';
import { slugifySegment } from './studio-url.ts';

type Node = Record<string, unknown>;
export interface StudioGraph { '@context': 'https://schema.org'; '@graph': Node[] }
export interface SchemaBuild { graph: StudioGraph | null; types: string[]; notes: string[]; dropped: string[] }

export const SEO_PLUGIN_OWNED = ['WebPage', 'CollectionPage', 'BreadcrumbList', 'Organization', 'LocalBusiness', 'LegalService', 'WebSite', 'Article', 'BlogPosting', 'NewsArticle', 'TechArticle'];
const ARTICLE_TYPES = ['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'];

/** Tipo schema.org da entidade a partir do segmento do projeto (sem segmento conhecido: LocalBusiness se há endereço; senão Organization). */
export function entityTypeFor(segment: string | null, hasAddress: boolean): string {
  const s = String(segment || '').toLowerCase();
  if (/jur[ií]d|advoc|legal|law/.test(s)) return 'LegalService';
  if (/odont|dental|dentist/.test(s)) return 'Dentist';
  if (/cl[ií]nic|sa[uú]de|health|medic/.test(s)) return 'MedicalBusiness';
  if (/imobili|real.?estate/.test(s)) return 'RealEstateAgent';
  if (/contab|account/.test(s)) return 'AccountingService';
  if (/restaur|food/.test(s)) return 'Restaurant';
  return hasAddress ? 'LocalBusiness' : 'Organization';
}

const OPENING = /^(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su))*\s+\d{2}:\d{2}-\d{2}:\d{2}$/;
function addressNode(line: string, country: string | null): Node {
  const cep = line.match(/\b(\d{5}-?\d{3})\b/);
  const street = line.replace(/\b\d{5}-?\d{3}\b/, '').replace(/[,\s-]+$/, '').trim();
  return { '@type': 'PostalAddress', streetAddress: street, ...(cep ? { postalCode: cep[1] } : {}), ...(country ? { addressCountry: country } : {}) };
}
const areaNode = (a: string): unknown => (/^[A-Za-z]{2}$/.test(a) ? a.toUpperCase() : { '@type': 'AdministrativeArea', name: a });

/** Entidade principal (UMA por site). Só campos que o Perfil tem. */
export function organizationNode(profile: ProfileFacts, doc: Pick<StudioPageDoc, 'origin' | 'areaServed' | 'segment'>): { node: Node; notes: string[] } {
  const notes: string[] = [];
  const type = entityTypeFor(profile.segment || doc.segment, profile.addresses.length > 0);
  const country = doc.areaServed.find((a) => /^[A-Za-z]{2}$/.test(a)) || null;
  const node: Node = { '@type': type, '@id': `${doc.origin}/#organization`, name: profile.name, url: `${doc.origin}/` };
  if (profile.logoUrl) node.logo = profile.logoUrl; else notes.push('Sem logomarca no Perfil: o schema da organização sai sem logo.');
  const sameAs = Array.from(new Set(profile.sameAs.filter((u) => /^https:\/\//i.test(u))));
  if (sameAs.length) node.sameAs = sameAs; else notes.push('Sem perfis oficiais (sameAs) no Perfil: cadastre os links reais das redes e do Google Meu Negócio.');
  if (profile.phones[0]) node.telephone = profile.phones[0];
  if (profile.email) node.email = profile.email;
  if (profile.addresses.length && type !== 'Organization') node.address = profile.addresses.length === 1 ? addressNode(profile.addresses[0], country) : profile.addresses.map((a) => addressNode(a, country));
  if (profile.hours) {
    const lines = profile.hours.split(/\r?\n|;/).map((l) => l.trim()).filter(Boolean);
    if (lines.length && lines.every((l) => OPENING.test(l))) node.openingHours = lines; else notes.push('O horário do Perfil não está em formato estruturado (ex.: "Mo-Fr 09:00-18:00"): fica de fora do schema para não afirmar horário errado.');
  }
  if (doc.areaServed.length) node.areaServed = doc.areaServed.map(areaNode);
  return { node, notes };
}

const hasText = (html: string, q: string) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase().includes(q.replace(/\s+/g, ' ').trim().toLowerCase());

export function buildStudioSchema(doc: StudioPageDoc, profile: ProfileFacts, opts: { type?: PageType } = {}): SchemaBuild {
  const type = opts.type || doc.type;
  const notes: string[] = [];
  const dropped: string[] = [];
  if (!doc.origin || !doc.url) return { graph: null, types: [], notes: ['Sem endereço do site/da página: o schema não é gerado.'], dropped };
  const orgId = `${doc.origin}/#organization`;
  const plugin = doc.seoPlugin;
  const nodes: Node[] = [];

  const org = organizationNode(profile, doc);
  notes.push(...org.notes);
  const providerRef: Node = plugin ? { '@type': 'Organization', name: profile.name, url: `${doc.origin}/` } : { '@id': orgId };

  if (!plugin) nodes.push(org.node);

  const page: Node = {
    '@type': type === 'hub' ? 'CollectionPage' : 'WebPage', '@id': `${doc.url}#webpage`, url: doc.url, name: doc.title, description: doc.metaDescription, inLanguage: doc.language,
    publisher: { '@id': orgId }, breadcrumb: { '@id': `${doc.url}#breadcrumb` },
  };
  if (doc.datePublished) page.datePublished = doc.datePublished;
  if (doc.dateModified) page.dateModified = new Date(Math.max(Date.parse(doc.dateModified), Date.parse(doc.datePublished || doc.dateModified) || 0)).toISOString();
  const hero = doc.images.find((i) => i.slot === 'hero' && i.origin !== 'pendente');
  if (hero) page.primaryImageOfPage = { '@type': 'ImageObject', url: hero.url, width: hero.width, height: hero.height };
  if (!plugin) nodes.push(page);

  if (doc.subject && ['servico', 'local', 'landing', 'pagina'].includes(type)) {
    const svc: Node = { '@type': 'Service', '@id': `${doc.url}#service`, name: doc.subject, serviceType: doc.subject, url: doc.url, provider: providerRef, inLanguage: doc.language };
    if (doc.areaServed.length) svc.areaServed = doc.areaServed.map(areaNode);
    if (doc.place && !doc.areaServed.length) svc.areaServed = { '@type': 'Place', name: doc.place };
    if (!plugin) (page as Node).about = { '@id': `${doc.url}#service` };
    nodes.push(svc);
  }

  if (type === 'guia') {
    const art: Node = { '@type': 'Article', '@id': `${doc.url}#article`, headline: doc.h1 || doc.title, mainEntityOfPage: { '@id': `${doc.url}#webpage` }, inLanguage: doc.language, url: doc.url, publisher: { '@id': orgId } };
    if (doc.datePublished) art.datePublished = doc.datePublished;
    if (doc.dateModified) art.dateModified = (page.dateModified as string) || doc.dateModified;
    if (hero) art.image = [hero.url];
    if (doc.author && doc.author.name.trim()) {
      art.author = { '@type': 'Person', '@id': `${doc.origin}/#person-${slugifySegment(doc.author.name, doc.language.slice(0, 2))}`, name: doc.author.name, ...(doc.author.credential ? { jobTitle: doc.author.credential } : {}), ...(doc.author.url ? { url: doc.author.url } : {}) };
    } else notes.push('Guia sem autor real: o schema sai sem autor. O sistema não inventa autor: cadastre a pessoa (e o registro profissional, se houver) no Perfil.');
    if (plugin) dropped.push('Article'); else nodes.push(art);
  } else if (doc.author?.name && !plugin) {
    // páginas comerciais citam o responsável pelo conteúdo só se existir (E-E-A-T); sem inventar cargo
    (page as Node).author = { '@type': 'Person', name: doc.author.name, ...(doc.author.credential ? { jobTitle: doc.author.credential } : {}) };
  }

  if (doc.breadcrumbs.length >= 2 && !plugin) {
    nodes.push({ '@type': 'BreadcrumbList', '@id': `${doc.url}#breadcrumb`, itemListElement: doc.breadcrumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) });
  } else if (plugin) dropped.push('BreadcrumbList');
  else notes.push('Trilha não gerada: faltam níveis (a hierarquia do endereço define a trilha).');

  const realFaq = doc.faq.filter((f) => f.q.trim() && f.a.trim() && hasText(doc.bodyHtml, f.q));
  if (realFaq.length >= 2) nodes.push({ '@type': 'FAQPage', '@id': `${doc.url}#faq`, mainEntity: realFaq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() } })), inLanguage: doc.language });
  else if (doc.faq.length) notes.push('FAQPage não gerada: só entra com 2 ou mais perguntas que aparecem de fato no texto da página.');

  if (plugin) dropped.push(...['WebPage', 'Organization'].filter((d) => !dropped.includes(d)));
  if (plugin) notes.push(`O site usa ${plugin}: WebPage, trilha, organização e Article ficam com ele; o Estúdio emite só Service e FAQPage (evita grafo duplicado).`);

  const graph: StudioGraph = { '@context': 'https://schema.org', '@graph': nodes };
  return { graph, types: typesOf(graph), notes, dropped };
}

const typesOfNode = (n: Node): string[] => (Array.isArray(n['@type']) ? (n['@type'] as unknown[]).map(String) : n['@type'] ? [String(n['@type'])] : []);
export const typesOf = (g: StudioGraph | null): string[] => (g ? Array.from(new Set(g['@graph'].flatMap(typesOfNode))) : []);

export interface SchemaProblem { code: 'sem_grafo' | 'id_repetido' | 'referencia_quebrada' | 'article_duplicado' | 'entidades_duplicadas' | 'sem_idioma' | 'sameas_invalido' | 'faq_sem_texto' | 'sem_nome'; text: string }
const ORG_TYPES = ['Organization', 'LocalBusiness', 'LegalService', 'Dentist', 'MedicalBusiness', 'RealEstateAgent', 'AccountingService', 'Restaurant'];

/** Valida o grafo: um só bloco por entidade, @id únicos, referências que resolvem, um Article no máximo. */
export function validateGraph(graph: StudioGraph | null, opts: { seoPlugin?: string | null } = {}): SchemaProblem[] {
  if (!graph || !graph['@graph']?.length) return [{ code: 'sem_grafo', text: 'A página não tem schema.' }];
  const out: SchemaProblem[] = [];
  const ids = graph['@graph'].map((n) => String(n['@id'] || '')).filter(Boolean);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) out.push({ code: 'id_repetido', text: `@id repetido: ${Array.from(new Set(dup)).join(', ')}.` });
  const have = new Set(ids);
  const refs: string[] = [];
  const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { const o = v as Record<string, unknown>; const keys = Object.keys(o); if (keys.length === 1 && keys[0] === '@id') refs.push(String(o['@id'])); else Object.values(o).forEach(walk); } };
  graph['@graph'].forEach((n) => Object.entries(n).forEach(([k, v]) => { if (k !== '@id') walk(v); }));
  const missing = Array.from(new Set(refs.filter((r) => !have.has(r))));
  // com plugin de SEO, as referências ao @id do plugin/organização não resolvem aqui por desenho
  const pluginIds = opts.seoPlugin ? missing.filter((m) => /#(?:organization|webpage|breadcrumb|article)$/.test(m)) : [];
  const broken = missing.filter((m) => !pluginIds.includes(m));
  if (broken.length) out.push({ code: 'referencia_quebrada', text: `Referência a @id que não existe no grafo: ${broken.join(', ')}.` });
  const all = graph['@graph'].flatMap(typesOfNode);
  if (all.filter((t) => ARTICLE_TYPES.includes(t)).length > 1) out.push({ code: 'article_duplicado', text: 'Mais de um bloco Article na página.' });
  if (graph['@graph'].filter((n) => typesOfNode(n).some((t) => ORG_TYPES.includes(t))).length > 1) out.push({ code: 'entidades_duplicadas', text: 'Mais de uma entidade (organização) no grafo: use uma só e referencie por @id.' });
  for (const n of graph['@graph']) {
    const types = typesOfNode(n);
    if (types.some((t) => ['WebPage', 'CollectionPage', 'Service', 'Article', 'FAQPage'].includes(t)) && !n.inLanguage) out.push({ code: 'sem_idioma', text: `${types[0]} sem inLanguage.` });
    if (types.some((t) => ORG_TYPES.includes(t)) && !n.name) out.push({ code: 'sem_nome', text: 'Entidade sem nome.' });
    if (Array.isArray(n.sameAs) && (n.sameAs as unknown[]).some((u) => !/^https:\/\//i.test(String(u)))) out.push({ code: 'sameas_invalido', text: 'sameAs com endereço que não é https.' });
    if (types.includes('FAQPage') && !(Array.isArray(n.mainEntity) && (n.mainEntity as unknown[]).length >= 2)) out.push({ code: 'faq_sem_texto', text: 'FAQPage sem perguntas suficientes.' });
  }
  return out;
}

export const jsonLdScript = (graph: StudioGraph | null): string => (graph && graph['@graph'].length ? `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>` : '');
