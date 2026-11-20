import { describe, expect, it } from 'vitest';
import { LEGAL_SOURCES, MAX_SOURCE_CHARS, buildSourcesContext, htmlToParagraphs, isPlaceholderText, matchLegalSources, pickRelevant, safeSourceUrl, temFonteSuficiente } from '../../supabase/functions/_shared/curadoria-fontes-core.ts';

const PAGINA = `<html><head><title>x</title><script>var a=1;</script></head><body><nav>Menu do portal e outras coisas longas aqui dentro</nav>
<article><h1>STJ mantém anulação do júri</h1><p>A Sexta Turma do Superior Tribunal de Justiça manteve a anulação do júri que condenou a arquiteta no caso da 113 Sul.</p>
<p>O relator destacou que houve nulidade processual desde a fase de instrução, porque a defesa só teve acesso tardio aos autos.</p>
<p>Publicidade: assine a newsletter do portal e receba novidades todos os dias.</p></article><footer>Rodapé do portal com muitos links diversos</footer></body></html>`;

describe('curadoria-fontes: extração de texto', () => {
  it('prefere <article>, descarta menu/rodapé/script e quebra em parágrafos', () => {
    const p = htmlToParagraphs(PAGINA);
    expect(p.some((l) => /Menu do portal|Rodapé|var a=1/.test(l))).toBe(false);
    expect(p).toContain('A Sexta Turma do Superior Tribunal de Justiça manteve a anulação do júri que condenou a arquiteta no caso da 113 Sul.');
  });
  it('decodifica entidades (acentos, º, §) e ignora o que é curto demais', () => {
    const p = htmlToParagraphs('<main><p>Art. 310 &sect; 1&ordm; &mdash; o juiz dever&aacute; fundamentar a decis&atilde;o de prisão preventiva.</p><p>curto</p></main>');
    expect(p).toEqual(['Art. 310 § 1º — o juiz deverá fundamentar a decisão de prisão preventiva.']);
  });
  it('escolhe os parágrafos do tema, na ordem original, e respeita o limite', () => {
    const paras = ['Parágrafo sobre futebol e esportes em geral no país.', 'A audiência de custódia deve ocorrer em até 24 horas após a prisão em flagrante.', 'Outro assunto sem relação alguma com o tema pedido aqui.', 'O juiz verifica na audiência de custódia se a prisão foi legal e necessária.'];
    const t = pickRelevant(paras, 'O que é audiência de custódia? prisão', 5000);
    expect(t.split('\n')).toEqual([paras[1], paras[3]]);
    expect(pickRelevant(paras, 'audiência de custódia prisão', 90).length).toBeLessThanOrEqual(90);
  });
  it('sem parágrafo ligado ao tema usa o começo do texto', () => {
    const t = pickRelevant(['Primeiro parágrafo longo o bastante para valer.', 'Segundo parágrafo também longo o suficiente.'], 'assunto totalmente diferente xyzzy', 5000);
    expect(t.startsWith('Primeiro')).toBe(true);
  });
  it('contexto da fonte tem cabeçalho com endereço e data e cabe no limite que a revisão lê', () => {
    const c = buildSourcesContext({ nome: 'STJ Notícias', url: 'https://www.stj.jus.br/x', textoFonte: 'a'.repeat(20000), consultadoEm: '2026-11-20' });
    expect(c).toMatch(/^FONTE: STJ Notícias\nENDEREÇO: https:\/\/www\.stj\.jus\.br\/x\nCONSULTADO EM: 2026-11-20/);
    expect(c.length).toBe(MAX_SOURCE_CHARS);
    expect(temFonteSuficiente(c)).toBe(true);
    expect(temFonteSuficiente('curto')).toBe(false);
    expect(temFonteSuficiente(null)).toBe(false);
  });
});

describe('curadoria-fontes: legislação oficial e segurança', () => {
  it('escolhe a lei do assunto (até 2) a partir do título e da palavra-chave', () => {
    expect(matchLegalSources('O que é audiência de custódia? prisão em flagrante').map((l) => l.id)).toContain('cpp');
    expect(matchLegalSources('Crime tributário e administrador sonegação fiscal')[0].id).toBe('crimes-tributarios');
    expect(matchLegalSources('integralizar imóvel em holding limitada capital social').map((l) => l.id)).toContain('cc');
    expect(matchLegalSources('O que é violência vicária?').map((l) => l.id)).toContain('maria-da-penha');
    expect(matchLegalSources('receita de bolo de cenoura')).toEqual([]);
    expect(matchLegalSources('prisão crime pena flagrante', 1)).toHaveLength(1);
  });
  it('toda lei da lista é https do planalto.gov.br', () => {
    for (const l of LEGAL_SOURCES) { const u = safeSourceUrl(l.url); expect(u?.hostname).toBe('www.planalto.gov.br'); }
  });
  it('só aceita https público: recusa http, IP literal, localhost, porta estranha e senha na URL', () => {
    expect(safeSourceUrl('https://www.stj.jus.br/noticia')).not.toBeNull();
    for (const ruim of ['http://www.stj.jus.br/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://localhost/x', 'https://exemplo.com:8443/x', 'https://u:p@exemplo.com/x', 'https://[::1]/x', 'ftp://exemplo.com', 'nao-e-url']) expect(safeSourceUrl(ruim)).toBeNull();
  });
  it('marcador interno no título ou na abertura nunca é conteúdo publicável', () => {
    expect(isPlaceholderText('[AGUARDANDO FONTE PRIMÁRIA] Informativo 909 do STJ')).toBe(true);
    expect(isPlaceholderText('[CONTEÚDO RETIDO — FONTE PRIMÁRIA INDISPONÍVEL]')).toBe(true);
    expect(isPlaceholderText('Jurisprudência do STJ: consulta à fonte primária indisponível')).toBe(true);
    expect(isPlaceholderText('O que é audiência de custódia?', 'A audiência de custódia acontece em até 24 horas.')).toBe(false);
    expect(isPlaceholderText('Título normal', 'Aguardando fonte primária para concluir')).toBe(true);
  });
});
