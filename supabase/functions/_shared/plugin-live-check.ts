/**
 * Conferência AO VIVO do plugin Zica Posts instalado em cada site (lado servidor).
 *
 * Por que existe: o painel lia `projects.wordpress_plugin_version`, que só era gravado quando o plugin empurrava estatísticas, quando
 * alguém clicava em "testar conexão" ou no pareamento. Atualizar o plugin no WordPress não avisava ninguém, então o painel ficava com a
 * versão velha. Aqui o servidor pergunta ao site (GET /version, rota pública do plugin) e, quando a versão mudou, grava a nova.
 *
 * Regras:
 *  - nada de SSRF: só https, sem credenciais na URL, sem porta estranha, DNS público a cada endereço, sem IP literal;
 *  - redirecionamento só dentro do MESMO site (mesmo host, ou com/sem "www."); a chave do plugin nunca vai a outro host;
 *  - tempo curto (3 s por requisição), no máximo 5 sites ao mesmo tempo, resposta lida com limite de tamanho;
 *  - site que não responde NÃO derruba nada: devolve o valor guardado e diz isso por extenso ("guardado: site não respondeu");
 *  - nunca inventa dado: sem resposta válida = versão guardada (ou null) e fila "sem dados";
 *  - a chave do plugin (credencial) só é lida do cofre pelo chamador (`getKey`), nunca é gravada, devolvida nem registrada em log.
 * Tudo é injetável (`fetchFn`, `lookupA`, `now`, `getKey`) para teste sem rede. NÃO chama serviço pago.
 */
import { isPublicIPv4, parseSafeUrl, type Deps } from './profile-analyze-core.ts';
import { mapLimit } from './engine-kernel.ts';
import type { PluginLive, PluginQueue } from './project-health-core.ts';

export const LIVE_TIMEOUT_MS = 3000;
export const LIVE_CONCURRENCY = 5;
export const LIVE_CACHE_MS = 10_000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;
const SITE_BUDGET_MS = 8000;
const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:[-+][0-9A-Za-z.-]{1,16})?$/;
const DEFAULT_NAMESPACE = 'zica-posts/v1';
/** Namespaces do mesmo plugin (o antigo ainda responde em instalações velhas) e o cabeçalho de chave de cada um. */
const CONTRACTS: Array<{ namespace: string; header: string; hasStatus: boolean }> = [
  { namespace: 'zica-posts/v1', header: 'X-ZICA-POSTS-Key', hasStatus: true },
  { namespace: 'zica-ai/v1', header: 'X-ZICA-AI-API-Key', hasStatus: true },
  { namespace: 'cfrdm/v1', header: 'X-CFRDM-API-Key', hasStatus: false },
];

export const ORIGIN_LIVE = 'ao vivo' as const;
export const ORIGIN_STORED = 'guardado: site não respondeu' as const;
export type LiveOrigin = typeof ORIGIN_LIVE | typeof ORIGIN_STORED;

export type LiveFailure = 'sem_endereco' | 'url_insegura' | 'redirecionamento_externo' | 'tempo_esgotado' | 'falha_de_rede' | 'resposta_invalida' | 'plugin_nao_encontrado' | `http_${number}`;
const FAILURE_TEXT: Record<string, string> = {
  sem_endereco: 'o projeto não tem endereço do WordPress',
  url_insegura: 'o endereço do site não passou na checagem de segurança',
  redirecionamento_externo: 'o site redirecionou para outro endereço',
  tempo_esgotado: 'demorou mais de 3 segundos',
  falha_de_rede: 'não foi possível conectar',
  resposta_invalida: 'respondeu algo que não é do plugin',
  plugin_nao_encontrado: 'o plugin não respondeu (desativado ou removido?)',
};
export const failureText = (code: string): string => FAILURE_TEXT[code] || (/^http_\d+$/.test(code) ? `o site respondeu com erro HTTP ${code.slice(5)}` : 'falha desconhecida');

export interface LiveTarget {
  project_id: string;
  organization_id?: string | null;
  wordpress_url: string | null;
  namespace?: string | null;
  credential_ref?: string | null;
  stored_version: string | null;
  stored_verified_at: string | null;
}
export interface LiveDeps extends Deps {
  /** Lê a chave do plugin no cofre. Ausente ou null = não consulta a fila (a versão é pública e continua sendo conferida). */
  getKey?: (credentialRef: string) => Promise<string | null>;
  /** Tempo máximo por requisição (padrão 3 s). Só os testes mudam isto. */
  timeoutMs?: number;
}
export interface LiveResult {
  project_id: string;
  /** Versão a mostrar: a lida agora; se o site não respondeu, a guardada (ou null). */
  version: string | null;
  stored_version: string | null;
  changed: boolean;
  origem: LiveOrigin;
  /** Quando a versão foi realmente conferida (agora, se "ao vivo"; senão a última verificação guardada, que pode ser null). */
  conferido_em: string | null;
  tentado_em: string;
  motivo: LiveFailure | null;
  motivo_texto: string | null;
  queue: PluginQueue | null;
}

// ------------------------------------------------------------------------------------------------------------ rede segura
/** `ok` true: resposta 2xx (`json` pode ser null se o corpo não for objeto JSON). `ok` false: `motivo` diz por quê. (Sem união discriminada: o projeto compila sem strictNullChecks.) */
interface Hop { ok: boolean; status?: number; json?: Record<string, unknown> | null; motivo?: LiveFailure }

const sameSite = (a: string, b: string) => a === b || a.replace(/^www\./, '') === b.replace(/^www\./, '');

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader?.();
  if (!reader) return (await res.text()).slice(0, MAX_BODY_BYTES);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (bytes + value.length > MAX_BODY_BYTES) { chunks.push(value.slice(0, MAX_BODY_BYTES - bytes)); await reader.cancel().catch(() => undefined); break; }
    chunks.push(value);
    bytes += value.length;
  }
  const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.length; }
  return new TextDecoder('utf-8', { fatal: false }).decode(all);
}

/** GET com todas as proteções. `headers` (inclui a chave do plugin) só vai ao host original. */
export async function safeGetJson(deps: Deps, rawUrl: string, headers: Record<string, string> = {}, timeoutMs = LIVE_TIMEOUT_MS): Promise<Hop> {
  const first = parseSafeUrl(rawUrl);
  if ('error' in first || first.url.protocol !== 'https:') return { ok: false, motivo: 'url_insegura' };
  const originHost = first.url.hostname.toLowerCase();
  const checkedHosts = new Set<string>();
  let current = first.url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const host = current.hostname.toLowerCase();
    if (!checkedHosts.has(host)) {
      let addresses: string[] = [];
      try { addresses = await deps.lookupA(host); } catch { addresses = []; }
      if (!addresses.length || addresses.some((ip) => !isPublicIPv4(ip))) return { ok: false, motivo: 'url_insegura' };
      checkedHosts.add(host);
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => { controller.abort(); resolve('timeout'); }, timeoutMs); });
    let res: Response;
    try {
      const sent = deps.fetchFn(current.href, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'ZicaAI-PluginCheck/1.0', ...(host === originHost ? headers : {}) } });
      const raced = await Promise.race([sent, timeout]);
      if (raced === 'timeout') { sent.catch(() => undefined); return { ok: false, motivo: 'tempo_esgotado' }; }
      res = raced;
    } catch (e) {
      return { ok: false, motivo: e instanceof Error && e.name === 'AbortError' ? 'tempo_esgotado' : 'falha_de_rede' };
    } finally { if (timer) clearTimeout(timer); }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      let next: URL;
      try { next = new URL(res.headers.get('location') as string, current); } catch { return { ok: false, motivo: 'url_insegura' }; }
      await res.body?.cancel?.().catch(() => undefined);
      const safeNext = parseSafeUrl(next.href);
      if ('error' in safeNext || safeNext.url.protocol !== 'https:') return { ok: false, motivo: 'url_insegura' };
      if (!sameSite(safeNext.url.hostname.toLowerCase(), originHost)) return { ok: false, motivo: 'redirecionamento_externo' };
      current = safeNext.url;
      continue;
    }
    if (res.status < 200 || res.status >= 300) { await res.body?.cancel?.().catch(() => undefined); return { ok: false, motivo: `http_${res.status}` }; }
    let json: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(await readCapped(res));
      json = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch { json = null; }
    return { ok: true, status: res.status, json };
  }
  return { ok: false, motivo: 'redirecionamento_externo' };
}

/** Raiz https do site no formato guardado pelo projeto (sem barra final, sem /wp-json). Null se não passar na checagem. */
export function liveBase(raw: string | null | undefined): string | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  const parsed = parseSafeUrl(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  if ('error' in parsed || parsed.url.protocol !== 'https:') return null;
  const u = parsed.url;
  const path = u.pathname.replace(/\/wp-json(?:\/.*)?$/i, '').replace(/\/+$/, '');
  return `${u.origin}${path}`;
}

// ------------------------------------------------------------------------------------------------------------ leitura do plugin
/** Versão válida (ex.: 3.18.0) ou null. */
export const cleanVersion = (v: unknown): string | null => (typeof v === 'string' && VERSION_RE.test(v.trim()) ? v.trim() : null);

/** Tira da mensagem de erro do plugin o que não pode aparecer na tela: endereços, parâmetros de chave e sequências longas (tokens). */
export function sanitizeQueueError(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(/https?:\/\/[^\s"'<>)]+/gi, '[endereço]')
    .replace(/\b(api[_-]?key|token|secret|signature|sig|key|password|senha)\s*[=:]\s*\S+/gi, '$1=[oculto]')
    .replace(/\b[A-Za-z0-9+/_-]{28,}={0,2}/g, '[oculto]')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? (text.length > 200 ? `${text.slice(0, 200)}…` : text) : null;
}

const toCount = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0);
const isoOrNull = (v: unknown): string | null => (typeof v === 'string' && v && Number.isFinite(Date.parse(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`)) ? v : null);

/**
 * Resume a fila de saída a partir da resposta de GET /status.
 * Plugin 3.19+ manda `outbox_summary` (contagens + último erro já saneado). Plugin 3.18 ou anterior só manda `outbox` (contagens):
 * as contagens aparecem e o MOTIVO fica "sem dados" (`detail: false`). Sem nenhum dos dois = null (sem dados).
 */
export function parseQueue(status: Record<string, unknown> | null): PluginQueue | null {
  if (!status) return null;
  const summary = status.outbox_summary && typeof status.outbox_summary === 'object' && !Array.isArray(status.outbox_summary) ? status.outbox_summary as Record<string, unknown> : null;
  const rawCounts = summary?.counts ?? status.outbox;
  if (!rawCounts || typeof rawCounts !== 'object' || Array.isArray(rawCounts)) return null;
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawCounts as Record<string, unknown>).slice(0, 12)) if (/^[a-z_]{2,20}$/.test(k)) counts[k] = toCount(v);
  return {
    counts,
    failed: counts.failed || 0,
    pending: (counts.pending || 0) + (counts.retry || 0) + (counts.processing || 0),
    detail: !!summary,
    last_error: summary ? sanitizeQueueError(summary.last_error) : null,
    last_error_at: summary ? isoOrNull(summary.last_error_event_at ?? summary.last_error_at) : null,
  };
}

const pickNamespaces = (preferred: string | null | undefined) => {
  const first = CONTRACTS.find((c) => c.namespace === (preferred || DEFAULT_NAMESPACE)) || CONTRACTS[0];
  return [first, ...CONTRACTS.filter((c) => c !== first)];
};

/** Confere UM site. Nunca lança: qualquer falha vira "guardado" com o motivo por extenso. */
export async function checkOne(target: LiveTarget, deps: LiveDeps): Promise<LiveResult> {
  const tentado_em = new Date(deps.now()).toISOString();
  const stored = cleanVersion(target.stored_version);
  const stored_ver = target.stored_version || null;
  const fallback = (motivo: LiveFailure): LiveResult => ({
    project_id: target.project_id, version: stored_ver, stored_version: stored_ver, changed: false, origem: ORIGIN_STORED,
    conferido_em: target.stored_verified_at || null, tentado_em, motivo, motivo_texto: failureText(motivo), queue: null,
  });
  const base = liveBase(target.wordpress_url);
  if (!target.wordpress_url || !target.wordpress_url.trim()) return fallback('sem_endereco');
  if (!base) return fallback('url_insegura');

  const deadline = deps.now() + SITE_BUDGET_MS;
  let lastFailure: LiveFailure = 'plugin_nao_encontrado';
  for (const contract of pickNamespaces(target.namespace)) {
    for (const mode of ['wp_json', 'rest_route'] as const) {
      if (deps.now() > deadline) return fallback(lastFailure);
      const url = mode === 'wp_json' ? `${base}/wp-json/${contract.namespace}/version` : `${base}/?rest_route=/${contract.namespace}/version`;
      const hop = await safeGetJson(deps, url, {}, deps.timeoutMs ?? LIVE_TIMEOUT_MS);
      if (!hop.ok) {
        const motivo = hop.motivo as LiveFailure;
        lastFailure = motivo;
        // Site fora do ar ou inseguro: tentar outra rota só gasta tempo.
        if (motivo === 'tempo_esgotado' || motivo === 'falha_de_rede' || motivo === 'url_insegura' || motivo === 'redirecionamento_externo') return fallback(motivo);
        continue;
      }
      const version = cleanVersion(hop.json?.version);
      const software = hop.json?.software_id;
      if (!hop.json || hop.json.success !== true || !version || (software !== undefined && software !== 'zica-posts')) { lastFailure = 'resposta_invalida'; continue; }
      const queue = contract.hasStatus && target.credential_ref && deps.getKey ? await readQueue(deps, base, contract, mode, target.credential_ref) : null;
      return {
        project_id: target.project_id, version, stored_version: stored_ver, changed: version !== stored, origem: ORIGIN_LIVE,
        conferido_em: tentado_em, tentado_em, motivo: null, motivo_texto: null, queue,
      };
    }
  }
  return fallback(lastFailure);
}

async function readQueue(deps: LiveDeps, base: string, contract: { namespace: string; header: string }, mode: 'wp_json' | 'rest_route', ref: string): Promise<PluginQueue | null> {
  try {
    const key = deps.getKey ? await deps.getKey(ref) : null;
    if (!key) return null;
    const url = mode === 'wp_json' ? `${base}/wp-json/${contract.namespace}/status` : `${base}/?rest_route=/${contract.namespace}/status`;
    const hop = await safeGetJson(deps, url, { [contract.header]: key }, deps.timeoutMs ?? LIVE_TIMEOUT_MS);
    return hop.ok && hop.json?.success === true ? parseQueue(hop.json) : null;
  } catch { return null; }
}

// ------------------------------------------------------------------------------------------------------------ vários sites
export interface LiveOptions { concurrency?: number; /** cache curto por projeto (evita martelar o site a cada atualização da tela) */ cache?: Map<string, { at: number; result: LiveResult }>; cacheMs?: number; force?: boolean }

/** Confere vários projetos em paralelo (limite de concorrência). Devolve um resultado para CADA projeto, na ordem recebida. */
export async function checkProjectsLive(targets: LiveTarget[], deps: LiveDeps, opts: LiveOptions = {}): Promise<LiveResult[]> {
  const ttl = opts.cacheMs ?? LIVE_CACHE_MS;
  return await mapLimit(targets, opts.concurrency ?? LIVE_CONCURRENCY, async (t) => {
    const key = `${t.project_id}|${t.wordpress_url || ''}`;
    const hit = opts.cache?.get(key);
    if (hit && !opts.force && deps.now() - hit.at < ttl && hit.result.stored_version === t.stored_version) return hit.result;
    const result = await checkOne(t, deps).catch((): LiveResult => ({ project_id: t.project_id, version: t.stored_version, stored_version: t.stored_version, changed: false, origem: ORIGIN_STORED, conferido_em: t.stored_verified_at, tentado_em: new Date(deps.now()).toISOString(), motivo: 'falha_de_rede', motivo_texto: failureText('falha_de_rede'), queue: null }));
    opts.cache?.set(key, { at: deps.now(), result });
    return result;
  });
}

/** Resultado pronto para a saúde do projeto (project-health-core). */
export const toPluginLive = (r: LiveResult): PluginLive => ({ origin: r.origem, checked_at: r.conferido_em, attempted_at: r.tentado_em, reason: r.motivo_texto, queue: r.queue });

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Grava a versão nova SÓ quando mudou e foi lida ao vivo. Devolve quantos projetos foram atualizados. Não derruba a leitura em caso de erro. */
export async function persistLiveVersions(admin: Admin, results: LiveResult[], nowIso: string): Promise<number> {
  let n = 0;
  for (const r of results) {
    if (r.origem !== ORIGIN_LIVE || !r.changed || !r.version) continue;
    try {
      const u = await admin.from('projects').update({ wordpress_plugin_version: r.version, wordpress_last_verified_at: nowIso, updated_at: nowIso }).eq('id', r.project_id);
      if (!u.error) n++; else console.error('[plugin-live-check] persist_failed');
    } catch { console.error('[plugin-live-check] persist_failed'); }
  }
  return n;
}

/**
 * Empurrão do plugin ("acabei de ser atualizado"): o plugin chama `pair-wordpress-site` (action register) com a chave dele; o servidor já
 * confere a chave chamando o site. Aqui o projeto com aquela chave passa a mostrar a versão nova na hora, sem esperar ninguém clicar.
 * O vínculo é a referência da credencial (`wordpress_<usuário>_<16 primeiros hex do hash da chave>`), nunca a chave em si.
 */
export async function applyPluginVersionPush(admin: Admin, input: { keyHash: string; version: string | null | undefined; nowIso: string }): Promise<{ updated: number; changed: Array<{ project_id: string; organization_id: string | null; from: string | null; to: string }> }> {
  const version = cleanVersion(input.version);
  if (!version || !/^[a-f0-9]{64}$/.test(input.keyHash)) return { updated: 0, changed: [] };
  const found = await admin.from('projects').select('id,organization_id,wordpress_plugin_version').eq('wordpress_connector_mode', 'zica_posts').like('wordpress_credential_ref', `%${input.keyHash.slice(0, 16)}`);
  if (found.error) return { updated: 0, changed: [] };
  const rows = (found.data || []) as Array<{ id: string; organization_id: string | null; wordpress_plugin_version: string | null }>;
  const changed: Array<{ project_id: string; organization_id: string | null; from: string | null; to: string }> = [];
  for (const p of rows) {
    const from = p.wordpress_plugin_version;
    if (from === version) continue;
    const u = await admin.from('projects').update({ wordpress_plugin_version: version, wordpress_last_verified_at: input.nowIso, updated_at: input.nowIso }).eq('id', p.id);
    if (!u.error) changed.push({ project_id: p.id, organization_id: p.organization_id, from, to: version });
  }
  return { updated: changed.length, changed };
}
