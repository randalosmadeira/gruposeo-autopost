import { describe, expect, it } from 'vitest';
import { classifyAnchor, extractLinks, parseDelimited, parseImport, summarize, verifyLink, type LinkRow } from '../../supabase/functions/_shared/backlinks-core';
import type { Deps } from '../../supabase/functions/_shared/profile-analyze-core';

const NOW = Date.UTC(2026, 10, 19, 12);

describe('backlinks: importação', () => {
  it('CSV com aspas e quebra de linha dentro do campo', () => {
    expect(parseDelimited('a,"b,c","d\ne"\nx,y,z', ',')).toEqual([['a', 'b,c', 'd\ne'], ['x', 'y', 'z']]);
  });
  it('uma URL por linha: normaliza, tira #, deduplica e descarta o que não é página pública', () => {
    const r = parseImport('https://blog.com/post-1#x\nhttps://blog.com/post-1\nhttp://localhost/x\nlixo sem endereco\nhttps://exemplo.com.br/interno\nnoticias.com.br/materia', 'exemplo.com.br');
    expect(r.rows.map((x) => x.source_url)).toEqual(['https://blog.com/post-1', 'https://noticias.com.br/materia']);
    expect(r).toMatchObject({ duplicates: 1, self_links: 1, invalid: 2, header: false });
  });
  it('export com cabeçalho (inglês ou português, vírgula, ponto e vírgula ou tab): origem, destino, âncora e atributo', () => {
    const csv = 'Referring page URL;Target URL;Anchor;Type\nhttps://a.com/p;https://exemplo.com.br/x;RDM Advogados;dofollow\nhttps://b.com/q;https://exemplo.com.br/;clique aqui;nofollow\n';
    const r = parseImport(csv, 'exemplo.com.br');
    expect(r.header).toBe(true);
    expect(r.rows).toMatchObject([{ source_url: 'https://a.com/p', target_url: 'https://exemplo.com.br/x', anchor: 'RDM Advogados', link_attr: 'follow' }, { source_url: 'https://b.com/q', anchor: 'clique aqui', link_attr: 'nofollow' }]);
    const pt = parseImport('URL de origem\tÂncora\tnofollow\nhttps://c.com/z\tmeu texto\ttrue', 'exemplo.com.br');
    expect(pt.rows[0]).toMatchObject({ source_url: 'https://c.com/z', anchor: 'meu texto', link_attr: 'nofollow' });
  });
  it('arquivo com BOM e limite de linhas', () => {
    expect(parseImport('﻿https://a.com/1', 'x.com').rows).toHaveLength(1);
    const big = Array.from({ length: 2100 }, (_, i) => `https://site${i}.com/p`).join('\n');
    const r = parseImport(big, 'exemplo.com.br');
    expect(r.rows).toHaveLength(2000);
    expect(r.truncated).toBe(true);
  });
});

describe('backlinks: leitura do HTML', () => {
  const html = `<html><head><meta name="robots" content="index,follow"></head><body>
    <a href="https://www.exemplo.com.br/servicos" rel="nofollow noopener">Advocacia Criminal</a>
    <a href="/interno">Outro</a>
    <a href="https://blog.exemplo.com.br/"><img src="x.png" alt="Logo RDM"></a>
    <a href="https://terceiro.com/">fora</a>
    <a href="javascript:void(0)">js</a>
    <a href='https://exemplo.com.br/' rel="sponsored">Patrocinado &amp; parceiro</a>
  </body></html>`;
  it('acha os links para o domínio (qualquer subdomínio) e lê âncora, imagem e rel', () => {
    const p = extractLinks(html, 'https://parceiro.com/pagina', 'exemplo.com.br');
    expect(p.links.map((l) => [l.href, l.anchor, l.attr])).toEqual([
      ['https://www.exemplo.com.br/servicos', 'Advocacia Criminal', 'nofollow'],
      ['https://blog.exemplo.com.br/', 'Logo RDM', 'follow'],
      ['https://exemplo.com.br/', 'Patrocinado & parceiro', 'sponsored'],
    ]);
    expect(p.links[1].imageOnly).toBe(true);
    expect(p.noindex).toBe(false);
  });
  it('robots da página (meta e cabeçalho): noindex e nofollow geral', () => {
    const a = extractLinks('<meta name="robots" content="noindex, nofollow"><a href="https://exemplo.com.br/">x</a>', 'https://p.com/', 'exemplo.com.br');
    expect(a).toMatchObject({ noindex: true, pageNofollow: true });
    expect(a.links[0].attr).toBe('nofollow');
    expect(extractLinks('<a href="https://exemplo.com.br/">x</a>', 'https://p.com/', 'exemplo.com.br', 'noindex').noindex).toBe(true);
  });
  it('link relativo na própria página do alvo conta quando o domínio base é o alvo', () => {
    expect(extractLinks('<a href="/x">x</a>', 'https://exemplo.com.br/a', 'exemplo.com.br').links).toHaveLength(1);
  });
});

function deps(responses: Record<string, () => Response | Promise<Response>>): Deps {
  return {
    now: () => NOW, lookupA: async () => ['93.184.216.34'],
    fetchFn: (async (input: RequestInfo | URL) => {
      const f = responses[String(input)];
      if (!f) throw new Error('falha');
      return f();
    }) as typeof fetch,
  };
}
const page = (html: string, status = 200, headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' }) => () => new Response(html, { status, headers });

describe('backlinks: verificação ao vivo', () => {
  it('link no ar -> live, com âncora, atributo e a URL de destino', async () => {
    const v = await verifyLink(deps({ 'https://a.com/p': page('<a href="https://exemplo.com.br/x" rel="ugc">RDM</a>') }), 'https://a.com/p', 'exemplo.com.br');
    expect(v).toMatchObject({ status: 'live', http_status: 200, links_found: 1, anchor: 'RDM', link_attr: 'ugc', target_url: 'https://exemplo.com.br/x', check_error: null });
  });
  it('página abre mas o link não está no HTML -> lost (e diz que é "não encontrado no HTML")', async () => {
    const v = await verifyLink(deps({ 'https://a.com/p': page('<p>nada</p>') }), 'https://a.com/p', 'exemplo.com.br');
    expect(v).toMatchObject({ status: 'lost', links_found: 0, check_error: 'link_nao_encontrado_no_html' });
  });
  it('404/410 -> dead; 403/429 -> blocked; 5xx e tempo esgotado NÃO viram perdido (ficam não verificados)', async () => {
    const d = deps({ 'https://a.com/404': page('', 404), 'https://a.com/403': page('', 403), 'https://a.com/500': page('', 503) });
    expect((await verifyLink(d, 'https://a.com/404', 'exemplo.com.br')).status).toBe('dead');
    expect((await verifyLink(d, 'https://a.com/403', 'exemplo.com.br')).status).toBe('blocked');
    const five = await verifyLink(d, 'https://a.com/500', 'exemplo.com.br');
    expect(five).toMatchObject({ status: 'unverified', http_status: 503 });
    const net = await verifyLink(deps({}), 'https://a.com/x', 'exemplo.com.br');
    expect(net.status).toBe('unverified');
  });
  it('conteúdo que não é HTML (PDF) fica não verificado; domínio que não resolve é página fora do ar', async () => {
    const pdf = await verifyLink(deps({ 'https://a.com/f.pdf': page('%PDF', 200, { 'content-type': 'application/pdf' }) }), 'https://a.com/f.pdf', 'exemplo.com.br');
    expect(pdf).toMatchObject({ status: 'unverified', check_error: 'conteudo_nao_html' });
    const dead = await verifyLink({ now: () => NOW, fetchFn: fetch, lookupA: async () => [] }, 'https://a.com/p', 'exemplo.com.br');
    expect(dead).toMatchObject({ status: 'dead', check_error: 'endereco_privado_ou_nao_resolvido' });
  });
  it('não visita endereço privado (proteção contra SSRF)', async () => {
    const v = await verifyLink({ now: () => NOW, fetchFn: (async () => { throw new Error('nao deveria buscar'); }) as typeof fetch, lookupA: async () => ['10.0.0.5'] }, 'https://interno.exemplo.org/p', 'exemplo.com.br');
    expect(v.status).toBe('dead');
  });
  it('página noindex é sinalizada', async () => {
    const v = await verifyLink(deps({ 'https://a.com/p': page('<a href="https://exemplo.com.br/">x</a>', 200, { 'content-type': 'text/html', 'x-robots-tag': 'noindex' }) }), 'https://a.com/p', 'exemplo.com.br');
    expect(v).toMatchObject({ status: 'live', source_noindex: true });
  });
});

describe('backlinks: âncoras e resumo', () => {
  it('classifica a âncora', () => {
    const brand = ['RDM Advogados', 'rdmadvogados'];
    expect(classifyAnchor('RDM Advogados Associados', brand, 'rdmadvogados.com.br')).toBe('marca');
    expect(classifyAnchor('www.rdmadvogados.com.br', brand, 'rdmadvogados.com.br')).toBe('url');
    expect(classifyAnchor('Clique aqui', brand, 'rdmadvogados.com.br')).toBe('generico');
    expect(classifyAnchor('', brand, 'rdmadvogados.com.br')).toBe('imagem');
    expect(classifyAnchor('advogado criminalista em guarulhos', brand, 'rdmadvogados.com.br')).toBe('palavra_chave');
  });

  const row = (i: number, over: Partial<LinkRow> = {}): LinkRow => ({
    source_url: `https://d${i}.com/p`, source_domain: `d${i}.com`, anchor: 'advogado criminal', link_attr: 'follow', origin: 'ahrefs', status: 'live', http_status: 200,
    last_checked_at: '2026-11-18T10:00:00.000Z', status_changed_at: '2026-11-10T10:00:00.000Z', first_seen_at: '2026-11-01T10:00:00.000Z', last_live_at: '2026-11-05T10:00:00.000Z', ...over,
  });
  it('conta por situação, domínios, atributo, âncora e origem; sem inventar', () => {
    const rows = [row(1), row(2, { anchor: 'RDM Advogados', link_attr: 'nofollow' }), row(3, { status: 'unverified', last_checked_at: null, anchor: null, link_attr: null }), row(4, { status: 'lost', status_changed_at: '2026-11-15T10:00:00.000Z' }), row(5, { source_domain: 'd1.com' })];
    const s = summarize(rows, ['RDM Advogados'], 'rdm.com.br', NOW);
    expect(s.total).toBe(5);
    expect(s.by_status).toEqual({ unverified: 1, live: 3, lost: 1, dead: 0, blocked: 0 });
    expect(s.verified_pct).toBe(80);
    expect(s.referring_domains).toEqual({ all: 4, live: 2 });
    expect(s.attr).toMatchObject({ follow: 2, nofollow: 1, sponsored: 0 });
    expect(s.anchors).toMatchObject({ marca: 1, palavra_chave: 2 });
    expect(s.by_origin).toEqual({ ahrefs: 5 });
    expect(s.top_domains[0]).toEqual({ domain: 'd1.com', live: 2, total: 2 });
    expect(s.lost_recent.count).toBe(1);
  });
  it('sinais de atenção só aparecem com amostra suficiente e dizem o número', () => {
    const few = summarize([row(1)], [], 'rdm.com.br', NOW);
    expect(few.flags).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => row(i, { source_domain: 'mesmo.com', link_attr: 'nofollow' }));
    const s = summarize(many, [], 'rdm.com.br', NOW);
    expect(s.flags.map((f) => f.key)).toEqual(expect.arrayContaining(['concentracao', 'poucos_follow', 'ancora_palavra_chave']));
    expect(s.flags.find((f) => f.key === 'concentracao')?.text).toMatch(/100%/);
  });
  it('link que nunca foi visto no ar não conta como "perdido recente"', () => {
    const s = summarize([row(1, { status: 'lost', status_changed_at: '2026-11-18T10:00:00.000Z', last_live_at: null })], [], 'rdm.com.br', NOW);
    expect(s.lost_recent.count).toBe(0);
  });
});
