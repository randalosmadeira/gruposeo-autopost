/**
 * Visão Geral e Estrutura do negócio: regras puras (sem rede, sem banco).
 *
 * Entrada: o JSON que o banco devolve (`site_overview_data`) + os mapas do domínio guardados + as conexões do projeto.
 * Saída: indicadores com comparação ao período anterior, DIAGNÓSTICOS em português (o que está estranho e por quê, com os números),
 * e a ÁRVORE do domínio (site -> subdomínios -> seções) com tráfego do Google e URLs do sitemap lado a lado.
 *
 * Regras que evitam número enganoso:
 *  - Totais do GA4 vêm só das linhas do site (o banco já faz isso); nunca somar linhas de página com linhas de site.
 *  - O GA4 não informa o endereço do site, só o caminho: por isso o tráfego do GA4 aparece por página, não por subdomínio.
 *  - Dado ausente é `null` e a tela diz "sem dados", nunca zero.
 */

export interface Totals { clicks?: number; impressions?: number; position?: number | null; sessions?: number; views?: number; users?: number; key_events?: number; ai_sessions?: number }
export interface RawOverview {
  days: number;
  gsc: { window: Record<string, string> | null; totals: { cur?: Totals; prev?: Totals }; by_host: HostRow[]; by_section: SectionRow[]; top_pages: PageRow[]; top_queries: QueryRow[] };
  ga4: { window: Record<string, string> | null; totals: { cur?: Totals; prev?: Totals }; channels: Array<{ channel: string; sessions: number }>; top_pages: Array<{ page: string; views: number; sessions: number }> };
  signals: Array<{ kind: string; agent: string; hits: number }>;
  articles: { total: number; published: number; last_published_at: string | null } | null;
}
export interface HostRow { host: string; pages: number; clicks: number; impressions: number; position: number | null }
export interface SectionRow extends HostRow { section: string }
export interface PageRow { page: string; clicks: number; impressions: number; position: number | null }
export interface QueryRow { query: string; clicks: number; impressions: number; position: number | null }

export interface MapSummary {
  host: string; fetched_at: string; is_primary: boolean;
  summary: { robots?: { found?: boolean; sitemaps?: string[] }; llms?: { found?: boolean }; sitemap?: { found?: boolean; urls?: number; files?: Array<{ url: string; count: number }>; sections?: Array<{ section: string; count: number; latest: string | null }>; newest?: string | null; truncated?: boolean }; subdomains?: string[]; home_kind?: string };
}
export interface Connections { gsc: boolean; ga4: boolean; bing: boolean; tracking_key: boolean }

export type Level = 'atencao' | 'info';
export interface Diagnostic { key: string; level: Level; text: string }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export interface Delta { value: number | null; previous: number | null; abs: number | null; pct: number | null }
export function delta(cur: number | null | undefined, prev: number | null | undefined): Delta {
  const c = num(cur); const p = num(prev);
  if (c === null) return { value: null, previous: p, abs: null, pct: null };
  if (p === null) return { value: c, previous: null, abs: null, pct: null };
  return { value: c, previous: p, abs: Math.round((c - p) * 10) / 10, pct: p === 0 ? null : Math.round(((c - p) / p) * 1000) / 10 };
}
export const ctr = (clicks: number | null | undefined, impressions: number | null | undefined): number | null => {
  const c = num(clicks); const i = num(impressions);
  return c === null || i === null || i === 0 ? null : Math.round((c / i) * 10000) / 100;
};

export interface Kpis {
  gsc: { clicks: Delta; impressions: Delta; position: Delta; ctr: Delta } | null;
  ga4: { sessions: Delta; views: Delta; users: Delta; key_events: Delta; ai_sessions: Delta } | null;
  cta: { total: number; by_agent: Record<string, number> };
  ai: { referrals: number; bot_hits: number };
  articles: { published: number; total: number; last_published_at: string | null } | null;
}

export function buildKpis(raw: RawOverview): Kpis {
  const g = raw.gsc.totals; const a = raw.ga4.totals;
  const gsc = g.cur ? {
    clicks: delta(g.cur.clicks, g.prev?.clicks), impressions: delta(g.cur.impressions, g.prev?.impressions),
    position: delta(g.cur.position, g.prev?.position), ctr: delta(ctr(g.cur.clicks, g.cur.impressions), g.prev ? ctr(g.prev.clicks, g.prev.impressions) : null),
  } : null;
  const ga4 = a.cur ? {
    sessions: delta(a.cur.sessions, a.prev?.sessions), views: delta(a.cur.views, a.prev?.views), users: delta(a.cur.users, a.prev?.users),
    key_events: delta(a.cur.key_events, a.prev?.key_events), ai_sessions: delta(a.cur.ai_sessions, a.prev?.ai_sessions),
  } : null;
  const by_agent: Record<string, number> = {}; let total = 0; let referrals = 0; let bots = 0;
  for (const s of raw.signals || []) {
    if (s.kind === 'cta_click') { by_agent[s.agent || 'outro'] = (by_agent[s.agent || 'outro'] || 0) + s.hits; total += s.hits; }
    else if (s.kind === 'ai_referral') referrals += s.hits;
    else if (s.kind === 'ai_bot_hit') bots += s.hits;
  }
  return { gsc, ga4, cta: { total, by_agent }, ai: { referrals, bot_hits: bots }, articles: raw.articles ? { published: raw.articles.published, total: raw.articles.total, last_published_at: raw.articles.last_published_at } : null };
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const daysSince = (iso: string, nowMs: number) => Math.floor((nowMs - Date.parse(iso)) / 86_400_000);

export function buildDiagnostics(raw: RawOverview, kpis: Kpis, conn: Connections, maps: MapSummary[], primaryHost: string | null, nowMs: number): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (!conn.gsc) out.push({ key: 'google_nao_conectado', level: 'atencao', text: 'O Search Console não está conectado a este projeto: não há cliques, impressões nem posição do Google aqui. Conecte em Visibilidade, "Conexões e coleta".' });
  if (!conn.ga4) out.push({ key: 'ga4_nao_conectado', level: 'info', text: 'O Google Analytics (GA4) não está conectado a este projeto: sem visitas, canais e visitas vindas de IA.' });
  const cs = raw.gsc.totals.cur?.clicks; const gs = raw.ga4.totals.cur?.sessions; const ke = raw.ga4.totals.cur?.key_events;
  if (typeof cs === 'number' && typeof gs === 'number' && cs >= 20 && gs < cs * 0.8) {
    out.push({ key: 'ga4_abaixo_do_google', level: 'atencao', text: `O GA4 contou ${fmt(gs)} sessões e o Google informou ${fmt(cs)} cliques no mesmo período. O GA4 costuma contar tanto quanto ou mais. Pode haver etiqueta do GA4 falhando, bloqueio por consentimento de cookies ou páginas sem a etiqueta.` });
  }
  if (typeof ke === 'number' && typeof gs === 'number' && gs >= 20 && ke / gs > 3) {
    out.push({ key: 'eventos_chave_demais', level: 'atencao', text: `O GA4 registra ${fmt(ke)} eventos-chave para ${fmt(gs)} sessões (${(ke / gs).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por sessão). Isso costuma indicar que eventos comuns (rolagem, clique) estão marcados como evento-chave. Não use esse número como "contatos"; use os cliques de contato medidos no site.` });
  }
  if (kpis.cta.total === 0) {
    out.push(conn.tracking_key
      ? { key: 'sem_cliques_de_contato', level: 'atencao', text: 'Nenhum clique em WhatsApp, telefone, e-mail ou formulário foi medido neste período. Atualize o plugin do site para a versão 3.16.2 (ou o script de sinais) para começar a medir.' }
      : { key: 'sem_rastreio_do_site', level: 'atencao', text: 'O rastreio do site (chave de sinais) não está configurado neste projeto, então cliques de contato e visitas de IA não são medidos.' });
  }
  const a = raw.articles;
  if (a && a.published > 0 && a.last_published_at) {
    const d = daysSince(a.last_published_at, nowMs);
    if (d >= 14) out.push({ key: 'publicacao_parada', level: 'atencao', text: `O último artigo foi publicado há ${d} dias (${new Date(a.last_published_at).toLocaleDateString('pt-BR')}).` });
  }
  const latest = new Map<string, MapSummary>();
  for (const m of maps) if (!latest.has(m.host)) latest.set(m.host, m);
  const prim = primaryHost ? latest.get(primaryHost) : null;
  if (primaryHost && !prim) out.push({ key: 'sem_mapa', level: 'info', text: `Ainda não há mapa guardado de ${primaryHost}. Clique em "Atualizar mapa do domínio" para ler os sitemaps.` });
  if (prim) {
    const sm = prim.summary.sitemap;
    if (!sm?.found) out.push({ key: 'sem_sitemap', level: 'atencao', text: `Não encontrei sitemap em ${primaryHost}. Sem sitemap, o Google descobre menos páginas.` });
    else {
      const gscPages = raw.gsc.by_host.find((h) => h.host === primaryHost)?.pages ?? 0;
      if (typeof sm.urls === 'number' && gscPages >= 20 && sm.urls < gscPages * 0.5) {
        out.push({ key: 'sitemap_curto', level: 'atencao', text: `O sitemap de ${primaryHost} lista ${fmt(sm.urls)} URLs, mas o Google mostrou ${fmt(gscPages)} páginas deste site. O sitemap principal pode estar desatualizado ou incompleto.` });
      }
    }
    if (prim.summary.llms && prim.summary.llms.found === false) out.push({ key: 'sem_llms', level: 'info', text: `${primaryHost} não tem llms.txt.` });
  }
  for (const h of raw.gsc.by_host) {
    if (!h.host || h.impressions < 100 || latest.has(h.host)) continue;
    if (h.host === primaryHost) continue;
    out.push({ key: `sem_mapa:${h.host}`, level: 'info', text: `${h.host} aparece no Google (${fmt(h.impressions)} impressões), mas ainda não tem mapa guardado.` });
  }
  return out;
}

export interface TreeSection { section: string; gsc_pages: number; clicks: number; impressions: number; position: number | null; sitemap_urls: number | null; flag: 'sem_busca' | 'fora_do_mapa' | null }
export interface TreeHost {
  host: string; primary: boolean;
  gsc: { pages: number; clicks: number; impressions: number; position: number | null } | null;
  map: { fetched_at: string; sitemap_found: boolean | null; sitemap_urls: number | null; files: number; llms_found: boolean | null; robots_found: boolean | null; newest: string | null } | null;
  sections: TreeSection[];
}

export function buildTree(raw: RawOverview, maps: MapSummary[], primaryHost: string | null): TreeHost[] {
  const latest = new Map<string, MapSummary>();
  for (const m of maps) if (!latest.has(m.host)) latest.set(m.host, m);
  const hosts = new Set<string>();
  if (primaryHost) hosts.add(primaryHost);
  for (const h of raw.gsc.by_host) if (h.host) hosts.add(h.host);
  for (const m of latest.keys()) hosts.add(m);
  const rows: TreeHost[] = [];
  for (const host of hosts) {
    const g = raw.gsc.by_host.find((h) => h.host === host) || null;
    const m = latest.get(host) || null;
    const sections = new Map<string, TreeSection>();
    for (const s of raw.gsc.by_section.filter((x) => x.host === host)) {
      const key = s.section.toLowerCase();
      sections.set(key, { section: key, gsc_pages: s.pages, clicks: s.clicks, impressions: s.impressions, position: s.position, sitemap_urls: m?.summary.sitemap?.found ? 0 : null, flag: null });
    }
    for (const s of m?.summary.sitemap?.sections || []) {
      const key = String(s.section).toLowerCase();
      const cur = sections.get(key) || { section: key, gsc_pages: 0, clicks: 0, impressions: 0, position: null, sitemap_urls: 0, flag: null };
      cur.sitemap_urls = s.count;
      sections.set(key, cur);
    }
    const list = [...sections.values()];
    for (const s of list) {
      if (s.sitemap_urls !== null && s.sitemap_urls >= 5 && s.impressions === 0) s.flag = 'sem_busca';
      else if (m?.summary.sitemap?.found && s.gsc_pages > 0 && s.sitemap_urls === 0) s.flag = 'fora_do_mapa';
    }
    list.sort((a, b) => b.impressions - a.impressions || (b.sitemap_urls ?? 0) - (a.sitemap_urls ?? 0));
    rows.push({
      host, primary: host === primaryHost,
      gsc: g ? { pages: g.pages, clicks: g.clicks, impressions: g.impressions, position: g.position } : null,
      map: m ? { fetched_at: m.fetched_at, sitemap_found: m.summary.sitemap?.found ?? null, sitemap_urls: m.summary.sitemap?.urls ?? null, files: m.summary.sitemap?.files?.length ?? 0, llms_found: m.summary.llms?.found ?? null, robots_found: m.summary.robots?.found ?? null, newest: m.summary.sitemap?.newest ?? null } : null,
      sections: list.slice(0, 40),
    });
  }
  rows.sort((a, b) => Number(b.primary) - Number(a.primary) || (b.gsc?.impressions ?? 0) - (a.gsc?.impressions ?? 0));
  return rows;
}

export const AGENT_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', phone: 'Telefone', email: 'E-mail', form: 'Formulário', other: 'Outro' };
