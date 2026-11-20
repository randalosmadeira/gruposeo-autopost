import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { defaultProfile } from '../../supabase/functions/_shared/optimization-rules';
import { detectLanguage, isQuestionHeading, parseLanguageTag, resolveLanguage } from '../../supabase/functions/_shared/language-packs';
import { packForSegment, resolvePack, runPack } from '../../supabase/functions/_shared/segment-packs';
import { analyzeContent, calculateScore, evaluateFindings } from '../../supabase/functions/_shared/seo-analysis-core';

// GLOBAL (decisão do dono, 20/11/2026): idiomas e segmentos. Exemplos: pt-BR jurídico, en comércio eletrônico, es saúde.
const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const PT_JURIDICO = '<h2>O que é prescrição?</h2><p>A prescrição é o prazo que a lei estabelece para que o credor cobre uma dívida. Depois desse prazo, o devedor pode se defender. Você deve guardar os documentos.</p><h2>Quando o prazo começa a correr?</h2><p>O prazo começa quando o direito pode ser exercido. Por exemplo, na data do vencimento da parcela.</p><h2>Como se defender</h2><p>O juiz deve reconhecer a prescrição quando ela for alegada. Portanto, procure orientação.</p>';
const EN_SHOP = '<h2>How do I choose running shoes?</h2><p>Running shoes are designed to absorb impact and keep your feet stable. You should pick a pair that fits your stride and your budget. However, the best choice depends on where you run.</p><h2>What is the return policy?</h2><p>You can return any pair within thirty days. For example, if the size does not fit, you can exchange it for free. Therefore, you can try them at home without worry.</p><h2>Delivery options</h2><p>We ship worldwide and you will receive tracking by email. In addition, you can pick up your order at the store.</p>';
const ES_SALUD = '<h2>¿Qué es la hipertensión?</h2><p>La hipertensión es una enfermedad frecuente que ocurre cuando la presión de la sangre es demasiado alta. Usted puede controlarla con hábitos saludables. Sin embargo, es importante hablar con su médico.</p><h2>Cómo medir la presión en casa</h2><p>Siéntese y descanse cinco minutos antes de medir. Por ejemplo, evite el café en la media hora anterior. Además, mida siempre en el mismo brazo.</p><h2>Síntomas</h2><p>Muchas personas no sienten nada. Por eso, usted debe revisar su presión con frecuencia. Usted conoce su cuerpo mejor que nadie. Si usted nota cambios, hable con su médico. Su familia también puede ayudarle a recordar sus controles.</p>';
const FI_TEXTO = 'Tämä on suomenkielinen teksti, jota järjestelmä ei tunne. Lauseet ovat lyhyitä ja selkeitä. Silti kaava puuttuu tästä kielestä kokonaan. Ohjelma ei saa antaa nollaa vain siksi, että kieli on tuntematon. Teksti jatkuu vielä hieman, jotta mittaus onnistuu.';
const analisar = (html: string, art: Record<string, unknown>, rules = defaultProfile(), extras = {}) => analyzeContent(html, strip(html), art, null, rules, extras);

describe('global: idioma do artigo e fórmula de legibilidade por idioma', () => {
  it('o idioma configurado vence; sem configuração, detecta pelo texto (pt, en, es, fr, it, de); texto curto ou ambíguo = desconhecido, sem chute', () => {
    expect(parseLanguageTag('pt_BR')).toEqual({ code: 'pt', region: 'BR', tag: 'pt-BR' });
    expect(parseLanguageTag('Español')).toMatchObject({ code: 'es' });
    expect(resolveLanguage({ configured: [null, 'en-GB'], text: strip(PT_JURIDICO) })).toMatchObject({ code: 'en', region: 'GB', source: 'configurado' });
    expect(resolveLanguage({ text: strip(EN_SHOP) })).toMatchObject({ code: 'en', source: 'detectado' });
    expect(resolveLanguage({ text: strip(ES_SALUD) })).toMatchObject({ code: 'es', source: 'detectado' });
    expect(resolveLanguage({ text: strip(PT_JURIDICO) })).toMatchObject({ code: 'pt', source: 'detectado' });
    expect(detectLanguage('Les chiens et les chats sont des animaux que les enfants aiment dans la maison, et il est important que les parents soient avec eux pour les aider dans la vie de tous les jours.').code).toBe('fr');
    expect(detectLanguage('Il cane e il gatto sono animali che i bambini amano molto, e per questo è importante che i genitori siano con loro in casa per aiutarli ogni giorno della vita.').code).toBe('it');
    expect(detectLanguage('Der Hund und die Katze sind Tiere, die Kinder sehr lieben, und es ist wichtig, dass die Eltern mit ihnen im Haus sind, um ihnen für den Alltag zu helfen.').code).toBe('de');
    expect(resolveLanguage({ text: 'texto curto' })).toMatchObject({ code: 'und', source: 'desconhecido', profile: null });
  });

  it('cada idioma usa a SUA fórmula, com nota real (nunca 0 de mentira) e a fórmula citada na análise', () => {
    const en = analisar(EN_SHOP, { keyword: 'running shoes', title: 'Running shoes', excerpt: '' });
    expect(en.language).toMatchObject({ code: 'en', formula: { id: 'flesch_en', status: 'documentada', scored: true } });
    expect(en.flesch.score).toBeGreaterThan(30);
    expect(en.readability_v2.gunning_fog).not.toBeNull(); // índices do inglês só existem para inglês
    const es = analisar(ES_SALUD, { keyword: 'hipertensión', title: 'Hipertensión', excerpt: '' });
    expect(es.language).toMatchObject({ code: 'es', formula: { id: 'fernandez_huerta' } });
    expect(es.flesch.score).toBeGreaterThan(20);
    expect(es.readability_v2.gunning_fog).toBeNull();
    const pt = analisar(PT_JURIDICO, { keyword: 'prescrição', title: 'Prescrição', excerpt: '' });
    expect(pt.language).toMatchObject({ code: 'pt', formula: { id: 'flesch_pt' } });
    expect(pt.flesch.score).toBeGreaterThan(20);
  });

  it('as fórmulas batem com as constantes documentadas (conta feita à mão)', () => {
    const mk = (code: string) => resolveLanguage({ configured: [code] }).profile!.readability!;
    const s = { words: 100, sentences: 5, syllables: 200, letters: 450 }; // ASL=20, ASW=2, P=200, F=5
    expect(mk('en').compute(s)).toBe(Math.round(206.835 - 1.015 * 20 - 84.6 * 2));
    expect(mk('pt').compute(s)).toBe(Math.round(248.835 - 1.015 * 20 - 84.6 * 2));
    expect(mk('es').compute(s)).toBe(Math.round(206.84 - 0.60 * 200 - 1.02 * 5) < 0 ? 0 : Math.round(206.84 - 0.60 * 200 - 1.02 * 5));
    expect(mk('fr').compute(s)).toBe(Math.round(207 - 1.015 * 20 - 73.6 * 2));
    expect(mk('de').compute(s)).toBe(Math.round(180 - 20 - 58.5 * 2));
    expect(mk('it').compute(s)).toBe(Math.max(0, Math.min(100, Math.round(89 + (300 * 5 - 10 * 450) / 100))));
    expect(mk('nl').status).toBe('referencia'); // constantes não confirmadas: marcada como referência
    expect(mk('en').status).toBe('documentada');
  });

  it('idioma sem pacote: SEM FÓRMULA, nota nula (não zero), não reprova e não puxa a nota geral para baixo', () => {
    const fi = analisar(`<h2>Otsikko</h2><p>${FI_TEXTO}</p>`, { keyword: 'teksti', title: 'Teksti', excerpt: '', language: 'fi' });
    expect(fi.language).toMatchObject({ code: 'fi', source: 'configurado', formula: { scored: false } });
    expect(fi.flesch).toMatchObject({ score: null, passed: true, scored: false, level: 'Sem fórmula' });
    expect(fi.readability_v2.transition_words_pct).toBeNull();
    const regras = defaultProfile();
    const ids = evaluateFindings(fi, regras).map((f) => f.id);
    expect(ids).not.toContain('flesch');
    expect(ids).not.toContain('conversational_tone');
    expect(ids).not.toContain('transition_words');
    expect(calculateScore(fi, regras)).toBeGreaterThan(0);
  });
});

describe('global: perguntas nos H2, conectivos, tom e dados em cada idioma', () => {
  it('H2 em forma de pergunta por idioma (como/o que é; how/what is; cómo/qué es; comment; come; wie; hoe)', () => {
    const pt = resolveLanguage({ configured: ['pt'] }).profile; const en = resolveLanguage({ configured: ['en'] }).profile; const es = resolveLanguage({ configured: ['es'] }).profile;
    expect(isQuestionHeading('Como funciona o prazo', pt)).toBe(true);
    expect(isQuestionHeading('How much does it cost', en)).toBe(true);
    expect(isQuestionHeading('Qué es la hipertensión', es)).toBe(true);
    expect(isQuestionHeading('Cómo medir la presión', es)).toBe(true);
    expect(isQuestionHeading('Prazo para recorrer', pt)).toBe(false);
    expect(isQuestionHeading('Delivery options', en)).toBe(false);
    expect(isQuestionHeading('¿Y ahora qué?', es)).toBe(true);
    for (const [c, h] of [['fr', 'Comment choisir'], ['it', 'Come scegliere'], ['de', 'Wie funktioniert es'], ['nl', 'Hoe werkt het']] as const) {
      expect(isQuestionHeading(h, resolveLanguage({ configured: [c] }).profile)).toBe(true);
    }
    expect(analisar(EN_SHOP, { keyword: 'shoes', title: 't', excerpt: '' }).geo.questionH2Pct).toBe(67);
    expect(analisar(ES_SALUD, { keyword: 'hipertensión', title: 't', excerpt: '' }).geo.questionH2Pct).toBe(67);
    expect(analisar(PT_JURIDICO, { keyword: 'prescrição', title: 't', excerpt: '' }).geo.questionH2Pct).toBe(100);
  });

  it('conectivos, tom conversacional, FAQ, conclusão e convite ao contato são medidos NO idioma do texto', () => {
    const en = analisar(`${EN_SHOP}<h2>Frequently asked questions</h2><p>Contact us to learn more. In conclusion, enjoy your run.</p>`, { keyword: 'shoes', title: 't', excerpt: '' });
    expect(en.readability_v2.transition_count).toBeGreaterThanOrEqual(4);
    expect(en.geo.isConversational).toBe(true);
    expect(en.structure).toMatchObject({ hasFAQ: true, hasConclusion: true, hasCTA: true });
    const es = analisar(ES_SALUD, { keyword: 'hipertensión', title: 't', excerpt: '' });
    expect(es.readability_v2.transition_count).toBeGreaterThanOrEqual(4);
    expect(es.geo.isConversational).toBe(true);
    const pt = analisar(PT_JURIDICO, { keyword: 'prescrição', title: 't', excerpt: '' });
    expect(pt.readability_v2.transition_count).toBeGreaterThanOrEqual(2);
  });

  it('moeda e dados não são do Brasil: US$, $, € e % contam como dado, em qualquer idioma', () => {
    const a = analisar('<p>The plan costs $49 per month, about 20% less than last year. In Europe it costs €45. According to Eurostat (2024), prices fell.</p>', { keyword: 'plan', title: 't', excerpt: '' });
    expect(a.geo.statsEvery200Words).toBeGreaterThan(0);
  });
});

describe('global: pacotes de conformidade por segmento (todos opcionais, em aviso por padrão e desligáveis)', () => {
  it('o pacote vem do segmento; a regra brasileira (OAB) só vale em português e só se o projeto for jurídico', () => {
    expect(packForSegment('legal', { code: 'pt', region: 'BR' })).toBe('juridico_oab');
    expect(packForSegment('legal', { code: 'en', region: 'US' })).toBeNull();
    expect(packForSegment('legal', { code: 'pt', region: 'PT' })).toBeNull();
    expect(packForSegment('health')).toBe('saude');
    expect(packForSegment('fintech')).toBe('financas');
    expect(packForSegment('ecommerce')).toBe('ecommerce');
    expect(packForSegment('education')).toBe('educacao');
    expect(packForSegment('general')).toBeNull();
    expect(resolvePack('nenhum', 'legal', { code: 'pt' })).toBeNull();
    expect(resolvePack('financas', 'general')).toBe('financas');
    expect(resolvePack('auto', 'health')).toBe('saude');
  });

  it('en comércio eletrônico, es saúde, pt jurídico: avisa por padrão, desliga, e só bloqueia no modo rígido', () => {
    const loja = runPack('ecommerce', 'aviso', { content: '<p>Hurry! Best price guaranteed, only today.</p>' });
    expect(loja.warnings.length).toBe(1);
    expect(loja.blocking).toBe(false);
    expect(runPack('ecommerce', 'rigido', { content: '<p>Last chance!</p>' }).blocking).toBe(true);
    expect(runPack('ecommerce', 'desligado', { content: '<p>Last chance!</p>' }).warnings).toEqual([]);
    expect(runPack('ecommerce', 'aviso', { content: '<p>Free delivery over $50.</p>' }).warnings).toEqual([]);
    const saude = runPack('saude', 'aviso', { content: '<p>Tratamiento milagroso sin efectos secundarios.</p>' });
    expect(saude.warnings[0].code).toBe('saude_resultado_garantido');
    expect(saude.blocking).toBe(false);
    const juridico = runPack('juridico_oab', 'aviso', { content: '<p>Resultado garantido: ganhamos 100% dos casos.</p>' });
    expect(juridico.blocking).toBe(false);
    expect(juridico.warnings.length).toBeGreaterThan(0);
    expect(runPack(null, 'aviso', { content: 'qualquer coisa' }).warnings).toEqual([]);
  });

  it('o núcleo (análise, perfil de regras e idiomas) não carrega regra de advocacia, de país ou de moeda local', () => {
    const nucleo = ['seo-analysis-core.ts', 'optimization-rules.ts', 'language-packs.ts'].map((f) => readFileSync(`supabase/functions/_shared/${f}`, 'utf8')).join('\n');
    expect(nucleo).not.toMatch(/Provimento|OAB|advog[ao]|jur[ií]dic|gov\.br/i);
  });
});
