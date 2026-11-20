import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_RULE_TABLE, RULE_IDS, defaultProfile, describeRule, isOn, parsePromptDirectives, promptLimits, resolveRuleProfile, ruleValue, wordBand,
} from '../../supabase/functions/_shared/optimization-rules';
import { analyzeContent, buildCriticalIssues, buildImprovements, buildSEOTips, calculateScore, countMarkdownTables, evaluateFindings, fleschPt } from '../../supabase/functions/_shared/seo-analysis-core';

const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const PARAGRAFO = 'A prescrição é o prazo que a lei estabelece para que o credor cobre uma dívida. Depois desse prazo, o devedor pode se defender. O juiz deve reconhecer a prescrição quando ela for alegada pela parte interessada.';
const ARTIGO = `<h2>O que é prescrição?</h2><p>${PARAGRAFO}</p><h2>Quando o prazo começa a correr?</h2><p>${PARAGRAFO} Você deve guardar os documentos.</p><h2>Como se defender</h2><p>${PARAGRAFO}</p>`;
const artigo = { keyword: 'prescrição da dívida', title: 'Prescrição da dívida: como funciona e quando prazo acaba', excerpt: '' };

describe('perfil de regras: padrão editável, camadas e níveis', () => {
  it('toda regra existe, tem nível válido e o padrão vem marcado como editável', () => {
    for (const id of RULE_IDS) {
      const r = DEFAULT_RULE_TABLE[id];
      expect(r, id).toBeTruthy();
      expect(['exigir', 'recomendar', 'desligado']).toContain(r.level);
      expect(r.source).toBe('padrao_editavel');
    }
    expect(defaultProfile().layers).toEqual(['padrao_editavel']);
  });

  it('tamanho NÃO é piso fixo: as palavras são só uma dica (recomendar) e o schema FAQ nunca é obrigatório', () => {
    const p = defaultProfile();
    expect(p.rules.words.level).toBe('recomendar');
    expect(p.rules.schema_faq.level).not.toBe('exigir');
    expect(p.options.auto).toBe(false);
    expect(p.options.apply_without_review).toBe(false);
    expect(p.options.compliance_pack).toBe('auto');
    expect(p.options.compliance_mode).toBe('aviso');
    expect(p.options.plugin_gate).toBe('avisar');
  });

  it('a camada do projeto, a do artigo e a do prompt substituem o padrão, nessa ordem (a última vence)', () => {
    const p = resolveRuleProfile({
      projectIdentity: { author_name: 'Ana', optimization_rules: { rules: { internal_links: 6, flesch: { value: 50, max: 65 }, faq: 'exigir' }, options: { auto: true } } },
      articleConfig: { geo_word_band: { min: 1200, max: 1800 }, optimization_rules: { internal_links: 8 } },
      prompts: ['Escreva com clareza.\n[otimizacao]\nlinks_internos=12\nbreadcrumb=desligado\nplugin_gate=exigir'],
    });
    expect(p.rules.internal_links).toMatchObject({ value: 12, source: 'prompt' }); // prompt > artigo (8) > projeto (6)
    expect(p.rules.flesch).toMatchObject({ value: 50, max: 65, source: 'projeto' });
    expect(p.rules.faq).toMatchObject({ level: 'exigir', source: 'projeto' });
    expect(p.rules.words).toMatchObject({ level: 'exigir', value: 1200, max: 1800, source: 'artigo' });
    expect(p.rules.breadcrumb.level).toBe('desligado');
    expect(isOn(p, 'breadcrumb')).toBe(false);
    expect(p.options.auto).toBe(true);
    expect(p.options.plugin_gate).toBe('exigir');
    expect(p.layers).toEqual(expect.arrayContaining(['padrao_editavel', 'projeto', 'artigo', 'prompt']));
  });

  it('o prompt do agente em português comum também define tamanho, Flesch, links e frases', () => {
    const d = parsePromptDirectives('Redija entre 1.200 e 1.800 palavras. Flesch mínimo 55. Pelo menos 8 links internos. Frases de até 22 palavras. Parágrafos de até 50 palavras.');
    expect(d.rules.words).toMatchObject({ value: 1200, max: 1800 });
    expect(d.rules.flesch).toMatchObject({ value: 55 });
    expect(d.rules.internal_links).toMatchObject({ value: 8 });
    expect(d.rules.sentence_words).toMatchObject({ value: 22 });
    expect(d.rules.paragraph_words).toMatchObject({ value: 50 });
    const p = resolveRuleProfile({ prompts: ['Mínimo de 900 palavras.'] });
    expect(wordBand(p)).toEqual({ min: 900, max: null });
  });

  it('entrada inesperada nunca derruba nem muda o padrão; valor absurdo é ignorado; teto de tokens e de passos tem trava dura', () => {
    const p = resolveRuleProfile({ projectIdentity: 'lixo', articleConfig: { optimization_rules: { flesch: 'banana', internal_links: -3, step_max_tokens: 999999, max_ai_steps: 99 } }, prompts: [null, undefined, '[otimizacao] palavras=abc'] });
    expect(p.rules.flesch).toEqual(DEFAULT_RULE_TABLE.flesch);
    expect(p.rules.internal_links.value).toBe(10);
    expect(p.options.step_max_tokens).toBe(4000);
    expect(p.options.max_ai_steps).toBe(12);
    expect(wordBand(p).min).toBe(1500);
  });

  it('desligar a regra de palavras remove qualquer faixa; os textos dos prompts de IA acompanham o perfil', () => {
    const off = resolveRuleProfile({ articleConfig: { optimization_rules: { palavras: 'desligado' } } });
    expect(wordBand(off)).toEqual({ min: null, max: null });
    expect(promptLimits(off).words).toMatch(/sem enchimento/);
    const custom = resolveRuleProfile({ prompts: ['[otimizacao]\nflesch=55..68\nlinks_internos=4\nfrases=22'] });
    expect(promptLimits(custom).readability).toMatch(/pelo menos 68/);
    expect(promptLimits(custom).internalLinks).toBe('no mínimo 4');
    expect(describeRule(custom, 'internal_links')).toMatch(/definido no prompt do agente/);
    expect(ruleValue(custom, 'internal_links', 0)).toBe(4);
  });
});

describe('análise de conteúdo guiada pelo perfil (mesmos números do analisador antigo no padrão)', () => {
  it('Flesch em português: texto jurídico comum dá nota real, não zero (a fórmula do inglês dava 0)', () => {
    const a = analyzeContent(ARTIGO, strip(ARTIGO), artigo);
    expect(a.flesch.score).toBeGreaterThan(20);
    expect(a.flesch.score).toBeLessThan(100);
    expect(fleschPt(20, 2.3)).toBe(Math.round(248.835 - 1.015 * 20 - 84.6 * 2.3));
  });

  it('o mínimo de Flesch vem do perfil: o mesmo texto passa com mínimo baixo e reprova com mínimo alto', () => {
    const base = analyzeContent(ARTIGO, strip(ARTIGO), artigo).flesch.score;
    const baixo = resolveRuleProfile({ articleConfig: { optimization_rules: { flesch: { value: Math.max(base - 5, 0), max: base } } } });
    const alto = resolveRuleProfile({ articleConfig: { optimization_rules: { flesch: { value: Math.min(base + 5, 100), max: 100 } } } });
    expect(analyzeContent(ARTIGO, strip(ARTIGO), artigo, null, baixo).flesch.passed).toBe(true);
    expect(analyzeContent(ARTIGO, strip(ARTIGO), artigo, null, alto).flesch.passed).toBe(false);
  });

  it('links internos: o mínimo vem do perfil e a mensagem cita o número do perfil, não 10 fixo', () => {
    const rules = resolveRuleProfile({ articleConfig: { optimization_rules: { links_internos: 3 } } });
    const a = analyzeContent(ARTIGO, strip(ARTIGO), artigo, null, rules);
    const msg = evaluateFindings(a, rules).find((f) => f.id === 'internal_links')!;
    expect(msg.ok).toBe(false);
    expect(msg.message).toMatch(/mínimo 3/);
    expect(buildImprovements(a, rules).some((i) => /mínimo 3/.test(i.suggestion))).toBe(true);
  });

  it('sem faixa de palavras definida pelo agente não existe dica de 1500; com faixa, a dica cita o que o agente pediu', () => {
    const off = resolveRuleProfile({ articleConfig: { optimization_rules: { palavras: 'desligado' } } });
    const a = analyzeContent(ARTIGO, strip(ARTIGO), artigo, null, off);
    expect(buildSEOTips(a, off).join(' ')).not.toMatch(/1500/);
    expect(a.structure.wordsOk).toBe(true);
    const pedido = resolveRuleProfile({ prompts: ['Mínimo de 2000 palavras.'] });
    const b = analyzeContent(ARTIGO, strip(ARTIGO), artigo, null, pedido);
    expect(b.structure.wordsOk).toBe(false);
    expect(buildSEOTips(b, pedido).join(' ')).toMatch(/2000/);
    expect(calculateScore(b, pedido)).toBeLessThan(calculateScore(a, off));
  });

  it('regra desligada some das constatações; só nível "exigir" vira problema crítico', () => {
    const rules = resolveRuleProfile({ articleConfig: { optimization_rules: { breadcrumb: 'desligado', faq: 'exigir' } } });
    const a = analyzeContent(ARTIGO, strip(ARTIGO), artigo, null, rules);
    const ids = evaluateFindings(a, rules).map((f) => f.id);
    expect(ids).not.toContain('breadcrumb');
    expect(buildCriticalIssues(a, rules).join(' ')).toMatch(/perguntas frequentes/);
    const padrao = defaultProfile();
    expect(buildCriticalIssues(analyzeContent(ARTIGO, strip(ARTIGO), artigo, null, padrao), padrao).join(' ')).not.toMatch(/perguntas frequentes/);
  });

  it('o JSON-LD vai por post-meta: a análise reconhece schema, trilha e SEO plugin informados de fora do corpo', () => {
    const sem = analyzeContent(ARTIGO, strip(ARTIGO), artigo);
    expect(sem.structure.hasArticleSchema).toBe(false);
    expect(sem.structure.hasBreadcrumb).toBe(false);
    const com = analyzeContent(ARTIGO, strip(ARTIGO), artigo, null, defaultProfile(), { schemaTypes: ['Article', 'BreadcrumbList'] });
    expect(com.structure.hasArticleSchema).toBe(true);
    expect(com.structure.hasBreadcrumb).toBe(true);
    const plugin = analyzeContent(ARTIGO, strip(ARTIGO), artigo, null, defaultProfile(), { seoPlugin: 'rank_math' });
    expect(plugin.structure.hasArticleSchema).toBe(true);
  });

  it('detecta tabela em markdown cru e resíduo de prompt', () => {
    const md = '<p>| Prazo | Valor |<br>|---|---|<br>| 5 anos | R$ 10 |</p>';
    expect(countMarkdownTables(md)).toBe(1);
    expect(countMarkdownTables('<table><tr><td>a</td></tr></table>')).toBe(0);
    const a = analyzeContent(`${ARTIGO}<p>[INSERIR FONTE]</p>`, strip(ARTIGO), artigo);
    expect(a.structure.residueCount).toBeGreaterThan(0);
  });

  it('o analisador da função de borda não tem mais os limites fixos escritos no código', () => {
    const src = readFileSync('supabase/functions/analyze-seo-advanced/index.ts', 'utf8');
    expect(src).not.toMatch(/206\.835/);
    expect(src).not.toMatch(/Flesch ≥ 70|MÍNIMO 1500|mín 10 links|Alvo: ≥70|Alvo: ≤25/);
    expect(src).toMatch(/loadRuleProfile/);
    expect(src).toMatch(/promptLimits/);
  });
});
