/**
 * Chamadas aos buscadores (todas GRATUITAS): Search Console URL Inspection (somente leitura), IndexNow e Bing Webmaster (envio de URLs).
 * Nenhuma chave aparece em resposta, evento ou log. Tudo recebe `fetchFn` por parâmetro (teste sem rede).
 *
 * O que NÃO existe (e a tela diz): pedir ao Google para indexar uma página comum. A Indexing API do Google só vale para vagas (JobPosting)
 * e transmissões ao vivo (BroadcastEvent); o URL Inspection é somente leitura. IndexNow não inclui o Google.
 */
import { getGscAccessToken, googleErrorDetail, readJson } from './nexus-gsc.ts';
import { BING_API_BASE, bingRequest, bingGetUserSites } from './nexus-bing.ts';
import { parseInspection, type InspectionState } from './indexation-core.ts';

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const URL_INSPECTION_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const TIMEOUT_MS = 30_000;

// ------------------------------------------------------------------------------------------------------------ Google (URL Inspection)
export type InspectResult = { ok: true; result: InspectionState } | { ok: false; error: 'gsc_auth_failed' | 'gsc_credential_invalid' | 'gsc_forbidden' | 'gsc_quota' | 'gsc_unreachable' | 'gsc_request_failed' | 'gsc_unreadable'; status: number; detail?: string };

/** Consulta o estado de UMA URL no Google. `secret` é o segredo do projeto (`oauth-access:<token>` ou conta de serviço). */
export async function googleInspect(fetchFn: typeof fetch, secret: string, property: string, url: string, now: () => number = Date.now, languageCode = 'en-US'): Promise<InspectResult> {
  const tok = await getGscAccessToken(fetchFn, secret, { now });
  if (tok.ok === false) return { ok: false, error: (tok.error as 'gsc_auth_failed'), status: tok.status, detail: tok.detail };
  let res: Response;
  try {
    res = await fetchFn(URL_INSPECTION_ENDPOINT, {
      method: 'POST', headers: { Authorization: `Bearer ${tok.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: property, languageCode }), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch { return { ok: false, error: 'gsc_unreachable', status: 0 }; }
  const json = await readJson(res);
  if (res.status === 429) return { ok: false, error: 'gsc_quota', status: 429, detail: googleErrorDetail(json) };
  if (res.status === 401 || res.status === 403 || res.status === 404) return { ok: false, error: 'gsc_forbidden', status: res.status, detail: googleErrorDetail(json) };
  if (res.status >= 500) return { ok: false, error: 'gsc_unreachable', status: res.status };
  if (!res.ok) return { ok: false, error: 'gsc_request_failed', status: res.status, detail: googleErrorDetail(json) };
  const parsed = parseInspection(json);
  return parsed ? { ok: true, result: parsed } : { ok: false, error: 'gsc_unreadable', status: res.status };
}

// ------------------------------------------------------------------------------------------------------------ IndexNow
export interface IndexNowPayload { host: string; key: string; keyLocation: string; urlList: string[] }
export interface IndexNowResult { ok: boolean; status: number; state: 'aceita' | 'recusada' | 'erro'; message: string }

const INDEXNOW_TEXT: Record<number, string> = {
  200: 'Recebido pelo IndexNow. Isso NÃO é "indexado": é só "recebido".',
  202: 'Aceito pelo IndexNow; a verificação da chave ainda está pendente do lado deles. Isso NÃO é "indexado".',
  400: 'O IndexNow recusou o formato do pedido.',
  403: 'O IndexNow não validou a chave (o arquivo da chave não foi encontrado ou não confere).',
  422: 'O IndexNow recusou: as URLs não pertencem ao host da chave, ou a chave não confere.',
  429: 'O IndexNow pediu para diminuir o ritmo (muitos pedidos). Tente de novo mais tarde.',
};
/** Um POST ao IndexNow (até 10.000 URLs). 200 e 202 são "aceita"; 4xx são "recusada"; o resto é "erro". */
export async function submitIndexNow(fetchFn: typeof fetch, payload: IndexNowPayload): Promise<IndexNowResult> {
  let res: Response;
  try {
    res = await fetchFn(INDEXNOW_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch { return { ok: false, status: 0, state: 'erro', message: 'Não foi possível falar com o IndexNow agora.' }; }
  void res.body?.cancel?.().catch(() => undefined);
  const accepted = res.status === 200 || res.status === 202;
  return { ok: accepted, status: res.status, state: accepted ? 'aceita' : res.status >= 400 && res.status < 500 ? 'recusada' : 'erro', message: INDEXNOW_TEXT[res.status] || `O IndexNow respondeu ${res.status}.` };
}

// ------------------------------------------------------------------------------------------------------------ Bing Webmaster
export type BingQuota = { daily: number | null; monthly: number | null };
export type BingError = 'bing_unauthorized' | 'bing_unreachable' | 'bing_invalid_request' | 'bing_site_not_found';

/** Cota de envio de URLs lida pela API (GetUrlSubmissionQuota). Campo ausente = null (não inventamos número). */
export async function bingQuota(fetchFn: typeof fetch, apiKey: string, siteUrl: string): Promise<{ ok: true; quota: BingQuota } | { ok: false; error: BingError; status: number }> {
  const r = await bingRequest(fetchFn, apiKey, 'GetUrlSubmissionQuota', { siteUrl });
  if (r.ok === false) return { ok: false, error: r.error, status: r.status };
  const d = r.d as { DailyQuota?: unknown; MonthlyQuota?: unknown };
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  return { ok: true, quota: { daily: n(d?.DailyQuota), monthly: n(d?.MonthlyQuota) } };
}

/** Qual site verificado do Bing cobre o host (o endereço exato do cadastro do Bing é o que vale). */
export async function bingSiteFor(fetchFn: typeof fetch, apiKey: string, host: string): Promise<{ ok: true; siteUrl: string } | { ok: false; error: BingError; status: number }> {
  const r = await bingGetUserSites(fetchFn, apiKey);
  if (r.ok === false) return { ok: false, error: r.error, status: r.status };
  const h = host.toLowerCase();
  const hit = r.sites.find((s) => { try { return new URL(s.url).hostname.toLowerCase() === h && s.isVerified; } catch { return false; } });
  return hit ? { ok: true, siteUrl: hit.url } : { ok: false, error: 'bing_site_not_found', status: 404 };
}

/** Envia um lote (até 500 URLs) pelo SubmitUrlBatch. 200 = aceito pelo Bing (não é "indexado"). */
export async function bingSubmitBatch(fetchFn: typeof fetch, apiKey: string, siteUrl: string, urls: string[]): Promise<{ ok: boolean; status: number; error?: BingError; detail?: string }> {
  let res: Response;
  try {
    res = await fetchFn(`${BING_API_BASE}/SubmitUrlBatch?${new URLSearchParams({ apikey: apiKey }).toString()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' }, body: JSON.stringify({ siteUrl, urlList: urls }), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch { return { ok: false, status: 0, error: 'bing_unreachable' }; }
  const json = (await readJson(res)) as { Message?: unknown; ErrorCode?: unknown } | null;
  const detail = typeof json?.Message === 'string' ? json.Message.slice(0, 200) : undefined;
  if (res.status === 401 || res.status === 403 || json?.ErrorCode === 3 || json?.ErrorCode === 14) return { ok: false, status: res.status, error: 'bing_unauthorized', detail };
  if (res.status >= 500 || res.status === 429) return { ok: false, status: res.status, error: 'bing_unreachable', detail };
  if (!res.ok || typeof json?.ErrorCode === 'number') return { ok: false, status: res.status, error: 'bing_invalid_request', detail };
  return { ok: true, status: res.status };
}
