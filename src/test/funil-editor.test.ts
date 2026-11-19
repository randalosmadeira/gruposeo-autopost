import { describe, expect, it } from 'vitest';
import { TEMPLATE_ADVOCACIA_PF, analyze, validateConfig, validateMonth, type FunnelConfig } from '../../supabase/functions/_shared/funnel-core';
import {
  addCount, addExtra, addIndicator, addStage, indicatorsUsing, moveCount, parseMonth, parsePaste, removeIndicator, removeMetric, removeStage, slugKey,
} from '../../supabase/functions/_shared/funnel-edit';

const cfg = (): FunnelConfig => JSON.parse(JSON.stringify(TEMPLATE_ADVOCACIA_PF));

describe('funil: editor completo da configuração (funções puras)', () => {
  it('código interno único e válido a partir do nome', () => {
    expect(slugKey('Contatos do nicho', [])).toBe('contatos_do_nicho');
    expect(slugKey('Ações & Indicações!', [])).toBe('acoes_indicacoes');
    expect(slugKey('Contatos', ['contatos'])).toBe('contatos_2');
    expect(slugKey('Contatos', ['contatos', 'contatos_2'])).toBe('contatos_3');
    expect(slugKey('123 ligações', [])).toMatch(/^n_123/);
    expect(slugKey('X', [])).toMatch(/^[a-z][a-z0-9_]{1,40}$/);
  });

  it('adicionar coluna, número de apoio, etapa e indicador gera configuração que o servidor aceita', () => {
    let c = cfg();
    c = addCount(c, 'Retornos');
    c = addExtra(c, 'Prazo de retorno', 'days');
    c = addStage(c, '7. Pós-venda', 'Cliente que volta.');
    const stage = c.stages.at(-1)!.key;
    c = addIndicator(c, stage, { label: 'Retornos ÷ contratos', kind: 'ratio', numerator: 'retornos', denominator: 'contratos' });
    c = addIndicator(c, stage, { label: 'Prazo médio', kind: 'metric', metric: 'prazo_de_retorno' });
    expect(c.template).toBe('custom');
    expect(c.counts.at(-1)?.key).toBe('retornos');
    expect(validateConfig(c).ok).toBe(true);
    expect(cfg().counts).toHaveLength(6); // o original não foi alterado
    const a = analyze(c, { '2026-10': { contratos: 10, retornos: 3, prazo_de_retorno: 12 } }, '2026-10');
    expect(a.stages.find((s) => s.key === stage)?.indicators.map((i) => i.value)).toEqual([0.3, 12]);
  });

  it('nomes curtos demais são ignorados (nada de coluna sem nome)', () => {
    expect(addCount(cfg(), ' ').counts).toHaveLength(6);
    expect(addStage(cfg(), 'x', 'y').stages).toHaveLength(6);
    expect(addExtra(cfg(), '', 'days').extras).toHaveLength(5);
  });

  it('remover uma coluna leva junto os indicadores que dependiam dela, e avisa quais', () => {
    expect(indicatorsUsing(cfg(), 'triagens').map((x) => x.indicator).sort()).toEqual(['pasta_rate', 'triagem_rate']);
    const r = removeMetric(cfg(), 'triagens');
    expect(r.removedIndicators).toHaveLength(2);
    expect(r.config.counts.map((m) => m.key)).not.toContain('triagens');
    expect(JSON.stringify(r.config.stages)).not.toContain('"triagens"');
    expect(validateConfig(r.config).ok).toBe(true);
    const e = removeMetric(cfg(), 'primeira_resposta_min');
    expect(e.config.extras.map((m) => m.key)).not.toContain('primeira_resposta_min');
    expect(validateConfig(e.config).ok).toBe(true);
  });

  it('proteções: mínimo de 2 colunas, mínimo de 1 etapa, limites e mover colunas', () => {
    let c = cfg();
    for (const k of ['indicacoes', 'contratos', 'analises', 'pastas_completas']) c = removeMetric(c, k).config;
    expect(c.counts).toHaveLength(2);
    const blocked = removeMetric(c, 'contatos');
    expect(blocked.blocked).toMatch(/pelo menos 2/);
    expect(blocked.config.counts).toHaveLength(2);
    let s = cfg();
    for (const st of s.stages.map((x) => x.key)) s = removeStage(s, st);
    expect(s.stages).toHaveLength(1);
    let big = cfg();
    for (let i = 0; i < 12; i++) big = addCount(big, `Coluna ${i}`);
    expect(big.counts).toHaveLength(10);
    expect(moveCount(cfg(), 0, 1).counts.map((x) => x.key).slice(0, 2)).toEqual(['triagens', 'contatos']);
    expect(moveCount(cfg(), 0, -1).counts[0].key).toBe('contatos');
    expect(removeIndicator(cfg(), 'nicho', 'pct_nicho').stages[0].indicators).toHaveLength(0);
    expect(validateConfig(removeIndicator(cfg(), 'nicho', 'pct_nicho')).ok).toBe(true);
  });
});

describe('funil: importar da planilha', () => {
  it('entende os formatos de mês', () => {
    expect(parseMonth('2026-10')).toBe('2026-10');
    expect(parseMonth('10/2026')).toBe('2026-10');
    expect(parseMonth('out/2026')).toBe('2026-10');
    expect(parseMonth('Outubro de 2026')).toBe('2026-10');
    expect(parseMonth('set 26')).toBe('2026-09');
    expect(parseMonth('2026-13')).toBeNull();
    expect(parseMonth('abril')).toBeNull();
  });

  it('lê tabela com TAB, ; ou vírgula; casa colunas pelo nome; ignora vazio e avisa o que não entendeu', () => {
    const tab = ['Mês', 'Contatos', 'Triagens (análises marcadas)', 'Coluna que não existe'].join('\t') + '\n' + ['2026-09', '100', '40', 'x'].join('\t') + '\n' + ['10/2026', '1.200', '', '5'].join('\t') + '\n';
    const r = parsePaste(cfg(), tab);
    expect(r.matchedColumns).toEqual(['Contatos', 'Triagens (análises marcadas)']);
    expect(r.unknownColumns).toEqual(['Coluna que não existe']);
    expect(r.months['2026-09']).toEqual({ contatos: '100', triagens: '40' });
    expect(r.months['2026-10']).toEqual({ contatos: '1200' }); // milhar com ponto; vazio não vira zero
    expect(r.errors).toEqual([]);
    expect(parsePaste(cfg(), 'mes;CONTATOS\n2026-08;77').months['2026-08']).toEqual({ contatos: '77' });
    expect(validateMonth(cfg(), '2026-10', r.months['2026-10']).ok).toBe(true); // passa pela validação oficial
  });

  it('erros claros: sem linhas, sem colunas conhecidas, mês ilegível', () => {
    expect(parsePaste(cfg(), 'só uma linha').errors[0]).toMatch(/pelo menos uma linha/);
    expect(parsePaste(cfg(), 'Mês;Foo\n2026-01;1').errors[0]).toMatch(/Nenhuma coluna/);
    const r = parsePaste(cfg(), 'Mês;Contatos\nabril;5\n2026-02;9');
    expect(r.errors[0]).toMatch(/Linha 2.*abril/);
    expect(r.months['2026-02']).toEqual({ contatos: '9' });
  });
});
