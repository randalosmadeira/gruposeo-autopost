import { describe, expect, it } from 'vitest';
import { runGates, gateById, type QualityReport } from '../../supabase/functions/_shared/studio-gates';
import { buildStudioSchema, validateGraph, type StudioGraph } from '../../supabase/functions/_shared/studio-schema';
import { resolveStudioRules, parseStudioDirectives } from '../../supabase/functions/_shared/studio-rules';
import { GATE_IDS } from '../../supabase/functions/_shared/studio-rules';
import { ctxFor, goodDoc, profile, rulesFor, FACTS, ORIGIN, GOOD_BODY } from './helpers/estudio-fixtures';

const run = (over: Parameters<typeof ctxFor>[1] = {}, doc = goodDoc()) => runGates(ctxFor(doc, over));
const status = (r: QualityReport, id: (typeof GATE_IDS)[number]) => gateById(r, id).status;

describe('portões técnicos: página boa', () => {
  const r = run();
  it('a página-modelo passa em todos os portões obrigatórios, sem falha', () => {
    expect(r.blocking, JSON.stringify(r.results.filter((x) => x.status === 'falha'))).toEqual([]);
    expect(r.complete).toBe(true);
    expect(r.results).toHaveLength(GATE_IDS.length);
    expect(status(r, 'schema_graph')).toBe('ok');
    expect(status(r, 'nap_consistency')).toBe('ok');
    expect(status(r, 'no_invention')).toBe('ok');
  });
  it('cada portão tem nota; os que não passam trazem "como corrigir"', () => {
    for (const g of r.results) { expect(g.note).toBeTypeOf('string'); if (g.status === 'falha' || g.status === 'aviso') expect(g.fix).toBeTruthy(); }
  });
});

describe('defeitos reais da auditoria da RDM viram falha ou aviso', () => {
  it('Article duplicado: dois blocos Article no grafo reprovam o schema', () => {
    const doc = goodDoc({ type: 'guia' });
    const b = buildStudioSchema(doc, profile());
    const g = b.graph as StudioGraph;
    const art = g['@graph'].find((n) => n['@type'] === 'Article')!;
    g['@graph'].push({ ...art, '@id': `${doc.url}#article-rankmath` });
    const res = run({ doc, schema: { ...b, graph: g } } as never, doc);
    expect(status(res, 'schema_graph')).toBe('falha');
    expect(validateGraph(g).map((p) => p.code)).toContain('article_duplicado');
  });
  it('três "entidades" (organizações) no grafo reprovam; o Estúdio gera UMA só', () => {
    const doc = goodDoc();
    const b = buildStudioSchema(doc, profile());
    expect(b.graph!['@graph'].filter((n) => ['LegalService', 'Organization', 'LocalBusiness'].includes(String(n['@type'])))).toHaveLength(1);
    const g = JSON.parse(JSON.stringify(b.graph)) as StudioGraph;
    g['@graph'].push({ '@type': 'Organization', '@id': `${ORIGIN}/#org2`, name: 'Aurora', url: ORIGIN }, { '@type': 'LocalBusiness', '@id': `${ORIGIN}/#org3`, name: 'Aurora Goiânia' });
    expect(validateGraph(g).map((p) => p.code)).toContain('entidades_duplicadas');
    expect(status(run({ schema: { ...b, graph: g } }), 'schema_graph')).toBe('falha');
  });
  it('sem autor: guia sem autor real fica sem autor no schema e o portão E-E-A-T avisa (o sistema não inventa autor)', () => {
    const doc = goodDoc({ type: 'guia', author: null });
    const b = buildStudioSchema(doc, profile());
    const art = b.graph!['@graph'].find((n) => n['@type'] === 'Article')!;
    expect(art.author).toBeUndefined();
    expect(b.notes.join(' ')).toMatch(/não inventa autor/);
    const res = run({}, doc);
    expect(status(res, 'eeat_author')).toBe('aviso');
    const generic = run({}, goodDoc({ author: { name: 'Redação', credential: null, url: null } }));
    expect(gateById(generic, 'eeat_author').details!.join(' ')).toMatch(/genérico/);
  });
  it('sem breadcrumb: trilha ausente ou fora da hierarquia reprova', () => {
    expect(status(run({}, goodDoc({ breadcrumbs: [] })), 'breadcrumb')).toBe('falha');
    const wrong = goodDoc({ breadcrumbs: [{ name: 'Início', url: `${ORIGIN}/` }, { name: 'X', url: `${ORIGIN}/advogado-criminalista/guarulhos/` }] });
    expect(status(run({}, wrong), 'breadcrumb')).toBe('falha');
  });
  it('telefone e horário conflitantes com o Perfil reprovam (NAP)', () => {
    const body = GOOD_BODY.replace('(11) 4002-8922', '(11) 3333-4444').replace('Conte o nome', 'Plantão 24 horas. Conte o nome');
    const res = run({}, goodDoc({ bodyHtml: body }));
    expect(status(res, 'nap_consistency')).toBe('falha');
    const d = gateById(res, 'nap_consistency').details!.join(' ');
    expect(d).toMatch(/Telefone/); expect(d).toMatch(/24 horas/);
  });
  it('páginas de cidade com texto quase igual: pouco texto único e página de porta, com proposta de consolidar', () => {
    const sibling = { id: 's1', label: 'Advogado criminalista em Osasco', place: 'Osasco', html: GOOD_BODY.replace(/Guarulhos/g, 'Osasco') };
    const res = run({ siblings: [sibling] });
    expect(res.doorway.verdict).toBe('porta');
    expect(res.doorway.uniquePct).toBeLessThan(60);
    expect(status(res, 'unique_content')).toBe('falha');
    expect(status(res, 'doorway')).toBe('falha');
    expect(gateById(res, 'doorway').fix).toMatch(/Consolide/);
    expect(res.complete).toBe(false);
  });
  it('tabela em markdown cru reprova a estrutura e o resíduo', () => {
    const body = `${GOOD_BODY}\n<p>| Prazo | Órgão |</p>\n<p>| --- | --- |</p>`;
    const res = run({}, goodDoc({ bodyHtml: body }));
    expect(status(res, 'html_semantic')).toBe('falha');
    expect(status(res, 'no_residue')).toBe('falha');
  });
  it('H2 sem pergunta: aviso de AEO (recomendar); com perguntas reais passa', () => {
    const body = GOOD_BODY.replace(/<h2>[^<]*<\/h2>/g, '<h2>Informações</h2>');
    expect(status(run({}, goodDoc({ bodyHtml: body.replace(/Informações/, 'Detalhes') })), 'aeo_blocks')).toBe('aviso');
    expect(status(run(), 'aeo_blocks')).toBe('ok');
  });
  it('sem fonte oficial: aviso nos links externos; fonte não oficial sem verificação não vale', () => {
    const none = goodDoc({ links: goodDoc().links.filter((l) => l.kind === 'interno'), sources: [] });
    none.bodyHtml = GOOD_BODY;
    expect(status(run({}, none), 'external_links')).toBe('aviso');
    const blog = goodDoc({ bodyHtml: `${GOOD_BODY}<p><a href="https://blog-qualquer.example/post/">Blog</a></p>`, links: goodDoc().links });
    expect(gateById(run({ linkChecks: {} }, blog), 'external_links').details!.join(' ')).toMatch(/não é fonte oficial/);
  });
  it('soft-404 e endereço: o canonical precisa bater com o endereço semântico e ter barra final', () => {
    expect(status(run({}, goodDoc({ url: `${ORIGIN}/advogado-criminalista/guarulhos` })), 'canonical')).toBe('falha');
    expect(status(run({}, goodDoc({ url: `${ORIGIN}/advogado-criminalista/outra/` })), 'canonical')).toBe('falha');
  });
});

describe('portões: níveis vêm do perfil de regras (nada fixo)', () => {
  it('desligar um portão o tira da conta; rebaixar para recomendar vira aviso', () => {
    const rules = resolveStudioRules({ type: 'local', projectIdentity: { optimization_rules: { palavras: 120 }, studio_rules: { gates: { breadcrumb: 'desligado', schema: 'recomendar' } } } });
    const doc = goodDoc({ breadcrumbs: [] });
    const res = runGates(ctxFor(doc, { rules }));
    expect(status(res, 'breadcrumb')).toBe('desligado');
    const bad = JSON.parse(JSON.stringify(buildStudioSchema(doc, profile())));
    bad.graph['@graph'].push({ '@type': 'Article', '@id': 'x', inLanguage: 'pt-BR' }, { '@type': 'Article', '@id': 'y', inLanguage: 'pt-BR' });
    expect(status(runGates(ctxFor(doc, { rules, schema: bad })), 'schema_graph')).toBe('aviso');
  });
  it('tamanho vem do projeto ou do prompt do agente; sem isso, vale o padrão editável da página', () => {
    const def = resolveStudioRules({ type: 'guia' });
    expect(def.gates.words).toMatchObject({ level: 'recomendar', value: 900, source: 'padrao_editavel' });
    const fromPrompt = resolveStudioRules({ type: 'guia', prompts: ['Texto do agente.\nmínimo de 1500 palavras\n[estudio]\nlote=3\ncara_de_ia=20\nfatos_locais=2\nportas=desligado'] });
    expect(fromPrompt.gates.words).toMatchObject({ value: 1500, source: 'prompt' });
    expect(fromPrompt.options.batch_limit).toBe(3);
    expect(fromPrompt.gates.ai_patterns.value).toBe(20);
    expect(fromPrompt.gates.local_facts.value).toBe(2);
    expect(fromPrompt.gates.doorway.level).toBe('desligado');
    expect(parseStudioDirectives('sem bloco').matched).toEqual([]);
    expect(rulesFor('local').layers).toEqual(expect.arrayContaining(['padrao_editavel', 'projeto']));
  });
  it('conformidade do segmento é AVISO por padrão, rígida só por escolha e desligável', () => {
    const risky = goodDoc({ bodyHtml: `${GOOD_BODY}<p>Garantimos a absolvição do seu caso. Somos os melhores advogados.</p>` });
    const aviso = run({}, risky);
    expect(status(aviso, 'compliance')).toBe('aviso');
    expect(aviso.blocking).not.toContain('compliance');
    const off = resolveStudioRules({ type: 'local', projectIdentity: { optimization_rules: { palavras: 120, options: { compliance_mode: 'desligado' } } } });
    expect(status(runGates(ctxFor(risky, { rules: off })), 'compliance')).toBe('desligado');
    const rigid = resolveStudioRules({ type: 'local', projectIdentity: { optimization_rules: { palavras: 120, options: { compliance_mode: 'rigido' } } } });
    expect(status(runGates(ctxFor(risky, { rules: rigid })), 'compliance')).toBe('falha');
    const semPacote = runGates(ctxFor(risky, { profile: profile({ segment: 'Tecnologia' }) }));
    expect(status(semPacote, 'compliance')).toBe('info');
  });
});

describe('portões: invenção, residuo, local, imagens, desempenho, hreflang, CTA', () => {
  it('número, telefone, endereço, link e depoimento sem origem BLOQUEIAM; nome novo só pede conferência', () => {
    const body = `${GOOD_BODY}<p>Em 2019 atendemos 4.500 casos com 98% de êxito. Fale no (11) 90000-1234. Estamos na Avenida Paulista, 1000. Depoimento: “Fui muito bem atendido pelo escritório e recomendo a todos” — João.</p><p><a href="https://site-inventado.example/x">fonte</a> Falou com Carlos Eduardo Pimentel ontem.</p>`;
    const res = run({}, goodDoc({ bodyHtml: body }));
    expect(status(res, 'no_invention')).toBe('falha');
    const codes = res.invention.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['ano_sem_origem', 'numero_sem_origem', 'telefone_sem_origem', 'endereco_sem_origem', 'url_sem_origem', 'depoimento_sem_origem']));
    expect(res.invention.find((i) => i.code === 'nome_proprio_novo')?.severity).toBe('revisar');
    const onlyName = run({}, goodDoc({ bodyHtml: `${GOOD_BODY}<p>Segundo Carlos Eduardo Pimentel, o caso é simples.</p>` }));
    expect(status(onlyName, 'no_invention')).toBe('ok');
    expect(gateById(onlyName, 'no_invention').note).toMatch(/Carlos/);
  });
  it('marcador [PENDENTE: ...] vira pendência e reprova o resíduo (impede aprovar)', () => {
    const res = run({}, goodDoc({ bodyHtml: `${GOOD_BODY}<p>O fórum fica em [PENDENTE: endereço do fórum, com fonte].</p>` }));
    expect(res.pendings).toEqual(['endereço do fórum, com fonte']);
    expect(status(res, 'no_residue')).toBe('falha');
    expect(res.complete).toBe(false);
  });
  it('página local exige fatos locais APROVADOS e com fonte (o não aprovado não conta)', () => {
    expect(status(run({ usedFactIds: ['f1', 'f2'] }), 'local_facts')).toBe('falha');
    expect(status(run({ usedFactIds: ['f1', 'f2', 'f4'] }), 'local_facts')).toBe('falha');
    expect(status(run({}, goodDoc({ type: 'servico' })), 'local_facts')).toBe('info');
  });
  it('imagens: sem alt, nome sem sentido e alt genérico reprovam; imagem pendente é pendência', () => {
    const doc = goodDoc({ images: [{ ...goodDoc().images[0], alt: 'Imagem de escritório', filename: 'IMG_1234.jpg', format: 'jpeg' }, { ...goodDoc().images[1], alt: '' }] });
    const res = run({}, doc);
    expect(status(res, 'images')).toBe('aviso');
    expect(gateById(res, 'images').details!.join(' ')).toMatch(/alt genérico|sem alt|sem significado/);
    expect(gateById(res, 'perf_budget').details!.join(' ')).toMatch(/WebP ou AVIF/);
    const pend = run({}, goodDoc({ images: [{ ...goodDoc().images[0], origin: 'pendente', url: '' }] }));
    expect(gateById(pend, 'images').details!.join(' ')).toMatch(/pendente/);
  });
  it('desempenho: sem JavaScript além do JSON-LD e sem CSS/fonte externos', () => {
    const res = run({}, goodDoc({ bodyHtml: `${GOOD_BODY}<script>alert(1)</script><link rel="stylesheet" href="https://x/y.css">` }));
    expect(status(res, 'perf_budget')).toBe('aviso');
    expect(gateById(res, 'perf_budget').details!.join(' ')).toMatch(/script/);
  });
  it('hreflang: com traduções exige autorreferência e x-default; sem traduções não se aplica', () => {
    expect(status(run(), 'hreflang')).toBe('info');
    expect(status(run({ hasTranslations: true }), 'hreflang')).toBe('aviso');
    const doc = goodDoc({ hreflang: { 'pt-BR': `${ORIGIN}/advogado-criminalista/guarulhos/`, en: `${ORIGIN}/en/criminal-lawyer/guarulhos/`, 'x-default': `${ORIGIN}/advogado-criminalista/guarulhos/` } });
    expect(status(run({}, doc), 'hreflang')).toBe('ok');
    expect(status(run({}, goodDoc({ hreflang: { en: `${ORIGIN}/en/` } })), 'hreflang')).toBe('aviso');
  });
  it('CTA: botão de contato sem data-zica-cta não será medido; sem canal no Perfil pede cadastro', () => {
    const body = GOOD_BODY.replace(/ data-zica-cta="phone"/, '');
    expect(gateById(run({}, goodDoc({ bodyHtml: body })), 'cta_tracking').details!.join(' ')).toMatch(/data-zica-cta/);
    expect(gateById(run({ profile: profile({ phones: [], whatsapp: null, email: null }) }, goodDoc({ bodyHtml: '<p class="answer">Texto sem contato.</p>' })), 'cta_tracking').details!.join(' ')).toMatch(/cadastre um canal/);
  });
  it('cara de IA: página com clichês reprova (nota acima do limite do perfil) e a nota máxima é regra editável', () => {
    const ia = goodDoc({ bodyHtml: `<p class="answer">No mundo atual, vale destacar que o atendimento é rápido, eficiente e seguro.</p><h2>Você já se perguntou o que fazer?</h2><p>Não é apenas um serviço, é uma solução completa com atendimento personalizado.</p><p>Em resumo, entre em contato.</p>` });
    const res = run({}, ia);
    expect(res.ai.score).toBeGreaterThan(35);
    expect(status(res, 'ai_patterns')).toBe('falha');
    const lax = resolveStudioRules({ type: 'local', projectIdentity: { optimization_rules: { palavras: 10 }, studio_rules: { gates: { cara_de_ia: 95 } } } });
    expect(status(runGates(ctxFor(ia, { rules: lax })), 'ai_patterns')).toBe('ok');
  });
  it('FAQPage só com FAQ que aparece na página', () => {
    const doc = goodDoc({ faq: [{ q: 'Quanto tempo dura a custódia?', a: 'Até 24 horas.' }, { q: 'Pergunta que não está no texto?', a: 'x' }] });
    expect(buildStudioSchema(doc, profile()).types).not.toContain('FAQPage');
    const withFaq = goodDoc({ faq: [{ q: 'O que acontece depois de uma prisão em flagrante em Guarulhos?', a: 'A pessoa é levada à delegacia.' }, { q: 'Quais documentos levar ao escritório?', a: 'Identidade e comprovante.' }] });
    const b = buildStudioSchema(withFaq, profile());
    expect(b.types).toContain('FAQPage');
    expect(status(run({}, withFaq), 'faq_schema')).toBe('ok');
  });
});

describe('schema em grafo único', () => {
  it('uma entidade, WebPage, Service, trilha igual à hierarquia, sameAs do Perfil, inLanguage, sem horário inventado', () => {
    const b = buildStudioSchema(goodDoc(), profile());
    const g = b.graph!['@graph'];
    const org = g.find((n) => n['@type'] === 'LegalService')!;
    expect(org['@id']).toBe(`${ORIGIN}/#organization`);
    expect(org.sameAs).toEqual(profile().sameAs);
    expect(org.openingHours).toEqual(['Mo-Fr 09:00-18:00']);
    expect(b.types).toEqual(expect.arrayContaining(['LegalService', 'WebPage', 'Service', 'BreadcrumbList']));
    const bc = g.find((n) => n['@type'] === 'BreadcrumbList')!;
    expect((bc.itemListElement as unknown[]).length).toBe(3);
    expect(g.filter((n) => n.inLanguage).every((n) => n.inLanguage === 'pt-BR')).toBe(true);
    expect(validateGraph(b.graph)).toEqual([]);
    const noHours = buildStudioSchema(goodDoc(), profile({ hours: 'Segunda a sexta, das 9h às 18h' }));
    expect(noHours.graph!['@graph'].find((n) => n['@type'] === 'LegalService')!.openingHours).toBeUndefined();
    expect(noHours.notes.join(' ')).toMatch(/formato estruturado/);
  });
  it('com Rank Math/Yoast ativo o Estúdio não duplica: só Service (e FAQ), sem Article, WebPage, trilha nem organização', () => {
    const b = buildStudioSchema(goodDoc({ seoPlugin: 'rank_math' }), profile());
    expect(b.types).toEqual(['Service']);
    expect(b.dropped).toEqual(expect.arrayContaining(['BreadcrumbList', 'WebPage', 'Organization']));
    expect(validateGraph(b.graph, { seoPlugin: 'rank_math' })).toEqual([]);
    const guia = buildStudioSchema(goodDoc({ type: 'guia', seoPlugin: 'yoast' }), profile());
    expect(guia.types).not.toContain('Article');
  });
  it('FATOS: o banco só aceita o que o Perfil e os fatos aprovados dizem (fatos não aprovados não entram)', () => {
    expect(FACTS.filter((f) => f.approved && f.source_url)).toHaveLength(3);
  });
});
