import { describe, expect, it } from 'vitest';
import {
  buildReport, findParagraphUnits, guardConclusion, guardRewrite, newJob, planAiSteps, runAll, runNext, sha256Hex, analyzeWorking,
  type AiRequest, type PilotDeps, type PilotInput,
} from '../../supabase/functions/_shared/auto-optimize-core';
import { resolveRuleProfile } from '../../supabase/functions/_shared/optimization-rules';
import { LANGUAGES } from '../../supabase/functions/_shared/language-packs';
import { SpendDeniedError, newSpendScope, runWithSpendScope, coverTextCall, resetPriceCache } from '../../supabase/functions/_shared/spend-gate';
import { textCostMicros, DEFAULT_PRICE_BOOK, textPriceFor } from '../../supabase/functions/_shared/spend-gate-core';
import { fakeSpendDb, ORG_A, usdm } from './helpers/fake-spend';

// ---------- fixtures (respostas de IA GRAVADAS; nada de rede, nada de provedor pago) ----------
const P1 = 'A prescrição extingue a pretensão do credor quando o prazo legal termina sem que a cobrança tenha sido feita, e o devedor pode alegar esse prazo vencido na própria defesa, desde que o juiz receba o pedido no momento correto do processo, porque a lei não permite que o magistrado reconheça o prazo sem provocação em muitos casos concretos.';
const P1_OK = 'A prescrição extingue a pretensão do credor quando o prazo legal termina sem cobrança. O devedor pode alegar esse prazo vencido na própria defesa. Isso vale desde que o juiz receba o pedido no momento correto do processo. A lei não permite que o magistrado reconheça o prazo sem provocação em muitos casos concretos.';
const P2 = 'O credor normalmente procura o devedor por carta, por telefone ou por aplicativo de mensagens, e cada uma dessas tentativas de contato pode ter efeito diferente sobre a contagem do prazo, o que exige uma análise cuidadosa dos documentos disponíveis antes de qualquer decisão sobre o caso.';
const P2_OK = 'O credor normalmente procura o devedor por carta, por telefone ou por aplicativo de mensagens. Cada uma dessas tentativas de contato pode ter efeito diferente sobre a contagem do prazo. Isso exige uma análise cuidadosa dos documentos disponíveis antes de qualquer decisão sobre o caso.';
const CONTENT = `<h2>Prazo para recorrer</h2><p>${P1}</p><h3>Detalhes</h3><p>${P2}</p><h2>Requisitos para a defesa</h2><p>Guarde comprovantes e contratos. A defesa fica mais simples com documentos organizados.</p><p>| Prazo | Valor |<br>|---|---|<br>| 5 anos | 10 |</p>`;
const CANDS = [
  { title: 'Prescrição da dívida: guia completo', url: 'https://exemplo.com/prescricao', keyword: 'prescrição da dívida' },
  { title: 'Como negociar uma dívida antiga', url: 'https://exemplo.com/negociar' },
];
const base = (over: Partial<PilotInput['article']> = {}, rulesCfg: Record<string, unknown> = {}, extra: Partial<PilotInput> = {}): PilotInput => ({
  article: { id: 'art-1', title: 'Prescrição da dívida: prazos e defesa', keyword: 'prescrição da dívida', excerpt: 'Entenda os prazos de cobrança e como se defender com calma e segurança.', content: CONTENT, slug: 'prescricao', language: 'pt-BR', published_url: null, config: {}, ...over },
  project: { name: 'Exemplo', domain: 'exemplo.com', wordpress_url: 'https://exemplo.com', editorial_identity: { author_name: 'Dra. Ana Souza' } },
  rules: resolveRuleProfile({ articleConfig: { optimization_rules: { internal_links: 2, ...rulesCfg } } }),
  candidates: CANDS, sources: [], cta: 'Fale com a nossa equipe pelo formulário do site.', segment: 'general', brand: 'Exemplo', ...extra,
});

interface Spy extends PilotDeps { calls: AiRequest[] }
const scripted = (answer: (req: AiRequest) => string | Error, cost = 4000): Spy => {
  const calls: AiRequest[] = [];
  return { calls, ai: { async call(req) { calls.push(req); const a = answer(req); if (a instanceof Error) throw a; return { content: a, costMicros: cost, usage: { inputTokens: 500, outputTokens: 300 } }; } } };
};
const REWRITES = new Map<string, string>([[`<p>${P1}</p>`, `<p>${P1_OK}</p>`], [`<p>${P2}</p>`, `<p>${P2_OK}</p>`]]);
const good = (req: AiRequest) => (req.stepId === 'conclusion' ? '<p>O artigo explica o prazo para recorrer e os requisitos para a defesa. Documentos organizados ajudam em qualquer caso.</p>' : REWRITES.get(req.user) ?? req.user);

describe('Piloto Automático: ordem, passos pequenos e relatório', () => {
  it('a análise do fixture reprova legibilidade (pré-condição) e há passos de IA planejados', () => {
    const input = base();
    const job = newJob(input, 'h0');
    expect(analyzeWorking(input, job.working).analysis.flesch.passed).toBe(false);
    expect(findParagraphUnits(CONTENT, LANGUAGES.pt).length).toBeGreaterThanOrEqual(2);
    expect(planAiSteps(input, { ...job, deterministicDone: true }).map((s) => s.id)).toContain('readability');
  });

  it('1º vêm as correções SEM IA; só depois a IA, uma chamada pequena por passo (nenhuma com 16.000 tokens)', async () => {
    const input = base({}, { palavras: 'desligado' });
    const spy = scripted(good);
    const job = await runAll(input, spy, await sha256Hex(CONTENT));
    expect(job.steps[0]).toMatchObject({ id: 'deterministico', kind: 'deterministico', costMicros: 0 });
    expect(spy.calls.length).toBeGreaterThan(0);
    for (const c of spy.calls) { expect(c.maxTokens).toBeLessThanOrEqual(1800); expect(c.maxTokens).toBeLessThan(16000); }
    const ids = job.applied.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['no_markdown_tables', 'h2_question_pct', 'internal_links', 'conclusion_cta', 'flesch']));
    expect(job.working.content).toContain('<table>');
    expect(job.working.content).toContain('Qual é o prazo para recorrer?');
    expect(job.working.content).toContain('<a href="https://exemplo.com/prescricao">');
    expect(job.working.content).toMatch(/<h2>Conclusão<\/h2>[\s\S]*Fale com a nossa equipe pelo formulário do site\./);
    expect(job.costMicros).toBe(spy.calls.length * 4000);
    expect(job.done).toBe(true);
  });

  it('progresso por passo: o 1º runNext é o bloco sem IA; cada runNext seguinte faz no máximo UMA chamada de IA', async () => {
    const input = base();
    const spy = scripted(good);
    let job = newJob(input, 'h0');
    job = await runNext(input, job, spy);
    expect(job.deterministicDone).toBe(true);
    expect(spy.calls.length).toBe(0);
    const seen: number[] = [];
    for (let i = 0; i < 10 && !job.done; i++) { const before = spy.calls.length; job = await runNext(input, job, spy); seen.push(spy.calls.length - before); }
    expect(seen.every((n) => n <= 1)).toBe(true);
    expect(job.done).toBe(true);
  });

  it('o teto de tokens por passo e o máximo de passos vêm do perfil de regras (e têm trava dura)', async () => {
    const input = base({}, { tokens_por_passo: 600, max_passos_ia: 1 });
    const spy = scripted(good);
    const job = await runAll(input, spy, 'h0');
    expect(spy.calls.length).toBe(1);
    expect(spy.calls[0].maxTokens).toBeLessThanOrEqual(600);
    expect(job.stopped).toMatchObject({ reason: 'limite' });
    expect(job.pending.some((p) => p.kind === 'limite')).toBe(true);
    const duro = resolveRuleProfile({ articleConfig: { optimization_rules: { tokens_por_passo: 99999 } } });
    expect(duro.options.step_max_tokens).toBe(4000);
  });

  it('relatório: o que foi aplicado, o que ficou pendente, custo, antes/depois, hash e plano de schema', async () => {
    const input = base({}, { palavras: 'desligado' });
    const spy = scripted(good);
    const job = await runAll(input, spy, await sha256Hex(CONTENT));
    const rep = await buildReport(input, job, { now: () => Date.UTC(2026, 10, 20, 12) });
    expect(rep.generated_at).toBe('2026-11-20T12:00:00.000Z');
    expect(rep.after.score).toBeGreaterThan(rep.before.score);
    expect(rep.cost_usd_micros).toBe(spy.calls.length * 4000);
    expect(rep.cost_is_estimate).toBe(true);
    expect(rep.unchanged).toBe(false);
    expect(rep.base_hash).not.toBe(rep.final_hash);
    expect(rep.language).toMatchObject({ tag: 'pt-BR', source: 'configurado', formula: 'flesch_pt' });
    expect(rep.schema?.types).toEqual(expect.arrayContaining(['Article', 'BreadcrumbList']));
    expect(rep.applied.length).toBeGreaterThan(3);
    expect(rep.rules_layers).toContain('artigo');
    expect(rep.partial).toBe(false);
  });
});

describe('Piloto Automático: NUNCA inventa fato, número, nome, fonte ou autor', () => {
  it('trecho com número novo, nome novo, link novo ou fonte nova é REJEITADO: o original fica e vira pendência humana', async () => {
    const maus = [
      P1_OK.replace('em muitos casos', 'em 80% dos casos'),
      P1_OK.replace('O devedor pode', 'Segundo o Dr. Marcos Silva, o devedor pode'),
      P1_OK.replace('A lei não permite', 'A Súmula Vinculante garante que a lei não permite'),
      `${P1_OK} Veja <a href="https://inventado.com/x">mais aqui</a>.`,
    ];
    for (const ruim of maus) {
      const input = base({ content: `<h2>Seção</h2><p>${P1}</p>` }, { conclusion_cta: 'desligado', links_internos: 'desligado' });
      const spy = scripted((req) => (req.stepId.startsWith('readability') ? `<p>${ruim}</p>` : req.user));
      const job = await runAll(input, spy, 'h0');
      expect(job.working.content).toContain(P1);
      expect(job.working.content).not.toContain('80%');
      expect(job.steps.some((s) => s.status === 'rejeitado')).toBe(true);
      expect(job.pending.some((p) => p.kind === 'rejeitado' && p.id === 'flesch')).toBe(true);
      expect(job.applied.some((a) => a.kind === 'ia')).toBe(false);
    }
  });

  it('guardRewrite aceita só a mesma informação dita de forma mais simples', () => {
    expect(guardRewrite(`<p>${P1}</p>`, `<p>${P1_OK}</p>`, LANGUAGES.pt).ok).toBe(true);
    expect(guardRewrite(`<p>${P1}</p>`, '<p>Curto.</p>', LANGUAGES.pt)).toMatchObject({ ok: false });
    expect(guardRewrite('<p>Pague 10 reais em 3 dias.</p>', '<p>Pague 10 reais em 4 dias.</p>', LANGUAGES.pt).violations.join(' ')).toMatch(/números/);
    expect(guardRewrite('<p>Texto simples aqui.</p>', '<p>[INSERIR FONTE] Texto simples aqui.</p>', null).ok).toBe(false);
  });

  it('conclusão: sem número, link, e-mail, telefone, nome novo nem promessa; o convite do projeto entra à parte', () => {
    const texto = 'prazo recorrer defesa documentos';
    expect(guardConclusion('<p>O artigo explica o prazo e a defesa.</p>', texto, '', LANGUAGES.pt).ok).toBe(true);
    for (const ruim of ['<p>Ligue para (11) 99999-8888 agora.</p>', '<p>Veja https://x.com/a e saiba.</p>', '<p>Fale em contato@x.com hoje.</p>', '<p>Resultado garantido em 30 dias.</p>', '<p>Segundo Roberto Carlos, vale a pena.</p>', '<h2>Título</h2><p>texto</p>']) {
      expect(guardConclusion(ruim, texto, '', LANGUAGES.pt).ok).toBe(false);
    }
  });

  it('sem fonte informada: não gera bloco de fontes, não inventa dado, citação, especialista nem autor: tudo vira pendência humana', async () => {
    const input = base({}, { faq: 'exigir', stats_with_source: 'exigir', expert_quotes: 'exigir', palavras: 3000, autor: 'recomendar' }, { project: { name: 'Exemplo', domain: 'exemplo.com', wordpress_url: 'https://exemplo.com', editorial_identity: { author_name: 'Redação' } } });
    const spy = scripted(good);
    const job = await runAll(input, spy, 'h0');
    expect(spy.calls.every((c) => c.stepId !== 'expand' && !/faq|source|quote|expert/i.test(c.stepId))).toBe(true);
    const rep = await buildReport(input, job);
    const pend = new Map(rep.pending.map((p) => [p.id, p]));
    for (const id of ['faq', 'stats_with_source', 'expert_quotes', 'words', 'author_byline']) expect(pend.get(id)?.kind, id).toBe('humano');
    expect(pend.get('words')?.reason).toMatch(/não inventa/);
    expect(job.working.content).not.toMatch(/Fontes:/);
    expect(job.working.content).not.toMatch(/Dr\.|Dra\./);
  });

  it('com fontes JÁ informadas pelo projeto: lista só essas, uma vez (idempotente)', async () => {
    const sources = [{ url: 'https://www.gov.example/lei', title: 'Texto oficial da lei' }];
    const input = base({}, { palavras: 'desligado', conclusion_cta: 'desligado', flesch: 'desligado' }, { sources });
    const job = await runAll(input, scripted(good), 'h0');
    expect(job.working.content).toContain('<li><a href="https://www.gov.example/lei">Texto oficial da lei</a></li>');
    const again = await runAll({ ...input, article: { ...input.article, content: job.working.content } }, scripted(good), 'h1');
    expect((again.working.content.match(/gov\.example/g) || []).length).toBe(1);
  });
});

describe('Piloto Automático: idempotência', () => {
  it('rodar duas vezes sobre o resultado não duplica nada e não chama IA de novo', async () => {
    const input = base({}, { palavras: 'desligado', faq: 'desligado' });
    const first = await runAll(input, scripted(good), 'h0');
    expect(first.working.content).not.toBe(CONTENT);
    const spy2 = scripted(good);
    const second = await runAll({ ...input, skipUnits: first.touchedUnits, article: { ...input.article, content: first.working.content, title: first.working.title, excerpt: first.working.excerpt } }, spy2, 'h1');
    expect(second.working.content).toBe(first.working.content);
    expect(spy2.calls.length).toBe(0);
    expect(second.applied.filter((a) => a.kind === 'deterministico' && a.id !== 'schema_article').length).toBe(0);
    expect((second.working.content.match(/<table>/g) || []).length).toBe(1);
    expect((second.working.content.match(/Leia também/g) || []).length).toBeLessThanOrEqual(1);
    expect((second.working.content.match(/<h2>Conclusão<\/h2>/g) || []).length).toBe(1);
  });

  it('regras desligadas não executam a correção correspondente', async () => {
    const input = base({}, { paragraph_words: 'desligado', h2_question_pct: 'desligado', internal_links: 'desligado', no_markdown_tables: 'desligado', flesch: 'desligado', conclusion_cta: 'desligado', conversational_tone: 'desligado' });
    const spy = scripted(good);
    const job = await runAll(input, spy, 'h0');
    expect(job.working.content).toBe(CONTENT);
    expect(spy.calls.length).toBe(0);
  });
});

describe('Piloto Automático: teto diário de gasto (usa o gate real, teto baixo)', () => {
  const MODEL = 'claude-sonnet-4-5-20250929';
  const portaComGate = (db: ReturnType<typeof fakeSpendDb>, answer = good): Spy => {
    const calls: AiRequest[] = [];
    return {
      calls,
      ai: {
        async call(req) {
          calls.push(req);
          const cover = await coverTextCall({ provider: 'anthropic', models: [MODEL], inputChars: (req.system + req.user).length, maxOutputTokens: req.maxTokens, articleId: 'art-1', operation: 'auto_otimizacao' });
          const usage = { inputTokens: 600, outputTokens: 350 };
          const content = answer(req);
          await cover.commit(usage, MODEL, false);
          return { content, usage, costMicros: textCostMicros(textPriceFor(DEFAULT_PRICE_BOOK, MODEL), usage.inputTokens, usage.outputTokens) };
        },
      },
    };
  };
  const scope = (db: ReturnType<typeof fakeSpendDb>) => newSpendScope({ module: 'auto-optimize', admin: db.admin as never, now: db.clock.now, orgId: ORG_A });

  it('teto já atingido: o piloto PARA, nenhuma IA roda, o texto da IA não entra e o relatório diz o que faltou (artigo intacto no que é pago)', async () => {
    resetPriceCache();
    const db = fakeSpendDb({ policies: { [ORG_A]: { cap: usdm(0.5), extra: 0 } }, ledger: [{ organization_id: ORG_A, amount: usdm(0.5), occurred_at: Date.UTC(2026, 10, 20, 14, 0, 0), metadata: {} }] });
    const input = base({}, { palavras: 'desligado' });
    const spy = portaComGate(db);
    const job = await runWithSpendScope(scope(db), () => runAll(input, spy, 'h0'));
    expect(job.stopped?.reason).toBe('teto');
    expect(job.stopped?.message).toMatch(/Teto diário de gasto/);
    expect(job.applied.some((a) => a.kind === 'ia')).toBe(false);
    expect(job.costMicros).toBe(0);
    expect(job.pending.filter((p) => p.kind === 'teto').length).toBeGreaterThan(0);
    const rep = await buildReport(input, job);
    expect(rep.partial).toBe(true);
    expect(rep.stopped?.reason).toBe('teto');
    expect(db.ledger.length).toBe(1); // nada novo foi gasto
  });

  it('o teto bate NO MEIO: o 1º passo cabe, o seguinte é negado; para com aviso, guarda o que já fez e lista o restante', async () => {
    resetPriceCache();
    const db = fakeSpendDb({ policies: { [ORG_A]: { cap: usdm(0.03), extra: 0 } } });
    const input = base({}, { palavras: 'desligado' });
    const spy = portaComGate(db);
    const job = await runWithSpendScope(scope(db), () => runAll(input, spy, 'h0'));
    expect(spy.calls.length).toBeGreaterThanOrEqual(2);
    expect(job.stopped?.reason).toBe('teto');
    expect(job.steps.filter((s) => s.status === 'aplicado' && s.kind === 'ia').length).toBeGreaterThanOrEqual(1);
    expect(job.steps.at(-1)?.status).toBe('teto');
    expect(job.pending.some((p) => p.kind === 'teto')).toBe(true);
    expect(db.totals(ORG_A).spent + db.totals(ORG_A).reserved).toBeLessThanOrEqual(usdm(0.03));
  });

  it('erro que NÃO é de teto não vira "teto": o passo é registrado como erro e duas falhas seguidas param o piloto', async () => {
    const input = base({}, { palavras: 'desligado' });
    const spy = scripted(() => new Error('provider_unavailable'));
    const job = await runAll(input, spy, 'h0');
    expect(job.stopped?.reason).toBe('erro');
    expect(job.steps.filter((s) => s.status === 'erro').length).toBe(2);
    expect(job.applied.some((a) => a.kind === 'ia')).toBe(false);
    expect(SpendDeniedError).toBeTruthy();
  });
});

describe('Piloto Automático: conformidade por segmento e idiomas', () => {
  it('pacote do segmento em AVISO (padrão): o trecho da IA entra, o aviso é registrado e vira pendência de revisão; em RÍGIDO é rejeitado', async () => {
    const promete = (req: AiRequest) => (req.stepId.startsWith('readability') ? `<p>${P1_OK} O tratamento é cura garantida.</p>`.replace('O tratamento é cura garantida.', '') : req.user);
    const comPromessa = (req: AiRequest) => { const r = promete(req); return r.replace('em muitos casos concretos.', 'em muitos casos concretos, com resultado garantido.'); };
    const mkInput = (modo: string) => base({ content: `<h2>Seção</h2><p>${P1}</p>`, config: { segment: 'legal' } }, { conclusion_cta: 'desligado', links_internos: 'desligado', compliance_mode: modo });
    const aviso = await runAll(mkInput('aviso'), scripted(comPromessa), 'h0');
    expect(aviso.compliance.length).toBeGreaterThan(0);
    const repAviso = await buildReport(mkInput('aviso'), aviso);
    expect(repAviso.pending.some((p) => p.kind === 'conformidade')).toBe(true);
    expect(repAviso.compliance.pack).toBe('juridico_oab');
    const rigido = await runAll(mkInput('rigido'), scripted(comPromessa), 'h0');
    expect(rigido.working.content).toContain(P1);
    expect(rigido.steps.some((s) => s.status === 'rejeitado')).toBe(true);
    const desligado = await runAll(mkInput('desligado'), scripted(comPromessa), 'h0');
    expect(desligado.compliance).toEqual([]);
  });

  it('inglês (comércio eletrônico): conclusão com título "Conclusion" e convite em inglês, bloco "Read also", sem regra jurídica', async () => {
    const EN = '<h2>How do I choose running shoes?</h2><p>Running shoes are designed to absorb impact and keep your feet stable. You should pick a pair that fits your stride and your budget.</p><h2>Delivery options</h2><p>We ship worldwide and you will receive tracking by email.</p>';
    const input = base({ title: 'Running shoes: how to choose', keyword: 'running shoes', excerpt: '', content: EN, language: 'en', config: { segment: 'ecommerce' } }, { internal_links: 1, palavras: 'desligado', flesch: 'desligado' }, {
      cta: null, candidates: [{ title: 'Trail running shoes guide', url: 'https://shop.example/trail' }],
    });
    const spy = scripted((req) => (req.stepId === 'conclusion' ? '<p>The article explains how to choose running shoes and how delivery works.</p>' : req.user));
    const job = await runAll(input, spy, 'h0');
    expect(spy.calls[0].system).toMatch(/Language: English/);
    expect(job.working.content).toContain('<h2>Conclusion</h2>');
    expect(job.working.content).toContain('Get in touch with our team.');
    expect(job.working.content).toContain('<strong>Read also:</strong>');
    expect(job.compliance).toEqual([]);
    expect(job.schema?.language.tag).toBe('en');
  });

  it('espanhol (saúde): conclusão com título "Conclusión"; tom direto exige "usted"/"tu"; a IA recebe o idioma certo', async () => {
    const ES = '<h2>¿Qué es la hipertensión?</h2><p>La hipertensión es una enfermedad frecuente que ocurre cuando la presión de la sangre es demasiado alta y exige control médico regular.</p>';
    const input = base({ title: 'Hipertensión', keyword: 'hipertensión', excerpt: '', content: ES, language: 'es', config: { segment: 'health' } }, { internal_links: 'desligado', palavras: 'desligado', flesch: 'desligado' }, { cta: null, candidates: [] });
    const spy = scripted((req) => (req.stepId === 'conclusion' ? '<p>El artículo explica qué es la hipertensión y por qué conviene controlarla.</p>' : req.user));
    const job = await runAll(input, spy, 'h0');
    expect(job.working.content).toContain('<h2>Conclusión</h2>');
    expect(job.working.content).toContain('Contacta con nuestro equipo.');
    expect(spy.calls.every((c) => /Spanish/.test(c.system))).toBe(true);
  });

  it('idioma sem pacote (finlandês): nada de fórmula, nada de passo de legibilidade, sem nota zero; só o que não depende de idioma', async () => {
    const FI = '<h2>Otsikko</h2><p>Tämä on suomenkielinen teksti, jota järjestelmä ei tunne. Lauseet ovat lyhyitä ja selkeitä. Silti kaava puuttuu tästä kielestä kokonaan.</p>';
    const input = base({ title: 'Teksti', keyword: 'teksti', excerpt: '', content: FI, language: 'fi' }, { internal_links: 'desligado', palavras: 'desligado' }, { cta: null, candidates: [] });
    const spy = scripted(good);
    const job = await runAll(input, spy, 'h0');
    expect(spy.calls.some((c) => c.stepId.startsWith('readability'))).toBe(false);
    const rep = await buildReport(input, job);
    expect(rep.language.formula).toBeNull();
    expect(rep.after.failing).not.toContain('flesch');
  });
});
