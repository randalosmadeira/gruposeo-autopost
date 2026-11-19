'use strict';
/**
 * Zica Signals - middleware Node (CommonJS, sem dependencias). Compativel com Express, Connect e
 * qualquer servidor que chame (req, res, next); no Fastify use com @fastify/middie.
 *
 * Conta acessos de robos de IA (User-Agent) em memoria e envia lotes assinados (HMAC-SHA256)
 * por intervalo. Nao registra IP, User-Agent completo nem cookies: so dia|tipo|agente|caminho.
 *
 * Uso:
 *   const zicaSignals = require('./zica-signals-middleware');
 *   app.use(zicaSignals({
 *     siteId: process.env.ZICA_SIGNALS_SITE_ID,
 *     secret: process.env.ZICA_SIGNALS_SECRET,        // nunca no codigo
 *     endpoint: process.env.ZICA_SIGNALS_ENDPOINT,    // https://PROJETO.supabase.co/functions/v1/zica-signals
 *   }));
 */
var crypto = require('crypto');
var https = require('https');
var urlLib = require('url');

// BEGIN signals-catalog (gerado de signals-catalog.json - nao editar a mao)
var C = {"b":["meta-externalagent","Applebot-Extended","Claude-SearchBot","Perplexity-User","Google-Extended","Googlebot-Image","Googlebot-Video","OAI-SearchBot","PerplexityBot","DuckAssistBot","ChatGPT-User","anthropic-ai","Claude-User","Bytespider","ClaudeBot","Googlebot","cohere-ai","Amazonbot","Applebot","Bingbot","GPTBot","CCBot"],"a":[["chatgpt.com",["chatgpt.com","chat.openai.com","openai.com"]],["perplexity.ai",["perplexity.ai"]],["gemini.google.com",["gemini.google.com","bard.google.com"]],["copilot.microsoft.com",["copilot.microsoft.com"]],["claude.ai",["claude.ai"]],["you.com",["you.com"]],["poe.com",["poe.com"]],["meta.ai",["meta.ai"]],["grok.com",["grok.com","x.ai"]]],"c":[["duckduckgo.com","duckduckgo.com",{"ia":"chat"},null],["bing.com","copilot.microsoft.com",null,["/chat","/copilot"]]],"u":{"chatgpt.com":"chatgpt.com","perplexity":"perplexity.ai","gemini":"gemini.google.com","copilot":"copilot.microsoft.com","claude":"claude.ai"},"s":[["google","(^|\\.)google\\.[a-z.]{2,6}$"],["bing","(^|\\.)bing\\.com$"],["duckduckgo","(^|\\.)duckduckgo\\.com$"],["yahoo","(^|\\.)yahoo\\.[a-z.]{2,6}$"],["yandex","(^|\\.)yandex\\.[a-z.]{2,6}$"],["ecosia","(^|\\.)ecosia\\.org$"],["baidu","(^|\\.)baidu\\.com$"]]};
// END signals-catalog

var BATCH_MAX_EVENTS = 500;
var BUFFER_MAX_KEYS = 2000;

function hostIs(host, list) {
  for (var i = 0; i < list.length; i++) {
    if (host === list[i] || host.slice(-list[i].length - 1) === '.' + list[i]) return true;
  }
  return false;
}

function detectBot(ua) {
  if (!ua) return null;
  var low = String(ua).toLowerCase();
  for (var i = 0; i < C.b.length; i++) if (low.indexOf(C.b[i].toLowerCase()) !== -1) return C.b[i];
  return null;
}

function classifyReferrer(req, pathname, query) {
  var utm = String(query.utm_source || query.ref || '').toLowerCase();
  if (utm && C.u[utm]) return ['ai_referral', C.u[utm]];
  var ref = req.headers && req.headers.referer;
  if (!ref) return null;
  var r;
  try { r = new urlLib.URL(ref); } catch (e) { return null; }
  var host = r.hostname.toLowerCase().replace(/^www\./, '');
  var own = String((req.headers && req.headers.host) || '').split(':')[0].toLowerCase().replace(/^www\./, '');
  if (!host || host === own) return null;
  var i, k;
  for (i = 0; i < C.a.length; i++) if (hostIs(host, C.a[i][1])) return ['ai_referral', C.a[i][0]];
  for (i = 0; i < C.c.length; i++) {
    var e = C.c[i];
    if (!hostIs(host, [e[0]])) continue;
    if (e[2]) for (k in e[2]) if (r.searchParams.get(k) === e[2][k]) return ['ai_referral', e[1]];
    if (e[3]) for (k = 0; k < e[3].length; k++) if (r.pathname.indexOf(e[3][k]) === 0) return ['ai_referral', e[1]];
  }
  for (i = 0; i < C.s.length; i++) if (new RegExp(C.s[i][1], 'i').test(host)) return ['search_referral', C.s[i][0]];
  return null;
}

function today(tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function sign(secret, ts, nonce, body) {
  var bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  return crypto.createHmac('sha256', secret).update(ts + '\n' + nonce + '\n' + bodyHash).digest('hex');
}

function post(endpoint, headers, body, cb) {
  var u;
  try { u = new urlLib.URL(endpoint); } catch (e) { return cb(false); }
  if (u.protocol !== 'https:') return cb(false);
  var req = https.request({
    method: 'POST',
    hostname: u.hostname,
    port: u.port || 443,
    path: u.pathname + u.search,
    headers: Object.assign({ 'Content-Length': Buffer.byteLength(body) }, headers),
    timeout: 15000,
  }, function (res) {
    res.resume();
    cb(res.statusCode >= 200 && res.statusCode < 300);
  });
  req.on('timeout', function () { req.destroy(); });
  req.on('error', function () { cb(false); });
  req.end(body);
}

function createMiddleware(opts) {
  opts = opts || {};
  var siteId = opts.siteId, secret = opts.secret, endpoint = opts.endpoint;
  var intervalMs = opts.flushIntervalMs || 60000;
  var tz = opts.timeZone || 'America/Sao_Paulo';
  var referrals = opts.referrals === true; // padrao: so robos (use o snippet para visitas humanas)
  var onError = typeof opts.onError === 'function' ? opts.onError : function () {};
  var buffer = new Map();
  var flushing = false;

  function record(kind, agent, path) {
    var safe = String(path || '/').replace(/[^\x20-\x7E]/g, '').replace(/\|/g, '%7C').slice(0, 200) || '/';
    var key = [today(tz), kind, agent, safe].join('|');
    var cur = buffer.get(key);
    if (cur !== undefined) buffer.set(key, Math.min(100000, cur + 1));
    else if (buffer.size < BUFFER_MAX_KEYS) buffer.set(key, 1);
  }

  function flush(done) {
    done = done || function () {};
    if (!siteId || !secret || !endpoint || flushing || buffer.size === 0) return done();
    flushing = true;
    var snapshot = Array.from(buffer.entries());
    buffer = new Map();
    var chunks = [];
    for (var i = 0; i < snapshot.length; i += BATCH_MAX_EVENTS) chunks.push(snapshot.slice(i, i + BATCH_MAX_EVENTS));
    var siteHost = String(opts.siteHost || '').toLowerCase();
    var pending = chunks.length;
    chunks.forEach(function (chunk) {
      var events = chunk.map(function (pair) {
        var p = pair[0].split('|');
        return { day: p[0], kind: p[1], agent: p[2], path: p.slice(3).join('|'), hits: pair[1] };
      });
      var body = JSON.stringify({ site_host: siteHost, batch_id: crypto.randomUUID(), events: events });
      var ts = String(Math.floor(Date.now() / 1000));
      var nonce = crypto.randomUUID();
      post(endpoint, {
        'Content-Type': 'application/json',
        'X-Zica-Site': siteId,
        'X-Zica-Timestamp': ts,
        'X-Zica-Nonce': nonce,
        'X-Zica-Signature': sign(secret, ts, nonce, body),
      }, body, function (ok) {
        if (!ok) {
          onError(new Error('zica-signals: lote nao aceito; mantido para nova tentativa'));
          chunk.forEach(function (pair) {
            var cur = buffer.get(pair[0]) || 0;
            if (cur || buffer.size < BUFFER_MAX_KEYS) buffer.set(pair[0], Math.min(100000, cur + pair[1]));
          });
        }
        if (--pending === 0) { flushing = false; done(); }
      });
    });
  }

  var timer = setInterval(function () { flush(); }, intervalMs);
  if (timer.unref) timer.unref();

  function middleware(req, res, next) {
    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        var parsed = new urlLib.URL(req.originalUrl || req.url || '/', 'http://localhost');
        var query = {};
        parsed.searchParams.forEach(function (v, k) { if (!(k in query)) query[k] = v; });
        var hit = null;
        var bot = detectBot(req.headers && req.headers['user-agent']);
        if (bot) hit = ['ai_bot_hit', bot];
        else if (referrals) hit = classifyReferrer(req, parsed.pathname, query);
        if (hit) record(hit[0], hit[1], parsed.pathname);
      }
    } catch (e) { /* medir nunca pode quebrar o site */ }
    if (typeof next === 'function') next();
  }
  middleware.flush = flush;
  middleware.stop = function () { clearInterval(timer); };
  return middleware;
}

module.exports = createMiddleware;
module.exports.createMiddleware = createMiddleware;
