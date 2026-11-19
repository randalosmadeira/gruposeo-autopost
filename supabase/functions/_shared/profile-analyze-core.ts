/**
 * Núcleo do pente fino do Perfil do Projeto (marco P4, etapa gratuita).
 *
 * Regras do marco:
 *  - SÓ medição: cada número do relatório vem de uma resposta real de uma fonte pública. Se a fonte falhou, o campo não existe
 *    (nada é preenchido, estimado ou inventado) e a verificação aparece como "erro" ou "não executada", com o motivo.
 *  - Gratuito primeiro: nenhuma verificação daqui gasta crédito. As pagas (Google Maps por Serper, perguntas às IAs) NÃO rodam nesta
 *    etapa; ficam registradas como "não executadas" até passarem pelo portão de custo.
 *  - Endereços informados por pessoas (site, redes) são DADOS não confiáveis: toda visita passa por `guardedFetch` (só http/https, portas 80/443,
 *    sem usuário/senha, sem IP literal, DNS resolvido para endereço público, redirecionamentos revalidados a cada salto, tempo e tamanho limitados).
 *  - Redes sociais: só se confere o FORMATO do link. Nenhuma plataforma é acessada (termos de uso).
 *  - Dados pessoais: nomes de sócios e do titular do domínio NÃO são guardados; só quantidades e datas.
 * Tudo é injetável (`Deps`) para teste sem rede.
 */

export const ANALYZE_VERSION = 'p4a-1';
export const USER_AGENT = 'ZicaAI-PerfilCheck/1.0 (+https://app.zica.posts.zicajuris.com.br; verificacao publica do perfil)';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skipped' | 'error';
export type Severity = 'alta' | 'media' | 'baixa' | 'info';

export interface CheckResult {
  check_key: string;
  source: string;
  status: CheckStatus;
  measured: Record<string, unknown>;
  evidence_url: string | null;
  duration_ms: number;
  error: string | null;
}
export interface Finding {
  check_key: string;
  severity: Severity;
  title: string;
  detail: string | null;
  evidence: Record<string, unknown>;
  suggested_action: string | null;
}
export interface Deps {
  fetchFn: typeof fetch;
  /** resolve registros A (IPv4) do nome; usado para recusar endereços privados antes de visitar */
  lookupA: (host: string) => Promise<string[]>;
  now: () => number;
}
export interface Inputs {
  cnpj: string | null;
  /** resposta do campo "Situação do CNPJ" (ex.: "Tenho CNPJ", "Sou MEI", "Ainda não tenho CNPJ") */
  cnpjStatus: string | null;
  ceps: string[];
  siteUrl: string | null;
  /** o que a pessoa respondeu em "Tem uma lista de URLs (sitemap)?": 'yes' | 'no' | 'unknown' | null */
  sitemapDeclared: string | null;
  socials: Record<string, string>;
}
interface Partial1 { check: Omit<CheckResult, 'duration_ms'>; findings: Finding[] }

// ------------------------------------------------------------------------------------------------------------ validação local
export const onlyDigits = (v: unknown): string => String(v ?? '').replace(/\D+/g, '');

export function validCnpj(raw: unknown): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += Number(d[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function extractCeps(text: unknown): string[] {
  const found = String(text ?? '').match(/\b\d{5}-?\d{3}\b/g) || [];
  return [...new Set(found.map(onlyDigits))].slice(0, 3);
}

export function isPublicIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19)));
}

/** Aceita só nome de site público em http/https. Devolve a URL normalizada ou um código de recusa. */
export function parseSafeUrl(raw: string): { url: URL } | { error: string } {
  let url: URL;
  try { url = new URL(raw); } catch { return { error: 'url_invalida' }; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'url_invalida' };
  if (url.username || url.password) return { error: 'url_com_credenciais' };
  if (url.port && url.port !== '80' && url.port !== '443') return { error: 'porta_nao_permitida' };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) return { error: 'endereco_nao_permitido' };
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost') || host.endsWith('.lan')) return { error: 'endereco_nao_permitido' };
  return { url };
}

/** O que a pessoa digitou ("meusite.com.br", "https://x.com/blog") vira a origem https do site; null se for inválido. */
export function normalizeSiteInput(raw: unknown): { origin: string; host: string } | null {
  const text = String(raw ?? '').trim().split(/\s+/)[0];
  if (!text) return null;
  const parsed = parseSafeUrl(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  if ('error' in parsed) return null;
  return { origin: `https://${parsed.url.hostname.toLowerCase()}`, host: parsed.url.hostname.toLowerCase() };
}

const TWO_LEVEL_SUFFIXES = new Set(['com.br', 'net.br', 'org.br', 'adv.br', 'edu.br', 'gov.br', 'eco.br', 'art.br', 'blog.br', 'med.br', 'psc.br', 'co.uk', 'org.uk', 'com.au', 'com.ar', 'com.mx', 'com.pt', 'co.za']);
/** Domínio registrável (heurística local, sem lista pública): www.exemplo.com.br -> exemplo.com.br */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const last2 = labels.slice(-2).join('.');
  return TWO_LEVEL_SUFFIXES.has(last2) ? labels.slice(-3).join('.') : last2;
}

const SOCIAL_HOSTS: Record<string, string[]> = {
  instagram: ['instagram.com'], facebook: ['facebook.com', 'fb.com'], linkedin: ['linkedin.com'], tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'], twitter: ['x.com', 'twitter.com'], kwai: ['kwai.com'],
};
export const SOCIAL_KEYS = Object.keys(SOCIAL_HOSTS);

// ------------------------------------------------------------------------------------------------------------ rede
function err(code: string) { return new Error(code); }

async function timedFetch(deps: Deps, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await deps.fetchFn(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) throw err('tempo_esgotado');
    throw err('falha_de_rede');
  } finally {
    clearTimeout(timer);
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const text = await res.text();
    return { text: text.slice(0, maxBytes), bytes: Math.min(text.length, maxBytes), truncated: text.length > maxBytes };
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (bytes + value.length > maxBytes) {
      chunks.push(value.slice(0, maxBytes - bytes));
      bytes = maxBytes;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    bytes += value.length;
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) { all.set(c, offset); offset += c.length; }
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(all), bytes, truncated };
}

export interface Visit { status: number; finalUrl: string; hops: string[]; headers: Headers; text: string; bytes: number; truncated: boolean; ttfbMs: number; totalMs: number }

/** Visita um endereço NÃO confiável com todas as proteções (ver cabeçalho do arquivo). */
export async function guardedFetch(deps: Deps, rawUrl: string, opts: { maxBytes?: number; maxHops?: number; timeoutMs?: number; accept?: string } = {}): Promise<Visit> {
  const maxBytes = opts.maxBytes ?? 512 * 1024;
  const maxHops = opts.maxHops ?? 5;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const started = deps.now();
  let current = rawUrl;
  const hops: string[] = [];
  for (let hop = 0; hop <= maxHops; hop++) {
    const parsed = parseSafeUrl(current);
    if ('error' in parsed) throw err(parsed.error);
    let addresses: string[];
    try { addresses = await deps.lookupA(parsed.url.hostname); } catch { addresses = []; }
    if (!addresses.length || addresses.some((ip) => !isPublicIPv4(ip))) throw err('endereco_privado_ou_nao_resolvido');
    hops.push(parsed.url.href);
    const hopStart = deps.now();
    const res = await timedFetch(deps, parsed.url.href, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': USER_AGENT, Accept: opts.accept || 'text/html,application/xhtml+xml,text/plain,application/xml;q=0.9,*/*;q=0.5' } }, timeoutMs);
    const ttfb = deps.now() - hopStart;
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      let next: string;
      try { next = new URL(res.headers.get('location') as string, parsed.url).href; } catch { throw err('url_invalida'); }
      current = next;
      await res.body?.cancel?.().catch(() => undefined);
      continue;
    }
    const body = await readLimited(res, maxBytes);
    return { status: res.status, finalUrl: parsed.url.href, hops, headers: res.headers, text: body.text, bytes: body.bytes, truncated: body.truncated, ttfbMs: ttfb, totalMs: deps.now() - started };
  }
  throw err('muitos_redirecionamentos');
}

const TRUSTED_HOSTS = new Set(['brasilapi.com.br', 'viacep.com.br', 'minhareceita.org', 'rdap.registro.br', 'rdap.org', 'cloudflare-dns.com', 'archive.org']);

/** Fontes públicas fixas (lista fechada). Só o caminho varia, e ele é montado com valores já validados. */
export async function trustedJson(deps: Deps, url: string, timeoutMs = 8000, accept = 'application/json'): Promise<{ status: number; json: unknown }> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !TRUSTED_HOSTS.has(parsed.hostname)) throw err('fonte_nao_permitida');
  const res = await timedFetch(deps, url, { method: 'GET', headers: { 'User-Agent': USER_AGENT, Accept: accept } }, timeoutMs);
  const body = await readLimited(res, 1024 * 1024);
  let json: unknown = null;
  try { json = JSON.parse(body.text); } catch { json = null; }
  return { status: res.status, json };
}

// ------------------------------------------------------------------------------------------------------------ utilitários
const clip = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'falha_desconhecida').slice(0, 200);
const SEV_ORDER: Record<Severity, number> = { alta: 0, media: 1, baixa: 2, info: 3 };

const ERROR_TEXT: Record<string, string> = {
  tempo_esgotado: 'A fonte não respondeu a tempo.', falha_de_rede: 'Não foi possível conectar.', url_invalida: 'Endereço inválido.',
  endereco_privado_ou_nao_resolvido: 'O endereço não resolve para um servidor público.', muitos_redirecionamentos: 'Redirecionamentos demais.',
  porta_nao_permitida: 'Porta não permitida.', endereco_nao_permitido: 'Endereço não permitido.', url_com_credenciais: 'Endereço com usuário e senha não é aceito.',
  fonte_nao_permitida: 'Fonte não permitida.',
};
export const errorText = (code: string) => ERROR_TEXT[code] || 'A verificação não pôde ser concluída.';

function mk(key: string, source: string, status: CheckStatus, measured: Record<string, unknown>, evidence: string | null, error: string | null = null): Omit<CheckResult, 'duration_ms'> {
  return { check_key: key, source, status, measured, evidence_url: evidence ? evidence.slice(0, 500) : null, error: error ? error.slice(0, 500) : null };
}
const finding = (check_key: string, severity: Severity, title: string, detail: string | null, evidence: Record<string, unknown>, suggested_action: string | null): Finding => ({ check_key, severity, title: title.slice(0, 200), detail: detail ? detail.slice(0, 1500) : null, evidence, suggested_action: suggested_action ? suggested_action.slice(0, 500) : null });

// ------------------------------------------------------------------------------------------------------------ CNPJ
export async function checkCnpjFormat(inputs: Inputs): Promise<Partial1> {
  const declaredNone = /ainda n[aã]o tenho/i.test(inputs.cnpjStatus || '');
  const declaredHas = !declaredNone && /tenho cnpj|sou mei/i.test(inputs.cnpjStatus || '');
  if (!inputs.cnpj) {
    const findings = declaredHas ? [finding('cnpj_formato', 'media', 'Você disse que tem CNPJ, mas o número não foi informado', 'Sem o número não dá para conferir a situação da empresa na Receita.', {}, 'Informe o CNPJ na etapa "Negócio e documentos".')] : [];
    return { check: mk('cnpj_formato', 'local', 'skipped', {}, null, declaredNone ? 'Sem CNPJ (informado pela pessoa).' : 'CNPJ não informado.'), findings };
  }
  if (!validCnpj(inputs.cnpj)) {
    return { check: mk('cnpj_formato', 'local', 'fail', { informado: onlyDigits(inputs.cnpj).slice(0, 14), digitos_verificadores_validos: false }, null), findings: [finding('cnpj_formato', 'alta', 'CNPJ com dígitos verificadores inválidos', 'O número não passa na conta de verificação do CNPJ: provável erro de digitação.', { cnpj: onlyDigits(inputs.cnpj) }, 'Confira o número no cartão CNPJ e corrija na etapa "Negócio e documentos".')] };
  }
  return { check: mk('cnpj_formato', 'local', 'ok', { cnpj: onlyDigits(inputs.cnpj), digitos_verificadores_validos: true }, null), findings: [] };
}

export interface CnpjFacts { situacao: string | null; municipio: string | null; uf: string | null; abertura: string | null }

export async function checkCnpjReceita(deps: Deps, inputs: Inputs): Promise<Partial1 & { facts?: CnpjFacts }> {
  if (!inputs.cnpj || !validCnpj(inputs.cnpj)) return { check: mk('cnpj_receita', 'brasilapi', 'skipped', {}, null, 'Sem CNPJ válido para consultar.'), findings: [] };
  const cnpj = onlyDigits(inputs.cnpj);
  const sources: Array<{ name: string; url: string }> = [
    { name: 'brasilapi', url: `https://brasilapi.com.br/api/cnpj/v1/${cnpj}` },
    { name: 'minhareceita', url: `https://minhareceita.org/${cnpj}` },
  ];
  let lastError = 'fonte_indisponivel';
  for (const src of sources) {
    try {
      const { status, json } = await trustedJson(deps, src.url);
      if (status === 404 || (status === 400 && src.name === 'brasilapi')) {
        return { check: mk('cnpj_receita', src.name, 'fail', { encontrado: false }, src.url), findings: [finding('cnpj_receita', 'alta', 'CNPJ não encontrado na Receita Federal', 'A fonte pública respondeu que não existe cadastro para este número.', { cnpj, fonte: src.name }, 'Confira o número do CNPJ e corrija se estiver errado.')] };
      }
      if (status !== 200 || !json) { lastError = `fonte_${status}`; continue; }
      const j = asRecord(json);
      const situacao = clip(j.descricao_situacao_cadastral) || (typeof j.situacao_cadastral === 'string' ? clip(j.situacao_cadastral) : null);
      const qsa = Array.isArray(j.qsa) ? j.qsa.length : null;
      const cnae = clip(j.cnae_fiscal_descricao);
      const measured: Record<string, unknown> = {
        fonte: src.name, encontrado: true, situacao, razao_social: clip(j.razao_social), nome_fantasia: clip(j.nome_fantasia),
        abertura: clip(j.data_inicio_atividade, 10), porte: clip(j.porte) || clip(j.descricao_porte), natureza_juridica: clip(j.natureza_juridica),
        cnae_principal: cnae ? { codigo: typeof j.cnae_fiscal === 'number' || typeof j.cnae_fiscal === 'string' ? String(j.cnae_fiscal).slice(0, 10) : null, descricao: cnae } : null,
        municipio: clip(j.municipio, 80), uf: clip(j.uf, 2), cep: clip(onlyDigits(j.cep), 8), socios_quantidade: qsa,
      };
      for (const k of Object.keys(measured)) if (measured[k] === null || measured[k] === undefined) delete measured[k];
      const findings: Finding[] = [];
      const active = situacao ? /^ativa$/i.test(norm(situacao)) : null;
      if (active === false) findings.push(finding('cnpj_receita', 'alta', `Situação do CNPJ na Receita: ${situacao}`, 'Empresa com situação diferente de ATIVA pode ter restrições para emitir nota, anunciar e contratar.', { situacao, cnpj }, 'Regularize a situação cadastral ou confirme se este é o CNPJ certo.'));
      const facts: CnpjFacts = { situacao: situacao ?? null, municipio: clip(j.municipio, 80), uf: clip(j.uf, 2), abertura: clip(j.data_inicio_atividade, 10) };
      return { check: mk('cnpj_receita', src.name, active === false ? 'warn' : 'ok', measured, src.url), findings, facts };
    } catch (e) { lastError = errMsg(e); }
  }
  return { check: mk('cnpj_receita', 'brasilapi', 'error', {}, null, `Nenhuma fonte respondeu (${lastError}). Nada foi preenchido.`), findings: [] };
}

// ------------------------------------------------------------------------------------------------------------ CEP
export async function checkCep(deps: Deps, inputs: Inputs, cnpj?: CnpjFacts): Promise<Partial1> {
  if (!inputs.ceps.length) return { check: mk('cep', 'brasilapi', 'skipped', {}, null, 'Nenhum CEP encontrado nos endereços informados.'), findings: [] };
  const items: Array<Record<string, unknown>> = [];
  const findings: Finding[] = [];
  let errors = 0;
  for (const cep of inputs.ceps.slice(0, 2)) {
    let done = false;
    for (const src of [{ name: 'brasilapi', url: `https://brasilapi.com.br/api/cep/v2/${cep}` }, { name: 'viacep', url: `https://viacep.com.br/ws/${cep}/json/` }]) {
      try {
        const { status, json } = await trustedJson(deps, src.url);
        const j = asRecord(json);
        if (status === 404 || (src.name === 'viacep' && j.erro)) {
          items.push({ cep, encontrado: false, fonte: src.name });
          findings.push(finding('cep', 'media', `CEP ${cep} não existe nas bases públicas`, 'O CEP digitado não foi encontrado: pode ter sido digitado errado.', { cep, fonte: src.name }, 'Confira o CEP no endereço e corrija.'));
          done = true; break;
        }
        if (status !== 200 || !json) continue;
        const city = clip(j.city) || clip(j.localidade, 80);
        const state = clip(j.state) || clip(j.uf, 2);
        items.push({ cep, encontrado: true, fonte: src.name, cidade: city, uf: state });
        if (cnpj?.municipio && city && norm(city) !== norm(cnpj.municipio)) {
          findings.push(finding('cep', 'info', `O CEP ${cep} é de ${city}, mas o CNPJ está em ${cnpj.municipio}`, 'Pode ser uma filial ou outro endereço da empresa; confira se é isso mesmo.', { cep, cidade_cep: city, municipio_cnpj: cnpj.municipio }, 'Se for filial, tudo certo; se não, corrija o endereço.'));
        }
        done = true; break;
      } catch (_e) { /* tenta a próxima fonte */ }
    }
    if (!done) errors++;
  }
  const status: CheckStatus = errors === Math.min(inputs.ceps.length, 2) ? 'error' : findings.some((f) => f.severity === 'media') ? 'warn' : 'ok';
  return { check: mk('cep', 'brasilapi', status, items.length ? { ceps: items } : {}, null, status === 'error' ? 'Nenhuma fonte de CEP respondeu. Nada foi preenchido.' : null), findings };
}

// ------------------------------------------------------------------------------------------------------------ domínio e DNS
export async function checkDomainRdap(deps: Deps, host: string | null): Promise<Partial1> {
  if (!host) return { check: mk('dominio_rdap', 'rdap', 'skipped', {}, null, 'Sem site informado.'), findings: [] };
  const domain = registrableDomain(host);
  const isBr = domain.endsWith('.br');
  const url = isBr ? `https://rdap.registro.br/domain/${encodeURIComponent(domain)}` : `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  try {
    const { status, json } = await trustedJson(deps, url, 8000, 'application/rdap+json, application/json');
    if (status === 404) {
      return { check: mk('dominio_rdap', isBr ? 'registro.br' : 'rdap.org', 'fail', { dominio: domain, registrado: false }, url), findings: [finding('dominio_rdap', 'alta', `O domínio ${domain} não aparece como registrado`, 'A base oficial de registro respondeu que não encontrou este domínio.', { dominio: domain }, 'Confira se o endereço do site está escrito certo.')] };
    }
    if (status !== 200 || !json) return { check: mk('dominio_rdap', isBr ? 'registro.br' : 'rdap.org', 'error', {}, null, `A base de registro respondeu ${status}. Nada foi preenchido.`), findings: [] };
    const j = asRecord(json);
    const events = Array.isArray(j.events) ? j.events.map(asRecord) : [];
    const at = (action: string) => clip(events.find((e) => e.eventAction === action)?.eventDate, 30);
    const registered = at('registration');
    const expires = at('expiration');
    const measured: Record<string, unknown> = { dominio: domain, registrado: true };
    if (registered) measured.registrado_em = registered;
    if (expires) {
      measured.expira_em = expires;
      const days = Math.floor((Date.parse(expires) - deps.now()) / 86_400_000);
      if (Number.isFinite(days)) measured.dias_para_expirar = days;
    }
    if (Array.isArray(j.status)) measured.status = j.status.filter((s) => typeof s === 'string').slice(0, 6);
    const findings: Finding[] = [];
    const days = measured.dias_para_expirar as number | undefined;
    if (typeof days === 'number' && days < 30) findings.push(finding('dominio_rdap', 'alta', days < 0 ? `O domínio ${domain} está vencido` : `O domínio ${domain} vence em ${days} dia(s)`, 'Domínio vencido tira o site, o e-mail e os anúncios do ar.', { dominio: domain, expira_em: expires, dias: days }, 'Renove o domínio agora no painel do registrador.'));
    else if (typeof days === 'number' && days < 90) findings.push(finding('dominio_rdap', 'media', `O domínio ${domain} vence em ${days} dias`, null, { dominio: domain, expira_em: expires, dias: days }, 'Programe a renovação (de preferência automática, por vários anos).'));
    return { check: mk('dominio_rdap', isBr ? 'registro.br' : 'rdap.org', findings.some((f) => f.severity === 'alta') ? 'fail' : findings.length ? 'warn' : 'ok', measured, url), findings };
  } catch (e) { return { check: mk('dominio_rdap', isBr ? 'registro.br' : 'rdap.org', 'error', {}, null, `${errorText(errMsg(e))} Nada foi preenchido.`), findings: [] }; }
}

async function doh(deps: Deps, name: string, type: string): Promise<Array<{ type: number; data: string }> | null> {
  try {
    const { status, json } = await trustedJson(deps, `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, 6000, 'application/dns-json');
    if (status !== 200 || !json) return null;
    const answer = asRecord(json).Answer;
    return Array.isArray(answer) ? answer.map(asRecord).filter((a) => typeof a.data === 'string').map((a) => ({ type: Number(a.type), data: String(a.data) })) : [];
  } catch { return null; }
}

export async function checkDns(deps: Deps, host: string | null): Promise<Partial1> {
  if (!host) return { check: mk('dns', 'cloudflare-doh', 'skipped', {}, null, 'Sem site informado.'), findings: [] };
  const domain = registrableDomain(host);
  const [a, mx, txt, dmarc] = await Promise.all([doh(deps, host, 'A'), doh(deps, domain, 'MX'), doh(deps, domain, 'TXT'), doh(deps, `_dmarc.${domain}`, 'TXT')]);
  if (a === null && mx === null && txt === null && dmarc === null) return { check: mk('dns', 'cloudflare-doh', 'error', {}, null, 'O serviço de DNS não respondeu. Nada foi preenchido.'), findings: [] };
  const measured: Record<string, unknown> = { dominio: domain, host };
  const findings: Finding[] = [];
  const unq = (s: string) => s.replace(/^"|"$/g, '').replace(/"\s*"/g, '');
  if (a !== null) {
    const ips = a.filter((r) => r.type === 1).map((r) => r.data).slice(0, 5);
    measured.a = ips;
    if (!ips.length && !a.some((r) => r.type === 5)) findings.push(finding('dns', 'alta', `${host} não resolve para nenhum servidor`, 'Sem registro A/CNAME o site não abre.', { host }, 'Confira o apontamento DNS do domínio (registro A ou CNAME).'));
  }
  if (mx !== null) {
    measured.mx = mx.filter((r) => r.type === 15).map((r) => r.data.slice(0, 80)).slice(0, 5);
    if (!(measured.mx as string[]).length) findings.push(finding('dns', 'info', `${domain} não recebe e-mail (sem registro MX)`, 'Só é problema se você usa e-mail com este domínio.', { dominio: domain }, 'Se usa e-mail @' + domain + ', configure os registros MX no DNS.'));
  }
  if (txt !== null) {
    const spf = txt.map((r) => unq(r.data)).find((d) => /^v=spf1\b/i.test(d));
    measured.spf = spf ? spf.slice(0, 200) : null;
    if (!spf && Array.isArray(measured.mx) && (measured.mx as string[]).length) findings.push(finding('dns', 'media', 'E-mail do domínio sem SPF', 'Sem SPF, os e-mails enviados em nome do domínio caem mais no spam e podem ser falsificados.', { dominio: domain }, 'Peça a quem cuida do e-mail para publicar o registro SPF.'));
  }
  if (dmarc !== null) {
    const rec = dmarc.map((r) => unq(r.data)).find((d) => /^v=dmarc1\b/i.test(d));
    const policy = rec ? (/;\s*p=(none|quarantine|reject)/i.exec(rec)?.[1]?.toLowerCase() ?? null) : null;
    measured.dmarc = rec ? { presente: true, politica: policy } : { presente: false };
    if (!rec && Array.isArray(measured.mx) && (measured.mx as string[]).length) findings.push(finding('dns', 'baixa', 'E-mail do domínio sem DMARC', 'O DMARC protege o domínio contra e-mails falsos e melhora a entrega.', { dominio: domain }, 'Publique um DMARC inicial (p=none) e evolua depois.'));
    else if (policy === 'none') findings.push(finding('dns', 'info', 'DMARC em modo monitoramento (p=none)', 'O domínio está monitorando, mas ainda não bloqueia e-mails falsos.', { dominio: domain }, 'Depois de analisar os relatórios, suba para quarantine ou reject.'));
  }
  const status: CheckStatus = findings.some((f) => f.severity === 'alta') ? 'fail' : findings.some((f) => f.severity === 'media' || f.severity === 'baixa') ? 'warn' : 'ok';
  return { check: mk('dns', 'cloudflare-doh', status, measured, null), findings };
}

// ------------------------------------------------------------------------------------------------------------ site
const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
};
const decodeEntities = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const metaTags = (html: string): string[] => html.match(/<meta\b[^>]{0,600}>/gi)?.slice(0, 80) || [];
const metaContent = (html: string, key: string, by: 'name' | 'property' = 'name'): string | null => {
  for (const tag of metaTags(html)) if ((attr(tag, by) || '').toLowerCase() === key) return attr(tag, 'content');
  return null;
};

export function parseHtmlFacts(html: string) {
  const title = /<title[^>]{0,200}>([\s\S]{0,400}?)<\/title>/i.exec(html)?.[1];
  const htmlTag = /<html\b[^>]{0,400}>/i.exec(html)?.[0] || '';
  const canonical = (html.match(/<link\b[^>]{0,500}>/gi) || []).slice(0, 60).find((t) => (attr(t, 'rel') || '').toLowerCase() === 'canonical');
  const types: string[] = [];
  let blocks = 0;
  for (const m of [...html.matchAll(/<script\b[^>]{0,300}type\s*=\s*["']?application\/ld\+json["']?[^>]{0,300}>([\s\S]*?)<\/script>/gi)].slice(0, 12)) {
    blocks++;
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
      for (const n of nodes.slice(0, 30)) {
        const t = n?.['@type'];
        for (const x of Array.isArray(t) ? t : [t]) if (typeof x === 'string' && types.length < 12 && !types.includes(x)) types.push(x.slice(0, 40));
      }
    } catch { /* bloco inválido: conta o bloco, sem tipos */ }
  }
  const robots = (metaContent(html, 'robots') || '').toLowerCase();
  return {
    title: title ? decodeEntities(title).slice(0, 200) : null,
    meta_description: (() => { const d = metaContent(html, 'description'); return d ? decodeEntities(d).slice(0, 400) : null; })(),
    h1_quantidade: (html.match(/<h1\b/gi) || []).length,
    idioma_html: htmlTag ? attr(htmlTag, 'lang') : null,
    viewport: metaContent(html, 'viewport') !== null,
    canonical: canonical ? attr(canonical, 'href')?.slice(0, 300) ?? null : null,
    og_title: metaContent(html, 'og:title', 'property') !== null,
    og_image: metaContent(html, 'og:image', 'property') !== null,
    noindex: /\bnoindex\b/.test(robots),
    json_ld_blocos: blocks,
    json_ld_tipos: types,
  };
}

const SERVER_DEFAULT_TITLES = [/^index of \//i, /welcome to nginx/i, /apache2? .{0,40}default page/i, /^it works!?$/i, /test page for the apache/i, /default web site page/i, /^iis windows server$/i, /^domain default page$/i];

export async function checkSite(deps: Deps, site: { origin: string; host: string } | null): Promise<Partial1> {
  if (!site) return { check: mk('site_resposta', 'visita-direta', 'skipped', {}, null, 'Nenhum site válido informado.'), findings: [] };
  const findings: Finding[] = [];
  const measured: Record<string, unknown> = { endereco: site.origin };
  let visit: Visit;
  try {
    visit = await guardedFetch(deps, `${site.origin}/`, { maxBytes: 512 * 1024, timeoutMs: 10_000 });
  } catch (e) {
    const code = errMsg(e);
    return { check: mk('site_resposta', 'visita-direta', 'fail', measured, site.origin, `${errorText(code)} Nada foi preenchido.`), findings: [finding('site_resposta', 'alta', `Não foi possível abrir ${site.host}`, `${errorText(code)} Se o site abre no seu navegador, ele pode estar bloqueando visitas automáticas.`, { endereco: site.origin, motivo: code }, 'Confira se o endereço está certo e se o site está no ar.')] };
  }
  measured.status_http = visit.status;
  measured.endereco_final = visit.finalUrl;
  measured.redirecionamentos = visit.hops.length - 1;
  measured.https_final = visit.finalUrl.startsWith('https://');
  measured.tempo_primeiro_byte_ms = visit.ttfbMs;
  measured.tempo_total_ms = visit.totalMs;
  measured.tipo_conteudo = clip(visit.headers.get('content-type'), 80);
  measured.bytes_lidos = visit.bytes;
  measured.leitura_cortada = visit.truncated;
  // http -> https (visita separada, curta)
  try {
    const http = await guardedFetch(deps, `http://${site.host}/`, { maxBytes: 1024, timeoutMs: 8000 });
    measured.http_redireciona_para_https = http.finalUrl.startsWith('https://');
  } catch { /* não medido: o campo fica de fora */ }

  if (visit.status >= 400) findings.push(finding('site_resposta', 'alta', `A página inicial respondeu erro ${visit.status}`, null, { status: visit.status }, 'Corrija o erro do servidor ou da página inicial.'));
  if (!measured.https_final) findings.push(finding('site_resposta', 'alta', 'O site não termina em HTTPS', 'Sem HTTPS o navegador avisa "não seguro" e o Google rebaixa o site.', { endereco_final: visit.finalUrl }, 'Instale o certificado e force o redirecionamento para HTTPS.'));
  else if (measured.http_redireciona_para_https === false) findings.push(finding('site_resposta', 'media', 'A versão http:// não redireciona para https://', null, {}, 'Force o redirecionamento de http para https.'));
  if (visit.ttfbMs > 3000) findings.push(finding('site_resposta', 'alta', `Servidor lento: ${visit.ttfbMs} ms até o primeiro byte`, 'Acima de 3 segundos o visitante desiste e o Google penaliza.', { ttfb_ms: visit.ttfbMs }, 'Revise hospedagem, cache e plugins.'));
  else if (visit.ttfbMs > 1500) findings.push(finding('site_resposta', 'media', `Servidor lento: ${visit.ttfbMs} ms até o primeiro byte`, 'O ideal é abaixo de 800 ms.', { ttfb_ms: visit.ttfbMs }, 'Ative cache de página e revise a hospedagem.'));

  const isHtml = /html/i.test(String(measured.tipo_conteudo || '')) || /<html|<!doctype/i.test(visit.text.slice(0, 1000));
  if (visit.status < 400 && isHtml) {
    const facts = parseHtmlFacts(visit.text);
    measured.html = facts;
    const ev = { endereco: visit.finalUrl };
    if (facts.title && SERVER_DEFAULT_TITLES.some((re) => re.test(facts.title as string))) findings.push(finding('site_resposta', 'alta', 'A página inicial é uma página padrão do servidor, não um site publicado', `O título da página é "${facts.title}": o servidor está no ar, mas ainda não há site nesse endereço.`, { ...ev, titulo: facts.title }, 'Publique o site (ou aponte o domínio para o lugar certo).'));
    if (facts.noindex) findings.push(finding('site_resposta', 'alta', 'A página inicial pede para NÃO ser indexada (noindex)', 'Com noindex o Google não mostra o site nos resultados.', ev, 'Remova a marcação noindex da página inicial.'));
    if (!facts.title) findings.push(finding('site_resposta', 'alta', 'A página inicial não tem título (<title>)', null, ev, 'Defina um título com o nome e o que a empresa faz.'));
    else if (facts.title.length > 65 || facts.title.length < 15) findings.push(finding('site_resposta', 'baixa', `Título com ${facts.title.length} caracteres`, 'O ideal fica entre 15 e 65 caracteres.', { ...ev, titulo: facts.title }, 'Ajuste o título para caber nos resultados do Google.'));
    if (!facts.meta_description) findings.push(finding('site_resposta', 'media', 'Sem meta description', 'É o texto que aparece abaixo do título no Google.', ev, 'Escreva uma descrição de 70 a 160 caracteres.'));
    if (facts.h1_quantidade === 0) findings.push(finding('site_resposta', 'baixa', 'A página inicial não tem título principal (H1)', null, ev, 'Use um único H1 com o assunto principal.'));
    else if (facts.h1_quantidade > 1) findings.push(finding('site_resposta', 'baixa', `A página inicial tem ${facts.h1_quantidade} títulos H1`, null, ev, 'Deixe só um H1 por página.'));
    if (!facts.viewport) findings.push(finding('site_resposta', 'media', 'Sem meta viewport (site pode não ser adaptado ao celular)', null, ev, 'Adicione a meta viewport e confira o layout no celular.'));
    if (!facts.idioma_html) findings.push(finding('site_resposta', 'baixa', 'Idioma da página não declarado (lang)', null, ev, 'Declare lang="pt-BR" no HTML.'));
    if (!facts.canonical) findings.push(finding('site_resposta', 'baixa', 'Sem link canônico', null, ev, 'Defina a URL canônica para evitar páginas duplicadas.'));
    if (facts.json_ld_blocos === 0) findings.push(finding('site_resposta', 'baixa', 'Sem dados estruturados (JSON-LD)', 'Dados estruturados ajudam o Google e as IAs a entender quem é a empresa.', ev, 'Adicione Organization/LocalBusiness em JSON-LD.'));
  } else if (visit.status < 400 && !isHtml) {
    findings.push(finding('site_resposta', 'media', 'A página inicial não devolveu HTML', null, { tipo_conteudo: measured.tipo_conteudo }, 'Confira o que o endereço está entregando.'));
  }
  const status: CheckStatus = findings.some((f) => f.severity === 'alta') ? 'fail' : findings.some((f) => f.severity === 'media') ? 'warn' : 'ok';
  return { check: mk('site_resposta', 'visita-direta', status, measured, visit.finalUrl), findings };
}

// ------------------------------------------------------------------------------------------------------------ robots, sitemap, llms.txt
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'PerplexityBot', 'CCBot'];

export function parseRobots(text: string) {
  const groups: Array<{ agents: string[]; disallow: string[]; allow: string[] }> = [];
  const sitemaps: string[] = [];
  let cur: { agents: string[]; disallow: string[]; allow: string[] } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/).slice(0, 2000)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'sitemap') { if (/^https?:\/\//i.test(val) && sitemaps.length < 10) sitemaps.push(val.slice(0, 300)); continue; }
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], disallow: [], allow: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'disallow') cur.disallow.push(val);
    else if (key === 'allow') cur.allow.push(val);
  }
  const blocksAll = (g?: { disallow: string[]; allow: string[] }) => !!g && g.disallow.includes('/') && !g.allow.includes('/');
  const star = groups.find((g) => g.agents.includes('*'));
  const aiBots: Record<string, string> = {};
  for (const bot of AI_BOTS) {
    const own = groups.find((g) => g.agents.includes(bot.toLowerCase()));
    aiBots[bot] = own ? (blocksAll(own) ? 'bloqueado' : 'permitido') : (blocksAll(star) ? 'bloqueado_pela_regra_geral' : 'nao_citado');
  }
  return { sitemaps, disallowAll: blocksAll(star), aiBots };
}

export async function checkRobots(deps: Deps, site: { origin: string; host: string } | null): Promise<Partial1 & { sitemaps?: string[] }> {
  if (!site) return { check: mk('robots_txt', 'visita-direta', 'skipped', {}, null, 'Nenhum site válido informado.'), findings: [] };
  const url = `${site.origin}/robots.txt`;
  try {
    const v = await guardedFetch(deps, url, { maxBytes: 256 * 1024, timeoutMs: 8000, accept: 'text/plain,*/*;q=0.5' });
    const ct = v.headers.get('content-type') || '';
    if (v.status === 404 || v.status === 410 || (v.status === 200 && /html/i.test(ct))) {
      return { check: mk('robots_txt', 'visita-direta', 'warn', { encontrado: false, status_http: v.status }, url), findings: [finding('robots_txt', 'baixa', 'O site não tem robots.txt', 'Sem robots.txt os buscadores seguem regras padrão e você não indica onde está o sitemap.', {}, 'Publique um robots.txt apontando para o sitemap.')], sitemaps: [] };
    }
    if (v.status !== 200) return { check: mk('robots_txt', 'visita-direta', 'error', { status_http: v.status }, url, `O robots.txt respondeu ${v.status}. Nada foi preenchido.`), findings: [] };
    const r = parseRobots(v.text);
    const blockedAi = Object.entries(r.aiBots).filter(([, s]) => s.startsWith('bloqueado')).map(([b]) => b);
    const findings: Finding[] = [];
    if (r.disallowAll) findings.push(finding('robots_txt', 'alta', 'O robots.txt bloqueia o site inteiro para todos os buscadores', 'Com "Disallow: /" para todos os robôs, o site não aparece no Google.', { endereco: url }, 'Remova a regra "Disallow: /" para o público (user-agent *).'));
    if (!r.disallowAll && blockedAi.length) findings.push(finding('robots_txt', 'info', `Robôs de IA bloqueados: ${blockedAi.join(', ')}`, 'Bloquear robôs de IA impede que as IAs citem o site. É uma decisão sua: pode ser proposital.', { robos: blockedAi }, 'Se quer ser citado pelas IAs, libere esses robôs.'));
    return { check: mk('robots_txt', 'visita-direta', r.disallowAll ? 'fail' : 'ok', { encontrado: true, sitemaps_declarados: r.sitemaps, bloqueia_tudo: r.disallowAll, robos_de_ia: r.aiBots }, url), findings, sitemaps: r.sitemaps };
  } catch (e) { return { check: mk('robots_txt', 'visita-direta', 'error', {}, url, `${errorText(errMsg(e))} Nada foi preenchido.`), findings: [], sitemaps: [] }; }
}

export async function checkSitemap(deps: Deps, site: { origin: string; host: string } | null, declared: string[], inputs: Inputs): Promise<Partial1> {
  if (!site) return { check: mk('sitemap', 'visita-direta', 'skipped', {}, null, 'Nenhum site válido informado.'), findings: [] };
  const candidates = [...new Set([...declared.filter((u) => { try { return new URL(u).hostname.replace(/^www\./, '') === site.host.replace(/^www\./, ''); } catch { return false; } }), `${site.origin}/sitemap.xml`, `${site.origin}/sitemap_index.xml`, `${site.origin}/wp-sitemap.xml`])].slice(0, 5);
  for (const url of candidates) {
    try {
      const v = await guardedFetch(deps, url, { maxBytes: 2 * 1024 * 1024, timeoutMs: 10_000, accept: 'application/xml,text/xml,*/*;q=0.5' });
      if (v.status !== 200 || !/<(urlset|sitemapindex)\b/i.test(v.text.slice(0, 5000))) continue;
      const isIndex = /<sitemapindex\b/i.test(v.text.slice(0, 5000));
      const locs = (v.text.match(/<loc>/gi) || []).length;
      return { check: mk('sitemap', 'visita-direta', 'ok', { encontrado: true, endereco: url, tipo: isIndex ? 'indice' : 'urls', quantidade_de_enderecos: locs, leitura_cortada: v.truncated }, url), findings: [] };
    } catch (_e) { /* tenta o próximo endereço */ }
  }
  const findings = [finding('sitemap', 'media', 'Nenhum sitemap encontrado', inputs.sitemapDeclared === 'yes' ? 'Você respondeu que tem um sitemap, mas ele não foi encontrado nos endereços comuns.' : 'O sitemap ajuda o Google a descobrir todas as páginas.', { testados: candidates.length }, 'Gere o sitemap (o Rank Math e o Yoast fazem isso) e informe-o no robots.txt.')];
  return { check: mk('sitemap', 'visita-direta', 'warn', { encontrado: false, testados: candidates.length }, null), findings };
}

export async function checkLlmsTxt(deps: Deps, site: { origin: string; host: string } | null): Promise<Partial1> {
  if (!site) return { check: mk('llms_txt', 'visita-direta', 'skipped', {}, null, 'Nenhum site válido informado.'), findings: [] };
  const url = `${site.origin}/llms.txt`;
  try {
    const v = await guardedFetch(deps, url, { maxBytes: 128 * 1024, timeoutMs: 8000, accept: 'text/plain,text/markdown,*/*;q=0.5' });
    const found = v.status === 200 && !/html/i.test(v.headers.get('content-type') || '') && v.text.trim().length > 20;
    if (found) return { check: mk('llms_txt', 'visita-direta', 'ok', { encontrado: true, bytes: v.bytes }, url), findings: [] };
    return { check: mk('llms_txt', 'visita-direta', 'warn', { encontrado: false, status_http: v.status }, url), findings: [finding('llms_txt', 'info', 'O site não tem llms.txt', 'É um arquivo que resume o site para as IAs (ainda é um padrão novo e opcional).', {}, 'Publique um llms.txt com a descrição do negócio e os links principais.')] };
  } catch (e) { return { check: mk('llms_txt', 'visita-direta', 'error', {}, url, `${errorText(errMsg(e))} Nada foi preenchido.`), findings: [] }; }
}

// ------------------------------------------------------------------------------------------------------------ idade do site (Wayback)
export async function checkWayback(deps: Deps, host: string | null): Promise<Partial1> {
  if (!host) return { check: mk('site_idade', 'wayback', 'skipped', {}, null, 'Sem site informado.'), findings: [] };
  const domain = registrableDomain(host);
  const url = `https://archive.org/wayback/available?url=${encodeURIComponent(domain)}&timestamp=19960101`;
  try {
    const { status, json } = await trustedJson(deps, url, 10_000);
    if (status !== 200 || !json) return { check: mk('site_idade', 'wayback', 'error', {}, null, `O Wayback respondeu ${status}. Nada foi preenchido.`), findings: [] };
    const snap = asRecord(asRecord(asRecord(json).archived_snapshots).closest);
    const ts = typeof snap.timestamp === 'string' && /^\d{14}$/.test(snap.timestamp) ? snap.timestamp : null;
    if (!ts) return { check: mk('site_idade', 'wayback', 'ok', { registro_encontrado: false }, url), findings: [finding('site_idade', 'info', 'O Wayback Machine não tem registro deste domínio', 'Pode ser um site novo ou que nunca foi arquivado; isso não é um erro.', { dominio: domain }, null)] };
    const first = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
    const years = Math.floor((deps.now() - Date.parse(first)) / (365.25 * 86_400_000));
    return { check: mk('site_idade', 'wayback', 'ok', { registro_encontrado: true, primeiro_registro: first, anos_com_registro: Number.isFinite(years) ? years : null }, url), findings: [] };
  } catch (e) { return { check: mk('site_idade', 'wayback', 'error', {}, null, `${errorText(errMsg(e))} Nada foi preenchido.`), findings: [] }; }
}

// ------------------------------------------------------------------------------------------------------------ redes (só formato)
export function checkSocials(inputs: Inputs): Partial1 {
  const entries = Object.entries(inputs.socials).filter(([, v]) => v && v.trim());
  if (!entries.length) return { check: mk('redes_formato', 'local', 'skipped', {}, null, 'Nenhuma rede informada.'), findings: [] };
  const items: Array<Record<string, unknown>> = [];
  const findings: Finding[] = [];
  for (const [network, raw] of entries.slice(0, 8)) {
    const hosts = SOCIAL_HOSTS[network];
    const text = raw.trim().split(/\s+/)[0];
    const parsed = parseSafeUrl(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if ('error' in parsed || !hosts) { items.push({ rede: network, formato_valido: false, verificacao: 'nao_acessada' }); findings.push(finding('redes_formato', 'media', `O link de ${network} não é um endereço válido`, null, { rede: network }, 'Cole o endereço completo do perfil.')); continue; }
    const host = parsed.url.hostname.toLowerCase().replace(/^www\.|^m\./, '');
    const hostOk = hosts.some((h) => host === h || host.endsWith(`.${h}`));
    const path = parsed.url.pathname.replace(/\/+$/, '');
    if (!hostOk) { items.push({ rede: network, formato_valido: false, motivo: 'dominio_diferente', verificacao: 'nao_acessada' }); findings.push(finding('redes_formato', 'media', `O link informado em ${network} não é do ${network}`, `O endereço aponta para ${host}.`, { rede: network, dominio: host }, 'Troque pelo endereço do perfil dentro da própria rede.')); continue; }
    if (!path || path === '') { items.push({ rede: network, formato_valido: false, motivo: 'sem_perfil', verificacao: 'nao_acessada' }); findings.push(finding('redes_formato', 'baixa', `O link de ${network} aponta para a página inicial, não para um perfil`, null, { rede: network }, 'Cole o endereço do perfil (com o nome de usuário).')); continue; }
    items.push({ rede: network, formato_valido: true, verificacao: 'nao_acessada' });
  }
  return { check: mk('redes_formato', 'local', findings.length ? 'warn' : 'ok', { redes: items, observacao: 'Só o formato do link é conferido. As redes não são acessadas.' }, null), findings };
}

// ------------------------------------------------------------------------------------------------------------ orquestração
export const PAID_CHECKS = [
  { check_key: 'maps_google_meu_negocio', source: 'serper-maps', reason: 'Consulta paga (Google Maps por Serper): não executada nesta etapa; exige liberação de custo.' },
  { check_key: 'ia_marca', source: 'observatorio', reason: 'Perguntas às IAs sobre a marca (paga): não executada nesta etapa; exige liberação de custo.' },
];

export async function runAnalysis(deps: Deps, inputs: Inputs): Promise<{ checks: CheckResult[]; findings: Finding[]; summary: Record<string, unknown> }> {
  const site = normalizeSiteInput(inputs.siteUrl);
  const timed = async (fn: () => Promise<Partial1>, key: string, source: string): Promise<Partial1 & { duration_ms: number }> => {
    const t0 = deps.now();
    try {
      const r = await fn();
      return { ...r, duration_ms: Math.max(0, deps.now() - t0) };
    } catch (e) {
      return { check: mk(key, source, 'error', {}, null, `${errorText(errMsg(e))} Nada foi preenchido.`), findings: [], duration_ms: Math.max(0, deps.now() - t0) };
    }
  };
  const cnpjFormat = await checkCnpjFormat(inputs);
  const [cnpjRes, rdap, dns, siteRes, robots, llms, wayback] = await Promise.all([
    timed(() => checkCnpjReceita(deps, inputs), 'cnpj_receita', 'brasilapi'),
    timed(() => checkDomainRdap(deps, site?.host ?? null), 'dominio_rdap', 'rdap'),
    timed(() => checkDns(deps, site?.host ?? null), 'dns', 'cloudflare-doh'),
    timed(() => checkSite(deps, site), 'site_resposta', 'visita-direta'),
    timed(() => checkRobots(deps, site), 'robots_txt', 'visita-direta'),
    timed(() => checkLlmsTxt(deps, site), 'llms_txt', 'visita-direta'),
    timed(() => checkWayback(deps, site?.host ?? null), 'site_idade', 'wayback'),
  ]);
  const cepRes = await timed(() => checkCep(deps, inputs, (cnpjRes as { facts?: CnpjFacts }).facts), 'cep', 'brasilapi');
  const sitemapRes = await timed(() => checkSitemap(deps, site, (robots as { sitemaps?: string[] }).sitemaps || [], inputs), 'sitemap', 'visita-direta');
  const social = checkSocials(inputs);
  const parts: Array<Partial1 & { duration_ms?: number }> = [
    { ...cnpjFormat, duration_ms: 0 }, cnpjRes, cepRes, rdap, dns, siteRes, robots, sitemapRes, llms, wayback, { ...social, duration_ms: 0 },
  ];
  const checks: CheckResult[] = parts.map((p) => ({ ...p.check, duration_ms: p.duration_ms ?? 0 }));
  for (const p of PAID_CHECKS) checks.push({ ...mk(p.check_key, p.source, 'skipped', {}, null, p.reason), duration_ms: 0 });
  const findings = parts.flatMap((p) => p.findings).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const counts: Record<CheckStatus, number> = { ok: 0, warn: 0, fail: 0, skipped: 0, error: 0 };
  for (const c of checks) counts[c.status]++;
  const bySeverity: Record<Severity, number> = { alta: 0, media: 0, baixa: 0, info: 0 };
  for (const f of findings) bySeverity[f.severity]++;
  const summary = {
    version: ANALYZE_VERSION,
    inputs: { cnpj: inputs.cnpj ? onlyDigits(inputs.cnpj) : null, site: site?.origin ?? null, ceps: inputs.ceps, redes: Object.keys(inputs.socials).filter((k) => inputs.socials[k]) },
    checks: counts, findings: bySeverity,
    pagas: { executadas: false, motivo: 'As verificações pagas (Google Maps e perguntas às IAs) não rodam nesta etapa.' },
  };
  return { checks, findings, summary };
}

/** Estado final da execução a partir dos resultados. */
export function runStatus(checks: CheckResult[]): 'done' | 'partial' | 'failed' {
  const real = checks.filter((c) => c.status !== 'skipped');
  if (!real.length) return 'done';
  if (real.every((c) => c.status === 'error')) return 'failed';
  return real.some((c) => c.status === 'error') ? 'partial' : 'done';
}

