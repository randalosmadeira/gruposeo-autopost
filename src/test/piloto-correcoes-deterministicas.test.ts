import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../../supabase/functions/_shared/language-packs';
import {
  ensureImgAlt, insertInternalLinks, markdownTablesToHtml, questionForHeading, questionifyHeadings, splitLongParagraphs,
} from '../../supabase/functions/_shared/auto-optimize-fixes';
import { buildSchemaPlan, completeHreflang, countArticleBlocks, dedupeSchemas, extractJsonLdTypes, resolveAreaServed } from '../../supabase/functions/_shared/schema-completeness';

const PT = LANGUAGES.pt; const EN = LANGUAGES.en; const ES = LANGUAGES.es;
const words = (h: string) => h.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const LONG = '<p>A prescrição extingue a pretensão quando o prazo legal termina sem que o credor tenha cobrado a dívida. O devedor pode alegar a prescrição na defesa. O juiz reconhece o prazo vencido quando a parte pede. Depois disso, a cobrança judicial perde a força e o credor não consegue mais executar o valor. Por isso, guardar comprovantes ajuda muito em qualquer discussão futura sobre o tema.</p>';

describe('correções determinísticas: parágrafo longo, tabela, alt, H2 em pergunta', () => {
  it('divide parágrafo longo em fronteiras de frase e é idempotente', () => {
    expect(words(LONG)).toBeGreaterThan(60);
    const a = splitLongParagraphs(LONG, 40);
    expect(a.changed).toBe(1);
    const ps = a.html.match(/<p>[\s\S]*?<\/p>/g) || [];
    expect(ps.length).toBeGreaterThanOrEqual(2);
    for (const p of ps) expect(words(p)).toBeLessThanOrEqual(40);
    // nenhum texto some nem aparece
    expect(a.html.replace(/<\/?p>|\s+/g, '')).toBe(LONG.replace(/<\/?p>|\s+/g, ''));
    expect(splitLongParagraphs(a.html, 40).changed).toBe(0);
  });

  it('não parte parágrafo de uma frase só nem quebra marcação aberta', () => {
    const uma = '<p>' + 'palavra '.repeat(80).trim() + '.</p>';
    expect(splitLongParagraphs(uma, 40).changed).toBe(0);
    const aberto = '<p>Uma frase com <strong>destaque que começa aqui. E só termina na frase seguinte</strong> com mais palavras para passar do limite de tamanho do parágrafo longo demais para ficar assim.</p>';
    expect(splitLongParagraphs(aberto, 8).html).toBe(aberto);
  });

  it('tabela em markdown cru (dentro de <p> com <br> e solta) vira <table>; tabela pronta e texto comum não mudam; idempotente', () => {
    const emP = '<p>Veja o quadro:<br>| Prazo | Valor |<br>|---|---|<br>| 5 anos | R$ 10 |<br>| 3 anos | R$ 5 |</p>';
    const a = markdownTablesToHtml(emP);
    expect(a.changed).toBe(1);
    expect(a.html).toContain('<table>');
    expect(a.html).toContain('<th>Prazo</th>');
    expect(a.html).toContain('<td>R$ 5</td>');
    expect(a.html).not.toMatch(/\|---/);
    expect(a.html).toContain('<p>Veja o quadro:</p>');
    expect(markdownTablesToHtml(a.html).changed).toBe(0);
    const solta = '<p>Texto</p>\n| Item | Qtd |\n|---|---|\n| A | 1 |\n<p>Fim</p>';
    expect(markdownTablesToHtml(solta).html).toContain('<td>A</td>');
    const pronta = '<table><tr><td>a | b</td></tr></table>';
    expect(markdownTablesToHtml(pronta)).toEqual({ html: pronta, changed: 0 });
    expect(markdownTablesToHtml('<p>Uma barra | no meio</p>').changed).toBe(0);
  });

  it('completa o alt da imagem pelo contexto, sem sobrescrever o que já existe', () => {
    const html = '<h2>Como funciona</h2><img src="a.jpg"><img src="b.jpg" alt=""><img src="c.jpg" alt="Já tem">';
    const a = ensureImgAlt(html, { title: 'Título do artigo' });
    expect(a.changed).toBe(2);
    expect(a.html).toContain('alt="Como funciona"');
    expect(a.html).toContain('alt="Já tem"');
    expect(ensureImgAlt(a.html, { title: 'x' }).changed).toBe(0);
  });

  it('H2 vira pergunta só quando a regra é segura, em pt, en e es (nunca conclusão, FAQ nem título composto)', () => {
    expect(questionForHeading('Prazo para recorrer', PT)).toBe('Qual é o prazo para recorrer?');
    expect(questionForHeading('Requisitos para a aposentadoria', PT)).toBe('Quais são os requisitos para a aposentadoria?');
    expect(questionForHeading('Pena prevista', PT)).toBe('Qual é a pena prevista?');
    expect(questionForHeading('Definição de usucapião', PT)).toBe('O que é usucapião?');
    expect(questionForHeading('Como funciona o prazo', PT)).toBe('Como funciona o prazo?');
    expect(questionForHeading('Requirements for the visa', EN)).toBe('What are the requirements for the visa?');
    expect(questionForHeading('How it works', EN)).toBe('How it works?');
    expect(questionForHeading('Requisitos para el visado', ES)).toBe('¿Cuáles son los requisitos para el visado?');
    expect(questionForHeading('Cómo medir la presión', ES)).toBe('¿Cómo medir la presión?');
    for (const t of ['Conclusão', 'Perguntas frequentes', 'FAQ', 'Prazo: o que muda em 2026', 'Considerações finais', 'Fontes']) expect(questionForHeading(t, PT)).toBeNull();
    expect(questionForHeading('Mercado aberto', PT)).toBeNull();
    expect(questionForHeading('Conclusion', EN)).toBeNull();
  });

  it('questionifyHeadings para na porcentagem-alvo, não mexe em H2 já pergunta e é idempotente', () => {
    const html = '<h2>O que é prescrição?</h2><p>x</p><h2>Prazo para recorrer</h2><p>y</p><h2>Requisitos para a defesa</h2><p>z</p><h2>Conclusão</h2><p>w</p>';
    const a = questionifyHeadings(html, 50, PT);
    expect(a.changed).toBe(1); // 1 de 4 já era pergunta: falta 1 para chegar a 50%
    expect(a.html).toContain('<h2>Qual é o prazo para recorrer?</h2>');
    expect(a.html).toContain('<h2>Requisitos para a defesa</h2>');
    const b = questionifyHeadings(html, 100, PT);
    expect(b.changed).toBe(2);
    expect(b.html).toContain('<h2>Conclusão</h2>');
    expect(questionifyHeadings(b.html, 100, PT).changed).toBe(0);
  });
});

describe('links internos: texto primeiro, bloco "Leia também" no idioma do artigo, nunca inventa', () => {
  const base = '<h2>Prazos</h2><p>A prescrição da dívida depende do tipo de cobrança. Veja os prazos de cada caso com calma.</p><p>Outro assunto qualquer sem relação.</p>';
  const cands = [
    { title: 'Prescrição da dívida: guia', url: 'https://site.com/prescricao', keyword: 'prescrição da dívida' },
    { title: 'Como negociar uma dívida antiga', url: 'https://site.com/negociar', keyword: 'negociar dívida' },
    { title: 'Esta própria página', url: 'https://site.com/este', keyword: 'própria página' },
  ];

  it('insere no texto quando a frase existe e completa com bloco; nunca linka a própria página', () => {
    const r = insertInternalLinks(base, cands, { needed: 2, selfUrl: 'https://site.com/este', lang: PT });
    expect(r.added.map((a) => a.mode)).toEqual(['no_texto', 'bloco']);
    expect(r.html).toContain('<a href="https://site.com/prescricao">prescrição da dívida</a>');
    expect(r.html).toContain('<strong>Leia também:</strong>');
    expect(r.html).not.toContain('https://site.com/este');
    expect(r.shortfall).toBe(0);
  });

  it('idempotente: rodar de novo com os mesmos candidatos não duplica link nem bloco', () => {
    const a = insertInternalLinks(base, cands, { needed: 2, selfUrl: 'https://site.com/este', lang: PT });
    const b = insertInternalLinks(a.html, cands, { needed: 2, selfUrl: 'https://site.com/este', lang: PT });
    expect(b.added).toEqual([]);
    expect(b.html).toBe(a.html);
    expect((b.html.match(/Leia também/g) || []).length).toBe(1);
  });

  it('rótulo do bloco no idioma do artigo; sem candidato real o que falta vira "shortfall" (nada inventado)', () => {
    const en = insertInternalLinks('<p>Plain english text without any matching phrase.</p>', [{ title: 'Running shoes guide', url: 'https://shop.com/shoes' }], { needed: 1, lang: EN });
    expect(en.html).toContain('<strong>Read also:</strong>');
    const es = insertInternalLinks('<p>Texto.</p>', [{ title: 'Guía de zapatillas', url: 'https://tienda.com/guia' }], { needed: 1, lang: ES });
    expect(es.html).toContain('Lee también');
    const nada = insertInternalLinks('<p>Texto.</p>', [], { needed: 3, lang: PT });
    expect(nada.html).toBe('<p>Texto.</p>');
    expect(nada.shortfall).toBe(3);
    expect(insertInternalLinks('<p>Texto.</p>', [{ title: 'curto', url: 'ftp://x' }, { url: 'https://a.com/x' }], { needed: 2, lang: PT }).added).toEqual([]);
  });

  it('não coloca link dentro de título nem dentro de outro link', () => {
    const html = '<h2>Prescrição da dívida</h2><p>Veja <a href="https://x.com/a">prescrição da dívida</a> aqui.</p>';
    const r = insertInternalLinks(html, [{ title: 'Guia', url: 'https://site.com/p', keyword: 'prescrição da dívida' }], { needed: 1, lang: PT });
    expect(r.added.filter((a) => a.mode === 'no_texto')).toEqual([]);
    expect(r.html).toContain('<h2>Prescrição da dívida</h2>');
  });
});

describe('plano de schema: um Article só, trilha, datas coerentes, idioma e região, sem país assumido', () => {
  const article = { id: 'a1', title: 'Prescrição da dívida: prazos e defesa', keyword: 'prescrição', excerpt: 'Entenda os prazos.', content: '<h2>O que é</h2><p>Texto.</p>', slug: 'prescricao', published_at: '2026-11-10T10:00:00Z', updated_at: '2026-11-01T10:00:00Z', language: 'pt-BR' };
  const project = { name: 'Escritório X', domain: 'exemplo.com.br', wordpress_url: 'https://exemplo.com.br', editorial_identity: { author_name: 'Redação' } };

  it('um só bloco Article, BreadcrumbList com URLs reais e data de modificação nunca antes da publicação', () => {
    const plan = buildSchemaPlan({ article, project, sectorType: 'legal', now: () => Date.parse('2026-11-20T12:00:00Z') });
    expect(countArticleBlocks(plan.types)).toBe(1);
    expect(plan.types).toContain('BreadcrumbList');
    const art = plan.schemas.find((s) => s['@type'] === 'Article')!;
    expect(Date.parse(String(art.dateModified))).toBeGreaterThanOrEqual(Date.parse(String(art.datePublished)));
    expect(plan.datesCoherent).toBe(false);
    expect(art.inLanguage).toBe('pt-BR');
    const bc = plan.schemas.find((s) => s['@type'] === 'BreadcrumbList') as { itemListElement: Array<{ name: string; item: string; position: number }> };
    expect(bc.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(bc.itemListElement[0]).toMatchObject({ name: 'Início', item: 'https://exemplo.com.br/' });
    expect(bc.itemListElement[1].item).toBe('https://exemplo.com.br/prescricao');
    expect(plan.author.identified).toBe(false); // "Redação" é genérico: pendência humana, nunca inventa autor
    expect(plan.notes.join(' ')).toMatch(/não inventa autor/);
  });

  it('com Rank Math (ou Yoast...) o Zica não emite o próprio Article: um bloco só, o do SEO plugin', () => {
    const plan = buildSchemaPlan({ article, project: { ...project, seo_plugin: 'rank_math' }, sectorType: 'legal' });
    expect(countArticleBlocks(plan.types)).toBe(0);
    expect(plan.policy).toMatchObject({ seo_plugin: 'rank_math' });
    expect(plan.policy.drop_types).toContain('Article');
    expect(plan.types).toContain('BreadcrumbList');
    expect(plan.notes.join(' ')).toMatch(/rank_math/);
  });

  it('autor real é reconhecido; FAQPage só com perguntas e respostas reais (2 ou mais); fora disso nada', () => {
    const real = buildSchemaPlan({ article, project: { ...project, editorial_identity: { author_name: 'Dra. Ana Souza' } }, sectorType: 'legal' });
    expect(real.author).toEqual({ name: 'Dra. Ana Souza', identified: true });
    expect(real.types).not.toContain('FAQPage');
    const faq = '<h2>Perguntas frequentes</h2><h3>Quanto tempo?</h3><p>Cinco anos.</p><h3>Posso recorrer?</h3><p>Sim, no prazo.</p>';
    const comFaq = buildSchemaPlan({ article: { ...article, content: faq }, project, sectorType: 'legal' });
    expect(comFaq.types).toContain('FAQPage');
    expect(comFaq.schemas.filter((s) => s['@type'] === 'FAQPage').length).toBe(1);
  });

  it('GLOBAL: idioma do artigo em inLanguage, rótulo "Home" em inglês, sem país assumido; região só do idioma configurado ou do que o projeto declara', () => {
    const en = { id: 'b', title: 'Running shoes: how to choose', keyword: 'running shoes', excerpt: '', content: '<p>Text.</p>', slug: 'running-shoes', language: 'en' };
    const proj = { name: 'Shop', domain: 'shop.example', wordpress_url: 'https://shop.example' };
    const plan = buildSchemaPlan({ article: en, project: proj, sectorType: 'marketing_digital' });
    const art = plan.schemas.find((s) => s['@type'] === 'Article')!;
    expect(art.inLanguage).toBe('en');
    const bc = plan.schemas.find((s) => s['@type'] === 'BreadcrumbList') as { itemListElement: Array<{ name: string }> };
    expect(bc.itemListElement[0].name).toBe('Home');
    expect(plan.areaServed).toEqual([]);
    // área atendida: lista do projeto (multi-país) tem prioridade; região do idioma só quando o idioma foi configurado
    expect(resolveAreaServed({ commercial_info: { areas_served: ['us', 'ca', 'gb'] } }, {}, null)).toEqual(['US', 'CA', 'GB']);
    expect(resolveAreaServed({}, {}, 'GB')).toEqual(['GB']);
    expect(resolveAreaServed({}, {}, null)).toEqual([]);
    const es = buildSchemaPlan({ article: { ...en, language: 'es-MX', content: '<p>Texto.</p>' }, project: { ...proj, commercial_info: { areas_served: ['MX', 'US'] } }, sectorType: 'legal' });
    const servico = es.schemas.find((s) => s['@type'] === 'LegalService');
    expect(servico?.areaServed).toEqual(['MX', 'US']);
    const semPais = buildSchemaPlan({ article: { ...en, language: 'en' }, project: proj, sectorType: 'legal' });
    expect(semPais.schemas.find((s) => s['@type'] === 'LegalService')).not.toHaveProperty('areaServed');
  });

  it('dedupe e detecção: blocos Article duplicados no HTML são contados e o dedupe mantém um só', () => {
    const html = '<script type="application/ld+json">{"@type":"Article","headline":"a"}</script><script type="application/ld+json">{"@graph":[{"@type":"BlogPosting"},{"@type":"BreadcrumbList"}]}</script>';
    const tipos = extractJsonLdTypes(html);
    expect(countArticleBlocks(tipos)).toBe(2);
    const dedupe = dedupeSchemas([{ '@type': 'Article' }, { '@type': 'BlogPosting' }, { '@type': 'BreadcrumbList' }, { '@type': 'BreadcrumbList' }]);
    expect(dedupe.length).toBe(2);
  });

  it('hreflang: etiquetas válidas, a própria página presente, x-default só se o idioma padrão é conhecido', () => {
    const r = completeHreflang({ 'pt-br': 'https://a.com/pt', en: 'https://a.com/en', 'xx yy': 'https://a.com/x', es: 'nao-e-url' }, { selfTag: 'pt-BR', selfUrl: 'https://a.com/pt', defaultTag: 'en' });
    expect(r.map).toMatchObject({ 'pt-BR': 'https://a.com/pt', en: 'https://a.com/en', 'x-default': 'https://a.com/en' });
    expect(r.invalid.sort()).toEqual(['es', 'xx yy']);
    expect(r.hasSelf && r.hasDefault).toBe(true);
    expect(completeHreflang({ en: 'https://a.com/en' }, { selfTag: 'en', selfUrl: 'https://a.com/en' }).hasDefault).toBe(false); // não chuta o padrão
  });
});
