/**
 * Zica Signals - Cloudflare Worker.
 * Passa a requisicao adiante sem alterar a resposta. Se o User-Agent for um robo de IA conhecido,
 * agrega a contagem em memoria (por isolate) e envia um lote assinado (HMAC-SHA256) a cada 60 s.
 *
 * Nao registra IP, User-Agent completo nem cookies: apenas dia|tipo|agente|caminho (sem query).
 * Segredo: wrangler secret put ZICA_SIGNALS_SECRET (nunca no codigo nem no wrangler.toml).
 * Assinatura igual ao plugin: hex(hmac_sha256(secret, ts + "\n" + nonce + "\n" + sha256hex(body))).
 */

// BEGIN signals-catalog (gerado de signals-catalog.json - nao editar a mao)
const C = {"b":["meta-externalagent","Applebot-Extended","Claude-SearchBot","Perplexity-User","Google-Extended","Googlebot-Image","Googlebot-Video","OAI-SearchBot","PerplexityBot","DuckAssistBot","ChatGPT-User","anthropic-ai","Claude-User","Bytespider","ClaudeBot","Googlebot","cohere-ai","Amazonbot","Applebot","Bingbot","GPTBot","CCBot"],"a":[["chatgpt.com",["chatgpt.com","chat.openai.com","openai.com"]],["perplexity.ai",["perplexity.ai"]],["gemini.google.com",["gemini.google.com","bard.google.com"]],["copilot.microsoft.com",["copilot.microsoft.com"]],["claude.ai",["claude.ai"]],["you.com",["you.com"]],["poe.com",["poe.com"]],["meta.ai",["meta.ai"]],["grok.com",["grok.com","x.ai"]]],"c":[["duckduckgo.com","duckduckgo.com",{"ia":"chat"},null],["bing.com","copilot.microsoft.com",null,["/chat","/copilot"]]],"u":{"chatgpt.com":"chatgpt.com","perplexity":"perplexity.ai","gemini":"gemini.google.com","copilot":"copilot.microsoft.com","claude":"claude.ai"},"s":[["google","(^|\\.)google\\.[a-z.]{2,6}$"],["bing","(^|\\.)bing\\.com$"],["duckduckgo","(^|\\.)duckduckgo\\.com$"],["yahoo","(^|\\.)yahoo\\.[a-z.]{2,6}$"],["yandex","(^|\\.)yandex\\.[a-z.]{2,6}$"],["ecosia","(^|\\.)ecosia\\.org$"],["baidu","(^|\\.)baidu\\.com$"]]};
// END signals-catalog

const FLUSH_INTERVAL_MS = 60000;
const BATCH_MAX_EVENTS = 500;
const BUFFER_MAX_KEYS = 2000;

const state = { buffer: new Map(), lastFlush: Date.now(), flushing: false };
const enc = new TextEncoder();

function hex(buf) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function hostIs(host, list) {
  return list.some((h) => host === h || host.endsWith('.' + h));
}

function detectBot(ua) {
  if (!ua) return null;
  const low = ua.toLowerCase();
  for (const name of C.b) if (low.includes(name.toLowerCase())) return name;
  return null;
}

function classifyReferrer(request, url) {
  const utm = (url.searchParams.get('utm_source') || url.searchParams.get('ref') || '').toLowerCase();
  if (utm && C.u[utm]) return ['ai_referral', C.u[utm]];
  const ref = request.headers.get('referer');
  if (!ref) return null;
  let r;
  try { r = new URL(ref); } catch (e) { return null; }
  const host = r.hostname.toLowerCase().replace(/^www\./, '');
  if (!host || host === url.hostname.toLowerCase().replace(/^www\./, '')) return null;
  for (const [agent, hosts] of C.a) if (hostIs(host, hosts)) return ['ai_referral', agent];
  for (const [h, agent, query, prefixes] of C.c) {
    if (!hostIs(host, [h])) continue;
    if (query) for (const k of Object.keys(query)) if (r.searchParams.get(k) === query[k]) return ['ai_referral', agent];
    if (prefixes) for (const p of prefixes) if (r.pathname.startsWith(p)) return ['ai_referral', agent];
  }
  for (const [agent, pattern] of C.s) if (new RegExp(pattern, 'i').test(host)) return ['search_referral', agent];
  return null;
}

function today(env) {
  const tz = env.ZICA_SIGNALS_TZ || 'America/Sao_Paulo';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function record(env, kind, agent, path) {
  const safePath = (path || '/').replace(/[^\x20-\x7E]/g, '').replace(/\|/g, '%7C').slice(0, 200) || '/';
  const key = [today(env), kind, agent, safePath].join('|');
  const cur = state.buffer.get(key);
  if (cur !== undefined) state.buffer.set(key, Math.min(100000, cur + 1));
  else if (state.buffer.size < BUFFER_MAX_KEYS) state.buffer.set(key, 1);
}

function endpointAllowed(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:';
  } catch (e) { return false; }
}

async function flush(env, siteHost) {
  const siteId = env.ZICA_SIGNALS_SITE_ID;
  const secret = env.ZICA_SIGNALS_SECRET;
  const endpoint = env.ZICA_SIGNALS_ENDPOINT;
  if (!siteId || !secret || !endpoint || !endpointAllowed(endpoint) || state.flushing || state.buffer.size === 0) return;
  state.flushing = true;
  state.lastFlush = Date.now();
  const snapshot = Array.from(state.buffer.entries());
  state.buffer = new Map();
  const failed = [];
  try {
    for (let i = 0; i < snapshot.length; i += BATCH_MAX_EVENTS) {
      const chunk = snapshot.slice(i, i + BATCH_MAX_EVENTS);
      const events = chunk.map(([key, hits]) => {
        const [day, kind, agent, ...rest] = key.split('|');
        return { day, kind, agent, path: rest.join('|'), hits };
      });
      const body = JSON.stringify({ site_host: siteHost, batch_id: crypto.randomUUID(), events });
      const ts = String(Math.floor(Date.now() / 1000));
      const nonce = crypto.randomUUID();
      const signature = await hmacHex(secret, ts + '\n' + nonce + '\n' + (await sha256Hex(body)));
      let ok = false;
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          redirect: 'manual',
          headers: {
            'Content-Type': 'application/json',
            'X-Zica-Site': siteId,
            'X-Zica-Timestamp': ts,
            'X-Zica-Nonce': nonce,
            'X-Zica-Signature': signature,
          },
          body,
        });
        ok = res.status >= 200 && res.status < 300;
      } catch (e) { ok = false; }
      if (!ok) failed.push(...chunk);
    }
  } finally {
    // devolve ao buffer o que nao foi aceito (soma com o que chegou durante o envio)
    for (const [key, hits] of failed) {
      const cur = state.buffer.get(key) || 0;
      if (cur || state.buffer.size < BUFFER_MAX_KEYS) state.buffer.set(key, Math.min(100000, cur + hits));
    }
    state.flushing = false;
  }
}

export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request);
    try {
      if (request.method === 'GET' || request.method === 'HEAD') {
        const url = new URL(request.url);
        let hit = null;
        const bot = detectBot(request.headers.get('user-agent'));
        if (bot) hit = ['ai_bot_hit', bot];
        else if (env.ZICA_SIGNALS_REFERRALS === '1') hit = classifyReferrer(request, url);
        if (hit) record(env, hit[0], hit[1], url.pathname);
        if (state.buffer.size > 0 && Date.now() - state.lastFlush >= FLUSH_INTERVAL_MS) {
          ctx.waitUntil(flush(env, (env.ZICA_SIGNALS_SITE_HOST || url.hostname).toLowerCase()));
        }
      }
    } catch (e) { /* medir nunca pode quebrar o site */ }
    return response;
  },
};
