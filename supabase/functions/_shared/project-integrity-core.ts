/**
 * Núcleo puro do mapa de conexões e do verificador de integridade de um projeto.
 *
 * Parte do manifesto de módulos (module-registry.ts) e dos fatos do projeto (project-health-core.ts). Mostra quais módulos têm
 * dado, quais ligações entre módulos estão de pé, quais estão quebradas ("consome sem origem"), paradas ("dado sem consumidor")
 * ou só previstas. Não inventa dado: módulo sem tabela no banco aparece como "não instalado".
 */
import { MODULES, FLOW_CHAIN, moduleByKey, moduleEdges, type ModuleKey } from './module-registry.ts';
import { compareVersions, daysSince, fmtDate, type ProjectFacts } from './project-health-core.ts';
import { PLUGIN_MINIMUM_VERSION } from './plugin-version.ts';

export type ModuleState = 'com_dados' | 'sem_dados' | 'nao_instalado' | 'planejado';
export interface MapModule { key: ModuleKey; label: string; route: string | null; state: ModuleState; detail: string }
/** Estado de uma ligação: `ok` = os dois lados têm dado; `sem_origem` = o consumidor tem dado e o produtor não (quebrada);
 *  `sem_consumo` = o produtor tem dado e o consumidor não (dado parado); `vazio` = nenhum dos dois; `prevista` = ainda não existe no código. */
export type LinkState = 'ok' | 'sem_origem' | 'sem_consumo' | 'vazio' | 'prevista';
export interface MapLink { from: ModuleKey; to: ModuleKey; table: string; state: LinkState; text: string }
export interface ConnectionMap { modules: MapModule[]; links: MapLink[]; chain: Array<{ from: ModuleKey; to: ModuleKey; connected: boolean; planned: boolean }> }

const stateOf = (key: ModuleKey, f: ProjectFacts): ModuleState => {
  const m = moduleByKey(key)!;
  if (m.status === 'planejado') return 'planejado';
  const has = m.hasData(f);
  return has === null ? 'nao_instalado' : has ? 'com_dados' : 'sem_dados';
};

const LINK_TEXT: Record<Exclude<LinkState, 'prevista'>, (a: string, b: string) => string> = {
  ok: (a, b) => `${a} alimenta ${b}: os dois têm dado.`,
  sem_origem: (a, b) => `${b} tem dado, mas ${a} (de onde ele lê) não tem: vínculo quebrado.`,
  sem_consumo: (a, b) => `${a} tem dado que ${b} ainda não usa: dado parado.`,
  vazio: (a, b) => `${a} e ${b} ainda estão sem dado.`,
};

/** Mapa de conexões do projeto: o que tem dado, o que está ligado a quê e onde falta ligação. */
export function buildConnectionMap(f: ProjectFacts): ConnectionMap {
  const modules: MapModule[] = MODULES.map((m) => {
    const state = stateOf(m.key, f);
    return { key: m.key, label: m.label, route: m.route, state, detail: state === 'planejado' ? 'ainda não construído' : state === 'nao_instalado' ? 'módulo ainda não instalado no banco' : state === 'sem_dados' ? 'sem dados neste projeto' : m.dataText(f) };
  });
  const st = new Map(modules.map((m) => [m.key, m.state] as const));
  const label = (k: ModuleKey) => moduleByKey(k)!.label;
  const seen = new Set<string>();
  const links: MapLink[] = [];
  for (const e of moduleEdges()) {
    const dedupe = `${e.from}>${e.to}>${e.planned}>${!!e.optional}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    if (e.optional) {
      // ligação real e dispensável: sem dado na origem o módulo continua funcionando, então nunca vira "vínculo quebrado"
      const a = st.get(e.from) === 'com_dados';
      const b = st.get(e.to) === 'com_dados';
      const state: LinkState = a && b ? 'ok' : a && !b ? 'sem_consumo' : 'vazio';
      links.push({ from: e.from, to: e.to, table: e.table, state, text: `${LINK_TEXT[state](label(e.from), label(e.to))} (ligação opcional)` });
      continue;
    }
    if (e.planned || st.get(e.from) === 'planejado' || st.get(e.to) === 'planejado') {
      links.push({ from: e.from, to: e.to, table: e.table, state: 'prevista', text: `${label(e.from)} → ${label(e.to)}: ligação prevista, ainda não construída no código.` });
      continue;
    }
    const a = st.get(e.from) === 'com_dados';
    const b = st.get(e.to) === 'com_dados';
    const state: LinkState = a && b ? 'ok' : !a && b ? 'sem_origem' : a && !b ? 'sem_consumo' : 'vazio';
    links.push({ from: e.from, to: e.to, table: e.table, state, text: LINK_TEXT[state](label(e.from), label(e.to)) });
  }
  const chain = FLOW_CHAIN.slice(0, -1).map((from, i) => {
    const to = FLOW_CHAIN[i + 1];
    const direct = links.find((l) => l.from === from && l.to === to);
    return { from, to, connected: !!direct && direct.state !== 'prevista', planned: !direct || direct.state === 'prevista' };
  });
  return { modules, links, chain };
}

export type IssueKind = 'dado_orfao' | 'vinculo_quebrado' | 'modulo_sem_consumidor' | 'ligacao_prevista';
export type IssueLevel = 'critico' | 'atencao' | 'info';
export interface IntegrityIssue { key: string; kind: IssueKind; level: IssueLevel; text: string; action: string | null; module: ModuleKey | null }

/** Contagem de linhas sem projeto (FK nula) por tabela, na organização; vem de private.project_orphan_scan. */
export interface OrphanScan { tables: Array<{ table: string; orphans: number }>; unverifiable: string[] }

export interface IntegrityReport {
  project_id: string;
  issues: IntegrityIssue[];
  totals: { critico: number; atencao: number; info: number };
  map: ConnectionMap;
  /** true quando nada crítico nem de atenção foi encontrado. */
  intact: boolean;
}

/** Verifica a integridade do projeto: vínculos quebrados, dado parado, ligações previstas e (se informado) linhas órfãs da organização. */
export function verifyIntegrity(f: ProjectFacts, now: number, orphans?: OrphanScan | null): IntegrityReport {
  const map = buildConnectionMap(f);
  const issues: IntegrityIssue[] = [];
  const label = (k: ModuleKey) => moduleByKey(k)!.label;

  for (const l of map.links) {
    if (l.state === 'sem_origem') issues.push({ key: `sem_origem:${l.from}>${l.to}`, kind: 'vinculo_quebrado', level: 'atencao', text: l.text, action: `Alimente ${label(l.from)} (a origem) ou confira por que ${label(l.to)} tem dado sem ela.`, module: l.to });
    else if (l.state === 'sem_consumo' && l.from !== 'projeto') {
      const consumer = moduleByKey(l.to)!;
      issues.push({ key: `sem_consumo:${l.from}>${l.to}`, kind: 'modulo_sem_consumidor', level: 'info', text: l.text, action: consumer.route ? `Use ${label(l.to)} para aproveitar esse dado.` : null, module: l.from });
    } else if (l.state === 'prevista') issues.push({ key: `prevista:${l.from}>${l.to}`, kind: 'ligacao_prevista', level: 'info', text: l.text, action: null, module: l.to });
  }

  // Vínculos quebrados dentro do próprio projeto (a partir dos fatos).
  const hasGoogle = f.providers.includes('gsc') || f.providers.includes('ga4');
  if (hasGoogle && f.gsc.rows === 0 && f.ga4.rows === 0) issues.push({ key: 'google_sem_dado', kind: 'vinculo_quebrado', level: 'atencao', text: 'O Google está conectado, mas nenhuma linha chegou ao Zica.', action: 'Reconecte o Google ou aguarde a primeira sincronização.', module: 'google' });
  if (!hasGoogle && (f.gsc.rows > 0 || f.ga4.rows > 0)) issues.push({ key: 'dado_sem_conexao', kind: 'vinculo_quebrado', level: 'atencao', text: 'Há dado do Google guardado, mas a conexão não existe mais: o dado não será atualizado.', action: 'Reconecte o Google para voltar a receber dados.', module: 'google' });
  if (f.signals.tracking_key && f.signals.last_batch_at === null) issues.push({ key: 'sinais_sem_envio', kind: 'vinculo_quebrado', level: 'atencao', text: 'A chave de sinais existe, mas o site nunca enviou nada: sem conversões medidas.', action: 'Instale o script de sinais (ou atualize o plugin) no site.', module: 'sinais' });
  if (f.speed?.scheduled && f.speed.enabled && !f.domain) issues.push({ key: 'velocidade_sem_dominio', kind: 'vinculo_quebrado', level: 'atencao', text: 'Há medição de velocidade agendada, mas o projeto não tem domínio cadastrado.', action: 'Cadastre o domínio ou desligue o agendamento.', module: 'monitor' });
  if ((f.backlinks?.total || 0) > 0 && !f.speed?.scheduled) issues.push({ key: 'backlinks_sem_velocidade', kind: 'vinculo_quebrado', level: 'info', text: 'O projeto tem backlinks acompanhados, mas não tem medição de velocidade agendada.', action: 'Agende a medição de velocidade do site.', module: 'monitor' });
  if (f.wordpress.connected && f.wordpress.plugin_version && compareVersions(f.wordpress.plugin_version, PLUGIN_MINIMUM_VERSION) < 0) issues.push({ key: 'plugin_abaixo_do_minimo', kind: 'vinculo_quebrado', level: 'critico', text: `O plugin ${f.wordpress.plugin_version} está abaixo do mínimo (${PLUGIN_MINIMUM_VERSION}): a ligação com o WordPress pode falhar.`, action: 'Atualize o plugin Zica Posts no WordPress.', module: 'conteudo' });
  if (f.wordpress_url && !f.wordpress.connected) issues.push({ key: 'wordpress_sem_credencial', kind: 'vinculo_quebrado', level: 'atencao', text: 'O projeto tem endereço de WordPress, mas sem credencial: não consegue publicar.', action: 'Refaça a conexão do WordPress em Configurações.', module: 'conteudo' });
  const idle = daysSince(f.wordpress.last_verified_at, now);
  if (f.wordpress.connected && idle !== null && idle > 90) issues.push({ key: 'wordpress_nao_verificado', kind: 'vinculo_quebrado', level: 'info', text: `A conexão com o WordPress não é verificada desde ${fmtDate(f.wordpress.last_verified_at)}.`, action: 'Teste a conexão em Configurações.', module: 'conteudo' });

  if (orphans) {
    for (const t of orphans.tables) if (t.orphans > 0) issues.push({ key: `orfao:${t.table}`, kind: 'dado_orfao', level: 'atencao', text: `${t.orphans.toLocaleString('pt-BR')} linha(s) em "${t.table}" estão sem projeto (a organização, não só este projeto).`, action: 'Atribua a um projeto ou apague depois de exportar. Nada é apagado automaticamente.', module: null });
  }
  const totals = { critico: issues.filter((i) => i.level === 'critico').length, atencao: issues.filter((i) => i.level === 'atencao').length, info: issues.filter((i) => i.level === 'info').length };
  return { project_id: f.id, issues, totals, map, intact: totals.critico === 0 && totals.atencao === 0 };
}

/** Confere o MANIFESTO (sem olhar projeto): toda tabela consumida tem produtor ativo e a cadeia combinada está declarada. Usado pelo teste. */
export function verifyManifest(): { problems: string[] } {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const m of MODULES) {
    if (keys.has(m.key)) problems.push(`módulo repetido: ${m.key}`);
    keys.add(m.key);
  }
  const edges = moduleEdges();
  for (const m of MODULES) {
    for (const t of [...m.consumes, ...m.plannedConsumes]) {
      if (!MODULES.some((o) => o.produces.includes(t))) problems.push(`${m.key} consome "${t}", que nenhum módulo produz`);
    }
    for (const t of m.consumes) {
      const p = MODULES.find((o) => o.produces.includes(t));
      if (p && p.status === 'planejado' && m.status === 'ativo') problems.push(`${m.key} (ativo) consome "${t}", produzida por módulo planejado ${p.key}`);
    }
  }
  FLOW_CHAIN.slice(0, -1).forEach((from, i) => {
    const to = FLOW_CHAIN[i + 1];
    if (!edges.some((e) => e.from === from && e.to === to)) problems.push(`a cadeia não tem ligação declarada de ${from} para ${to}`);
  });
  return { problems };
}
