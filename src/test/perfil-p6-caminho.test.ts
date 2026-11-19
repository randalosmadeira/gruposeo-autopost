import { describe, expect, it } from 'vitest';
import { buildHelpSummary, isDelegable, measuredGaps, measuredGroups } from '@/lib/profile-path';
import type { AnalysisCheck, AnalysisFinding, CheckStatus, FindingSeverity, FindingState } from '@/lib/profile-api';

const check = (check_key: string, status: CheckStatus): AnalysisCheck => ({ check_key, source: 'x', status, measured: {}, evidence_url: null, duration_ms: 0, error: null });
const finding = (check_key: string, severity: FindingSeverity, title = `Achado ${check_key}`, state: FindingState = 'open'): AnalysisFinding => ({ id: `${check_key}-${severity}-${title}`, check_key, severity, title, detail: 'detalhe', evidence: {}, suggested_action: 'faça algo', state });
const by = (groups: ReturnType<typeof measuredGroups>, key: string) => groups.find((g) => g.key === key)!;

describe('P6: maturidade MEDIDA (só dado medido)', () => {
  it('sem nenhuma verificação: todos os grupos "sem medição", nunca um número', () => {
    const g = measuredGroups([]);
    expect(g.map((x) => x.key)).toEqual(['empresa', 'dominio', 'site', 'redes']);
    for (const x of g) expect(x).toMatchObject({ score: null, measured: 0 });
  });

  it('ok vale 1, atenção vale 0,5, problema vale 0', () => {
    const g = measuredGroups([check('dns', 'ok'), check('dominio_rdap', 'warn')]);
    expect(by(g, 'dominio')).toMatchObject({ score: 75, measured: 2, ok: 1, warn: 1, fail: 0 });
    expect(by(measuredGroups([check('dns', 'fail'), check('dominio_rdap', 'fail')]), 'dominio').score).toBe(0);
    expect(by(measuredGroups([check('dns', 'ok'), check('dominio_rdap', 'ok')]), 'dominio').score).toBe(100);
  });

  it('verificação SEM resposta ou não executada não conta, nem como zero', () => {
    const g = measuredGroups([check('site_resposta', 'ok'), check('robots_txt', 'error'), check('sitemap', 'warn'), check('llms_txt', 'skipped')]);
    expect(by(g, 'site')).toMatchObject({ score: 75, measured: 2, unmeasured: 2 });
    const allDead = measuredGroups([check('dns', 'error'), check('dominio_rdap', 'error'), check('cnpj_formato', 'skipped')]);
    expect(by(allDead, 'dominio')).toMatchObject({ score: null, measured: 0, unmeasured: 2 });
    expect(by(allDead, 'empresa')).toMatchObject({ score: null, measured: 0 });
  });

  it('as verificações pagas e a idade do site nunca entram na pontuação', () => {
    const g = measuredGroups([check('maps_google_meu_negocio', 'ok'), check('ia_marca', 'ok'), check('site_idade', 'ok')]);
    for (const x of g) expect(x.score).toBeNull();
  });

  it('o mesmo conjunto de medições dá sempre o mesmo resultado (reproduzível)', () => {
    const checks = [check('cnpj_formato', 'ok'), check('cnpj_receita', 'warn'), check('cep', 'ok'), check('site_resposta', 'fail'), check('redes_formato', 'ok')];
    expect(measuredGroups(checks)).toEqual(measuredGroups([...checks].reverse()));
    expect(by(measuredGroups(checks), 'empresa').score).toBe(83);
  });
});

describe('P6: lacunas medidas e "faz sozinho × vale delegar"', () => {
  it('só entram achados EM ABERTO de gravidade alta ou média', () => {
    const gaps = measuredGaps([
      finding('dns', 'alta', 'a'), finding('sitemap', 'media', 'b'), finding('llms_txt', 'baixa', 'c'), finding('cep', 'info', 'd'),
      finding('dns', 'alta', 'e', 'ignored'), finding('sitemap', 'media', 'f', 'applied'),
    ]);
    expect(gaps.map((g) => g.item)).toEqual(['a', 'b']);
    expect(gaps.every((g) => g.source === 'medido')).toBe(true);
  });

  it('a sugestão de quem faz é fixa por tipo de verificação', () => {
    const who = (k: string, sev: FindingSeverity = 'media') => measuredGaps([finding(k, sev, 't')])[0].who;
    expect(who('cnpj_formato', 'alta')).toBe('Dá para fazer sozinho');
    expect(who('cep')).toBe('Dá para fazer sozinho');
    expect(who('dominio_rdap', 'alta')).toBe('Dá para fazer sozinho');
    expect(who('redes_formato')).toBe('Dá para fazer sozinho');
    expect(who('cnpj_receita', 'alta')).toBe('Vale delegar');
    expect(who('dns', 'alta')).toBe('Vale delegar');
    expect(who('robots_txt', 'alta')).toBe('Dá para fazer sozinho, com ajuda');
    expect(who('sitemap')).toBe('Dá para fazer sozinho, com ajuda');
    expect(who('site_resposta', 'alta')).toBe('Vale delegar');
    expect(who('site_resposta', 'media')).toBe('Dá para fazer sozinho, com ajuda');
    expect(who('verificacao_nova')).toBe('Dá para fazer sozinho, com ajuda');
  });

  it('isDelegable reconhece as formas de "delegar" das duas fontes de lacunas', () => {
    for (const w of ['Vale delegar', 'Delegar a contador']) expect(isDelegable(w), w).toBe(true);
    for (const w of ['Dá para fazer sozinho', 'Dá para fazer sozinho, com ajuda', 'Dá para começar sozinho']) expect(isDelegable(w), w).toBe(false);
  });
});

describe('P6: resumo do pedido de fase 2', () => {
  it('traz o projeto, o que vale delegar, os achados altos e avisa que não há dado financeiro', () => {
    const t = buildHelpSummary({ projectName: 'Loja Exemplo', delegable: ['Site profissional', 'Medição (GA4)'], highFindings: ['O site não termina em HTTPS'], measuredAt: '16/11/2026' });
    expect(t).toContain('"Loja Exemplo"');
    expect(t).toContain('O que vale delegar: Site profissional; Medição (GA4).');
    expect(t).toContain('Achados altos do pente fino (16/11/2026): O site não termina em HTTPS.');
    expect(t).toMatch(/sem dados financeiros/);
    expect(t.startsWith('[Perfil · fase 2]')).toBe(true);
  });
  it('o mesmo item não aparece duas vezes: o que já está em "vale delegar" não repete em "achados altos"', () => {
    const t = buildHelpSummary({ projectName: 'X', delegable: ['O site não termina em HTTPS', 'Medição (GA4)'], highFindings: ['o site não termina em HTTPS', 'Servidor lento'] });
    expect(t.match(/não termina em HTTPS/gi)).toHaveLength(1);
    expect(t).toContain('Achados altos do pente fino: Servidor lento.');
    const only = buildHelpSummary({ projectName: 'X', delegable: ['A'], highFindings: ['A'] });
    expect(only).not.toMatch(/Achados altos/);
  });
  it('sem itens, vira um pedido geral de conversa', () => {
    const t = buildHelpSummary({ projectName: 'X', delegable: [], highFindings: [] });
    expect(t).toMatch(/Quero conversar sobre ajuda/);
    expect(t).not.toMatch(/O que vale delegar/);
  });
  it('remove repetidos e vazios, e limita a 8 itens e 5 achados', () => {
    const t = buildHelpSummary({ projectName: 'X', delegable: ['a', 'a', ' ', ...Array.from({ length: 20 }, (_, i) => `item${i}`)], highFindings: Array.from({ length: 12 }, (_, i) => `achado${i}`) });
    expect(t.match(/item\d+/g)).toHaveLength(7); // 'a' + 7 dos item = 8
    expect(t).toContain('a; item0');
    expect(t.match(/achado\d+/g)).toHaveLength(5);
  });
  it('NUNCA passa de 1.000 caracteres nem fica abaixo de 3, mesmo com entradas absurdas', () => {
    const huge = 'x'.repeat(5000);
    for (const input of [
      { projectName: huge, delegable: Array(30).fill(huge), highFindings: Array(30).fill(huge) },
      { projectName: '', delegable: [], highFindings: [] },
      { projectName: 'A', delegable: ['b'], highFindings: [] },
    ]) {
      const t = buildHelpSummary(input);
      expect(t.length).toBeGreaterThanOrEqual(3);
      expect(t.length).toBeLessThanOrEqual(1000);
    }
  });
  it('só usa o que foi passado: nenhum campo de perfil entra sozinho', () => {
    const t = buildHelpSummary({ projectName: 'Loja', delegable: ['Gateway de pagamento'], highFindings: [] });
    expect(t).not.toMatch(/faturamento|lucro|caixa|capital|meta/i);
  });
});
