/**
 * Núcleo puro da Central de Projetos: status e saúde de cada projeto.
 *
 * Recebe os FATOS lidos do banco (`private.project_health_inputs`) e devolve estado, nota 0-100, itens com fonte, data e
 * ação recomendada, e sugestões (inativo, duplicado, sem domínio, sem conexão, plugin desatualizado).
 * Regras: nunca inventa dado (fato ausente = "sem dados", e não entra na nota); o sistema SUGERE, o dono decide; não faz I/O.
 */
import { PLUGIN_MINIMUM_VERSION, PLUGIN_VERSION } from './plugin-version.ts';

export type LifecycleStatus = 'ativo' | 'pausado' | 'arquivado';
export type HealthState = 'saudavel' | 'atencao' | 'critico' | 'inativo' | 'pausado' | 'arquivado';
export type ItemStatus = 'ok' | 'atencao' | 'critico' | 'sem_dados' | 'info';
export type ItemArea = 'conexoes' | 'atividade' | 'resultado' | 'estrutura' | 'risco';

export const STATE_LABEL: Record<HealthState, string> = { saudavel: 'Saudável', atencao: 'Atenção', critico: 'Crítico', inativo: 'Inativo', pausado: 'Pausado', arquivado: 'Arquivado' };
export const AREA_LABEL: Record<ItemArea, string> = { conexoes: 'Conexões', atividade: 'Atividade', resultado: 'Resultado', estrutura: 'Estrutura', risco: 'Risco' };

/** Fatos de UM projeto. `null` em um bloco opcional = a tabela do módulo não existe no banco (módulo não instalado): vira "sem dados". */
export interface ProjectFacts {
  id: string;
  name: string;
  domain: string | null;
  wordpress_url: string | null;
  created_at: string | null;
  lifecycle_status: LifecycleStatus;
  archived_at: string | null;
  paused_reason: string | null;
  wordpress: { connected: boolean; plugin_version: string | null; mode: string | null; connected_at: string | null; last_verified_at: string | null };
  profile: { status: string | null; completeness: number | null; confirmed: boolean | null } | null;
  articles: { total: number; published: number; last_published_at: string | null };
  gsc: { rows: number; last_day: string | null };
  ga4: { rows: number; last_day: string | null };
  providers: string[];
  signals: { tracking_key: boolean; last_batch_at: string | null; last_day: string | null; cta_28d: number };
  automation: { news_agents_active: number; rss_active: number };
  taxonomy: { nodes: number; approved: number } | null;
  site_map: { reads: number; last_at: string | null } | null;
  speed: { scheduled: boolean; enabled: boolean; frequency: string | null; consecutive_failures: number; runs: number; last_run_at: string | null; last_score: number | null } | null;
  alerts: { open_speed: number; open_backlinks: number } | null;
  backlinks: { total: number; live: number; last_checked_at: string | null } | null;
  funnel: { configured: boolean; entries: number; last_month: string | null } | null;
  observatory: { prompts: number; citations: number } | null;
  /** Indexação (project_indexation_summary): ausente/null = módulo não instalado; urls 0 = instalado, sem inventário. */
  indexation?: { urls: number; indexed: number; not_indexed: number; problems: number; last_checked_at: string | null; last_synced_at: string | null } | null;
  /** Radar de mercado (project_radar_summary): ausente/null = módulo não instalado; focuses 0 = instalado, sem foco. */
  radar?: { focuses: number; competitors: number; last_run_at: string | null; coverage_done: number; coverage_total: number; identities_orphan: number; competitors_without_link: number } | null;
  /** Estúdio de Páginas (project_studio_summary): ausente/null = módulo não instalado; pages 0 = instalado, sem páginas. */
  studio?: { pages: number; drafts: number; in_review: number; approved: number; published: number; pending: number; avg_quality: number | null; last_published_at: string | null } | null;
}

export interface HealthItem { key: string; area: ItemArea; label: string; status: ItemStatus; detail: string; source: string; date: string | null; action: string | null }
export type SuggestionKind = 'arquivar' | 'mesclar' | 'configurar' | 'atualizar';
export interface Suggestion { key: string; kind: SuggestionKind; text: string; related_project_id: string | null }
export interface ProjectHealth {
  project_id: string; name: string; domain: string | null; lifecycle_status: LifecycleStatus;
  state: HealthState; state_label: string; score: number | null; reason: string;
  last_activity_at: string | null; days_inactive: number | null;
  items: HealthItem[]; suggestions: Suggestion[];
  counts: { ok: number; atencao: number; critico: number; sem_dados: number };
}

export const DAY_MS = 86_400_000;
export const INACTIVE_SUGGEST_DAYS = 60;
export const INACTIVE_STRONG_DAYS = 90;
const NEW_PROJECT_GRACE_DAYS = 14;
const NEVER_ACTIVE_SUGGEST_DAYS = 30;

export const daysSince = (iso: string | null | undefined, now: number): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY_MS)) : null;
};
/** "2026-11-19" ou ISO completo -> "19/11/2026" (sem fuso: usa só a parte da data). */
export const fmtDate = (iso: string | null | undefined): string => {
  const m = typeof iso === 'string' ? iso.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'sem data';
};
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
const ago = (d: number) => (d === 0 ? 'hoje' : d === 1 ? 'há 1 dia' : `há ${d} dias`);

/** Compara versões "3.16.2" (só números separados por ponto). Retorna <0, 0 ou >0. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Domínio normalizado para comparar projetos: minúsculo, sem protocolo, sem "www.", sem barra/caminho. */
export function normalizeDomain(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const host = value.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/^www\./, '').replace(/:\d+$/, '').replace(/\.$/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
}
/** Nome normalizado: sem acento, minúsculo, só letras e números separados por espaço único. */
export function normalizeName(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const n = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return n.length >= 3 ? n : null;
}

const lastOf = (dates: Array<string | null | undefined>): string | null => {
  let best: string | null = null;
  let bestT = -Infinity;
  for (const d of dates) {
    if (!d) continue;
    const t = Date.parse(d);
    if (Number.isFinite(t) && t > bestT) { best = d; bestT = t; }
  }
  return best;
};

/** Última atividade conhecida do projeto: publicação, leitura do Google, sinais do site, medições, verificações, mapa, funil. */
export function lastActivity(f: ProjectFacts): string | null {
  return lastOf([
    f.articles.last_published_at, f.gsc.last_day, f.ga4.last_day, f.signals.last_batch_at, f.signals.last_day,
    f.speed?.last_run_at, f.backlinks?.last_checked_at, f.site_map?.last_at, f.funnel?.last_month,
  ]);
}

/** Quantidade de dado que o projeto acumulou: usada só para escolher qual de dois duplicados parece o "principal". */
export function richness(f: ProjectFacts): number {
  return f.articles.total + Math.min(f.gsc.rows, 200_000) / 10 + Math.min(f.ga4.rows, 200_000) / 10 + (f.taxonomy?.nodes || 0) + (f.backlinks?.total || 0)
    + (f.funnel?.entries || 0) + (f.profile?.completeness || 0) / 10 + (f.providers.length ? 5 : 0);
}

const item = (key: string, area: ItemArea, label: string, status: ItemStatus, detail: string, source: string, date: string | null, action: string | null = null): HealthItem => ({ key, area, label, status, detail, source, date, action });
const SEM = (key: string, area: ItemArea, label: string, detail: string, source: string): HealthItem => item(key, area, label, 'sem_dados', detail, source, null, null);

/** Todos os itens de saúde de um projeto, a partir dos fatos. Sem dado = "sem dados" (não entra na nota). */
export function buildItems(f: ProjectFacts, now: number): HealthItem[] {
  const out: HealthItem[] = [];
  const google = f.providers.includes('gsc') || f.providers.includes('ga4');

  // ---- Conexões
  out.push(f.domain
    ? item('dominio', 'estrutura', 'Domínio cadastrado', 'ok', `Endereço: ${f.domain}.`, 'Cadastro do projeto', null)
    : item('dominio', 'estrutura', 'Domínio cadastrado', 'atencao', 'O projeto não tem domínio cadastrado.', 'Cadastro do projeto', null, 'Cadastre o endereço do site no projeto para medir velocidade, backlinks e o mapa do domínio.'));
  if (f.wordpress.connected) {
    out.push(item('wordpress', 'conexoes', 'WordPress', 'ok', `Conectado${f.wordpress.last_verified_at ? `; última verificação em ${fmtDate(f.wordpress.last_verified_at)}` : ''}.`, 'Conexão WordPress', f.wordpress.last_verified_at || f.wordpress.connected_at));
  } else {
    out.push(item('wordpress', 'conexoes', 'WordPress', 'atencao', 'Nenhum site WordPress conectado.', 'Conexão WordPress', null, 'Conecte o WordPress em Configurações para publicar e acompanhar os artigos.'));
  }
  if (f.wordpress.connected) {
    const v = f.wordpress.plugin_version;
    if (!v) out.push(SEM('plugin', 'conexoes', 'Plugin do WordPress', 'A versão do plugin não foi informada (conexão sem o plugin Zica Posts).', 'Plugin do WordPress'));
    else if (compareVersions(v, PLUGIN_MINIMUM_VERSION) < 0) out.push(item('plugin', 'risco', 'Plugin do WordPress', 'critico', `Plugin ${v} abaixo do mínimo aceito (${PLUGIN_MINIMUM_VERSION}). A versão atual é ${PLUGIN_VERSION}.`, 'Plugin do WordPress', f.wordpress.last_verified_at, `Atualize o plugin Zica Posts no WordPress para a ${PLUGIN_VERSION}.`));
    else if (compareVersions(v, PLUGIN_VERSION) < 0) out.push(item('plugin', 'conexoes', 'Plugin do WordPress', 'atencao', `Plugin ${v} desatualizado; a versão atual é ${PLUGIN_VERSION}.`, 'Plugin do WordPress', f.wordpress.last_verified_at, `Atualize o plugin Zica Posts no WordPress para a ${PLUGIN_VERSION}.`));
    else out.push(item('plugin', 'conexoes', 'Plugin do WordPress', 'ok', `Plugin ${v} (atual).`, 'Plugin do WordPress', f.wordpress.last_verified_at));
  }
  out.push(google
    ? item('google', 'conexoes', 'Google (Search Console e GA4)', 'ok', `Conectado: ${f.providers.filter((p) => p !== 'bing').map((p) => (p === 'gsc' ? 'Search Console' : 'GA4')).join(' e ')}.`, 'Conexões do Google', null)
    : item('google', 'conexoes', 'Google (Search Console e GA4)', 'atencao', 'Sem Google conectado: não há cliques, impressões nem visitas para acompanhar.', 'Conexões do Google', null, 'Conecte o Google em NEXUS · Motores & APIs.'));
  if (f.providers.includes('bing')) out.push(item('bing', 'conexoes', 'Bing Webmaster', 'info', 'Conectado.', 'Conexões do Google/Bing', null));
  if (f.signals.tracking_key) {
    const d = daysSince(f.signals.last_batch_at, now);
    if (d === null) out.push(item('sinais', 'conexoes', 'Sinais do site (script)', 'atencao', 'A chave existe, mas o site nunca enviou sinais.', 'Sinais do site', null, 'Instale o script de sinais no site (ou o plugin atualizado).'));
    else if (d > 14) out.push(item('sinais', 'conexoes', 'Sinais do site (script)', 'atencao', `O site não envia sinais ${ago(d)} (último em ${fmtDate(f.signals.last_batch_at)}).`, 'Sinais do site', f.signals.last_batch_at, 'Confira se o script ou o plugin continuam ativos no site.'));
    else out.push(item('sinais', 'conexoes', 'Sinais do site (script)', 'ok', `Último envio ${ago(d)}.`, 'Sinais do site', f.signals.last_batch_at));
  } else {
    out.push(item('sinais', 'conexoes', 'Sinais do site (script)', 'info', 'Sem chave de sinais: não há medição de contatos nem de visitas de IA.', 'Sinais do site', null, 'Gere a chave de sinais para medir cliques de contato.'));
  }

  // ---- Atividade
  if (f.articles.total === 0) out.push(SEM('publicacao', 'atividade', 'Última publicação', 'O projeto não tem artigos.', 'Artigos'));
  else if (!f.articles.last_published_at) out.push(item('publicacao', 'atividade', 'Última publicação', 'atencao', `${plural(f.articles.total, 'artigo', 'artigos')}, nenhum publicado.`, 'Artigos', null, 'Revise e publique os artigos prontos.'));
  else {
    const d = daysSince(f.articles.last_published_at, now) ?? 0;
    out.push(item('publicacao', 'atividade', 'Última publicação', d <= 45 ? 'ok' : 'atencao', `Último artigo publicado ${ago(d)} (${fmtDate(f.articles.last_published_at)}); ${plural(f.articles.published, 'publicado', 'publicados')} de ${f.articles.total.toLocaleString('pt-BR')}.`, 'Artigos', f.articles.last_published_at, d <= 45 ? null : 'Publique conteúdo novo ou arquive o projeto se ele não é mais usado.'));
  }
  if (!google) out.push(SEM('leitura_google', 'atividade', 'Leitura do Google', 'Sem Google conectado.', 'Search Console / GA4'));
  else {
    const lastDay = f.providers.includes('gsc') ? f.gsc.last_day : f.ga4.last_day;
    const rows = f.providers.includes('gsc') ? f.gsc.rows : f.ga4.rows;
    const label = f.providers.includes('gsc') ? 'Search Console' : 'GA4';
    const d = daysSince(lastDay, now);
    if (rows === 0 || d === null) out.push(item('leitura_google', 'atividade', 'Leitura do Google', 'atencao', `${label} conectado, mas nenhuma linha foi lida ainda.`, label, null, 'Aguarde a primeira sincronização ou reconecte o Google.'));
    else if (d <= 7) out.push(item('leitura_google', 'atividade', 'Leitura do Google', 'ok', `${label}: dado até ${fmtDate(lastDay)} (${ago(d)}).`, label, lastDay));
    else if (d <= 14) out.push(item('leitura_google', 'atividade', 'Leitura do Google', 'atencao', `${label}: o dado mais recente é de ${fmtDate(lastDay)} (${ago(d)}).`, label, lastDay, 'Confira a conexão do Google em NEXUS · Motores & APIs.'));
    else out.push(item('leitura_google', 'risco', 'Leitura do Google', 'critico', `${label}: leitura parada ${ago(d)} (último dado em ${fmtDate(lastDay)}).`, label, lastDay, 'Reconecte o Google: a autorização pode ter vencido.'));
  }
  if (!f.speed) out.push(SEM('velocidade', 'atividade', 'Monitor de velocidade', 'Módulo de velocidade ainda não instalado no banco.', 'Monitor de velocidade'));
  else if (!f.speed.scheduled && f.speed.runs === 0) out.push(item('velocidade', 'atividade', 'Monitor de velocidade', 'info', 'Sem agendamento nem medição de velocidade.', 'Monitor de velocidade', null, f.domain ? 'Agende a medição de velocidade do site.' : null));
  else if (f.speed.consecutive_failures >= 3) out.push(item('velocidade', 'risco', 'Monitor de velocidade', 'critico', `${f.speed.consecutive_failures} medições seguidas falharam.`, 'Monitor de velocidade', f.speed.last_run_at, 'Confira se o site está no ar e se o endereço cadastrado está correto.'));
  else {
    const d = daysSince(f.speed.last_run_at, now);
    if (d === null) out.push(item('velocidade', 'atividade', 'Monitor de velocidade', 'info', f.speed.scheduled ? (f.speed.enabled ? 'Agendado, ainda sem medição.' : 'Agendamento desligado.') : 'Sem medição.', 'Monitor de velocidade', null));
    else out.push(item('velocidade', 'atividade', 'Monitor de velocidade', d <= 45 || !f.speed.enabled ? 'ok' : 'atencao', `Última medição ${ago(d)}${f.speed.last_score !== null ? `, nota ${f.speed.last_score}` : ''}${f.speed.enabled ? '' : ' (agendamento desligado)'}.`, 'Monitor de velocidade', f.speed.last_run_at, d <= 45 || !f.speed.enabled ? null : 'Rode uma medição agora; o agendamento não está produzindo.'));
  }

  // ---- Resultado
  if (!f.signals.tracking_key) out.push(SEM('contatos', 'resultado', 'Cliques de contato', 'Sem chave de sinais: não há medição.', 'Sinais do site'));
  else if (f.signals.cta_28d > 0) out.push(item('contatos', 'resultado', 'Cliques de contato', 'ok', `${plural(f.signals.cta_28d, 'clique', 'cliques')} de contato nos últimos 28 dias.`, 'Sinais do site', f.signals.last_day));
  else out.push(item('contatos', 'resultado', 'Cliques de contato', 'atencao', 'Nenhum clique de contato medido nos últimos 28 dias.', 'Sinais do site', f.signals.last_day, 'Confira se os botões de WhatsApp e telefone do site estão marcados para a medição.'));
  if (!f.observatory) out.push(SEM('citacoes_ia', 'resultado', 'Citações em IA', 'Módulo de observatório não instalado no banco.', 'Observatório de IA'));
  else if (f.observatory.prompts === 0) out.push(SEM('citacoes_ia', 'resultado', 'Citações em IA', 'Nenhuma pergunta de IA acompanhada neste projeto.', 'Observatório de IA'));
  else out.push(item('citacoes_ia', 'resultado', 'Citações em IA', 'info', `${plural(f.observatory.citations, 'citação registrada', 'citações registradas')} em ${plural(f.observatory.prompts, 'pergunta', 'perguntas')} acompanhadas.`, 'Observatório de IA', null));
  if (!f.funnel) out.push(SEM('funil', 'resultado', 'Funil de captação', 'Módulo de funil não instalado no banco.', 'Funil'));
  else if (!f.funnel.configured) out.push(SEM('funil', 'resultado', 'Funil de captação', 'Funil não configurado.', 'Funil'));
  else out.push(item('funil', 'resultado', 'Funil de captação', f.funnel.entries > 0 ? 'ok' : 'info', f.funnel.entries > 0 ? `${plural(f.funnel.entries, 'número lançado', 'números lançados')}; último mês ${fmtDate(f.funnel.last_month)}.` : 'Funil configurado, sem números lançados.', 'Funil', f.funnel.last_month, f.funnel.entries > 0 ? null : 'Lance os números do mês para ver o funil.'));

  // ---- Estrutura
  if (!f.profile || (f.profile.completeness === null && !f.profile.status)) {
    out.push(item('perfil', 'estrutura', 'Perfil do Projeto', 'atencao', 'O Perfil do Projeto ainda não foi preenchido.', 'Perfil do Projeto', null, 'Preencha o Perfil do Projeto: ele guia a taxonomia, o funil e os agentes.'));
  } else {
    const complete = f.profile.confirmed === true || f.profile.status === 'complete' || (f.profile.completeness ?? 0) >= 80;
    out.push(item('perfil', 'estrutura', 'Perfil do Projeto', complete ? 'ok' : 'atencao', complete ? `Perfil completo${f.profile.completeness !== null ? ` (${f.profile.completeness}%)` : ''}.` : `Perfil ${f.profile.completeness ?? 0}% completo.`, 'Perfil do Projeto', null, complete ? null : 'Complete o Perfil do Projeto.'));
  }
  if (!f.taxonomy) out.push(SEM('taxonomia', 'estrutura', 'Taxonomia aprovada', 'Módulo de taxonomia ainda não instalado no banco.', 'Taxonomia'));
  else if (f.taxonomy.nodes === 0) out.push(item('taxonomia', 'estrutura', 'Taxonomia aprovada', 'info', 'Nenhuma área, subárea ou nicho montado.', 'Taxonomia', null, 'Monte a taxonomia em Taxonomia e mercado.'));
  else out.push(item('taxonomia', 'estrutura', 'Taxonomia aprovada', f.taxonomy.approved > 0 ? 'ok' : 'atencao', `${plural(f.taxonomy.nodes, 'nó', 'nós')}, ${plural(f.taxonomy.approved, 'aprovado', 'aprovados')}.`, 'Taxonomia', null, f.taxonomy.approved > 0 ? null : 'Revise e aprove os nós sugeridos.'));
  if (!f.site_map) out.push(SEM('mapa_dominio', 'estrutura', 'Mapa do domínio', 'Módulo de estrutura ainda não instalado no banco.', 'Estrutura do domínio'));
  else if (!f.domain) out.push(SEM('mapa_dominio', 'estrutura', 'Mapa do domínio', 'Sem domínio cadastrado.', 'Estrutura do domínio'));
  else if (f.site_map.reads === 0) out.push(item('mapa_dominio', 'estrutura', 'Mapa do domínio', 'atencao', 'O mapa do domínio nunca foi lido.', 'Estrutura do domínio', null, 'Clique em "Atualizar mapa do domínio" na Estrutura do negócio.'));
  else {
    const d = daysSince(f.site_map.last_at, now) ?? 0;
    out.push(item('mapa_dominio', 'estrutura', 'Mapa do domínio', d <= 60 ? 'ok' : 'atencao', `Mapa lido ${ago(d)} (${fmtDate(f.site_map.last_at)}).`, 'Estrutura do domínio', f.site_map.last_at, d <= 60 ? null : 'Atualize o mapa do domínio.'));
  }

  if (!f.indexation) out.push(SEM('indexacao', 'estrutura', 'Indexação', 'Módulo de indexação ainda não instalado no banco.', 'Indexação'));
  else if (f.indexation.urls === 0) out.push(SEM('indexacao', 'estrutura', 'Indexação', 'Ainda não há inventário de URLs neste projeto.', 'Indexação'));
  else {
    const ix = f.indexation;
    const known = ix.indexed + ix.not_indexed;
    const when = ix.last_checked_at || ix.last_synced_at;
    if (known === 0) out.push(item('indexacao', 'estrutura', 'Indexação', 'info', `${plural(ix.urls, 'URL no inventário', 'URLs no inventário')}; o estado no Google ainda não foi consultado${ix.problems ? `; ${plural(ix.problems, 'com problema', 'com problemas')}` : ''}.`, 'Indexação', when, 'Consulte o Google (somente leitura) na tela Indexação.'));
    else {
      const pct = Math.round((100 * ix.indexed) / known);
      const bad = ix.problems > 0 || pct < 50;
      out.push(item('indexacao', 'estrutura', 'Indexação', bad ? 'atencao' : 'ok', `${plural(ix.indexed, 'URL indexada', 'URLs indexadas')} de ${known.toLocaleString('pt-BR')} consultadas no Google (${pct}%)${ix.problems ? `; ${plural(ix.problems, 'URL com problema', 'URLs com problema')}` : ''}.`, 'Indexação', when, bad ? 'Abra Indexação: veja a fila "o que indexar primeiro" e a higiene.' : null));
    }
  }

  if (!f.radar) out.push(SEM('radar', 'estrutura', 'Radar de mercado', 'Módulo do radar de mercado ainda não instalado no banco.', 'Radar de mercado'));
  else if (f.radar.focuses === 0) out.push(SEM('radar', 'estrutura', 'Radar de mercado', 'Ainda não há foco de mercado neste projeto.', 'Radar de mercado'));
  else {
    const rd = f.radar; const orphans = rd.identities_orphan + rd.competitors_without_link;
    const pct = rd.coverage_total > 0 ? Math.round((100 * rd.coverage_done) / rd.coverage_total) : 0;
    out.push(item('radar', 'estrutura', 'Radar de mercado', orphans > 0 ? 'atencao' : 'ok', `${plural(rd.focuses, 'foco', 'focos')}, ${plural(rd.competitors, 'concorrente mapeado', 'concorrentes mapeados')}, ${pct}% das buscas consultadas${orphans ? `; ${plural(orphans, 'ponta solta', 'pontas soltas')} fora da árvore` : '; nenhuma ponta solta'}.`, 'Radar de mercado', rd.last_run_at, orphans > 0 ? 'Abra o Radar de mercado, Pontas soltas: ligue cada perfil e concorrente à árvore.' : null));
  }

  if (!f.studio) out.push(SEM('estudio', 'estrutura', 'Estúdio de Páginas', 'Módulo do Estúdio de Páginas ainda não instalado no banco.', 'Estúdio de Páginas'));
  else if (f.studio.pages === 0) out.push(SEM('estudio', 'estrutura', 'Estúdio de Páginas', 'Ainda não há páginas no Estúdio deste projeto.', 'Estúdio de Páginas'));
  else {
    const st = f.studio;
    const waiting = st.drafts + st.in_review + st.approved;
    const bad = st.pending > 0 || (st.avg_quality !== null && st.avg_quality < 70);
    out.push(item('estudio', 'estrutura', 'Estúdio de Páginas', bad ? 'atencao' : 'ok', `${plural(st.pages, 'página', 'páginas')} (${plural(st.published, 'publicada', 'publicadas')}, ${waiting} esperando revisão ou publicação)${st.pending ? `; ${plural(st.pending, 'pendência', 'pendências')}` : ''}${st.avg_quality !== null ? `; qualidade média ${st.avg_quality}/100` : ''}.`, 'Estúdio de Páginas', st.last_published_at, bad ? 'Resolva as pendências e os portões reprovados no Estúdio de Páginas.' : null));
  }

  // ---- Risco
  if (!f.alerts) out.push(SEM('avisos', 'risco', 'Avisos abertos', 'Módulo de avisos ainda não instalado no banco.', 'Avisos do monitor'));
  else {
    const open = f.alerts.open_speed + f.alerts.open_backlinks;
    out.push(open === 0
      ? item('avisos', 'risco', 'Avisos abertos', 'ok', 'Nenhum aviso aberto.', 'Avisos do monitor', null)
      : item('avisos', 'risco', 'Avisos abertos', 'atencao', `${plural(open, 'aviso aberto', 'avisos abertos')} (${f.alerts.open_speed} de velocidade, ${f.alerts.open_backlinks} de backlinks).`, 'Avisos do monitor', null, 'Abra Velocidade e Backlinks, resolva ou dispense os avisos.'));
  }
  return out;
}

const POINTS: Record<ItemStatus, number | null> = { ok: 1, atencao: 0.5, critico: 0, sem_dados: null, info: null };
const WEIGHT: Record<string, number> = { google: 2, wordpress: 2, perfil: 2, leitura_google: 2, plugin: 2 };

/** Nota 0-100: média ponderada só dos itens com dado (ok=1, atenção=0,5, crítico=0). Sem item com dado, a nota é null. */
export function scoreItems(items: HealthItem[]): number | null {
  let sum = 0;
  let weights = 0;
  for (const it of items) {
    const p = POINTS[it.status];
    if (p === null) continue;
    const w = WEIGHT[it.key] ?? 1;
    sum += p * w;
    weights += w;
  }
  return weights === 0 ? null : Math.round((100 * sum) / weights);
}

/** Sugestões automáticas para UM projeto. Servem de aviso: nada é aplicado sozinho. */
export function buildSuggestions(f: ProjectFacts, all: ProjectFacts[], now: number): Suggestion[] {
  if (f.lifecycle_status === 'arquivado') return [];
  const out: Suggestion[] = [];
  const act = lastActivity(f);
  const idle = daysSince(act, now);
  const age = daysSince(f.created_at, now);
  if (idle !== null && idle >= INACTIVE_STRONG_DAYS) out.push({ key: 'inativo_90', kind: 'arquivar', text: `Sem nenhuma atividade há ${idle} dias (desde ${fmtDate(act)}). Se não é mais usado, arquive: dá para restaurar depois.`, related_project_id: null });
  else if (idle !== null && idle >= INACTIVE_SUGGEST_DAYS) out.push({ key: 'inativo_60', kind: 'arquivar', text: `Sem atividade há ${idle} dias (desde ${fmtDate(act)}). Vale decidir: retomar ou arquivar.`, related_project_id: null });
  else if (idle === null && age !== null && age >= NEVER_ACTIVE_SUGGEST_DAYS) out.push({ key: 'nunca_ativo', kind: 'arquivar', text: `Criado há ${age} dias e nunca teve atividade (sem artigos, leitura do Google nem medições). Arquive se foi só um teste.`, related_project_id: null });

  if (!f.domain) out.push({ key: 'sem_dominio', kind: 'configurar', text: 'Projeto sem domínio cadastrado: velocidade, backlinks e mapa do domínio não funcionam sem ele.', related_project_id: null });
  if (!f.wordpress.connected && f.providers.length === 0) out.push({ key: 'sem_conexao', kind: 'configurar', text: 'Sem WordPress e sem Google conectados: o projeto não produz nem mede nada.', related_project_id: null });
  if (f.wordpress.connected && f.wordpress.plugin_version && compareVersions(f.wordpress.plugin_version, PLUGIN_VERSION) < 0) out.push({ key: 'plugin_desatualizado', kind: 'atualizar', text: `O plugin do WordPress está na ${f.wordpress.plugin_version}; a versão atual é ${PLUGIN_VERSION}.`, related_project_id: null });

  const myDomain = normalizeDomain(f.domain) || normalizeDomain(f.wordpress_url);
  const myName = normalizeName(f.name);
  const twins = all.filter((o) => o.id !== f.id && o.lifecycle_status !== 'arquivado' && (
    (myDomain !== null && (normalizeDomain(o.domain) === myDomain || normalizeDomain(o.wordpress_url) === myDomain)) || (myName !== null && normalizeName(o.name) === myName)));
  if (twins.length) {
    const rich = (p: ProjectFacts) => richness(p);
    const poorer = twins.every((o) => rich(f) < rich(o) || (rich(f) === rich(o) && String(f.created_at) >= String(o.created_at)));
    const names = twins.map((o) => `«${o.name}»`).join(', ');
    const why = twins.some((o) => myDomain !== null && (normalizeDomain(o.domain) === myDomain || normalizeDomain(o.wordpress_url) === myDomain)) ? 'mesmo endereço' : 'mesmo nome';
    out.push({ key: 'duplicado', kind: 'mesclar', text: `Parece duplicado de ${names} (${why}). Confira e, se for o caso, junte os dados à mão: o sistema não mescla sozinho.`, related_project_id: twins[0].id });
    if (poorer) out.push({ key: 'duplicado_arquivar', kind: 'arquivar', text: 'Este é o que tem menos dados do par duplicado: é o melhor candidato a arquivar.', related_project_id: twins[0].id });
  }
  return out;
}

const countOf = (items: HealthItem[]) => ({ ok: items.filter((i) => i.status === 'ok').length, atencao: items.filter((i) => i.status === 'atencao').length, critico: items.filter((i) => i.status === 'critico').length, sem_dados: items.filter((i) => i.status === 'sem_dados').length });

/** Avalia UM projeto. `all` = todos os projetos da organização (para achar duplicados). */
export function assessProject(f: ProjectFacts, all: ProjectFacts[], now: number): ProjectHealth {
  const base = { project_id: f.id, name: f.name, domain: f.domain, lifecycle_status: f.lifecycle_status };
  if (f.lifecycle_status === 'arquivado') {
    return { ...base, state: 'arquivado', state_label: STATE_LABEL.arquivado, score: null, reason: `Arquivado${f.archived_at ? ` em ${fmtDate(f.archived_at)}` : ''}. Os dados continuam guardados; dá para restaurar.`, last_activity_at: lastActivity(f), days_inactive: daysSince(lastActivity(f), now), items: [], suggestions: [], counts: { ok: 0, atencao: 0, critico: 0, sem_dados: 0 } };
  }
  const items = buildItems(f, now);
  const score = scoreItems(items);
  const act = lastActivity(f);
  const idle = daysSince(act, now);
  const age = daysSince(f.created_at, now);
  const suggestions = buildSuggestions(f, all, now);
  const counts = countOf(items);
  const firstOf = (s: ItemStatus) => items.find((i) => i.status === s);
  let state: HealthState;
  let reason: string;
  if (f.lifecycle_status === 'pausado') {
    state = 'pausado';
    reason = `Pausado${f.paused_reason ? `: ${f.paused_reason}` : ''}. Agendamentos e agentes estão desligados; nada foi apagado.`;
  } else if ((idle !== null && idle >= INACTIVE_SUGGEST_DAYS) || (idle === null && age !== null && age >= NEW_PROJECT_GRACE_DAYS)) {
    state = 'inativo';
    reason = idle === null ? `Sem nenhuma atividade desde a criação (${age} dias).` : `Sem atividade há ${idle} dias (desde ${fmtDate(act)}).`;
  } else if (counts.critico > 0 || (score !== null && score < 40)) {
    state = 'critico';
    reason = firstOf('critico')?.detail || `Nota baixa (${score}).`;
  } else if (score !== null && score >= 80 && counts.atencao === 0) {
    state = 'saudavel';
    reason = 'Conexões, atividade e estrutura em ordem.';
  } else if (score !== null && score >= 80) {
    state = 'saudavel';
    reason = `Em ordem, com ${plural(counts.atencao, 'ponto de atenção', 'pontos de atenção')}: ${firstOf('atencao')?.detail}`;
  } else {
    state = 'atencao';
    reason = score === null ? 'Ainda não há dado suficiente para avaliar.' : (firstOf('atencao')?.detail || `Nota ${score}.`);
  }
  return { ...base, state, state_label: STATE_LABEL[state], score, reason, last_activity_at: act, days_inactive: idle, items, suggestions, counts };
}

export interface OrganizationHealth { projects: ProjectHealth[]; totals: Record<HealthState, number>; generated_at: string }

/** Avalia todos os projetos da organização (arquivados incluídos, no fim da lista). */
export function assessOrganization(all: ProjectFacts[], now: number): OrganizationHealth {
  const order: Record<HealthState, number> = { critico: 0, atencao: 1, inativo: 2, pausado: 3, saudavel: 4, arquivado: 5 };
  const projects = all.map((f) => assessProject(f, all, now)).sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name, 'pt-BR'));
  const totals: Record<HealthState, number> = { saudavel: 0, atencao: 0, critico: 0, inativo: 0, pausado: 0, arquivado: 0 };
  for (const p of projects) totals[p.state]++;
  return { projects, totals, generated_at: new Date(now).toISOString() };
}

/** Bloco de indexação (project_indexation_summary) normalizado; valor que não é objeto vira null (= "sem dados"). */
export function normalizeIndexation(v: unknown): ProjectFacts['indexation'] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0);
  const str = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);
  return { urls: num(o.urls), indexed: num(o.indexed), not_indexed: num(o.not_indexed), problems: num(o.problems), last_checked_at: str(o.last_checked_at), last_synced_at: str(o.last_synced_at) };
}

/** Bloco do Estúdio de Páginas (project_studio_summary) normalizado; valor que não é objeto vira null (= "sem dados"). */
export function normalizeStudio(v: unknown): ProjectFacts['studio'] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0);
  const str = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);
  return { pages: num(o.pages), drafts: num(o.drafts), in_review: num(o.in_review), approved: num(o.approved), published: num(o.published), pending: num(o.pending), avg_quality: o.avg_quality === null || o.avg_quality === undefined ? null : num(o.avg_quality), last_published_at: str(o.last_published_at) };
}

/** Bloco do radar (project_radar_summary) normalizado; valor que não é objeto vira null (= "sem dados"). */
export function normalizeRadar(v: unknown): ProjectFacts['radar'] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0);
  const str = (x: unknown): string | null => (typeof x === 'string' && x !== '' ? x : null);
  return { focuses: num(o.focuses), competitors: num(o.competitors), last_run_at: str(o.last_run_at), coverage_done: num(o.coverage_done), coverage_total: num(o.coverage_total), identities_orphan: num(o.identities_orphan), competitors_without_link: num(o.competitors_without_link) };
}

/** Normaliza o JSON bruto do banco (colunas ausentes viram valores seguros; blocos de módulo não instalado ficam null). */
export function normalizeFacts(raw: Record<string, unknown>): ProjectFacts {
  const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  const bool = (v: unknown): boolean => v === true;
  const lc = str(raw.lifecycle_status);
  const wp = obj(raw.wordpress) || {};
  const prof = obj(raw.profile);
  const art = obj(raw.articles) || {};
  const gsc = obj(raw.gsc) || {};
  const ga4 = obj(raw.ga4) || {};
  const sig = obj(raw.signals) || {};
  const aut = obj(raw.automation) || {};
  const tax = obj(raw.taxonomy);
  const map = obj(raw.site_map);
  const spd = obj(raw.speed);
  const alr = obj(raw.alerts);
  const bl = obj(raw.backlinks);
  const fn = obj(raw.funnel);
  const obs = obj(raw.observatory);
  const idx = obj(raw.indexation);
  return {
    id: String(raw.id), name: String(raw.name ?? ''), domain: str(raw.domain), wordpress_url: str(raw.wordpress_url), created_at: str(raw.created_at),
    lifecycle_status: lc === 'pausado' || lc === 'arquivado' ? lc : 'ativo', archived_at: str(raw.archived_at), paused_reason: str(raw.paused_reason),
    wordpress: { connected: bool(wp.connected), plugin_version: str(wp.plugin_version), mode: str(wp.mode), connected_at: str(wp.connected_at), last_verified_at: str(wp.last_verified_at) },
    profile: prof ? { status: str(prof.status), completeness: prof.completeness === null || prof.completeness === undefined ? null : num(prof.completeness), confirmed: prof.confirmed === null || prof.confirmed === undefined ? null : bool(prof.confirmed) } : null,
    articles: { total: num(art.total), published: num(art.published), last_published_at: str(art.last_published_at) },
    gsc: { rows: num(gsc.rows), last_day: str(gsc.last_day) },
    ga4: { rows: num(ga4.rows), last_day: str(ga4.last_day) },
    providers: Array.isArray(raw.providers) ? (raw.providers as unknown[]).filter((p): p is string => typeof p === 'string') : [],
    signals: { tracking_key: bool(sig.tracking_key), last_batch_at: str(sig.last_batch_at), last_day: str(sig.last_day), cta_28d: num(sig.cta_28d) },
    automation: { news_agents_active: num(aut.news_agents_active), rss_active: num(aut.rss_active) },
    taxonomy: tax ? { nodes: num(tax.nodes), approved: num(tax.approved) } : null,
    site_map: map ? { reads: num(map.reads), last_at: str(map.last_at) } : null,
    speed: spd ? { scheduled: bool(spd.scheduled), enabled: bool(spd.enabled), frequency: str(spd.frequency), consecutive_failures: num(spd.consecutive_failures), runs: num(spd.runs), last_run_at: str(spd.last_run_at), last_score: spd.last_score === null || spd.last_score === undefined ? null : num(spd.last_score) } : null,
    alerts: alr ? { open_speed: num(alr.open_speed), open_backlinks: num(alr.open_backlinks) } : null,
    backlinks: bl ? { total: num(bl.total), live: num(bl.live), last_checked_at: str(bl.last_checked_at) } : null,
    funnel: fn ? { configured: bool(fn.configured), entries: num(fn.entries), last_month: str(fn.last_month) } : null,
    observatory: obs ? { prompts: num(obs.prompts), citations: num(obs.citations) } : null,
    indexation: idx ? normalizeIndexation(idx) : null,
    radar: normalizeRadar(raw.radar),
    studio: normalizeStudio(raw.studio),
  };
}
