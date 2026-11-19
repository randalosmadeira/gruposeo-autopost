/*! Zica Signals: sem cookies/PII; respeita doNotTrack. data-site, data-endpoint, data-all */
(function (w, d) {
  /* BEGIN signals-catalog (gerado de signals-catalog.json) */
var C={"a":[["chatgpt.com",["chatgpt.com","chat.openai.com","openai.com"]],["perplexity.ai",["perplexity.ai"]],["gemini.google.com",["gemini.google.com","bard.google.com"]],["copilot.microsoft.com",["copilot.microsoft.com"]],["claude.ai",["claude.ai"]],["you.com",["you.com"]],["poe.com",["poe.com"]],["meta.ai",["meta.ai"]],["grok.com",["grok.com","x.ai"]]],"c":[["duckduckgo.com","duckduckgo.com",{"ia":"chat"},null],["bing.com","copilot.microsoft.com",null,["/chat","/copilot"]]],"u":{"chatgpt.com":"chatgpt.com","perplexity":"perplexity.ai","gemini":"gemini.google.com","copilot":"copilot.microsoft.com","claude":"claude.ai"},"s":[["google","(^|\\.)google\\.[a-z.]{2,6}$"],["bing","(^|\\.)bing\\.com$"],["duckduckgo","(^|\\.)duckduckgo\\.com$"],["yahoo","(^|\\.)yahoo\\.[a-z.]{2,6}$"],["yandex","(^|\\.)yandex\\.[a-z.]{2,6}$"],["ecosia","(^|\\.)ecosia\\.org$"],["baidu","(^|\\.)baidu\\.com$"]]};
  /* END signals-catalog */
  var n = w.navigator, s = d.currentScript || {}, Z = w.ZICA_SIGNALS || {}, L = w.location, a = d.createElement('a');
  function at(k) { return s.getAttribute && s.getAttribute('data-' + k); }
  var site = Z.site || at('site'), ep = Z.endpoint || at('endpoint'), all = Z.all || at('all');
  if (!site || !ep || w.__zs || n.doNotTrack == '1' || w.doNotTrack == '1') return;
  w.__zs = 1;
  function q(k, x) {
    var m = RegExp('[?&]' + k + '=([^&#]*)').exec(x);
    try { return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')).toLowerCase() : ''; } catch (e) { return ''; }
  }
  function is(h, l) {
    for (var i = 0; i < l.length; i++) if (h == l[i] || h.slice(-l[i].length - 1) == '.' + l[i]) return 1;
  }
  function run() {
    var i, j, e, u = q('utm_source', L.search) || q('ref', L.search), h, p;
    if (typeof C.u[u] == 'string') return ['ai_referral', C.u[u]];
    a.href = d.referrer;
    h = a.hostname.toLowerCase().replace(/^www\./, '');
    p = '/' + a.pathname.replace(/^\//, '');
    if (h != L.hostname.toLowerCase().replace(/^www\./, '')) {
      for (i = 0; e = C.a[i]; i++) if (is(h, e[1])) return ['ai_referral', e[0]];
      for (i = 0; e = C.c[i]; i++) {
        if (!is(h, [e[0]])) continue;
        for (j in e[2]) if (q(j, a.search) == e[2][j]) return ['ai_referral', e[1]];
        for (j in e[3]) if (!p.indexOf(e[3][j])) return ['ai_referral', e[1]];
      }
      for (i = 0; e = C.s[i]; i++) if (RegExp(e[1], 'i').test(h)) return ['search_referral', e[0]];
    }
    if (all == '1') return ['human_pageview', 'other'];
  }
  var t = 'text/plain;charset=UTF-8';
  function send(kind, agent) {
    var b = JSON.stringify({ site_id: site, kind: kind, agent: agent, path: L.pathname.slice(0, 200) });
    try { if (n.sendBeacon(ep, new Blob([b], { type: t }))) return; } catch (e) {}
    try { w.fetch(ep, { method: 'POST', body: b, keepalive: true, headers: { 'Content-Type': t } }).catch(function () {}); } catch (e) {}
  }
  var r = run();
  if (r) send(r[0], r[1]);
  /* Cliques de contato (item 4): WhatsApp, telefone, e-mail e formulario. So o TIPO e o caminho da pagina saem do navegador:
     nunca o numero, o endereco de e-mail ou o texto digitado. Respeita doNotTrack (ja tratado no inicio do arquivo). */
  var CTA = { whatsapp: 1, phone: 1, email: 1, form: 1 }, last = {};
  function cta(agent) {
    var now = Date.now();
    if (last[agent] && now - last[agent] < 3000) return;
    last[agent] = now;
    send('cta_click', agent);
  }
  function kindOfHref(href) {
    var h = String(href || '').toLowerCase().replace(/^\s+/, '');
    if (h.indexOf('tel:') == 0) return 'phone';
    if (h.indexOf('mailto:') == 0) return 'email';
    if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com|(www\.)?whatsapp\.com\/send)/.test(h) || h.indexOf('whatsapp://') == 0) return 'whatsapp';
  }
  d.addEventListener('click', function (ev) {
    var el = ev.target, k, i = 0;
    while (el && el !== d && i++ < 8) {
      if (el.getAttribute) {
        k = el.getAttribute('data-zica-cta');
        if (k && CTA[k]) return cta(k);
        if (el.tagName && el.tagName.toLowerCase() == 'a') { k = kindOfHref(el.getAttribute('href')); if (k) return cta(k); }
      }
      el = el.parentNode;
    }
  }, true);
  d.addEventListener('submit', function (ev) {
    var f = ev.target, id;
    if (!f || !f.tagName || f.tagName.toLowerCase() != 'form' || f.getAttribute('role') == 'search') return;
    id = (f.id || '') + ' ' + (f.className || '') + ' ' + (f.getAttribute('action') || '');
    if (/search|busca|newsletter|login|comment/i.test(id) || (f.querySelector && f.querySelector('input[type=search]'))) return;
    cta('form');
  }, true);
})(window, document);
