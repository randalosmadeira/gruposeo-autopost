import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { BROWSER_KINDS, CTA_AGENTS, SERVER_KINDS, normalizeAgent, parseBrowserEvent } from '../../supabase/functions/_shared/zica-signals';

const SCRIPTS = ['public/zica-signals.js', 'public/wordpress-plugin/zica-posts/assets/zica-signals.js'];
const SITE = 'abcdefghijkl';

/** Executa o script de sinais como o navegador faria e devolve o que ele enviou. */
function load(file: string, attrs: Record<string, string> = {}) {
  const sent: Array<Record<string, unknown>> = [];
  const beacon = vi.fn((_url: string, blob: Blob) => { (blob as unknown as { _text?: string })._text = ''; sent.push({ blob }); return true; });
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
  const el = document.createElement('script');
  el.setAttribute('data-site', SITE); el.setAttribute('data-endpoint', 'https://p.supabase.co/functions/v1/zica-signals');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  Object.defineProperty(document, 'currentScript', { value: el, configurable: true });
  new Function(readFileSync(file, 'utf8'))();
  const readBlob = (b: Blob) => new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsText(b); });
  const bodies = async () => Promise.all(sent.map(async (s) => JSON.parse(await readBlob(s.blob as Blob))));
  return { beacon, bodies };
}
const click = (el: Element) => { el.addEventListener('click', (e) => e.preventDefault(), { once: true }); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };
let listeners: Array<[string, EventListener, boolean]> = [];
const origAdd = document.addEventListener.bind(document);

beforeEach(() => {
  listeners = [];
  document.addEventListener = ((type: string, fn: EventListener, opts?: boolean | AddEventListenerOptions) => { listeners.push([type, fn, opts === true || (typeof opts === 'object' && !!opts?.capture)]); origAdd(type, fn, opts); }) as typeof document.addEventListener;
  delete (window as unknown as { __zs?: number }).__zs;
  document.body.innerHTML = '';
  Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  window.history.pushState({}, '', '/advogado-criminalista/guarulhos/?utm_source=google&telefone=11999990000');
});
afterEach(() => { for (const [t, f, c] of listeners) document.removeEventListener(t, f, c); document.addEventListener = origAdd; vi.useRealTimers(); });

describe('cliques de contato: script do navegador', () => {
  for (const file of SCRIPTS) {
    describe(file, () => {
      it('mede clique em WhatsApp, telefone e e-mail enviando só o TIPO e o caminho, nunca o número nem o e-mail', async () => {
        document.body.innerHTML = '<a id="w" href="https://wa.me/5511999990000?text=oi">WhatsApp</a><a id="t" href="tel:+5511951730074"><span id="ts">Ligar</span></a><a id="e" href="mailto:contato@rdm.com.br">E-mail</a><a id="o" href="https://exemplo.com/x">fora</a>';
        const { bodies } = load(file);
        click(document.getElementById('w')!); click(document.getElementById('ts')!); click(document.getElementById('e')!); click(document.getElementById('o')!);
        const b = await bodies();
        expect(b.map((x) => `${x.kind}:${x.agent}`)).toEqual(['cta_click:whatsapp', 'cta_click:phone', 'cta_click:email']);
        expect(b.every((x) => x.site_id === SITE && x.path === '/advogado-criminalista/guarulhos/')).toBe(true);
        const raw = JSON.stringify(b);
        expect(raw).not.toMatch(/5511|9999|951730074|contato@|telefone|wa\.me/); // nada de dado pessoal nem de endereço
      });
      it('atributo data-zica-cta marca botões que não são links (por exemplo, abrem o WhatsApp por JavaScript)', async () => {
        document.body.innerHTML = '<button data-zica-cta="whatsapp"><b id="x">Falar agora</b></button><button data-zica-cta="invalido" id="y">x</button>';
        const { bodies } = load(file);
        click(document.getElementById('x')!); click(document.getElementById('y')!);
        expect((await bodies()).map((x) => `${x.kind}:${x.agent}`)).toEqual(['cta_click:whatsapp']);
      });
      it('envio de formulário de contato conta; busca, newsletter, login e comentário não', async () => {
        document.body.innerHTML = '<form id="c" action="/contato"><input name="n"></form><form id="b" role="search"></form><form id="n" class="newsletter"></form><form id="s"><input type="search"></form>';
        const { bodies } = load(file);
        for (const id of ['b', 'n', 's', 'c']) document.getElementById(id)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        expect((await bodies()).map((x) => `${x.kind}:${x.agent}`)).toEqual(['cta_click:form']);
      });
      it('o mesmo tipo de clique em menos de 3 segundos conta uma vez só', async () => {
        document.body.innerHTML = '<a id="w" href="https://api.whatsapp.com/send?phone=5511">zap</a>';
        const { bodies } = load(file);
        click(document.getElementById('w')!); click(document.getElementById('w')!); click(document.getElementById('w')!);
        expect(await bodies()).toHaveLength(1);
      });
      it('respeita "não rastrear" do navegador: não mede nada', async () => {
        Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
        document.body.innerHTML = '<a id="w" href="tel:1199">x</a>';
        const { beacon } = load(file);
        click(document.getElementById('w')!);
        expect(beacon).not.toHaveBeenCalled();
        Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true });
      });
      it('sem chave do site ou sem endereço de envio o script não faz nada', () => {
        document.body.innerHTML = '<a id="w" href="tel:1199">x</a>';
        const { beacon } = load(file, { 'data-site': '' });
        click(document.getElementById('w')!);
        expect(beacon).not.toHaveBeenCalled();
      });
    });
  }
  it('as duas cópias do script são idênticas (plugin e sites estáticos)', () => {
    expect(readFileSync(SCRIPTS[0], 'utf8')).toBe(readFileSync(SCRIPTS[1], 'utf8'));
  });
});

describe('cliques de contato: servidor de sinais', () => {
  it('aceita o tipo cta_click do navegador e do servidor, com só 4 tipos de contato; o resto vira "other"', () => {
    expect(BROWSER_KINDS).toContain('cta_click'); expect(SERVER_KINDS).toContain('cta_click');
    expect([...CTA_AGENTS]).toEqual(['whatsapp', 'phone', 'email', 'form']);
    expect(normalizeAgent('cta_click', 'WhatsApp')).toBe('whatsapp');
    expect(normalizeAgent('cta_click', 'cpf 123')).toBe('other');
    const ok = parseBrowserEvent(JSON.stringify({ site_id: SITE, kind: 'cta_click', agent: 'phone', path: '/contato/?x=1' }));
    expect(ok).toMatchObject({ ok: true, kind: 'cta_click', agent: 'phone' });
    expect(parseBrowserEvent(JSON.stringify({ site_id: SITE, kind: 'cta_click', agent: '5511999990000', path: '/' }))).toMatchObject({ ok: true, agent: 'other' });
    expect(parseBrowserEvent(JSON.stringify({ site_id: SITE, kind: 'outro_tipo', agent: 'x', path: '/' }))).toMatchObject({ ok: false });
  });
});
