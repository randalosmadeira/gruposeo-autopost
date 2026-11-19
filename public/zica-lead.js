/*! Zica Lead: botão-atalho de captação. Sem cookies, sem rastreio, sem chamadas de rede: só abre a página de cadastro do Zica.ai quando a pessoa clica.
 * Uso:  <script async src="https://app.zica.posts.zicajuris.com.br/zica-lead.js"></script>
 * Opções (atributos do script):
 *   data-label    texto do botão (padrão "Quero começar")
 *   data-position bottom-right (padrão) | bottom-left | inline (não flutua; use data-target)
 *   data-target   seletor CSS do elemento onde o botão entra quando data-position="inline"
 *   data-color    cor de fundo (padrão #D4FF00); data-text-color (padrão #0D1117)
 *   data-source   marca de origem (padrão: o endereço do site onde o botão está)
 *   data-target-blank  "1" abre em nova aba
 * Também funciona sem script: <a href="https://app.zica.posts.zicajuris.com.br/comecar?utm_source=meusite&utm_medium=link">Quero começar</a>
 */
(function (w, d) {
  'use strict';
  var script = d.currentScript;
  if (!script || w.__zicaLeadLoaded) return;
  w.__zicaLeadLoaded = true;

  var BASE = (function () { try { return new URL(script.src).origin; } catch (e) { return 'https://app.zica.posts.zicajuris.com.br'; } })();
  var attr = function (k, fallback) { var v = script.getAttribute('data-' + k); return v && v.trim() ? v.trim() : fallback; };
  var safeColor = function (v, fallback) { return /^#[0-9a-fA-F]{3,8}$/.test(v) || /^[a-zA-Z]{3,20}$/.test(v) ? v : fallback; };

  function buildUrl() {
    var host = '';
    try { host = w.location.hostname; } catch (e) { host = ''; }
    var source = attr('source', host).slice(0, 80);
    var q = ['utm_source=' + encodeURIComponent(source || 'site'), 'utm_medium=' + encodeURIComponent('botao-site')];
    try { q.push('ref=' + encodeURIComponent((w.location.pathname || '/').slice(0, 200))); } catch (e) { /* sem ref */ }
    return BASE + '/comecar?' + q.join('&');
  }

  function render() {
    var host = d.createElement('div');
    var position = attr('position', 'bottom-right');
    var inline = position === 'inline';
    host.setAttribute('data-zica-lead', '1');
    if (!inline) host.style.cssText = 'position:fixed;bottom:16px;' + (position === 'bottom-left' ? 'left:16px;' : 'right:16px;') + 'z-index:2147483000;';
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var a = d.createElement('a');
    a.href = buildUrl();
    a.textContent = attr('label', 'Quero começar').slice(0, 40);
    a.rel = 'noopener';
    if (attr('target-blank', '') === '1') a.target = '_blank';
    a.setAttribute('aria-label', a.textContent + ' (abre o cadastro do Zica.ai)');
    a.style.cssText = 'display:inline-block;font:700 15px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:14px 20px;border-radius:999px;text-decoration:none;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.28);' +
      'background:' + safeColor(attr('color', '#D4FF00'), '#D4FF00') + ';color:' + safeColor(attr('text-color', '#0D1117'), '#0D1117') + ';';
    root.appendChild(a);
    if (inline) {
      var target = null;
      try { target = d.querySelector(attr('target', '')); } catch (e) { target = null; }
      (target || script.parentNode || d.body).insertBefore(host, target ? null : script.nextSibling);
    } else {
      d.body.appendChild(host);
    }
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', render); else render();
})(window, document);
