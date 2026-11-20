/**
 * Estúdio de Páginas: tipos comuns (sem dependência de Deno, banco ou rede; usado também pela tela e pelo vitest).
 *
 * Princípio do módulo: a página nasce de DADOS REAIS (Perfil do Projeto, taxonomia/território, inteligência de mercado, fatos de campo com fonte)
 * e passa por portões técnicos e por um detector de "cara de IA" antes de uma pessoa aprovar. Nada é publicado sem aprovação humana.
 * O que faltar vira PENDÊNCIA (nunca enchimento): o sistema não inventa fato, endereço, depoimento, estatística, resultado ou fonte.
 */
export const PAGE_TYPES = ['pagina', 'landing', 'hub', 'servico', 'local', 'guia', 'comparativo'] as const;
export type PageType = (typeof PAGE_TYPES)[number];
export const PAGE_STATUSES = ['rascunho', 'em_revisao', 'aprovada', 'publicada', 'despublicada'] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];
export const ADAPTERS = ['wordpress_plugin', 'site_manifest', 'zica_hosted'] as const;
export type AdapterKind = (typeof ADAPTERS)[number];

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  pagina: 'Página', landing: 'Landing page', hub: 'Página-hub', servico: 'Serviço', local: 'Página local', guia: 'Guia', comparativo: 'Comparativo',
};

/** Dados do Perfil do Projeto que o Estúdio pode usar. Só entra o que a pessoa informou ou confirmou: o que falta fica null (e vira pendência). */
export interface ProfileFacts {
  name: string;
  segment: string | null;
  offer: string | null;
  voice: string | null;
  tones: string[];
  never: string | null;
  proof: string | null;
  constraints: string | null;
  phones: string[];
  whatsapp: string | null;
  email: string | null;
  addresses: string[];
  hours: string | null;
  sameAs: string[];
  languages: string[];
  regions: string | null;
  /** autores REAIS (nome + credencial verificável). Sem autor cadastrado o Estúdio não inventa: aponta pendência. */
  authors: Array<{ name: string; credential: string | null; url: string | null }>;
  logoUrl: string | null;
  /** https://dominio-do-site (sem barra final) */
  origin: string | null;
  seoPlugin: string | null;
}
export const emptyProfile = (): ProfileFacts => ({
  name: '', segment: null, offer: null, voice: null, tones: [], never: null, proof: null, constraints: null, phones: [], whatsapp: null, email: null,
  addresses: [], hours: null, sameAs: [], languages: [], regions: null, authors: [], logoUrl: null, origin: null, seoPlugin: null,
});

/** Fato de campo (delegacia, fórum, prazo, documento, norma): só conta se tem origem e foi aprovado por pessoa. */
export interface FieldFact {
  id: string;
  kind: 'orgao' | 'local' | 'prazo' | 'documento' | 'numero' | 'norma' | 'outro';
  text: string;
  place?: string | null;
  source_url?: string | null;
  source_label?: string | null;
  approved: boolean;
}
export interface SourceRef { url: string; label: string; official?: boolean; verified?: boolean | null }

export interface FaqItem { q: string; a: string }
export interface Crumb { name: string; url: string }
export interface PageImage {
  slot: 'hero' | 'og' | 'inline';
  url: string;
  alt: string;
  width: number;
  height: number;
  format: 'webp' | 'avif' | 'jpeg' | 'png';
  filename: string;
  credit?: string | null;
  origin: 'acervo' | 'gerada' | 'pendente';
  lazy?: boolean;
  bytes?: number | null;
}
export interface Author { name: string; credential: string | null; url: string | null }

export interface PlannedLink { url: string; anchor: string; kind: 'interno' | 'externo'; reason: string; verified?: boolean | null; rel?: string }

/** A página como o Estúdio a enxerga (entrada dos portões, do renderizador e dos adaptadores). */
export interface StudioPageDoc {
  type: PageType;
  language: string;
  title: string;
  metaDescription: string;
  h1: string;
  /** caminho semântico sem barras nas pontas, ex.: "advogado-criminalista/guarulhos" */
  slugPath: string;
  /** https://dominio (sem barra final) */
  origin: string;
  /** URL canônica final (origem + caminho + barra final) */
  url: string;
  bodyHtml: string;
  faq: FaqItem[];
  breadcrumbs: Crumb[];
  sources: SourceRef[];
  links: PlannedLink[];
  images: PageImage[];
  author: Author | null;
  datePublished: string | null;
  dateModified: string | null;
  noindex: boolean;
  hreflang: Record<string, string>;
  /** o site usa Rank Math/Yoast...: eles emitem WebPage, trilha e organização; o Estúdio não duplica */
  seoPlugin: string | null;
  /** áreas atendidas declaradas (nunca assumidas) */
  areaServed: string[];
  /** assunto da página (para schema Service) */
  subject: string | null;
  place: string | null;
  segment: string | null;
}

export interface Pending { id: string; label: string; reason: string; kind: 'humano' | 'dado' | 'teto' | 'rejeitado' | 'fonte' | 'imagem' | 'radar' }

export const TRANSITIONS: Record<PageStatus, PageStatus[]> = {
  rascunho: ['em_revisao'],
  em_revisao: ['rascunho', 'aprovada'],
  aprovada: ['rascunho', 'em_revisao', 'publicada'],
  publicada: ['despublicada', 'rascunho'],
  despublicada: ['rascunho', 'publicada'],
};
