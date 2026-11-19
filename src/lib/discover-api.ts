/**
 * Cliente da "Descoberta do negócio": chama a função de borda `profile-discover` (só leitura do site público),
 * monta o perfil pré-preenchido com a síntese e guarda o resultado no navegador para a pessoa voltar sem refazer.
 */
import { supabase } from '@/integrations/supabase/client';
import { PAGES_PER_CALL, type PageFacts, type PageError, type SiteMapResult } from '../../supabase/functions/_shared/profile-discover-core';
import { synthesize, type Discovery } from '../../supabase/functions/_shared/profile-discover-synth';

export type { Discovery } from '../../supabase/functions/_shared/profile-discover-synth';

export class DiscoverError extends Error {
  constructor(public code: string) { super(code); }
}

const MESSAGES: Record<string, string> = {
  project_domain_required: 'Este projeto ainda não tem um endereço de site. Informe o site para a Zica ler.',
  site_invalid: 'Esse endereço não parece um site válido. Use algo como minhaempresa.com.br.',
  site_outside_project_domain: 'Esse endereço é de outro domínio. Cada projeto lê só o próprio site e seus subdomínios.',
  url_outside_project_domain: 'Uma das páginas é de outro domínio e foi recusada.',
  role_not_allowed: 'Seu papel nesta organização permite ver o perfil, mas não rodar a descoberta.',
  organization_membership_required: 'Você não faz parte da organização deste projeto.',
  project_not_found: 'Projeto não encontrado.',
  discover_operation_failed: 'A leitura do site não conseguiu terminar. Tente de novo em instantes.',
};
export const discoverErrorMessage = (e: unknown): string =>
  e instanceof DiscoverError ? MESSAGES[e.code] || 'Não foi possível ler o site agora. Tente de novo.' : 'Não foi possível ler o site agora. Tente de novo.';

async function call<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('profile-discover', { body: { action, ...body } });
  if (error) {
    let payload: { error?: string } | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== 'undefined' && ctx instanceof Response) payload = await ctx.json().catch(() => null);
    throw new DiscoverError(payload?.error || 'request_failed');
  }
  return data as T;
}

export type Phase = 'mapa' | 'paginas' | 'sintese' | 'pronto';
export interface Progress { phase: Phase; done: number; total: number; message: string; pagesRead: number; sitemapUrls: number; current?: string }

/**
 * Lê o site em etapas (mapa, depois páginas em lotes) para mostrar o andamento de verdade e aguentar sites lentos.
 * Se um lote falhar, segue com o que já foi lido; só o mapa é obrigatório.
 */
export async function runDiscovery(projectId: string, site: string | undefined, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<Discovery> {
  onProgress({ phase: 'mapa', done: 0, total: 1, message: 'Abrindo o site, o robots.txt e os sitemaps…', pagesRead: 0, sitemapUrls: 0 });
  const { map } = await call<{ map: SiteMapResult }>('map', { projectId, ...(site ? { site } : {}) });
  if (signal?.aborted) throw new DiscoverError('cancelled');

  const pages: PageFacts[] = [];
  let failed = 0;
  const urls = map.home ? map.candidates : [];
  const batches: string[][] = [];
  for (let i = 0; i < urls.length; i += PAGES_PER_CALL) batches.push(urls.slice(i, i + PAGES_PER_CALL));
  let done = 0;
  const report = (current?: string) => onProgress({
    phase: 'paginas', done, total: Math.max(urls.length, 1),
    message: urls.length ? `Lendo as páginas mais importantes (${Math.min(done, urls.length)} de ${urls.length})…` : 'Sem páginas para ler.',
    pagesRead: pages.length + (map.home ? 1 : 0), sitemapUrls: map.sitemap.urls, current,
  });
  report();
  // dois lotes por vez: rápido sem sobrecarregar o site do cliente
  for (let i = 0; i < batches.length; i += 2) {
    if (signal?.aborted) throw new DiscoverError('cancelled');
    const group = batches.slice(i, i + 2);
    const results = await Promise.allSettled(group.map((urlsOfBatch) => call<{ pages: PageFacts[]; errors: PageError[] }>('pages', { projectId, urls: urlsOfBatch })));
    results.forEach((r, k) => {
      if (r.status === 'fulfilled') { pages.push(...r.value.pages); failed += r.value.errors.length; } else failed += group[k].length;
      done += group[k].length;
    });
    report(group[group.length - 1]?.[0]);
  }
  onProgress({ phase: 'sintese', done: urls.length, total: Math.max(urls.length, 1), message: 'Montando o perfil, a estrutura e as oportunidades…', pagesRead: pages.length + (map.home ? 1 : 0), sitemapUrls: map.sitemap.urls });
  const discovery = synthesize(map, pages, failed);
  onProgress({ phase: 'pronto', done: urls.length, total: Math.max(urls.length, 1), message: 'Pronto.', pagesRead: discovery.stats.pagesRead, sitemapUrls: map.sitemap.urls });
  return discovery;
}

// ------------------------------------------------------------------------------------------------------------ guarda local
const key = (projectId: string) => `zica:descoberta:v1:${projectId}`;
export function loadDiscovery(projectId: string): Discovery | null {
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Discovery;
    return d && typeof d === 'object' && Array.isArray(d.inferences) && d.site ? d : null;
  } catch { return null; }
}
export function saveDiscovery(projectId: string, d: Discovery): void {
  try { localStorage.setItem(key(projectId), JSON.stringify(d)); } catch { /* sem armazenamento: o resultado fica só nesta tela */ }
}
export function clearDiscovery(projectId: string): void {
  try { localStorage.removeItem(key(projectId)); } catch { /* ignora */ }
}

export const COMMON_SITE_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/.*)?$/i;
/** o que a pessoa colou ("https://www.x.com.br/blog?x=1", "X.com.br ") vira o endereço limpo; null se não parecer um site. */
export function cleanSiteInput(raw: string): string | null {
  const t = raw.trim().split(/\s+/)[0] || '';
  if (!t || !COMMON_SITE_RE.test(t)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.toLowerCase();
  } catch { return null; }
}
