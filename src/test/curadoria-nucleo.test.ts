import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CURADORIA_VERSION, CURATION_MODULES, IMAGE_RULES, articleFingerprint, buildImageUsage, checkImage, covers, curateArticle, funnelStage, imageKey, overallOf, promptCoverage, scoreOf, tokens,
  type CurationArticle, type CurationContext, type CurationItem,
} from '../../supabase/functions/_shared/curadoria-core';
import { emptyProfile } from '../../supabase/functions/_shared/studio-types';

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);
const IMG_A = 'https://x.supabase.co/storage/v1/object/public/article-images/p1/prisao-em-flagrante.webp';
const IMG_B = 'https://x.supabase.co/storage/v1/object/public/article-images/p1/audiencia-de-custodia.webp';

const BODY = `<h2>O que é prisão em flagrante?</h2>
<p>A prisão em flagrante acontece quando a pessoa é surpreendida cometendo o crime ou logo depois dele. O Código de Processo Penal prevê as situações em que a polícia pode agir.</p>
<p>Em seguida vem a audiência de custódia, em que o juiz verifica se a prisão foi legal e se há necessidade de manter a pessoa presa. Veja também <a href="/blog/audiencia-de-custodia">audiência de custódia</a>.</p>
<h2>Como funciona a defesa criminal?</h2>
<p>A defesa criminal acompanha o inquérito desde o início, confere os documentos e orienta a família sobre os próximos passos, sem prometer resultado.</p>
<h2>Conclusão</h2>
<p>Se você precisa de orientação sobre prisão em flagrante, entre em contato com o escritório pelo WhatsApp e agende uma conversa.</p>`;

const art = (over: Partial<CurationArticle> = {}): CurationArticle => ({
  id: 'a1', project_id: 'p1', organization_id: 'o1', title: 'Prisão em flagrante: o que fazer e quais são os direitos', keyword: 'prisão em flagrante', secondary_keywords: ['audiência de custódia'],
  excerpt: 'Entenda a prisão em flagrante e a audiência de custódia.', content: BODY, slug: 'prisao-em-flagrante-o-que-fazer', status: 'draft', language: 'pt-BR', type: 'blog',
  featured_image_url: IMG_A, image_prompt: 'foto de uma delegacia, prisão em flagrante', image_source: 'generated', published_url: null, config: { image_geo: { alt_text: 'Delegacia onde ocorre uma prisão em flagrante' } }, created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-10T00:00:00Z', ...over,
});

const ctx = (over: Partial<CurationContext> = {}): CurationContext => ({
  now: NOW, project: { id: 'p1', name: 'Acme', nicho: 'advocacia criminal', domain: 'acme.example' },
  profile: { ...emptyProfile(), name: 'Acme', segment: 'advocacia criminal', offer: 'defesa criminal', languages: ['pt-BR'], never: 'garantimos resultado; ganho de causa garantido' },
  funnel: { configured: true, template: 'advocacia-pf' },
  taxonomy: [{ id: 'n1', label: 'Direito Criminal', kind: 'area', status: 'aprovado' }, { id: 'n2', label: 'Prisão em flagrante', kind: 'nicho', status: 'aprovado' }, { id: 'n3', label: 'Direito Trabalhista', kind: 'area', status: 'aprovado' }],
  geo: [{ municipio: 'Guarulhos', uf: 'SP' }],
  prompts: [{ id: 'q1', query: 'o que fazer em caso de prisão em flagrante', topic: 'criminal' }, { id: 'q2', query: 'quanto custa um advogado trabalhista em Campinas' }],
  market: [{ id: 'm1', label: 'prisão em flagrante criminalista' }], radar: [{ id: 'r1', label: 'audiência de custódia', kind: 'tema' }],
  indexation: null, backlinks: null, inbound: null, siteHost: 'acme.example', candidates: [{ title: 'Audiência de custódia', url: 'https://acme.example/blog/audiencia-de-custodia', keyword: 'audiência de custódia' }],
  imageUsage: new Map(), ...over,
});

const item = (r: Awaited<ReturnType<typeof curateArticle>>, m: string) => r.itens.find((i) => i.modulo === m)!;

describe('Curadoria: núcleo puro', () => {
  it('devolve UM item por módulo, na ordem combinada, com estado, motivo em português e fonte', async () => {
    const r = await curateArticle(art(), ctx());
    expect(r.itens.map((i) => i.modulo)).toEqual([...CURATION_MODULES]);
    for (const i of r.itens) { expect(['ok', 'aviso', 'pendencia', 'sem_dados']).toContain(i.estado); expect(i.motivo_em_portugues.length).toBeGreaterThan(10); expect(i.fonte.length).toBeGreaterThan(5); }
    expect(r.version).toBe(CURADORIA_VERSION);
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('artigo com imagem própria, texto limpo e sem pendência: aprovado; os avisos não impedem', async () => {
    const r = await curateArticle(art(), ctx());
    expect(item(r, 'imagens').estado).toBe('ok');
    expect(r.bloqueios).toEqual([]);
    expect(r.estado).toBe('aprovado');
    expect(r.nota).toBeGreaterThan(0);
  });

  it('REGRA DURA: imagem repetida (mesma URL em outro artigo do projeto) bloqueia, e diz quantas vezes', async () => {
    const usage = buildImageUsage([{ id: 'a1', featured_image_url: IMG_A }, { id: 'a2', featured_image_url: IMG_A }, { id: 'a3', featured_image_url: `${IMG_A}?v=2` }, { id: 'a4', featured_image_url: IMG_B }]);
    const r = await curateArticle(art(), ctx({ imageUsage: usage }));
    expect(r.estado).toBe('bloqueado');
    expect(r.imagem).toMatchObject({ estado: 'repetida', usos: 3 });
    expect(r.imagem.outros_artigos.sort()).toEqual(['a2', 'a3']);
    expect(item(r, 'imagens')).toMatchObject({ estado: 'pendencia', bloqueia: true });
    expect(item(r, 'imagens').motivo_em_portugues).toMatch(/3 artigos/);
    expect(r.bloqueios[0]).toMatch(/Imagem repetida/);
    // a imagem exclusiva de outro artigo não conta contra este
    expect((await curateArticle(art({ id: 'a4', featured_image_url: IMG_B }), ctx({ imageUsage: usage }))).estado).toBe('aprovado');
  });

  it('REGRA DURA: imagem ausente bloqueia; texto sem imagem nunca é aprovado', async () => {
    for (const url of [null, '', '   ']) {
      const r = await curateArticle(art({ featured_image_url: url }), ctx());
      expect(r.estado).toBe('bloqueado');
      expect(r.imagem.estado).toBe('ausente');
      expect(item(r, 'imagens').bloqueia).toBe(true);
    }
  });

  it('a mesma imagem é reconhecida com parâmetros, versão derivada (-1200x675), rota de render e www', () => {
    const base = imageKey('https://x.supabase.co/storage/v1/object/public/article-images/p1/foto.png');
    expect(imageKey('https://x.supabase.co/storage/v1/object/public/article-images/p1/foto.png?t=1')).toBe(base);
    expect(imageKey('https://x.supabase.co/storage/v1/object/public/article-images/p1/foto-1200x675.webp')).toBe(base);
    expect(imageKey('https://x.supabase.co/storage/v1/render/image/public/article-images/p1/foto.png?width=1200&format=webp')).toBe(base);
    expect(imageKey('https://WWW.x.supabase.co/storage/v1/object/public/article-images/p1/FOTO.png')).toBe(imageKey('https://x.supabase.co/storage/v1/object/public/article-images/p1/foto.png'));
    expect(imageKey('https://x.supabase.co/storage/v1/object/public/article-images/p1/outra.png')).not.toBe(base);
    expect(imageKey('')).toBeNull();
    expect(imageKey('data:image/png;base64,AAAA')).not.toBe(imageKey('data:image/png;base64,BBBB'));
  });

  it('tamanho, proporção e relevância só avisam (flexíveis): nunca bloqueiam', async () => {
    const big = art({ config: { image_geo: { policy_version: '2026-09', compliance: 'oversized', alt_text: 'prisão', hero: { width: 800, within_budget: false } } } });
    const r = await curateArticle(big, ctx());
    expect(r.imagem.estado).toBe('aviso');
    expect(item(r, 'imagens').estado).toBe('aviso');
    expect(r.estado).toBe('aprovado');
    expect(r.imagem.detalhes.join(' ')).toMatch(/150 KB/);
    expect(r.imagem.detalhes.join(' ')).toMatch(/1200px/);
    const off = checkImage(art({ image_prompt: 'paisagem de montanha ao amanhecer', image_source: 'stock', config: {}, featured_image_url: 'https://cdn.example/img/montanha-azul.jpg' }), new Map());
    expect(off.relevancia).toBe('baixa');
    expect(off.estado).toBe('aviso');
    expect(off.detalhes.join(' ')).toMatch(/heurística/);
  });

  it('relevância sem descrição da imagem é "sem dados", não nota inventada', () => {
    const r = checkImage(art({ image_prompt: null, image_source: null, config: {}, featured_image_url: 'https://cdn.example/img/0f8a1c2d3e4f.jpg' }), new Map());
    expect(r.relevancia).toBe('sem_dados');
    expect(r.estado).not.toBe('repetida');
  });

  it('o espelho dos números da política de imagem confere com image-policy.ts', () => {
    const src = readFileSync(join(process.cwd(), 'supabase/functions/_shared/image-policy.ts'), 'utf8');
    expect(src).toContain(`export const HERO_MIN_WIDTH = ${IMAGE_RULES.min_width};`);
    expect(src).toContain('export const HERO_MIN_PIXELS = 300_000;');
    expect(IMAGE_RULES.min_pixels).toBe(300_000);
    expect(src).toContain('export const HERO_MAX_BYTES = 150 * 1024;');
    expect(IMAGE_RULES.max_bytes).toBe(150 * 1024);
  });

  it('sem dados de módulo = "sem_dados" com o que falta; nunca preenche', async () => {
    const r = await curateArticle(art(), ctx({ profile: null, funnel: null, taxonomy: null, geo: null, prompts: null, market: null, radar: null }));
    for (const m of ['perfil', 'taxonomia', 'mercado', 'radar', 'observatorio', 'backlinks', 'indexacao']) expect(item(r, m).estado, m).toBe('sem_dados');
    expect(item(r, 'perfil').motivo_em_portugues).toMatch(/Perfil do Projeto/);
    // sem dado não conta na nota
    const only: CurationItem[] = [{ modulo: 'perfil', estado: 'sem_dados', motivo_em_portugues: 'x', fonte: 'y' }];
    expect(scoreOf(only)).toBeNull();
  });

  it('perfil: o texto que ignora o segmento, usa idioma fora do Perfil ou o que "nunca dizer" gera aviso (heurística rotulada)', async () => {
    const off = await curateArticle(art({ title: 'Receita de bolo de cenoura', keyword: 'bolo de cenoura', secondary_keywords: [], excerpt: '', content: '<h2>Ingredientes</h2><p>Farinha, ovos e cenoura para uma sobremesa caseira bem macia.</p>' }), ctx());
    expect(item(off, 'perfil').estado).toBe('aviso');
    expect(item(off, 'perfil').fonte).toMatch(/heurística/);
    const never = await curateArticle(art({ content: `${BODY}<p>Garantimos resultado para o seu caso.</p>` }), ctx());
    expect(item(never, 'perfil').estado).toBe('aviso');
    expect(item(never, 'perfil').motivo_em_portugues).toMatch(/nunca usar/);
    const en = await curateArticle(art({ language: 'en' }), ctx());
    expect(item(en, 'perfil').motivo_em_portugues).toMatch(/Idioma/);
  });

  it('taxonomia: casa com nó forte pelo título; só no corpo é aviso; sem nó é aviso; geografia citada é informada', async () => {
    const ok = await curateArticle(art(), ctx());
    expect(item(ok, 'taxonomia').estado).toBe('ok');
    expect(item(ok, 'taxonomia').motivo_em_portugues).toMatch(/Prisão em flagrante/);
    const none = await curateArticle(art({ title: 'Receita de bolo', keyword: 'bolo', secondary_keywords: [], excerpt: '', content: '<p>Receita simples de bolo caseiro com farinha e ovos.</p>' }), ctx());
    expect(item(none, 'taxonomia').estado).toBe('aviso');
    const geo = await curateArticle(art({ content: `${BODY}<p>Atendemos em Guarulhos.</p>` }), ctx());
    expect((item(geo, 'taxonomia').detalhes || []).join(' ')).toMatch(/Guarulhos/);
  });

  it('funil: etapa por heurística do título e do tipo; sem convite ao contato é aviso; funil não configurado é dito', async () => {
    expect(funnelStage(art({ title: 'Quanto custa um advogado criminalista', keyword: 'advogado criminalista' })).etapa).toBe('fundo');
    expect(funnelStage(art({ title: 'Vale a pena? Diferença entre os planos', keyword: 'x' })).etapa).toBe('meio');
    expect(funnelStage(art({ title: 'O que é habeas corpus', keyword: 'habeas corpus' })).etapa).toBe('topo');
    expect(funnelStage(art({ title: 'Habeas corpus', keyword: 'hc', type: 'sales' })).etapa).toBe('fundo');
    const noCta = await curateArticle(art({ content: '<h2>O que é habeas corpus?</h2><p>É um instrumento de proteção da liberdade de locomoção previsto na Constituição Federal.</p>' }), ctx());
    expect(item(noCta, 'funil').estado).toBe('aviso');
    expect(item(noCta, 'funil').motivo_em_portugues).toMatch(/convite ao contato/);
    const unconfigured = await curateArticle(art(), ctx({ funnel: { configured: false } }));
    expect(item(unconfigured, 'funil').motivo_em_portugues).toMatch(/não está configurado/);
  });

  it('domínio: slug com sufixo numérico ou sem relação com o tema e artigo sem link interno geram aviso; links reais contam', async () => {
    const good = await curateArticle(art(), ctx());
    expect(item(good, 'dominio').estado).not.toBe('pendencia');
    const dup = await curateArticle(art({ slug: 'prisao-em-flagrante-o-que-fazer-2' }), ctx());
    expect(item(dup, 'dominio').motivo_em_portugues).toMatch(/duplicata/);
    const unrelated = await curateArticle(art({ slug: 'novidades-da-semana-no-escritorio' }), ctx());
    expect(item(unrelated, 'dominio').motivo_em_portugues).toMatch(/relação com a palavra-chave/);
    const orphan = await curateArticle(art({ content: BODY.replace(/<a [^>]*>[^<]*<\/a>/, 'audiência de custódia') }), ctx());
    expect(item(orphan, 'dominio').motivo_em_portugues).toMatch(/Sem nenhum link interno/);
    const noSlug = await curateArticle(art({ slug: null }), ctx());
    expect(item(noSlug, 'dominio').motivo_em_portugues).toMatch(/slug/);
  });

  it('mercado, radar e observatório casam por palavras-chave e se dizem heurística; sem casamento é aviso', async () => {
    const r = await curateArticle(art(), ctx());
    for (const m of ['mercado', 'radar', 'observatorio']) { expect(item(r, m).estado, m).toBe('ok'); expect(item(r, m).fonte, m).toMatch(/heurística/); }
    expect(item(r, 'observatorio').motivo_em_portugues).toMatch(/o que fazer em caso de prisão em flagrante/);
    const miss = await curateArticle(art({ title: 'Receita de bolo', keyword: 'bolo', secondary_keywords: [], content: '<h2>Ingredientes</h2><p>Farinha e ovos.</p>', excerpt: '' }), ctx());
    for (const m of ['mercado', 'radar', 'observatorio']) expect(item(miss, m).estado, m).toBe('aviso');
  });

  it('indexação e backlinks: artigo não publicado é "sem dados" (sem endereço); publicado usa o índice, sem inventar', async () => {
    const draft = await curateArticle(art(), ctx());
    expect(item(draft, 'indexacao').estado).toBe('sem_dados');
    expect(item(draft, 'backlinks').estado).toBe('sem_dados');
    const pub = art({ status: 'published', published_url: 'https://acme.example/blog/prisao-em-flagrante-o-que-fazer/' });
    const c = ctx({ indexation: { 'acme.example/blog/prisao-em-flagrante-o-que-fazer': { indexed: true } }, backlinks: { 'acme.example/blog/prisao-em-flagrante-o-que-fazer': 3 } });
    const r = await curateArticle(pub, c);
    expect(item(r, 'indexacao').estado).toBe('ok');
    expect(item(r, 'backlinks')).toMatchObject({ estado: 'ok' });
    expect(item(await curateArticle(pub, ctx({ indexation: {}, backlinks: {} })), 'indexacao').estado).toBe('aviso');
  });

  it('estúdio: resíduo de publicação e CTA de contato quebrado são pendência (precisa_correcao, não bloqueio); texto vazio também', async () => {
    const residue = await curateArticle(art({ content: `${BODY}<p>[PENDENTE REVISÃO] texto provisório</p>` }), ctx());
    expect(item(residue, 'estudio').estado).toBe('pendencia');
    expect(residue.estado).toBe('precisa_correcao');
    expect(residue.faltando.join(' ')).toMatch(/estudio/);
    const empty = await curateArticle(art({ content: '' }), ctx());
    expect(item(empty, 'estudio').estado).toBe('pendencia');
    expect(item(empty, 'piloto').estado).toBe('sem_dados');
    const ai = await curateArticle(art(), ctx());
    expect((item(ai, 'estudio').detalhes || [])[0]).toMatch(/anti-IA/);
  });

  it('piloto: conta as correções determinísticas que ele proporia (sem IA) e não altera o artigo', async () => {
    const withMd = art({ content: `${BODY}\n<p>| a | b |\n| --- | --- |\n| 1 | 2 |</p>` });
    const before = JSON.stringify(withMd);
    const r = await curateArticle(withMd, ctx());
    expect(JSON.stringify(withMd)).toBe(before);
    expect(item(r, 'piloto').fonte).toMatch(/não usa IA/);
    expect(['ok', 'aviso']).toContain(item(r, 'piloto').estado);
  });

  it('impressão digital muda com título, texto, imagem e endereço; a curadoria só vale para a mesma versão', async () => {
    const a = art();
    const h = await articleFingerprint(a);
    expect(await articleFingerprint({ ...a })).toBe(h);
    for (const patch of [{ title: 'Outro' }, { content: `${BODY}<p>x</p>` }, { featured_image_url: IMG_B }, { slug: 'outro-endereco-novo' }, { excerpt: 'resumo novo' }]) expect(await articleFingerprint({ ...a, ...patch })).not.toBe(h);
  });

  it('estado geral: bloqueado > precisa_correcao > aprovado, e a nota ignora "sem dados"', () => {
    const mk = (estado: CurationItem['estado'], extra: Partial<CurationItem> = {}): CurationItem => ({ modulo: 'perfil', estado, motivo_em_portugues: 'm', fonte: 'f', ...extra });
    expect(overallOf([mk('ok'), mk('aviso')]).estado).toBe('aprovado');
    expect(overallOf([mk('ok'), mk('pendencia')]).estado).toBe('precisa_correcao');
    expect(overallOf([mk('pendencia'), mk('pendencia', { modulo: 'imagens', bloqueia: true })]).estado).toBe('bloqueado');
    expect(scoreOf([mk('ok'), mk('aviso'), mk('sem_dados')])).toBe(75);
    expect(scoreOf([mk('ok'), mk('ok')])).toBe(100);
  });

  it('palavras: sem acento, sem artigos, plural simples; cobertura exige a maioria das palavras', () => {
    expect(tokens('Prisões em Flagrante: o que FAZER?')).toEqual(expect.arrayContaining(['prisoe', 'flagrante']));
    expect(tokens('a de o')).toEqual([]);
    expect(covers(['prisao', 'flagrante'], new Set(['prisao', 'flagrante', 'x'])).ok).toBe(true);
    expect(covers(['prisao', 'flagrante'], new Set(['prisao'])).ok).toBe(false);
    expect(covers(['aaa', 'bbb', 'ccc', 'ddd', 'eee'], new Set(['aaa', 'bbb', 'ccc'])).ok).toBe(true);
    expect(covers(['aaa', 'bbb', 'ccc', 'ddd', 'eee'], new Set(['aaa', 'bbb'])).ok).toBe(false);
  });
});

describe('Curadoria: perguntas abertas do Observatório', () => {
  const arts: CurationArticle[] = [
    art({ id: 'pub', status: 'published', title: 'Prisão em flagrante: direitos', keyword: 'prisão em flagrante', secondary_keywords: [], content: null }),
    art({ id: 'wip', status: 'draft', title: 'Como pedir habeas corpus', keyword: 'habeas corpus', secondary_keywords: [], content: null }),
  ];
  const prompts = [
    { id: '1', query: 'o que fazer em caso de prisão em flagrante' },
    { id: '2', query: 'como pedir habeas corpus em plantão' },
    { id: '3', query: 'quanto custa um advogado trabalhista em Campinas' },
  ];
  it('classifica cada pergunta: coberta por publicado, só em produção, ou sem artigo; mostra a correspondência usada', () => {
    const cov = promptCoverage(prompts, arts);
    expect(cov.map((c) => c.estado)).toEqual(['coberto', 'so_em_producao', 'sem_artigo']);
    expect(cov[0].cobertos_por[0]).toMatchObject({ article_id: 'pub' });
    expect(cov[0].cobertos_por[0].palavras_casadas).toEqual(expect.arrayContaining(['prisao', 'flagrante']));
    expect(cov[2].cobertos_por).toEqual([]);
  });
});
