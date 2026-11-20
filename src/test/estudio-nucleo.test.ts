import { describe, expect, it, vi } from 'vitest';
import { breadcrumbsFor, buildSlugPath, publicUrl, redirectFor, slugifySegment, suggestAlternatives, validateSlugPath } from '../../supabase/functions/_shared/studio-url';
import { assessDoorway, checkThrottle, jaccard, measureOverlap, neutralize, shingles } from '../../supabase/functions/_shared/studio-doorway';
import { anchorVariety, extractLinks, findOrphans, isOfficialHost, planExternalLinks, planInternalLinks, renderLinkBlocks, replaceLinkBlocks, verifyLinks } from '../../supabase/functions/_shared/studio-links';
import { buildFactBank, extractPendingMarkers, guardInvention } from '../../supabase/functions/_shared/studio-facts';
import { buildImages, buildImagePrompt, checkAlt, planSlots, resolvePolicy, selectFromAcervo, semanticFilename, type AssetRow } from '../../supabase/functions/_shared/studio-images';
import { buildPluginPagePayload, buildSitemapXml, buildStaticPackage, parsePluginPageReply, ZICA_HOSTED_CONTRACT } from '../../supabase/functions/_shared/studio-adapters';
import { buildSuperiorityBrief, checkNoCopy, citedSourcesMap, classifyHost, classifyIntent, EMPTY_RADAR, findGaps, type RadarInput } from '../../supabase/functions/_shared/studio-brief';
import { approvalCheck, canTransition, contentHash, estimateCost, publishCheck } from '../../supabase/functions/_shared/studio-core';
import { profileFromProject } from '../../supabase/functions/_shared/studio-profile';
import { buildStudioSchema } from '../../supabase/functions/_shared/studio-schema';
import { runGates } from '../../supabase/functions/_shared/studio-gates';
import { FACTS, GOOD_BODY, ORIGIN, ctxFor, goodDoc, profile, rulesFor } from './helpers/estudio-fixtures';

describe('URL semântica', () => {
  it('minúsculas, sem acento, sem palavras de ligação, até 3 níveis, hífen; funciona em outros alfabetos', () => {
    expect(slugifySegment('Advogado Criminalista em São Paulo!', 'pt')).toBe('advogado-criminalista-sao-paulo');
    expect(slugifySegment('The best lawyer for the case', 'en')).toBe('best-lawyer-case');
    expect(slugifySegment('Rechtsanwalt für Strafrecht', 'de')).toBe('rechtsanwalt-strafrecht');
    expect(slugifySegment('弁護士 東京', 'ja')).toBe('弁護士-東京');
    expect(buildSlugPath(['Advogado criminalista', 'Guarulhos', 'Flagrante', 'quarto nível'], 'pt')).toBe('advogado-criminalista/guarulhos/flagrante');
    expect(slugifySegment('uma palavra com muitas outras palavras que passam do limite de seis palavras', 'pt').split('-').length).toBeLessThanOrEqual(6);
  });
  it('recusa reservado, data/ID, caracteres inválidos, nível curto/longo, mais de 3 níveis; colisão sugere alternativas SEM sufixo numérico', () => {
    const codes = (p: string, o = {}) => validateSlugPath(p, o).issues.map((i) => i.code);
    expect(codes('blog/post')).toContain('reservado');
    expect(codes('wp-admin')).toContain('reservado');
    expect(codes('noticias/2026-11-20')).toContain('data_ou_id');
    expect(codes('Advogado/Guarulhos')).toContain('caracteres');
    expect(codes('ab/cidade')).toContain('tamanho');
    expect(codes('a-b-c-d-e-f-g/cidade')).toContain('palavras');
    expect(codes('um/dois/tres/quatro')).toContain('niveis');
    expect(codes('')).toContain('vazio');
    const c = validateSlugPath('advogado-criminalista/guarulhos', { existing: ['advogado-criminalista/guarulhos'], qualifiers: ['plantão', 'flagrante'] });
    expect(c.ok).toBe(false);
    expect(c.issues.map((i) => i.code)).toContain('colisao');
    expect(c.suggestions).toEqual(['advogado-criminalista/guarulhos-plantao', 'advogado-criminalista/guarulhos-flagrante']);
    expect(c.suggestions.some((s) => /-\d$/.test(s))).toBe(false);
    expect(validateSlugPath('advogado-criminalista/guarulhos', { existing: ['advogado-criminalista/guarulhos'], selfPath: 'advogado-criminalista/guarulhos' }).ok).toBe(true);
    expect(suggestAlternatives('a/b', ['a/b'], [], 'pt')).toEqual([]);
  });
  it('a hierarquia do endereço é a trilha; URL pública com subpasta do WordPress e barra final; 301 só para página publicada', () => {
    expect(publicUrl('https://x.example/', 'servicos/cidade', '/blog/')).toBe('https://x.example/blog/servicos/cidade/');
    const crumbs = breadcrumbsFor({ origin: 'https://x.example', slugPath: 'servicos/cidade', homeLabel: 'Início', title: 'Serviço na cidade', labels: { servicos: 'Serviços' } });
    expect(crumbs.map((c) => c.name)).toEqual(['Início', 'Serviços', 'Serviço na cidade']);
    expect(crumbs[2].url).toBe('https://x.example/servicos/cidade/');
    expect(redirectFor('servicos/cidade', 'servicos/cidade-sp', true)).toEqual({ from: '/servicos/cidade/', to: '/servicos/cidade-sp/' });
    expect(redirectFor('servicos/cidade', 'servicos/cidade-sp', false)).toBeNull();
    expect(redirectFor('a/b', 'a/b', true)).toBeNull();
  });
  it('máquina de estados: rascunho -> revisão -> aprovada -> publicada; não pula etapa', () => {
    expect(canTransition('rascunho', 'em_revisao')).toBe(true);
    expect(canTransition('rascunho', 'aprovada')).toBe(false);
    expect(canTransition('rascunho', 'publicada')).toBe(false);
    expect(canTransition('em_revisao', 'aprovada')).toBe(true);
    expect(canTransition('aprovada', 'publicada')).toBe(true);
    expect(canTransition('publicada', 'despublicada')).toBe(true);
    expect(canTransition('despublicada', 'publicada')).toBe(true);
  });
});

describe('texto único, páginas de porta e trava de lote', () => {
  const base = GOOD_BODY;
  it('o molde com só o nome do lugar trocado é quase 100% igual; texto próprio é diferente', () => {
    const o = measureOverlap({ html: base, place: 'Guarulhos' }, [{ id: 's', label: 'Osasco', html: base.replace(/Guarulhos/g, 'Osasco'), place: 'Osasco' }]);
    expect(o.maxSimilarity).toBeGreaterThan(0.9);
    expect(o.uniquePct).toBeLessThan(10);
    const own = measureOverlap({ html: '<p>A Zona Leste tem a Delegacia da Mooca e o plantão do fórum de Itaquera funciona aos sábados até às 12 horas, segundo o regimento interno do tribunal.</p>', place: 'Itaquera' }, [{ id: 's', label: 'Osasco', html: base.replace(/Guarulhos/g, 'Osasco'), place: 'Osasco' }]);
    expect(own.uniquePct).toBeGreaterThan(80);
    expect(neutralize('<p>Em Guarulhos chove</p>', ['Guarulhos'])).toContain('lugar');
    expect(jaccard(shingles('a b c d e f g'), shingles('a b c d e f g'))).toBe(1);
  });
  it('veredito: porta (com proposta de consolidar), fina (palavras do perfil) e ok; limites são do perfil', () => {
    const sib = [{ id: 's', label: 'Osasco', html: base.replace(/Guarulhos/g, 'Osasco'), place: 'Osasco' }];
    const porta = assessDoorway({ html: base, place: 'Guarulhos', type: 'local' }, sib, { minUniquePct: 60, maxSimilarityPct: 70, minWords: null });
    expect(porta.verdict).toBe('porta');
    expect(porta.proposal).toMatch(/Consolide/);
    expect(porta.reasons.join(' ')).toMatch(/nome do lugar trocado/);
    expect(assessDoorway({ html: base, place: 'Guarulhos', type: 'local' }, sib, { minUniquePct: null, maxSimilarityPct: null, minWords: null }).verdict).toBe('ok');
    expect(assessDoorway({ html: '<p>Curto demais.</p>', place: 'X', type: 'local' }, [], { minUniquePct: 60, maxSimilarityPct: 70, minWords: 100 }).verdict).toBe('fina');
    expect(assessDoorway({ html: base, place: 'Guarulhos', type: 'local' }, [], { minUniquePct: 60, maxSimilarityPct: 70, minWords: 10 }).verdict).toBe('ok');
  });
  it('trava de lote: quantas páginas novas por lote e publicações por dia (números do perfil)', () => {
    expect(checkThrottle({ requested: 1, createdInWindow: 5, batchLimit: 5, publishedToday: 0, dailyPublishLimit: 10, kind: 'criar' })).toMatchObject({ blocked: true, allowed: 0 });
    expect(checkThrottle({ requested: 4, createdInWindow: 3, batchLimit: 5, publishedToday: 0, dailyPublishLimit: 10, kind: 'criar' })).toMatchObject({ blocked: false, allowed: 2 });
    expect(checkThrottle({ requested: 1, createdInWindow: 0, batchLimit: 5, publishedToday: 3, dailyPublishLimit: 3, kind: 'publicar' }).blocked).toBe(true);
    expect(checkThrottle({ requested: 1, createdInWindow: 0, batchLimit: 5, publishedToday: 2, dailyPublishLimit: 3, kind: 'publicar' }).blocked).toBe(false);
  });
});

describe('plano de links: internos (hub, fortes, âncoras variadas, sem órfã) e externos (oficiais verificados, sem âncora exata)', () => {
  const site = [
    { url: `${ORIGIN}/advogado-criminalista/`, title: 'Advogado criminalista', slugPath: 'advogado-criminalista', keywords: ['advogado', 'criminalista'], impressions: 900, published: true },
    { url: `${ORIGIN}/advogado-criminalista/flagrante/`, title: 'Flagrante', slugPath: 'advogado-criminalista/flagrante', keywords: ['flagrante', 'preso'], impressions: 400, published: true },
    { url: `${ORIGIN}/advogado-criminalista/custodia/`, title: 'Custódia', slugPath: 'advogado-criminalista/custodia', keywords: ['custodia', 'audiencia', 'flagrante'], impressions: 100, inlinks: 0, published: true },
    { url: `${ORIGIN}/rascunho-nao-publicado/`, title: 'Rascunho', slugPath: 'rascunho', keywords: ['flagrante'], published: false },
    { url: `${ORIGIN}/guia-prisao/`, title: 'Guia da prisão', slugPath: 'guia-prisao', keywords: ['flagrante', 'prisao'], impressions: 0, inlinks: 0, published: true },
  ];
  const input = { page: { url: `${ORIGIN}/advogado-criminalista/guarulhos/`, slugPath: 'advogado-criminalista/guarulhos', title: 'Advogado criminalista em Guarulhos', subject: 'advogado criminalista', place: 'Guarulhos', keywords: ['flagrante', 'advogado'], type: 'local' }, site, minLinks: 3 };
  it('hub primeiro, irmãs e fortes do tema; só páginas publicadas; o hub recebe sugestão de link de volta; ajuda página órfã', () => {
    const p = planInternalLinks(input);
    expect(p.links[0]).toMatchObject({ url: `${ORIGIN}/advogado-criminalista/`, kind: 'interno' });
    expect(p.links[0].reason).toMatch(/hub/);
    expect(p.links.map((l) => l.url)).not.toContain(`${ORIGIN}/rascunho-nao-publicado/`);
    expect(p.inbound).toEqual([{ from: `${ORIGIN}/advogado-criminalista/`, to: input.page.url, reason: expect.stringMatching(/hub/) }]);
    expect(p.links.some((l) => /órfã/.test(l.reason))).toBe(true);
    expect(p.missing).toBe(0);
  });
  it('âncoras variam entre páginas para o MESMO destino (nunca repete a anterior) e a variedade é medida', () => {
    const used: Record<string, string[]> = {};
    const a1 = planInternalLinks({ ...input, usedAnchors: used });
    const a2 = planInternalLinks({ ...input, page: { ...input.page, url: `${ORIGIN}/advogado-criminalista/osasco/`, slugPath: 'advogado-criminalista/osasco' }, usedAnchors: used });
    const hub1 = a1.links.find((l) => l.url === `${ORIGIN}/advogado-criminalista/`)!.anchor;
    const hub2 = a2.links.find((l) => l.url === `${ORIGIN}/advogado-criminalista/`)!.anchor;
    expect(hub1).not.toBe(hub2);
    expect(anchorVariety([{ to: 'x', anchor: 'a' }, { to: 'x', anchor: 'a' }, { to: 'x', anchor: 'a' }, { to: 'x', anchor: 'b' }]).ok).toBe(false);
    expect(anchorVariety([{ to: 'x', anchor: 'a' }, { to: 'x', anchor: 'b' }, { to: 'x', anchor: 'c' }]).ok).toBe(true);
  });
  it('órfãs: páginas sem link de entrada', () => {
    expect(findOrphans([{ url: 'a' }, { url: 'b' }, { url: 'c' }], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }])).toEqual(['c']);
  });
  it('externos: https, oficial OU verificada; recusa âncora igual à palavra-chave, repetido, próprio site e não verificado', () => {
    const r = planExternalLinks({
      sources: [
        { url: 'https://atos.cnj.jus.br/atos/detalhar/2234', label: 'Resolução 213/2015 do CNJ', official: true },
        { url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del3689.htm', label: 'advogado criminalista guarulhos' },
        { url: 'https://blog.example/post', label: 'Um blog' },
        { url: 'https://referencia-boa.example/estudo', label: 'Estudo X', verified: true },
        { url: 'http://inseguro.example/', label: 'Inseguro', official: true },
        { url: `${ORIGIN}/propria/`, label: 'Própria' },
        { url: 'https://quebrada.example/', label: 'Quebrada', verified: false },
        { url: 'https://atos.cnj.jus.br/atos/detalhar/2234', label: 'Repetida', official: true },
      ], targetKeywords: ['advogado criminalista guarulhos'], ownHost: 'aurora-advogados.example', min: 2,
    });
    expect(r.links.map((l) => l.url)).toEqual(['https://atos.cnj.jus.br/atos/detalhar/2234', 'https://referencia-boa.example/estudo']);
    expect(r.links.every((l) => l.rel === 'noopener')).toBe(true);
    const why = r.rejected.map((x) => x.why).join(' | ');
    for (const w of [/correspondência exata/, /não é fonte oficial/, /https/, /próprio site/, /verificação falhou/, /repetido/]) expect(why).toMatch(w);
    expect(r.missing).toBe(0);
    expect(isOfficialHost('www.tjsp.jus.br')).toBe(true);
    expect(isOfficialHost('jusbrasil.com.br')).toBe(false);
  });
  it('verificação HEAD/200 com rede injetada: 200 ok, 404 não, HEAD recusado cai para GET, rede interna e http não saem', async () => {
    const calls: Array<[string, string]> = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => { calls.push([init?.method || 'GET', url]); if (url.includes('ok.example')) return new Response(null, { status: 200 }); if (url.includes('nohead.example')) return new Response(null, { status: init?.method === 'HEAD' ? 405 : 200 }); return new Response(null, { status: 404 }); }) as unknown as typeof fetch;
    const lookupA = async (h: string) => (h === 'interno.example' ? ['10.0.0.5'] : ['93.184.216.34']);
    const r = await verifyLinks(['https://ok.example/a', 'https://nohead.example/b', 'https://gone.example/c', 'https://interno.example/d', 'http://inseguro.example/e'], { fetchFn, lookupA });
    expect(r.map((x) => [x.url, x.ok])).toEqual([['https://ok.example/a', true], ['https://nohead.example/b', true], ['https://gone.example/c', false], ['https://interno.example/d', false], ['http://inseguro.example/e', false]]);
    expect(calls.filter(([, u]) => u.includes('nohead')).map(([m]) => m)).toEqual(['HEAD', 'GET']);
    expect(calls.some(([, u]) => u.includes('interno'))).toBe(false);
  });
  it('blocos de links no HTML e leitura dos links; trocar o bloco não mexe no resto do texto', () => {
    const blocks = renderLinkBlocks([{ url: `${ORIGIN}/a/`, anchor: 'Página A', kind: 'interno', reason: '' }, { url: 'https://gov.example/lei', anchor: 'Lei', kind: 'externo', reason: '' }], { related: 'Veja também', sources: 'Fontes' });
    expect(blocks).toContain('data-zica-links');
    const html = `<p>Texto.</p>\n${blocks}`;
    const l = extractLinks(html, ORIGIN);
    expect(l.internal).toHaveLength(1); expect(l.external[0].rel).toBe('noopener');
    const next = replaceLinkBlocks(html, renderLinkBlocks([{ url: `${ORIGIN}/b/`, anchor: 'B', kind: 'interno', reason: '' }], { related: 'Veja também', sources: 'Fontes' }));
    expect(next).toContain('<p>Texto.</p>'); expect(next).toContain('/b/'); expect(next).not.toContain('/a/'); expect(next.match(/data-zica-links/g)).toHaveLength(1);
  });
});

describe('banco de fatos e guarda contra invenção', () => {
  const bank = buildFactBank({ profile: profile(), fieldFacts: FACTS, sources: [{ url: 'https://atos.cnj.jus.br/atos/detalhar/2234', label: 'Resolução 213/2015 do CNJ', official: true }], ownOrigin: ORIGIN });
  const codes = (html: string) => guardInvention(html, bank, { nowYear: 2026, ownOrigin: ORIGIN }).filter((i) => i.severity === 'bloqueia').map((i) => i.code);
  it('o que está nos dados passa; ano corrente passa; número solto, telefone, endereço, link e depoimento não', () => {
    expect(codes('<p>A audiência de custódia sai em até 24 horas, conforme a Resolução 213/2015 do CNJ. Ligue (11) 4002-8922.</p>')).toEqual([]);
    expect(codes('<p>Atualizado em 2026.</p>')).toEqual([]);
    expect(codes('<p>Resolvemos 4.500 casos.</p>')).toEqual(['numero_sem_origem']);
    expect(codes('<p>Desde 1998 no mercado.</p>')).toEqual(['ano_sem_origem']);
    expect(codes('<p>Fale no (11) 90000-1234.</p>')).toEqual(['telefone_sem_origem']);
    expect(codes('<p>Estamos na Avenida Brasil, 500.</p>')).toEqual(['endereco_sem_origem']);
    expect(codes('<p><a href="https://outro.example/">x</a></p>')).toEqual(['url_sem_origem']);
    expect(codes('<p>5 estrelas! O que nossos clientes dizem: ótimo.</p>')).toEqual(['depoimento_sem_origem', 'depoimento_sem_origem']);
    expect(codes('<p>Esperamos 5 minutos.</p>')).toEqual([]); // número de 1 dígito sem unidade de fato não afirma nada
  });
  it('marcadores de pendência em vários idiomas viram lista', () => {
    expect(extractPendingMarkers('<p>[PENDENTE: fórum] [PENDING: court] [PENDIENTE: juzgado] [OFFEN: Gericht]</p>')).toEqual(['fórum', 'court', 'juzgado', 'Gericht']);
  });
});

describe('imagens: acervo, política, alt, nome, formato; sem inventar', () => {
  const asset = (over: Partial<AssetRow> = {}): AssetRow => ({ id: 'a', label: 'Prédio', source_type: 'external_url', external_url: 'https://x.example/a.webp', alt_text: 'Prédio comercial no centro visto da calçada, de manhã', semantic_filename: 'predio-centro.webp', semantic_tags: ['centro', 'guarulhos'], is_active: true, usage_count: 0, ...over });
  it('seleção por tema, menos usada no empate, sem relação sinalizada; inativa e sem URL ficam de fora', () => {
    const list = [asset({ id: '1', semantic_tags: ['osasco'], usage_count: 0 }), asset({ id: '2', semantic_tags: ['guarulhos'], usage_count: 5 }), asset({ id: '3', semantic_tags: ['guarulhos'], usage_count: 1 }), asset({ id: '4', is_active: false, semantic_tags: ['guarulhos'] }), asset({ id: '5', external_url: null, public_url: null, semantic_tags: ['guarulhos'] })];
    expect(selectFromAcervo(list, { subject: 'advogado', place: 'Guarulhos' })!.asset.id).toBe('3');
    expect(selectFromAcervo([asset({ semantic_tags: ['outra', 'coisa'], label: 'x', alt_text: 'y' })], { subject: 'advogado', place: 'Guarulhos' })!.matched).toBe(false);
    expect(selectFromAcervo([], { subject: 'a' })).toBeNull();
  });
  it('alt: vazio, genérico, longo ou igual ao arquivo reprova; nome de arquivo semântico; política com padrões conservadores', () => {
    expect(checkAlt('').ok).toBe(false);
    expect(checkAlt('Imagem de um escritório').problems.join()).toMatch(/genérico/);
    expect(checkAlt('Photo of a desk').problems.join()).toMatch(/genérico/);
    expect(checkAlt('x'.repeat(130)).problems.join()).toMatch(/125/);
    expect(checkAlt('predio centro', 'predio-centro.webp').problems.join()).toMatch(/nome do arquivo/);
    expect(checkAlt('Mesa de trabalho com documentos e uma caneta').ok).toBe(true);
    expect(semanticFilename('Advogado criminalista', 'Guarulhos', 'hero', 'webp', 'pt')).toBe('advogado-criminalista-guarulhos.webp');
    expect(semanticFilename('Advogado criminalista', null, 'og', 'avif', 'pt')).toBe('advogado-criminalista-og.avif');
    const pol = resolvePolicy([{ allow_ai_generation: true, hero_width: 1600, preferred_format: 'avif' }, null]);
    expect(pol).toMatchObject({ allow_ai_generation: true, hero_width: 1600, preferred_format: 'avif', auto_select: true });
    expect(resolvePolicy([])).toMatchObject({ allow_ai_generation: false, preferred_format: 'webp' });
    expect(planSlots(pol, 2).map((s) => s.slot)).toEqual(['hero', 'og', 'inline', 'inline']);
    expect(planSlots(pol, 1)[2].lazy).toBe(true);
  });
  it('o prompt proíbe rosto real, lugar falso, texto e marca d\'água; geração só pela porta injetada, no teto; erro de teto vira pendência', async () => {
    const prompt = buildImagePrompt({ sceneEn: 'A desk with documents' }, { width: 1200, height: 675 });
    for (const w of [/NO identifiable real person/, /NO invented faces/, /NO text/, /watermarks/, /NO real address/, /minimalist/]) expect(prompt).toMatch(w);
    const denied = { generate: vi.fn(async () => { const e = new Error('Teto atingido'); e.name = 'SpendDeniedError'; throw e; }) };
    const r = await buildImages({ policy: resolvePolicy([{ allow_ai_generation: true }]), assets: [], topic: { subject: 'advogado' }, language: 'pt-BR', origin: ORIGIN, scene: { sceneEn: 'A desk', alt: 'Mesa de trabalho com documentos e uma caneta' }, port: denied });
    expect(r.stopped?.reason).toBe('teto');
    expect(r.images.every((i) => i.origin === 'pendente')).toBe(true);
    expect(r.pendings[0].kind).toBe('teto');
    expect(denied.generate).toHaveBeenCalledTimes(1);
    const badAlt = await buildImages({ policy: resolvePolicy([{ allow_ai_generation: true }]), assets: [], topic: { subject: 'advogado' }, language: 'pt', origin: ORIGIN, scene: { sceneEn: 'A desk', alt: 'Imagem de mesa' }, port: { generate: vi.fn() } });
    expect(badAlt.images.every((i) => i.origin === 'pendente')).toBe(true);
  });
});

describe('adaptadores de publicação', () => {
  it('plugin: payload com slug, pai, conteúdo sem H1, schema, OG, completude sem itens de artigo; resposta lida sem confiar nela', async () => {
    const doc = goodDoc();
    const schema = buildStudioSchema(doc, profile());
    const p = await buildPluginPagePayload({ externalId: '11111111-2222-4333-8444-555555555555', doc, graph: schema.graph, rules: rulesFor('local'), dropTypes: schema.dropped });
    expect(p).toMatchObject({ post_type: 'page', status: 'draft', slug: 'guarulhos', parent_path: 'advogado-criminalista', full_path: 'advogado-criminalista/guarulhos', template: 'clean', noindex: false, canonical: doc.url });
    expect(p.content).not.toMatch(/<h1/);
    expect(p.og.image).toContain('-og.webp');
    expect(p.completeness.levels).not.toHaveProperty('schema');
    expect(p.completeness.levels).not.toHaveProperty('featured_image');
    expect(p.completeness.levels).not.toHaveProperty('author');
    expect(p.completeness.levels).toHaveProperty('breadcrumb');
    expect(p.completeness.approved_hash).toBe(p.content_hash);
    const guia = await buildPluginPagePayload({ externalId: '11111111-2222-4333-8444-555555555555', doc: goodDoc({ type: 'guia' }), graph: null, rules: rulesFor('guia') });
    expect(guia.completeness.levels).toHaveProperty('author');
    expect(parsePluginPageReply({ success: true, id: 9, url: `${ORIGIN}/advogado-criminalista/guarulhos/`, path: 'advogado-criminalista/guarulhos', status: 'publish' }, 'advogado-criminalista/guarulhos')).toMatchObject({ ok: true, id: 9, slugChanged: false });
    expect(parsePluginPageReply({ success: true, id: 9, url: `${ORIGIN}/advogado-criminalista/guarulhos-2/` }, 'advogado-criminalista/guarulhos')).toMatchObject({ ok: false, slugChanged: true });
    expect(parsePluginPageReply({ success: false, message: 'erro' }, 'x/y').ok).toBe(false);
    expect(parsePluginPageReply('<html>', 'x/y').ok).toBe(false);
    expect(parsePluginPageReply({ success: true, id: 1, url: 'http://inseguro.example/' }, 'x').url).toBeNull();
  });
  it('estático: HTML completo (head com tudo, um H1, JSON-LD, sem script), sitemap só com indexáveis e data real, 301 só se mudou, 404 real, instruções com reversão e somas', async () => {
    const doc = goodDoc({ hreflang: { 'pt-BR': `${ORIGIN}/advogado-criminalista/guarulhos/`, en: `${ORIGIN}/en/criminal-lawyer/guarulhos/`, 'x-default': `${ORIGIN}/advogado-criminalista/guarulhos/` } });
    const noindex = goodDoc({ noindex: true, slugPath: 'privada/pagina', url: `${ORIGIN}/privada/pagina/` });
    const pkg = await buildStaticPackage({ pages: [
      { externalId: 'a', version: 3, doc, graph: buildStudioSchema(doc, profile()).graph, approvedHash: 'h', previousPath: 'advogado-criminalista/guarulhos-antigo', wasPublished: true },
      { externalId: 'b', version: 1, doc: noindex, graph: null, approvedHash: 'h2' },
    ], siteName: 'Aurora Advogados', language: 'pt-BR', llmsTxt: true, now: () => Date.UTC(2026, 10, 20) });
    const html = pkg.files.find((f) => f.path === 'advogado-criminalista/guarulhos/index.html')!.content;
    for (const w of [/<html lang="pt-BR">/, /<title>Advogado criminalista em Guarulhos/, /<meta name="description"/, /<meta name="robots" content="index,follow,max-image-preview:large">/, /rel="canonical"/, /hreflang="en"/, /hreflang="x-default"/, /property="og:image"/, /og:image:alt/, /twitter:card" content="summary_large_image"/, /application\/ld\+json/, /<main id="conteudo">/, /<footer>/, /aria-label="Trilha de navegação"/]) expect(html).toMatch(w);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toMatch(/<script(?![^>]*ld\+json)/);
    expect(html).not.toMatch(/rel="stylesheet"/);
    const sm = pkg.files.find((f) => f.path === 'sitemap-estudio.xml')!.content;
    expect(sm).toContain('<lastmod>2026-11-19</lastmod>'); expect(sm).not.toContain('privada/pagina'); expect(sm).toContain('xhtml:link');
    expect(buildSitemapXml([doc])).toContain('<loc>https://aurora-advogados.example/advogado-criminalista/guarulhos/</loc>');
    expect(pkg.files.find((f) => f.path === 'redirects-estudio.htaccess')!.content).toContain('Redirect 301 /advogado-criminalista/guarulhos-antigo/ /advogado-criminalista/guarulhos/');
    expect(pkg.files.find((f) => f.path === '404.html')!.content).toContain('noindex');
    expect(pkg.files.find((f) => f.path === 'htaccess-404-real.txt')!.content).toMatch(/soft-404/i);
    expect(pkg.files.find((f) => f.path === 'llms-estudio.txt')).toBeTruthy();
    expect(pkg.instructions).toMatch(/Reverter/); expect(pkg.instructions).toMatch(/BACKUP/);
    expect(pkg.warnings.join(' ')).toMatch(/noindex/);
    expect((pkg.manifest.files as unknown[]).length).toBe(pkg.files.length - 1); // o manifesto não lista as instruções (criadas depois)
  });
  it('hospedado pela Zica: só contrato, marcado como não construído', () => {
    expect(ZICA_HOSTED_CONTRACT.status).toBe('nao_construido');
    expect(ZICA_HOSTED_CONTRACT.contract.routes.length).toBeGreaterThan(2);
  });
  it('aprovação e publicação: regras puras (hash, aprovador, pendência, portão)', async () => {
    const doc = goodDoc(); const hash = await contentHash(doc);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await contentHash(goodDoc({ title: 'Outro título' }))).not.toBe(hash);
    const q = runGates(ctxFor(doc));
    const page = { status: 'em_revisao' as const, created_by: 'u1', content_hash: hash };
    expect(approvalCheck({ page, currentHash: hash, quality: q, userId: 'u2', options: { require_distinct_approver: true }, pendingMarkers: 0 }).ok).toBe(true);
    expect(approvalCheck({ page, currentHash: hash, quality: q, userId: 'u1', options: { require_distinct_approver: true }, pendingMarkers: 0 }).reasons.join()).toMatch(/outra pessoa/);
    expect(approvalCheck({ page, currentHash: hash, quality: q, userId: 'u2', options: { require_distinct_approver: false }, pendingMarkers: 2 }).reasons.join()).toMatch(/2 pendência/);
    expect(approvalCheck({ page: { ...page, status: 'rascunho' }, currentHash: hash, quality: q, userId: 'u2', options: { require_distinct_approver: false }, pendingMarkers: 0 }).ok).toBe(false);
    expect(publishCheck({ page: { status: 'aprovada', approved_hash: hash, approved_by: 'u2' }, currentHash: hash, quality: q, adapter: 'wordpress_plugin' }).ok).toBe(true);
    expect(publishCheck({ page: { status: 'aprovada', approved_hash: 'x'.repeat(64), approved_by: 'u2' }, currentHash: hash, quality: q, adapter: 'wordpress_plugin' }).reasons.join()).toMatch(/mudou depois da aprovação/);
    expect(publishCheck({ page: { status: 'rascunho', approved_hash: hash, approved_by: 'u2' }, currentHash: hash, quality: q, adapter: 'wordpress_plugin' }).ok).toBe(false);
  });
  it('custo estimado: por página, em micros de dólar, contra o teto padrão; é estimativa', () => {
    const c = estimateCost({ options: { max_ai_steps: 8, step_max_tokens: 1400 }, sections: 5, imagesToGenerate: 2 });
    expect(c.perPageMicros.total).toBe(c.perPageMicros.text + c.perPageMicros.images);
    expect(c.capMicros).toBe(7_000_000); expect(c.extraMicros).toBe(2_200_000);
    expect(c.pagesPerDayWithinCap).toBeGreaterThan(0);
    expect(c.note).toMatch(/não verificado/);
  });
});

describe('Briefing de Superação (concorrentes, lacunas, diferenciais, superfícies, metas, fontes citadas pelas IAs)', () => {
  const NOW = Date.UTC(2026, 10, 20);
  const radar = (): RadarInput => ({
    source: 'radar', depth: 'completa', fetchedAt: null, mapPack: [{ name: 'Escritório X', rating: 4.8, reviews: 120 }],
    social: [{ host: 'youtube.com', platform: 'youtube', handle: '@rival', topics: ['flagrante'], formats: ['canal'], postsPerMonth: 8, lastPostAt: '2026-11-10' }, { host: 'instagram.com', platform: 'instagram', handle: '@rival', topics: [], formats: ['perfil'], postsPerMonth: 12 }],
    scoreboard: { position: 7, aiCitations: 0, indexed: null, score: 41 },
    pages: [
      { url: 'https://a.example/flagrante-guarulhos/', host: 'a.example', title: 'Guia: o que fazer no flagrante em Guarulhos', position: 1, headings: ['O que é flagrante?', 'Audiência de custódia: prazo', 'Documentos para liberdade provisória', 'Fiança: quando cabe'], entities: ['Polícia Civil', 'CNJ'], words: 1800, schemaTypes: ['Article', 'FAQPage'], images: 4, videos: 1, updatedAt: '2026-10-01', internalLinks: 30, externalLinks: 4 },
      { url: 'https://b.example/criminalista/', host: 'b.example', title: 'Advogado criminalista em Guarulhos | Plantão', position: 2, headings: ['Audiência de custódia: prazo', 'Fiança: quando cabe', 'Plantão 24 horas'], entities: ['CNJ'], words: 900, schemaTypes: ['LegalService'], images: 2, videos: 0, updatedAt: '2026-06-01', internalLinks: 12, externalLinks: 1 },
      { url: 'https://c.example/melhores-advogados/', host: 'c.example', title: 'Os 10 melhores advogados criminalistas de Guarulhos: ranking', position: 3, headings: ['Fiança: quando cabe'], words: 1200, schemaTypes: ['ItemList'], updatedAt: '2025-12-01' },
      { url: 'https://www.youtube.com/watch?v=1', host: 'www.youtube.com', title: 'Flagrante: o que dizer ao delegado', position: 4, kind: 'video' },
    ],
  });
  const input = (over = {}) => ({ query: 'advogado criminalista em Guarulhos', language: 'pt-BR', profile: profile(), fieldFacts: FACTS, sources: [{ url: 'https://atos.cnj.jus.br/atos/detalhar/2234', label: 'Resolução 213/2015 do CNJ', official: true }], radar: radar(), citations: null, ownText: 'Audiência de custódia e documentos.', ownTopics: ['advogado criminalista'], candidateQuestions: [{ text: 'Quem avisa a família quando alguém é preso em Guarulhos?', source: 'taxonomia' }, { text: 'Fiança: quando cabe', source: 'taxonomia' }], topN: 10, nowMs: NOW, territory: { place: 'Guarulhos' }, ...over });

  it('1 intenção e formato: o que vence hoje (guia, comparativo, serviço, vídeo, mapa) e a recomendação', () => {
    const i = classifyIntent(radar(), 'advogado criminalista em Guarulhos', ['Guarulhos']);
    expect(i.mix).toMatchObject({ guia: expect.any(Number), comparativo: expect.any(Number), video: expect.any(Number) });
    expect(i.extraSurfaces).toEqual(expect.arrayContaining(['video', 'mapa']));
    expect(['guia', 'comparativo', 'local', 'servico']).toContain(i.recommendedType);
    expect(i.rationale).toMatch(/dos resultados que vencem hoje/);
    const none = classifyIntent(EMPTY_RADAR, 'como pedir liberdade provisória', []);
    expect(none.recommendedType).toBe('guia'); expect(none.rationale).toMatch(/Sem resultados medidos/);
    expect(classifyIntent(EMPTY_RADAR, 'advogado em guarulhos', ['Guarulhos']).recommendedType).toBe('local');
  });
  it('2 benchmark das N melhores: palavras, schema, mídia, idade, links e identidades sociais', () => {
    const b = buildSuperiorityBrief(input()).benchmark;
    expect(b).toMatchObject({ n: 4, depth: 'completa', medianWords: 1200, p75Words: 1800 });
    expect(b.schemaPrevalence.Article).toBeGreaterThan(0);
    expect(b.mediaShare.videos).toBeGreaterThan(0);
    expect(b.medianAgeDays).toBeGreaterThan(0);
    expect(b.socialSummary).toMatchObject({ identities: 2, medianPostsPerMonth: 10 });
    expect(b.topEntities[0]).toEqual({ entity: 'CNJ', pages: 2 });
    expect(buildSuperiorityBrief(input({ topN: 2 })).benchmark.n).toBe(2);
  });
  it('3 lacunas: o que eles cobrem e nós não; o que ninguém cobre bem; o que só nós cobrimos', () => {
    const g = findGaps(radar(), { text: 'Audiência de custódia e documentos.', topics: ['advogado criminalista'], candidates: [{ text: 'Quem avisa a família quando alguém é preso em Guarulhos?', source: 'taxonomia' }, { text: 'Fiança: quando cabe', source: 'taxonomia' }] }, 10);
    expect(g.basis).toBe('conteudo');
    expect(g.theyCoverWeDont.map((x) => x.topic)).toContain('Fiança: quando cabe');
    expect(g.theyCoverWeDont.find((x) => x.topic === 'Fiança: quando cabe')).toMatchObject({ coveredBy: 3, of: 4 });
    expect(g.theyCoverWeDont.map((x) => x.topic)).not.toContain('Audiência de custódia: prazo'); // nós já cobrimos
    expect(g.nobodyCovers.map((x) => x.topic)).toEqual(['Quem avisa a família quando alguém é preso em Guarulhos?']);
    expect(findGaps(EMPTY_RADAR, { text: '', topics: [], candidates: [] }, 10).basis).toBe('sem_dados');
  });
  it('4 diferenciais com PROVA e pendências do que falta; 5 superfícies; 6 metas ligadas ao placar do Radar', () => {
    const b = buildSuperiorityBrief(input({ gbpUrl: 'https://g.page/aurora-advogados-exemplo' }));
    const ready = b.angles.filter((a) => a.status === 'pronto');
    expect(ready.some((a) => a.kind === 'especificidade_local' && a.proof[0].includes('policiacivil'))).toBe(true);
    expect(ready.some((a) => a.kind === 'autor_real')).toBe(true);
    expect(ready.some((a) => a.kind === 'dado_com_fonte')).toBe(true);
    expect(b.angles.find((a) => a.id === 'caso')).toMatchObject({ status: 'pendente' });
    expect(b.pendings.some((p) => p.id === 'angulo:caso')).toBe(true);
    expect(b.surfaces.find((s) => s.kind === 'video')!.notes).toMatch(/prioridade alta/);
    expect(b.surfaces.find((s) => s.kind === 'google_business')!.status).toBe('planejado');
    expect(b.surfaces.find((s) => s.kind === 'resposta_ia')!.notes).toMatch(/30 a 60 palavras/);
    expect(b.goals.linkedToRadar).toBe(true);
    expect(b.goals.goals.find((g) => g.key === 'posicao')).toMatchObject({ current: 7, target: 'chegar ao top 3', source: 'placar do Radar' });
    expect(b.goals.goals.find((g) => g.key === 'placar_radar')).toMatchObject({ current: 41, status: 'medido' });
    expect(b.outline[0].from).toBe('estrutura');
    expect(b.outline.some((o) => o.from === 'lacuna')).toBe(true);
    // sem fatos aprovados e sem autor: diferenciais viram pendência, nunca invenção
    const poor = buildSuperiorityBrief(input({ fieldFacts: [], profile: profile({ authors: [] }), sources: [] }));
    expect(poor.angles.filter((a) => a.status === 'pendente').map((a) => a.id)).toEqual(expect.arrayContaining(['fato:nenhum', 'fonte:nenhuma', 'autor', 'caso']));
  });
  it('sem Radar: lacunas e benchmark viram PENDÊNCIA; o briefing segue só com os dados do projeto', () => {
    const b = buildSuperiorityBrief(input({ radar: null }));
    expect(b.radarSource).toBe('ausente');
    expect(b.pendings.map((p) => p.id)).toEqual(expect.arrayContaining(['radar_sem_dados', 'observatorio_sem_dados']));
    expect(b.gaps.basis).toBe('sem_dados'); expect(b.benchmark.n).toBe(0);
    expect(b.goals.goals.find((g) => g.key === 'posicao')).toMatchObject({ status: 'pendente' });
    expect(b.notes.join(' ')).toMatch(/nunca é copiado/);
  });
  it('NUNCA copiar texto de concorrente: o verificador reprova trechos iguais (só temas e estrutura)', () => {
    const theirs = 'Quem é preso em flagrante tem direito a ser ouvido pelo delegado de polícia e a avisar a família, conforme prevê a Constituição Federal no artigo quinto.';
    expect(checkNoCopy(`<p>${theirs}</p>`, [{ url: 'https://a.example/', text: theirs }], 8)).toMatchObject({ ok: false, worst: { url: 'https://a.example/', overlapPct: 100 } });
    expect(checkNoCopy('<p>Na prática, a família costuma descobrir o endereço da delegacia por telefone, e o advogado confere o auto de prisão antes de qualquer pedido.</p>', [{ url: 'https://a.example/', text: theirs }], 8).ok).toBe(true);
    expect(checkNoCopy('', [], 8).ok).toBe(true);
  });
  it('MAPA DE FONTES CITADAS PELAS IAs: por site, tipo, motores, o que é nosso, e alvos de presença com ação (sem comprar link)', () => {
    const rows = [
      ...[1, 2, 3].map((i) => ({ engine: 'chatgpt', query: 'advogado criminalista guarulhos', topic: null, url: `https://www.jusbrasil.com.br/a/${i}`, host: 'www.jusbrasil.com.br', is_own: false, position: i, title: 't' })),
      ...[1, 2].map((i) => ({ engine: 'perplexity', query: 'advogado criminalista guarulhos', topic: null, url: `https://www.youtube.com/watch?v=${i}`, host: 'www.youtube.com', is_own: false, position: i, title: 't' })),
      { engine: 'chatgpt', query: 'advogado criminalista guarulhos', topic: null, url: 'https://www.cnj.jus.br/x', host: 'www.cnj.jus.br', is_own: false, position: 1, title: 't' },
      { engine: 'gemini', query: 'advogado criminalista guarulhos', topic: null, url: `${ORIGIN}/a/`, host: 'aurora-advogados.example', is_own: false, position: 2, title: 't' },
      { engine: 'chatgpt', query: 'receita de bolo', topic: null, url: 'https://bolo.example/', host: 'bolo.example', is_own: false, position: 1, title: 't' },
    ];
    const m = citedSourcesMap(rows, 'advogado criminalista em Guarulhos', ['aurora-advogados.example']);
    expect(m.matched).toBe('consulta');
    expect(m.total).toBe(7);
    expect(m.byHost.map((h) => [h.host, h.kind, h.count])).toEqual([['jusbrasil.com.br', 'diretorio', 3], ['youtube.com', 'video', 2], ['cnj.jus.br', 'oficial', 1], ['aurora-advogados.example', 'proprio', 1]]);
    expect(m.own).toEqual({ count: 1, share: 14 });
    expect(m.byHost[1].engines).toEqual(['perplexity']);
    expect(m.presenceTargets.map((t) => t.host)).toEqual(['jusbrasil.com.br', 'youtube.com', 'cnj.jus.br']);
    expect(m.presenceTargets[2].action).toMatch(/fonte oficial/);
    expect(m.presenceTargets[1].action).toMatch(/vídeo/i);
    expect(m.presenceTargets.map((t) => t.action).join(' ')).not.toMatch(/compre|comprar/i);
    expect(citedSourcesMap([], 'x', []).notes.join(' ')).toMatch(/Observatório ainda não tem/);
    expect(citedSourcesMap(rows, 'tema sem relação nenhuma xyz', []).matched).toBe('todas');
    expect(classifyHost('www.tjsp.jus.br')).toBe('oficial'); expect(classifyHost('www.instagram.com')).toBe('social_forum'); expect(classifyHost('exemplo.com')).toBe('outro');
  });
});

describe('Perfil do Projeto -> o que o Estúdio pode afirmar', () => {
  it('lê colunas do projeto e do Perfil; o que falta vira lacuna com onde preencher (nunca inventa)', () => {
    const { profile: p, gaps } = profileFromProject({ name: 'Aurora', domain: 'https://www.Aurora-Advogados.example/inicio', nicho: 'Advocacia', empresa_telefone: '(11) 4002-8922', commercial_info: {}, editorial_identity: {}, seo_plugin: 'rank_math', social_linkedin: 'http://nao-https.example/x', social_instagram: 'https://instagram.com/aurora' }, { offer: 'Defesa criminal', tom: ['Acolhedor'] });
    expect(p).toMatchObject({ name: 'Aurora', origin: 'https://www.aurora-advogados.example', segment: 'Advocacia', phones: ['(11) 4002-8922'], seoPlugin: 'rank_math', tones: ['Acolhedor'] });
    expect(p.sameAs).toEqual(['https://instagram.com/aurora']); // só https
    expect(gaps.map((g) => g.key)).toEqual(expect.arrayContaining(['endereco', 'horario', 'autor', 'logo']));
    expect(gaps.every((g) => g.where.length > 5)).toBe(true);
  });
});
