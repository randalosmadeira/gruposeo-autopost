import { describe, expect, it } from 'vitest';
import {
  analyze, configFromTemplate, formatValue, monthlyTable, monthsBack, previousMonth, suggestTemplate, validateConfig, validateMonth, weeksIn,
  TEMPLATES, TEMPLATE_ADVOCACIA_PF, type FunnelConfig, type FunnelEntries,
} from '../../supabase/functions/_shared/funnel-core';
import { COUNCIL } from '../../supabase/functions/_shared/profile-registry';

const cfg = (): FunnelConfig => JSON.parse(JSON.stringify(TEMPLATE_ADVOCACIA_PF));
const entries: FunnelEntries = {
  '2026-09': { contatos: 100, triagens: 40, pastas_completas: 30, analises: 24, contratos: 12, indicacoes: 6, contatos_nicho: 70, contatos_conteudo: 35, primeira_resposta_min: 90, dias_pasta_completa: 5, casos_por_pessoa: 18 },
  '2026-10': { contatos: 120, triagens: 42, pastas_completas: 21, analises: 18, contratos: 10, indicacoes: 8, contatos_nicho: 90, contatos_conteudo: 62, primeira_resposta_min: 130, dias_pasta_completa: 9, casos_por_pessoa: 21 },
};

describe('funil: modelos e validação da configuração', () => {
  it('os dois modelos passam na própria validação (sem remendo)', () => {
    for (const t of Object.values(TEMPLATES)) {
      const r = validateConfig(t);
      expect(r.ok, t.template).toBe(true);
      if (r.ok) expect(r.value).toEqual(t);
    }
  });

  it('modelo de advocacia segue a tabela do recon: seis etapas e colunas contatos → triagens → pastas → análises → contratos → indicações', () => {
    expect(TEMPLATE_ADVOCACIA_PF.stages).toHaveLength(6);
    expect(TEMPLATE_ADVOCACIA_PF.counts.map((c) => c.key)).toEqual(['contatos', 'triagens', 'pastas_completas', 'analises', 'contratos', 'indicacoes']);
    expect(TEMPLATE_ADVOCACIA_PF.stages.find((s) => s.key === 'conteudo')?.compliance).toMatch(/promessa/i);
  });

  it('segmento sugere o modelo, mas a configuração é livre; conselho do Perfil entra por projeto', () => {
    expect(suggestTemplate('Advocacia')).toBe('advocacia-pf');
    expect(suggestTemplate('Estética e beleza')).toBe('generico');
    expect(suggestTemplate(undefined)).toBe('generico');
    const odonto = configFromTemplate('generico', COUNCIL.Odontologia[1]);
    expect(odonto.stages.find((s) => s.key === 'atrair')?.compliance).toBe(COUNCIL.Odontologia[1]);
    expect(configFromTemplate('generico').stages.every((s) => !s.compliance)).toBe(true);
    // o modelo original não é alterado
    expect(TEMPLATES.generico.stages.every((s) => !s.compliance)).toBe(true);
  });

  it('aceita etapas e indicadores próprios do projeto', () => {
    const c = cfg();
    c.template = 'custom';
    c.counts.splice(2, 1); // tira "pastas completas"
    c.stages = c.stages.filter((s) => s.key !== 'coleta');
    c.counts.push({ key: 'retornos', label: 'Retornos', kind: 'count' });
    c.stages.push({ key: 'retorno', label: '7. Retorno', goal: 'Cliente que volta.', indicators: [{ key: 'ret', label: 'Retornos ÷ contratos', kind: 'ratio', numerator: 'retornos', denominator: 'contratos' }] });
    expect(validateConfig(c).ok).toBe(true);
  });

  it('recusa configuração fora do contrato, sem consertar escondido', () => {
    const bad = (mut: (c: FunnelConfig) => void) => { const c = cfg(); mut(c); const r = validateConfig(c); return r.ok === false ? r.error : 'ok'; };
    expect(bad((c) => { c.counts = c.counts.slice(0, 1); })).toBe('counts_invalid');
    expect(bad((c) => { c.counts[1].key = 'contatos'; })).toBe('metric_key_duplicated');
    expect(bad((c) => { c.counts[0].key = 'Contatos Totais'; })).toBe('count_invalid');
    expect(bad((c) => { c.stages[0].indicators = [{ key: 'razao', label: 'Razão', kind: 'ratio', numerator: 'nao_existe', denominator: 'contatos' }]; })).toBe('indicator_reference_invalid');
    expect(bad((c) => { c.stages[0].indicators = [{ key: 'razao', label: 'Razão', kind: 'ratio', numerator: 'primeira_resposta_min', denominator: 'contatos' }]; })).toBe('indicator_reference_invalid'); // tempo não entra em razão
    expect(bad((c) => { c.stages[1].key = c.stages[0].key; })).toBe('stage_invalid');
    expect(bad((c) => { c.stages[0].label = 'x'; })).toBe('stage_invalid');
    expect(bad((c) => { (c as unknown as { version: number }).version = 2; })).toBe('config_version_unsupported');
    expect(bad((c) => { c.extras[0].kind = 'texto' as never; })).toBe('extra_invalid');
    expect(validateConfig(null).ok).toBe(false);
    expect(validateConfig({ ...cfg(), counts: Array.from({ length: 11 }, (_, i) => ({ key: `c${i}x`, label: `Coluna ${i}`, kind: 'count' })) }).ok).toBe(false);
  });

  it('números do mês: validação de tipo, faixa e contagem inteira; vazio limpa', () => {
    const c = cfg();
    expect(validateMonth(c, '2026-10', { contatos: '120', primeira_resposta_min: '12,5', triagens: null })).toEqual({ ok: true, value: { month: '2026-10', set: { contatos: 120, primeira_resposta_min: 12.5 }, clear: ['triagens'] } });
    const err = (m: unknown, v: unknown) => { const r = validateMonth(c, m, v); return r.ok === false ? `${r.error}${r.where ? ':' + r.where : ''}` : 'ok'; };
    expect(err('2026-13', {})).toBe('month_invalid');
    expect(err('10/2026', {})).toBe('month_invalid');
    expect(err('2026-10', { contatos: -1 })).toBe('value_invalid:contatos');
    expect(err('2026-10', { contatos: 'abc' })).toBe('value_invalid:contatos');
    expect(err('2026-10', { contatos: 10.5 })).toBe('count_must_be_integer:contatos');
    expect(err('2026-10', { inventado: 3 })).toBe('metric_unknown:inventado');
    expect(err('2026-10', { contatos: 1e12 })).toBe('value_invalid:contatos');
    expect(err('2026-10', [])).toBe('values_invalid');
  });
});

describe('funil: cálculo mensal', () => {
  it('calendário: semanas do mês e mês anterior (inclusive virada de ano)', () => {
    expect(weeksIn('2026-02')).toBe(4);
    expect(weeksIn('2026-10')).toBeCloseTo(31 / 7);
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-03')).toBe('2026-02');
    expect(monthsBack('2026-02', 3)).toEqual(['2026-02', '2026-01', '2025-12']);
  });

  it('conversão de cada passo, variação sobre o mês anterior e vazamento pelo maior recuo', () => {
    const a = analyze(cfg(), entries, '2026-10');
    expect(a.steps.map((s) => s.from + '>' + s.to)).toEqual(['contatos>triagens', 'triagens>pastas_completas', 'pastas_completas>analises', 'analises>contratos', 'contratos>indicacoes']);
    const triagem = a.steps[0]; const pasta = a.steps[1];
    expect(triagem.rate).toBeCloseTo(0.35);
    expect(triagem.prevRate).toBeCloseTo(0.4);
    expect(triagem.deltaPp).toBe(-5);
    expect(pasta.rate).toBeCloseTo(0.5);
    expect(pasta.deltaPp).toBe(-25); // 75% -> 50%
    expect(pasta.lost).toBe(21);
    expect(a.leak).toMatchObject({ stepIndex: 1, reason: 'maior_queda' });
    expect(a.leak?.text).toMatch(/Pastas completas/);
  });

  it('sem mês anterior, aponta o passo de menor conversão e diz que não há com o que comparar', () => {
    const a = analyze(cfg(), { '2026-09': entries['2026-09'] }, '2026-09');
    expect(a.leak?.reason).toBe('mais_baixa');
    expect(a.leak?.text).toMatch(/Sem mês anterior/);
    expect(a.steps[0].prevRate).toBeNull();
  });

  it('indicadores de cada etapa: razão, por semana, tempo; variação; "sem dados" quando falta número', () => {
    const a = analyze(cfg(), entries, '2026-10');
    const by = (k: string) => a.stages.find((s) => s.key === k)?.indicators[0];
    expect(by('nicho')?.value).toBeCloseTo(0.75);
    expect(by('nicho')?.delta).toBeCloseTo(0.05);
    expect(by('conteudo')?.value).toBe(14); // 62 contatos em ~4,43 semanas
    expect(by('conteudo')?.unit).toBe('per_week');
    expect(by('atendimento')?.value).toBe(130);
    expect(by('atendimento')?.unit).toBe('minutes');
    expect(formatValue(90, 'minutes')).toBe('90 min');
    expect(formatValue(130, 'minutes')).toBe('2,2 h');
    expect(formatValue(150, 'minutes')).toBe('2,5 h');
    expect(formatValue(0.755, 'percent')).toBe('75,5%');
    expect(formatValue(null, 'percent')).toBe('sem dados');
    const empty = analyze(cfg(), {}, '2026-10');
    expect(empty.filled).toBe(0);
    expect(empty.stages.every((s) => s.missing.length === s.indicators.length)).toBe(true);
    expect(empty.leak).toBeNull();
  });

  it('não divide por zero nem trata zero como ausência', () => {
    const a = analyze(cfg(), { '2026-10': { contatos: 0, triagens: 0, contatos_nicho: 0 } }, '2026-10');
    expect(a.steps[0].rate).toBeNull();
    expect(a.stages[0].indicators[0].value).toBeNull();
    const z = analyze(cfg(), { '2026-10': { contatos: 10, triagens: 0 } }, '2026-10');
    expect(z.steps[0].rate).toBe(0);
    expect(z.steps[0].lost).toBe(10);
  });

  it('avisa lançamento incoerente (número de baixo maior que o de cima) e não o usa como vazamento', () => {
    const a = analyze(cfg(), { '2026-10': { contatos: 10, triagens: 20, pastas_completas: 5 } }, '2026-10');
    expect(a.steps[0].inconsistent).toBe(true);
    expect(a.warnings[0]).toMatch(/maior que/);
    expect(a.leak?.stepIndex).not.toBe(0);
  });

  it('tabela mensal: valores e conversões, do mês mais novo ao mais antigo, com buracos', () => {
    const t = monthlyTable(cfg(), entries, ['2026-10', '2026-09', '2026-08']);
    expect(t[0].values).toEqual([120, 42, 21, 18, 10, 8]);
    expect(t[0].rates[0]).toBeCloseTo(0.35);
    expect(t[2].values.every((v) => v === null)).toBe(true);
    expect(t[2].rates.every((v) => v === null)).toBe(true);
  });
});
