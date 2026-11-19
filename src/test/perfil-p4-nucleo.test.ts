import { describe, expect, it } from 'vitest';
import {
  checkCep, checkCnpjFormat, checkCnpjReceita, checkDns, checkDomainRdap, checkLlmsTxt, checkRobots, checkSite, checkSitemap, checkSocials, checkWayback,
  extractCeps, guardedFetch, isPublicIPv4, normalizeSiteInput, parseHtmlFacts, parseRobots, parseSafeUrl, registrableDomain, runAnalysis, runStatus, trustedJson, validCnpj,
  type Deps, type Inputs,
} from '../../supabase/functions/_shared/profile-analyze-core';

const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);
type Handler = (init?: RequestInit) => Response | Promise<Response>;
function makeDeps(routes: Array<[RegExp, Handler]> = [], lookup: (h: string) => string[] = () => ['93.184.216.34']) {
  const calls: string[] = [];
  let t = T0;
  const deps: Deps = {
    now: () => (t += 5),
    lookupA: async (h) => lookup(h),
    fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      for (const [re, fn] of routes) if (re.test(url)) return await fn(init);
      throw new Error(`sem rota: ${url}`);
    }) as typeof fetch,
  };
  return { deps, calls };
}
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const html = (body: string, status = 200, extra: Record<string, string> = {}) => () => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...extra } });
const text = (body: string, status = 200, ct = 'text/plain') => () => new Response(body, { status, headers: { 'content-type': ct } });
const hangs: Handler = (init) => new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' }))));
const base: Inputs = { cnpj: null, cnpjStatus: null, ceps: [], siteUrl: null, sitemapDeclared: null, socials: {} };

describe('validação local', () => {
  it('CNPJ: aceita o válido e recusa dígito errado, repetidos e tamanho errado', () => {
    expect(validCnpj('11.222.333/0001-81')).toBe(true);
    expect(validCnpj('11222333000182')).toBe(false);
    expect(validCnpj('11111111111111')).toBe(false);
    expect(validCnpj('123')).toBe(false);
    expect(validCnpj(null)).toBe(false);
  });
  it('CEP: extrai do texto livre, sem repetir, no máximo 3', () => {
    expect(extractCeps('Rua A, 10, Centro, São Paulo, CEP 01310-100\nOutra, 01310100 e 04538-132, 20040-020, 30140-071')).toEqual(['01310100', '04538132', '20040020']);
    expect(extractCeps('sem cep')).toEqual([]);
  });
  it('endereços privados e reservados não são públicos', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '192.168.1.5', '172.16.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '198.18.0.1']) expect(isPublicIPv4(ip), ip).toBe(false);
    for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1']) expect(isPublicIPv4(ip), ip).toBe(true);
    expect(isPublicIPv4('::1')).toBe(false);
  });
  it('parseSafeUrl recusa o que não é site público', () => {
    for (const u of ['file:///etc/passwd', 'ftp://x.com', 'https://user:pass@x.com', 'https://x.com:8080', 'https://127.0.0.1', 'https://localhost', 'https://intranet', 'https://x.internal', 'https://[::1]/', 'não é url']) expect('error' in parseSafeUrl(u), u).toBe(true);
    expect('error' in parseSafeUrl('https://exemplo.com.br:443/x')).toBe(false);
  });
  it('normalizeSiteInput e domínio registrável', () => {
    expect(normalizeSiteInput('exemplo.com.br/blog')).toEqual({ origin: 'https://exemplo.com.br', host: 'exemplo.com.br' });
    expect(normalizeSiteInput('http://www.Exemplo.com')).toEqual({ origin: 'https://www.exemplo.com', host: 'www.exemplo.com' });
    expect(normalizeSiteInput('127.0.0.1')).toBeNull();
    expect(normalizeSiteInput('')).toBeNull();
    expect(registrableDomain('www.loja.exemplo.com.br')).toBe('exemplo.com.br');
    expect(registrableDomain('blog.exemplo.com')).toBe('exemplo.com');
  });
});

describe('guardedFetch (SSRF, tempo e tamanho)', () => {
  it('recusa quando o nome resolve para endereço privado (rebind)', async () => {
    const { deps, calls } = makeDeps([[/./, text('x')]], () => ['10.0.0.5']);
    await expect(guardedFetch(deps, 'https://site.com/')).rejects.toThrow('endereco_privado_ou_nao_resolvido');
    expect(calls).toEqual([]);
  });
  it('recusa quando não resolve (ou só tem IPv6)', async () => {
    const { deps, calls } = makeDeps([[/./, text('x')]], () => []);
    await expect(guardedFetch(deps, 'https://site.com/')).rejects.toThrow('endereco_privado_ou_nao_resolvido');
    expect(calls).toEqual([]);
  });
  it('revalida cada salto: redirecionamento para host interno é barrado ANTES de visitar', async () => {
    const { deps, calls } = makeDeps([[/^https:\/\/site\.com\//, () => new Response(null, { status: 302, headers: { location: 'https://interno.site.com/' } })], [/interno/, text('segredo')]], (h) => (h.startsWith('interno') ? ['10.1.1.1'] : ['93.184.216.34']));
    await expect(guardedFetch(deps, 'https://site.com/')).rejects.toThrow('endereco_privado_ou_nao_resolvido');
    expect(calls.some((c) => c.includes('interno'))).toBe(false);
  });
  it('redirecionamento para IP literal, porta ou protocolo proibidos é barrado', async () => {
    for (const loc of ['http://169.254.169.254/latest', 'https://site.com:8443/', 'file:///etc/passwd']) {
      const { deps } = makeDeps([[/^https:\/\/site\.com\/$/, () => new Response(null, { status: 301, headers: { location: loc } })]]);
      await expect(guardedFetch(deps, 'https://site.com/'), loc).rejects.toThrow();
    }
  });
  it('limita redirecionamentos', async () => {
    const { deps } = makeDeps([[/./, () => new Response(null, { status: 302, headers: { location: 'https://site.com/outra' } })]]);
    await expect(guardedFetch(deps, 'https://site.com/', { maxHops: 3 })).rejects.toThrow('muitos_redirecionamentos');
  });
  it('corta o corpo no limite e avisa', async () => {
    const { deps } = makeDeps([[/./, text('a'.repeat(5000))]]);
    const v = await guardedFetch(deps, 'https://site.com/', { maxBytes: 1000 });
    expect(v.bytes).toBe(1000);
    expect(v.truncated).toBe(true);
    expect(v.text.length).toBe(1000);
  });
  it('tempo esgotado vira erro claro', async () => {
    const { deps } = makeDeps([[/./, hangs]]);
    await expect(guardedFetch(deps, 'https://site.com/', { timeoutMs: 20 })).rejects.toThrow('tempo_esgotado');
  });
  it('só fontes da lista fechada em trustedJson', async () => {
    const { deps } = makeDeps([[/./, json({})]]);
    await expect(trustedJson(deps, 'https://evil.example.com/x')).rejects.toThrow('fonte_nao_permitida');
    await expect(trustedJson(deps, 'http://brasilapi.com.br/x')).rejects.toThrow('fonte_nao_permitida');
    await expect(trustedJson(makeDeps([[/./, hangs]]).deps, 'https://brasilapi.com.br/x', 20)).rejects.toThrow('tempo_esgotado');
  });
});

describe('CNPJ', () => {
  const withCnpj = (c: string | null, status: string | null = 'Tenho CNPJ'): Inputs => ({ ...base, cnpj: c, cnpjStatus: status });
  it('formato: sem número com "tenho CNPJ" gera achado; sem CNPJ declarado é só "não aplicável"', async () => {
    const a = await checkCnpjFormat(withCnpj(null, 'Tenho CNPJ'));
    expect(a.check.status).toBe('skipped');
    expect(a.findings[0].severity).toBe('media');
    const b = await checkCnpjFormat(withCnpj(null, 'Ainda não tenho CNPJ'));
    expect(b.findings).toEqual([]);
    expect(b.check.error).toMatch(/Sem CNPJ/);
  });
  it('formato: dígito errado é achado alto; válido é ok', async () => {
    const bad = await checkCnpjFormat(withCnpj('11.222.333/0001-82'));
    expect(bad.check.status).toBe('fail');
    expect(bad.findings[0].severity).toBe('alta');
    expect((await checkCnpjFormat(withCnpj('11.222.333/0001-81'))).check.status).toBe('ok');
  });
  const receita = { razao_social: 'EMPRESA TESTE LTDA', nome_fantasia: 'Teste', descricao_situacao_cadastral: 'ATIVA', data_inicio_atividade: '2015-03-10', porte: 'DEMAIS', natureza_juridica: 'Sociedade Empresária Limitada', cnae_fiscal: 6201501, cnae_fiscal_descricao: 'Desenvolvimento de programas de computador sob encomenda', municipio: 'SAO PAULO', uf: 'SP', cep: '01310100', qsa: [{ nome_socio: 'FULANO DA SILVA', cnpj_cpf_do_socio: '***123456**' }, { nome_socio: 'BELTRANA' }] };
  it('Receita: mede e NÃO guarda nome de sócio, só a quantidade', async () => {
    const { deps } = makeDeps([[/brasilapi\.com\.br\/api\/cnpj/, json(receita)]]);
    const r = await checkCnpjReceita(deps, withCnpj('11222333000181'));
    expect(r.check.status).toBe('ok');
    expect(r.check.measured).toMatchObject({ fonte: 'brasilapi', situacao: 'ATIVA', municipio: 'SAO PAULO', uf: 'SP', socios_quantidade: 2, abertura: '2015-03-10' });
    expect(JSON.stringify(r.check)).not.toMatch(/FULANO|BELTRANA|\*\*\*/);
    expect(r.findings).toEqual([]);
  });
  it('Receita: situação diferente de ATIVA vira alerta alto', async () => {
    const { deps } = makeDeps([[/brasilapi/, json({ ...receita, descricao_situacao_cadastral: 'BAIXADA' })]]);
    const r = await checkCnpjReceita(deps, withCnpj('11222333000181'));
    expect(r.check.status).toBe('warn');
    expect(r.findings[0]).toMatchObject({ severity: 'alta' });
    expect(r.findings[0].title).toMatch(/BAIXADA/);
  });
  it('Receita: 404 é "não encontrado" (achado alto); a fonte 1 caída usa o plano B', async () => {
    const nf = await checkCnpjReceita(makeDeps([[/brasilapi/, json({ message: 'CNPJ não encontrado' }, 404)]]).deps, withCnpj('11222333000181'));
    expect(nf.check.status).toBe('fail');
    expect(nf.findings[0].severity).toBe('alta');
    const planB = await checkCnpjReceita(makeDeps([[/brasilapi/, json({}, 503)], [/minhareceita/, json(receita)]]).deps, withCnpj('11222333000181'));
    expect(planB.check.status).toBe('ok');
    expect(planB.check.measured.fonte).toBe('minhareceita');
  });
  it('Receita: TODAS as fontes falham -> erro, nada preenchido, nenhum achado inventado', async () => {
    for (const routes of [[[/brasilapi/, json({}, 500)], [/minhareceita/, json({}, 429)]], []] as Array<Array<[RegExp, Handler]>>) {
      const { deps } = makeDeps(routes);
      const r = await checkCnpjReceita(deps, withCnpj('11222333000181'));
      expect(r.check.status).toBe('error');
      expect(r.check.measured).toEqual({});
      expect(r.findings).toEqual([]);
    }
  });
  it('Receita: sem CNPJ válido não consulta', async () => {
    const { deps, calls } = makeDeps([[/./, json({})]]);
    expect((await checkCnpjReceita(deps, withCnpj('123'))).check.status).toBe('skipped');
    expect(calls).toEqual([]);
  });
});

describe('CEP', () => {
  const inputs: Inputs = { ...base, ceps: ['01310100'] };
  it('encontra e compara a cidade com a do CNPJ (diferença é só informação)', async () => {
    const { deps } = makeDeps([[/brasilapi\.com\.br\/api\/cep/, json({ cep: '01310100', city: 'São Paulo', state: 'SP' })]]);
    const same = await checkCep(deps, inputs, { situacao: 'ATIVA', municipio: 'SAO PAULO', uf: 'SP', abertura: null });
    expect(same.check.status).toBe('ok');
    expect(same.findings).toEqual([]);
    const diff = await checkCep(deps, inputs, { situacao: 'ATIVA', municipio: 'CAMPINAS', uf: 'SP', abertura: null });
    expect(diff.findings[0].severity).toBe('info');
  });
  it('CEP inexistente (404) vira achado médio; plano B ViaCEP funciona', async () => {
    const nf = await checkCep(makeDeps([[/brasilapi/, json({}, 404)]]).deps, inputs);
    expect(nf.check.status).toBe('warn');
    expect(nf.findings[0].severity).toBe('media');
    const via = await checkCep(makeDeps([[/brasilapi/, json({}, 500)], [/viacep/, json({ localidade: 'São Paulo', uf: 'SP' })]]).deps, inputs);
    expect(via.check.status).toBe('ok');
    expect((via.check.measured.ceps as Array<{ fonte: string }>)[0].fonte).toBe('viacep');
  });
  it('sem CEP: não aplicável; fontes fora do ar: erro sem inventar', async () => {
    expect((await checkCep(makeDeps().deps, base)).check.status).toBe('skipped');
    const down = await checkCep(makeDeps([[/./, json({}, 500)]]).deps, inputs);
    expect(down.check.status).toBe('error');
    expect(down.findings).toEqual([]);
  });
});

describe('domínio (RDAP) e DNS', () => {
  const rdap = (days: number) => ({ status: ['active'], events: [{ eventAction: 'registration', eventDate: '2015-01-01T00:00:00Z' }, { eventAction: 'expiration', eventDate: new Date(T0 + days * 86_400_000 + 3_600_000).toISOString() }], entities: [{ vcardArray: ['vcard', [['fn', {}, 'text', 'TITULAR PESSOAL']]] }] });
  it('.br usa o Registro.br; vencimento perto vira alerta e o titular NÃO é guardado', async () => {
    const { deps, calls } = makeDeps([[/rdap\.registro\.br/, json(rdap(20))]]);
    const r = await checkDomainRdap(deps, 'www.exemplo.com.br');
    expect(calls[0]).toContain('rdap.registro.br/domain/exemplo.com.br');
    expect(r.check.measured).toMatchObject({ dominio: 'exemplo.com.br', registrado: true, dias_para_expirar: 20 });
    expect(JSON.stringify(r.check)).not.toMatch(/TITULAR/);
    expect(r.findings[0].severity).toBe('alta');
    expect((await checkDomainRdap(makeDeps([[/rdap/, json(rdap(60))]]).deps, 'exemplo.com.br')).findings[0].severity).toBe('media');
    const ok = await checkDomainRdap(makeDeps([[/rdap/, json(rdap(400))]]).deps, 'exemplo.com.br');
    expect(ok.check.status).toBe('ok');
    expect(ok.findings).toEqual([]);
  });
  it('domínio não .br usa rdap.org; 404 = não registrado; falha = erro', async () => {
    const { deps, calls } = makeDeps([[/rdap\.org/, json({}, 404)]]);
    const r = await checkDomainRdap(deps, 'exemplo.com');
    expect(calls[0]).toContain('rdap.org/domain/exemplo.com');
    expect(r.check.status).toBe('fail');
    expect(r.findings[0].severity).toBe('alta');
    const e = await checkDomainRdap(makeDeps([[/rdap/, json({}, 500)]]).deps, 'exemplo.com.br');
    expect(e.check.status).toBe('error');
    expect(e.findings).toEqual([]);
    expect((await checkDomainRdap(makeDeps().deps, null)).check.status).toBe('skipped');
  });
  const dnsAnswer = (data: Array<[number, string]>) => json({ Status: 0, Answer: data.map(([type, d]) => ({ type, data: d })) });
  const dnsRoutes = (o: { a?: Array<[number, string]>; mx?: Array<[number, string]>; txt?: Array<[number, string]>; dmarc?: Array<[number, string]> }): Array<[RegExp, Handler]> => [
    [/name=_dmarc\./, dnsAnswer(o.dmarc || [])], [/type=MX/, dnsAnswer(o.mx || [])], [/type=TXT/, dnsAnswer(o.txt || [])], [/type=A/, dnsAnswer(o.a || [])],
  ];
  it('DNS completo e saudável', async () => {
    const r = await checkDns(makeDeps(dnsRoutes({ a: [[1, '93.184.216.34']], mx: [[15, '10 mail.exemplo.com.br.']], txt: [[16, '"v=spf1 include:_spf.google.com ~all"']], dmarc: [[16, '"v=DMARC1; p=reject; rua=mailto:a@b.com"']] })).deps, 'www.exemplo.com.br');
    expect(r.check.status).toBe('ok');
    expect(r.check.measured).toMatchObject({ a: ['93.184.216.34'], dmarc: { presente: true, politica: 'reject' } });
    expect(r.findings).toEqual([]);
  });
  it('DNS: e-mail sem SPF/DMARC e domínio que não resolve geram achados proporcionais', async () => {
    const r = await checkDns(makeDeps(dnsRoutes({ a: [[1, '93.184.216.34']], mx: [[15, '10 mail.x.com.']] })).deps, 'exemplo.com.br');
    expect(r.findings.map((f) => f.severity).sort()).toEqual(['baixa', 'media']);
    expect(r.check.status).toBe('warn');
    const none = await checkDns(makeDeps(dnsRoutes({})).deps, 'exemplo.com.br');
    expect(none.check.status).toBe('fail');
    expect(none.findings.some((f) => f.severity === 'alta')).toBe(true);
    const p = await checkDns(makeDeps(dnsRoutes({ a: [[1, '93.184.216.34']], dmarc: [[16, '"v=DMARC1; p=none"']] })).deps, 'exemplo.com.br');
    expect(p.findings.some((f) => /p=none/.test(f.title))).toBe(true);
  });
  it('DNS fora do ar: erro, sem inventar', async () => {
    const r = await checkDns(makeDeps([[/./, json({}, 500)]]).deps, 'exemplo.com.br');
    expect(r.check.status).toBe('error');
    expect(r.findings).toEqual([]);
  });
});

const goodHtml = `<!doctype html><html lang="pt-BR"><head><title>Exemplo Advogados — Direito do Consumidor em SP</title><meta name="description" content="Descrição do site."><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://exemplo.com.br/"><meta property="og:title" content="x"><meta property="og:image" content="y"><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"LegalService"},{"@type":["Organization","LocalBusiness"]}]}</script></head><body><h1>Olá</h1></body></html>`;
const site = { origin: 'https://exemplo.com.br', host: 'exemplo.com.br' };

describe('site', () => {
  it('parseHtmlFacts lê título, descrição, H1, lang, viewport, canônico e JSON-LD', () => {
    const f = parseHtmlFacts(goodHtml);
    expect(f).toMatchObject({ title: 'Exemplo Advogados — Direito do Consumidor em SP', h1_quantidade: 1, idioma_html: 'pt-BR', viewport: true, canonical: 'https://exemplo.com.br/', og_title: true, og_image: true, noindex: false, json_ld_blocos: 1 });
    expect(f.json_ld_tipos).toEqual(['LegalService', 'Organization', 'LocalBusiness']);
    expect(parseHtmlFacts('<html><head><meta name="robots" content="noindex,follow"></head></html>').noindex).toBe(true);
  });
  it('site saudável: ok, mede tempo e HTTPS, sem achado', async () => {
    const { deps } = makeDeps([[/^http:\/\/exemplo\.com\.br/, () => new Response(null, { status: 301, headers: { location: 'https://exemplo.com.br/' } })], [/^https:\/\/exemplo\.com\.br\/$/, html(goodHtml)]]);
    const r = await checkSite(deps, site);
    expect(r.check.status).toBe('ok');
    expect(r.check.measured).toMatchObject({ status_http: 200, https_final: true, http_redireciona_para_https: true });
    expect(typeof r.check.measured.tempo_total_ms).toBe('number');
    expect(r.findings).toEqual([]);
  });
  it('problemas reais viram achados com a gravidade certa', async () => {
    const bad = '<html><head><meta name="robots" content="noindex"></head><body><h1>a</h1><h1>b</h1></body></html>';
    const { deps } = makeDeps([[/^http:\/\//, html(bad)], [/^https:\/\//, html(bad)]]);
    const r = await checkSite(deps, site);
    const titles = r.findings.map((f) => f.title).join('|');
    expect(r.check.status).toBe('fail');
    expect(titles).toMatch(/noindex/);
    expect(titles).toMatch(/não tem título/);
    expect(titles).toMatch(/meta description/);
    expect(titles).toMatch(/2 títulos H1/);
    expect(titles).toMatch(/viewport/);
    expect(r.findings.find((f) => /redireciona/.test(f.title))?.severity).toBe('media');
  });
  it('site que termina em http e site fora do ar', async () => {
    const insecure = await checkSite(makeDeps([[/^https:\/\//, () => new Response(null, { status: 302, headers: { location: 'http://exemplo.com.br/' } })], [/^http:\/\//, html(goodHtml)]]).deps, site);
    expect(insecure.findings.some((f) => f.severity === 'alta' && /HTTPS/.test(f.title))).toBe(true);
    const down = await checkSite(makeDeps([]).deps, site);
    expect(down.check.status).toBe('fail');
    expect(down.check.measured).toEqual({ endereco: 'https://exemplo.com.br' });
    const err = await checkSite(makeDeps([[/./, html('x', 503)]]).deps, site);
    expect(err.findings[0]).toMatchObject({ severity: 'alta' });
    expect((await checkSite(makeDeps().deps, null)).check.status).toBe('skipped');
  });
  it('página padrão do servidor ("Index of /", nginx, Apache) é achado alto: o site não foi publicado', async () => {
    for (const title of ['Index of /', 'Welcome to nginx!', 'Apache2 Ubuntu Default Page: It works']) {
      const page = `<!doctype html><html><head><title>${title}</title></head><body><h1>x</h1></body></html>`;
      const { deps } = makeDeps([[/^http:\/\//, () => new Response(null, { status: 301, headers: { location: 'https://exemplo.com.br/' } })], [/^https:\/\//, html(page)]]);
      const r = await checkSite(deps, site);
      expect(r.findings.some((f) => f.severity === 'alta' && /página padrão do servidor/.test(f.title)), title).toBe(true);
      expect(r.check.status).toBe('fail');
    }
  });
  it('servidor lento é medido, não presumido', async () => {
    let calls = 0;
    const deps: Deps = { fetchFn: (async () => new Response(goodHtml, { status: 200, headers: { 'content-type': 'text/html' } })) as typeof fetch, lookupA: async () => ['93.184.216.34'], now: () => (calls += 2000) };
    const r = await checkSite(deps, site);
    expect(r.findings.some((f) => /Servidor lento/.test(f.title))).toBe(true);
  });
  it('o site NUNCA é visitado se o nome aponta para a rede interna', async () => {
    const { deps, calls } = makeDeps([[/./, html(goodHtml)]], () => ['192.168.0.10']);
    const r = await checkSite(deps, site);
    expect(calls).toEqual([]);
    expect(r.check.status).toBe('fail');
  });
});

describe('robots, sitemap e llms.txt', () => {
  it('parseRobots: bloqueio total, robôs de IA e sitemaps', () => {
    const r = parseRobots('User-agent: *\nDisallow: /wp-admin/\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nSitemap: https://x.com/sitemap.xml');
    expect(r.disallowAll).toBe(false);
    expect(r.aiBots.GPTBot).toBe('bloqueado');
    expect(r.aiBots.ClaudeBot).toBe('permitido');
    expect(r.aiBots.PerplexityBot).toBe('nao_citado');
    expect(r.sitemaps).toEqual(['https://x.com/sitemap.xml']);
    const all = parseRobots('User-agent: *\nDisallow: /');
    expect(all.disallowAll).toBe(true);
    expect(all.aiBots.GPTBot).toBe('bloqueado_pela_regra_geral');
  });
  it('robots: bloqueio total é alto; robôs de IA bloqueados é só informação; ausente é baixo', async () => {
    const all = await checkRobots(makeDeps([[/robots/, text('User-agent: *\nDisallow: /')]]).deps, site);
    expect(all.check.status).toBe('fail');
    expect(all.findings[0].severity).toBe('alta');
    const ai = await checkRobots(makeDeps([[/robots/, text('User-agent: GPTBot\nDisallow: /\nSitemap: https://exemplo.com.br/sm.xml')]]).deps, site);
    expect(ai.findings[0].severity).toBe('info');
    expect(ai.sitemaps).toEqual(['https://exemplo.com.br/sm.xml']);
    const missing = await checkRobots(makeDeps([[/robots/, html('<html>404</html>', 200)]]).deps, site);
    expect(missing.check.status).toBe('warn');
    expect(missing.findings[0].severity).toBe('baixa');
    expect((await checkRobots(makeDeps([[/robots/, text('x', 500)]]).deps, site)).check.status).toBe('error');
    expect((await checkRobots(makeDeps([]).deps, site)).check.status).toBe('error');
  });
  it('sitemap: acha o do robots, conta endereços; sem sitemap vira achado médio', async () => {
    const xml = `<?xml version="1.0"?><urlset>${'<url><loc>https://exemplo.com.br/a</loc></url>'.repeat(3)}</urlset>`;
    const ok = await checkSitemap(makeDeps([[/sm\.xml/, text(xml, 200, 'application/xml')]]).deps, site, ['https://exemplo.com.br/sm.xml'], base);
    expect(ok.check.measured).toMatchObject({ encontrado: true, tipo: 'urls', quantidade_de_enderecos: 3 });
    const idx = await checkSitemap(makeDeps([[/sitemap\.xml/, text('<sitemapindex><sitemap><loc>a</loc></sitemap></sitemapindex>', 200, 'text/xml')]]).deps, site, [], base);
    expect(idx.check.measured.tipo).toBe('indice');
    const none = await checkSitemap(makeDeps([[/./, html('<html></html>', 404)]]).deps, site, [], { ...base, sitemapDeclared: 'yes' });
    expect(none.check.status).toBe('warn');
    expect(none.findings[0].severity).toBe('media');
    expect(none.findings[0].detail).toMatch(/respondeu que tem/);
  });
  it('sitemap de outro domínio declarado no robots NÃO é visitado', async () => {
    const { deps, calls } = makeDeps([[/./, html('x', 404)]]);
    await checkSitemap(deps, site, ['https://outro-dominio.com/sitemap.xml'], base);
    expect(calls.some((c) => c.includes('outro-dominio'))).toBe(false);
  });
  it('llms.txt: presente, ausente e erro', async () => {
    expect((await checkLlmsTxt(makeDeps([[/llms/, text('# Exemplo\n> Resumo do negócio para as IAs com mais de vinte caracteres')]]).deps, site)).check.status).toBe('ok');
    const no = await checkLlmsTxt(makeDeps([[/llms/, html('<html>404</html>', 404)]]).deps, site);
    expect(no.findings[0].severity).toBe('info');
    expect((await checkLlmsTxt(makeDeps([]).deps, site)).check.status).toBe('error');
  });
});

describe('Wayback e redes', () => {
  it('idade do site: primeiro registro, sem registro e fonte fora do ar', async () => {
    const found = await checkWayback(makeDeps([[/archive\.org/, json({ archived_snapshots: { closest: { timestamp: '20100305120000', status: '200' } } })]]).deps, 'exemplo.com.br');
    expect(found.check.measured).toMatchObject({ registro_encontrado: true, primeiro_registro: '2010-03-05', anos_com_registro: 16 });
    const none = await checkWayback(makeDeps([[/archive\.org/, json({ archived_snapshots: {} })]]).deps, 'exemplo.com.br');
    expect(none.check.measured).toEqual({ registro_encontrado: false });
    expect(none.findings[0].severity).toBe('info');
    const down = await checkWayback(makeDeps([[/archive/, json({}, 503)]]).deps, 'exemplo.com.br');
    expect(down.check.status).toBe('error');
    expect(down.check.measured).toEqual({});
  });
  it('redes: confere só o formato e diz que não acessou', () => {
    const ok = checkSocials({ ...base, socials: { instagram: 'https://instagram.com/exemplo', facebook: 'facebook.com/exemplo' } });
    expect(ok.check.status).toBe('ok');
    expect(JSON.stringify(ok.check.measured)).toMatch(/nao_acessada/);
    const wrong = checkSocials({ ...base, socials: { instagram: 'https://meusite.com/insta', linkedin: 'https://linkedin.com/', youtube: 'isto não é link' } });
    expect(wrong.check.status).toBe('warn');
    expect(wrong.findings).toHaveLength(3);
    expect(checkSocials(base).check.status).toBe('skipped');
  });
});

describe('análise completa', () => {
  const full: Inputs = { cnpj: '11.222.333/0001-81', cnpjStatus: 'Tenho CNPJ', ceps: ['01310100'], siteUrl: 'https://exemplo.com.br', sitemapDeclared: 'unknown', socials: { instagram: 'https://instagram.com/exemplo' } };
  it('com toda a rede fora do ar: nada é inventado e as pagas ficam "não executadas"', async () => {
    const { deps } = makeDeps([]);
    const r = await runAnalysis(deps, full);
    const by = Object.fromEntries(r.checks.map((c) => [c.check_key, c]));
    for (const k of ['cnpj_receita', 'cep', 'dominio_rdap', 'dns', 'robots_txt', 'llms_txt', 'site_idade']) { expect(by[k].status, k).toBe('error'); expect(by[k].measured, k).toEqual({}); }
    expect(by.site_resposta.status).toBe('fail');
    expect(by.maps_google_meu_negocio).toMatchObject({ status: 'skipped', measured: {} });
    expect(by.ia_marca).toMatchObject({ status: 'skipped', measured: {} });
    expect(r.findings.every((f) => f.check_key === 'site_resposta' || f.check_key === 'sitemap')).toBe(true);
    expect(runStatus(r.checks)).toBe('partial');
    expect(r.summary).toMatchObject({ version: 'p4a-1', pagas: { executadas: false } });
  });
  it('resultado reproduzível: mesmas respostas, mesmo relatório', async () => {
    const routes: Array<[RegExp, Handler]> = [
      [/brasilapi\.com\.br\/api\/cnpj/, json({ razao_social: 'X', descricao_situacao_cadastral: 'ATIVA', municipio: 'SAO PAULO', uf: 'SP', qsa: [] })],
      [/brasilapi\.com\.br\/api\/cep/, json({ city: 'São Paulo', state: 'SP' })],
      [/rdap\.registro\.br/, json({ events: [{ eventAction: 'expiration', eventDate: new Date(T0 + 400 * 86_400_000).toISOString() }] })],
      [/cloudflare-dns/, json({ Status: 0, Answer: [] })],
      [/archive\.org/, json({ archived_snapshots: {} })],
      [/^https?:\/\/exemplo\.com\.br\/robots\.txt/, text('User-agent: *\nAllow: /')],
      [/llms\.txt/, html('x', 404)],
      [/^http:\/\//, () => new Response(null, { status: 301, headers: { location: 'https://exemplo.com.br/' } })],
      [/^https:\/\/exemplo\.com\.br\/(sitemap|wp-sitemap)/, html('x', 404)],
      [/^https:\/\/exemplo\.com\.br\/$/, html(goodHtml)],
    ];
    const strip = (r: Awaited<ReturnType<typeof runAnalysis>>) => ({ ...r, checks: r.checks.map((c) => ({ ...c, duration_ms: 0 })) });
    const a = strip(await runAnalysis(makeDeps(routes).deps, full));
    const b = strip(await runAnalysis(makeDeps(routes).deps, full));
    expect(a).toEqual(b);
    expect(a.checks.find((c) => c.check_key === 'cnpj_receita')?.status).toBe('ok');
    expect(a.checks.find((c) => c.check_key === 'site_resposta')?.status).toBe('ok');
  });
  it('site informado que aponta para a rede interna é descartado antes de qualquer visita', async () => {
    const { deps, calls } = makeDeps([[/./, html(goodHtml)]]);
    const r = await runAnalysis(deps, { ...full, siteUrl: 'http://169.254.169.254/latest/meta-data' });
    expect(calls.some((c) => c.includes('169.254'))).toBe(false);
    expect(r.checks.find((c) => c.check_key === 'site_resposta')?.status).toBe('skipped');
  });
});
