import { describe, expect, it } from 'vitest';
import { appendFaq, buildFaqMessages, faqHtml, jaTiraDuvidas, parseFaq, plainArticleText, significantTokens } from '../../supabase/functions/_shared/curadoria-duvidas-core.ts';

const TEXTO = plainArticleText(`<h2>Audiência de custódia</h2><p>A audiência de custódia acontece em até 24 horas depois da prisão em flagrante. O juiz verifica se a prisão foi legal e se a pessoa foi bem tratada pela polícia. O advogado ou a defensoria acompanham a pessoa presa durante a audiência.</p>
<p>Depois da audiência, o juiz pode relaxar a prisão, converter em prisão preventiva ou conceder liberdade provisória com medidas cautelares, como a tornozeleira eletrônica.</p>`);

const raw = (items: Array<{ q: string; a: string }>) => '```json\n' + JSON.stringify({ faq: items }) + '\n```';
const bom = [
  { q: 'Quando acontece a audiência de custódia?', a: 'Em até 24 horas depois da prisão em flagrante. Nela o juiz verifica se a prisão foi legal e se a pessoa foi bem tratada pela polícia.' },
  { q: 'Quem acompanha a pessoa presa na audiência?', a: 'O advogado ou a defensoria acompanham a pessoa presa durante a audiência de custódia, do começo ao fim.' },
  { q: 'O que o juiz pode decidir depois da audiência?', a: 'O juiz pode relaxar a prisão, converter em prisão preventiva ou conceder liberdade provisória com medidas cautelares, como a tornozeleira eletrônica.' },
];

describe('curadoria-duvidas: parseFaq (a IA só entra se o texto do artigo apoiar)', () => {
  it('aceita itens bem formados e apoiados no texto, mesmo com cerca de código na resposta', () => {
    const r = parseFaq(raw(bom), TEXTO);
    expect(r.items).toHaveLength(3);
    expect(r.descartados).toHaveLength(0);
  });
  it('descarta resposta que inventa fato fora do texto (sem apoio)', () => {
    const inventada = { q: 'Qual é o valor da fiança?', a: 'A fiança costuma custar entre dez e cem salários mínimos segundo a Lei 12.403 de 2011 aplicável às infrações.' };
    const r = parseFaq(raw([...bom, inventada]), TEXTO);
    expect(r.items).toHaveLength(3);
    expect(r.descartados[0].motivo).toMatch(/^sem_apoio_no_texto_/);
  });
  it('descarta promessa de resultado, link, pergunta sem "?", repetida e resposta curta', () => {
    const lixo = [
      { q: 'Posso ter certeza do resultado?', a: 'Garantimos resultado na audiência de custódia para toda pessoa que o advogado acompanhar durante a audiência.' },
      { q: 'Onde ver mais sobre a audiência de custódia?', a: 'Veja mais em https://exemplo.com sobre a audiência de custódia e a prisão em flagrante do juiz.' },
      { q: 'Quando acontece a audiência de custódia', a: 'Em até 24 horas depois da prisão em flagrante, quando o juiz verifica se a prisão foi legal.' },
      { q: 'Quando acontece a audiência de custódia?', a: 'Curta.' },
    ];
    const r = parseFaq(raw([...lixo, ...bom]), TEXTO);
    expect(r.items.map((i) => i.q)).toEqual(bom.map((i) => i.q));
    expect(r.descartados.map((d) => d.motivo).sort()).toEqual(['pergunta_mal_formada', 'promessa_ou_link', 'promessa_ou_link', 'resposta_fora_do_tamanho'].sort());
  });
  it('resposta que não é JSON válido não gera nada, e perguntas repetidas entram uma vez só', () => {
    expect(parseFaq('desculpe, não consigo', TEXTO).items).toHaveLength(0);
    expect(parseFaq(raw([bom[0], { ...bom[0] }]), TEXTO).items).toHaveLength(1);
  });
});

describe('curadoria-duvidas: montagem da seção', () => {
  it('escapa HTML nas perguntas e respostas e usa h2 + h3/p', () => {
    const h = faqHtml([{ q: 'Pode <b>isso</b> & aquilo?', a: 'Sim, se "assim" for.' }]);
    expect(h).toContain('<h2>Perguntas frequentes</h2>');
    expect(h).toContain('<h3>Pode &lt;b&gt;isso&lt;/b&gt; &amp; aquilo?</h3>');
    expect(h).toContain('&quot;assim&quot;');
  });
  it('só acrescenta com 3+ itens e nunca duplica a seção; depois de acrescentar o artigo já tira dúvidas', () => {
    expect(appendFaq('<p>x</p>', bom.slice(0, 2))).toBeNull();
    const novo = appendFaq('<h2>Tema</h2><p>x</p>', bom)!;
    expect(novo.startsWith('<h2>Tema</h2>')).toBe(true);
    expect(jaTiraDuvidas(novo)).toBe(true);
    expect(appendFaq(novo, bom)).toBeNull();
    expect(jaTiraDuvidas('<h2>Tema</h2><p>x</p>')).toBe(false);
  });
  it('pedido à IA proíbe inventar, promessa e link, e leva o texto do artigo', () => {
    const m = buildFaqMessages({ title: 'Audiência de custódia', keyword: 'custódia', text: TEXTO, language: 'pt-BR' });
    expect(m[0].content).toMatch(/SOMENTE com o que o texto do artigo já afirma/);
    expect(m[0].content).toMatch(/promessa de resultado/);
    expect(m[1].content).toContain('Audiência de custódia');
    expect(m[1].content).toContain('24 horas');
  });
  it('palavras significativas ignoram acento, artigos e palavras curtas', () => {
    expect(significantTokens('A prisão é LEGAL para o juiz?')).toEqual(['prisao', 'legal', 'juiz']);
  });
});
