import { describe, expect, it } from 'vitest';
import { assembleBody, deterministicEdit, deterministicMeta, dial, factsUsed, guardSection, newState, planSections, runPipeline, STAGES, type StudioAiPort, type StudioAiRequest } from '../../supabase/functions/_shared/studio-pipeline';
import { buildSuperiorityBrief, EMPTY_RADAR } from '../../supabase/functions/_shared/studio-brief';
import { buildFactBank } from '../../supabase/functions/_shared/studio-facts';
import { resolveStudioRules } from '../../supabase/functions/_shared/studio-rules';
import { detectAiPatterns } from '../../supabase/functions/_shared/studio-ai-detector';
import { FACTS, ORIGIN, profile } from './helpers/estudio-fixtures';

const NOW = Date.UTC(2026, 10, 20);
const brief = () => buildSuperiorityBrief({ query: 'advogado criminalista em Guarulhos', language: 'pt-BR', profile: profile(), fieldFacts: FACTS, sources: [], radar: { ...EMPTY_RADAR, source: 'radar', depth: 'completa', pages: [{ url: 'https://a.example/', host: 'a.example', title: 'A', position: 1, headings: ['Fiança: quando cabe', 'Prazo da custódia', 'Documentos', 'Direitos do preso', 'Visitas', 'Habeas corpus', 'Relaxamento'], words: 900 }, { url: 'https://b.example/', host: 'b.example', title: 'B', position: 2, headings: ['Fiança: quando cabe', 'Prazo da custódia', 'Documentos', 'Direitos do preso', 'Visitas', 'Habeas corpus', 'Relaxamento'], words: 800 }] }, citations: null, topN: 10, nowMs: NOW, territory: { place: 'Guarulhos', country: 'br' } });
const input = (over: Record<string, unknown> = {}) => ({ brief: brief(), profile: profile(), fieldFacts: FACTS, sources: [], rules: resolveStudioRules({ type: 'local', projectIdentity: { optimization_rules: { palavras: 600 } } }), origin: ORIGIN, slugPath: 'advogado-criminalista/guarulhos', url: `${ORIGIN}/advogado-criminalista/guarulhos/`, breadcrumbs: [], links: [], ai: null, now: () => NOW, nowYear: 2026, language: 'pt-BR', ...over });

describe('pipeline em etapas: plano, guardas e montagem', () => {
  it('etapas: pesquisa, briefing, rascunho, edição humana simulada e verificação', () => {
    expect(STAGES).toEqual(['pesquisa', 'briefing', 'rascunho', 'edicao', 'verificacao']);
    expect(newState(1)).toMatchObject({ stage: 'pesquisa', sections: [], aiUsed: 0, stopped: null, done: false });
  });
  it('número de seções vem do tamanho do perfil de regras (não é fixo); lacunas dos concorrentes viram seções', () => {
    const few = planSections(brief(), resolveStudioRules({ type: 'local', projectIdentity: { optimization_rules: { palavras: 300 } } }));
    const many = planSections(brief(), resolveStudioRules({ type: 'local', projectIdentity: { optimization_rules: { palavras: 1500 } } }));
    expect(few.length).toBeLessThan(many.length);
    expect(few[0]).toMatchObject({ id: 'resposta', kind: 'resposta' });
    expect(many.some((s) => s.heading === 'Fiança: quando cabe' && s.from === 'lacuna')).toBe(true);
    expect(new Set(many.map((s) => s.heading)).size).toBe(many.length); // sem seções repetidas
  });
  it('guarda da seção: título, link, markdown, resíduo de conversa, tamanho e dados sem origem reprovam; texto limpo passa', () => {
    const bank = buildFactBank({ profile: profile(), fieldFacts: FACTS, ownOrigin: ORIGIN });
    const g = (html: string, target: number | null = null) => guardSection(html, bank, { targetWords: target, nowYear: 2026, allowedUrls: [], ownOrigin: ORIGIN });
    expect(g('<p>A audiência de custódia sai em até 24 horas.</p>').ok).toBe(true);
    for (const bad of ['<h2>Título</h2><p>x</p>', '<p><a href="https://a.example/">x</a></p>', '<p>**negrito** aqui</p>', '<p>Claro! Aqui está o texto.</p>', '', '<p>Atendemos 4.500 casos.</p>']) expect(g(bad).ok, bad).toBe(false);
    expect(g('<p>curto</p>', 200).reasons.join()).toMatch(/tamanho fora do esperado/);
    expect(g('<p>Segundo Carlos Pimentel e Marcos Antunes, o caso é simples e claro para todos.</p>').reasons.join()).toMatch(/nomes próprios/);
  });
  it('contato vem do Perfil, nunca inventado; código de país só com território declarado; sem canal vira pendência', async () => {
    expect(dial('(11) 4002-8922', 'br')).toBe('+551140028922');
    expect(dial('(11) 4002-8922', '')).toBe('1140028922');
    expect(dial('+44 20 7946 0958', 'br')).toBe('+442079460958');
    const run = await runPipeline(input() as never);
    expect(run.body).toContain('tel:+551140028922');
    expect(run.body).toContain('data-zica-cta="phone"');
    expect(run.body).toContain('https://wa.me/5511999990001');
    const none = await runPipeline(input({ profile: profile({ phones: [], whatsapp: null, email: null }) }) as never);
    expect(none.body).toMatch(/\[PENDENTE: cadastrar telefone, WhatsApp ou e-mail no Perfil do Projeto\]/);
    expect(none.body).not.toMatch(/tel:|wa\.me/);
  });
  it('sem IA: seções viram [PENDENTE], com motivo geral; título e meta sem IA saem da consulta e do texto real; fatos usados são detectados', async () => {
    const r = await runPipeline(input() as never);
    expect(r.pendings.some((p) => p.kind === 'humano')).toBe(true);
    expect(r.body).toMatch(/\[PENDENTE: resposta direta do topo \(IA indisponível\)\]/);
    expect(r.meta.h1).toBe('Advogado criminalista em Guarulhos');
    expect(r.state.stage).toBe('verificacao');
    expect(r.state.done).toBe(true);
    expect(factsUsed('<p>A audiência de custódia deve ocorrer em até 24 horas após a prisão, conforme a Resolução 213/2015 do CNJ.</p>', FACTS)).toEqual(['f2']);
    expect(deterministicMeta({ ...newState(1), sections: [{ id: 'resposta', kind: 'resposta', heading: null, purpose: '', from: '', html: `<p>${'Palavra '.repeat(40)}</p>`, status: 'ok' }] }, input() as never).description.length).toBeLessThanOrEqual(170);
  });
  it('limpeza determinística: só o primeiro travessão fica; HTML sem travessão não muda', () => {
    expect(deterministicEdit('<p>a — b — c — d</p>')).toBe('<p>a — b, c, d</p>');
    expect(deterministicEdit('<p>sem</p>')).toBe('<p>sem</p>');
  });
  it('a IA recebe só TEMAS e estrutura: nunca o título nem o texto dos concorrentes; as proibições do guia de estilo vão no prompt', async () => {
    const reqs: StudioAiRequest[] = [];
    const ai: StudioAiPort = { async call(req) { reqs.push(req); return { content: '<p>A 1ª Delegacia de Polícia de Guarulhos recebe os presos em flagrante da região central.</p>', costMicros: 1 }; } };
    await runPipeline(input({ ai }) as never);
    const joined = reqs.map((r) => `${r.system}\n${r.user}`).join('\n');
    expect(joined).toMatch(/TOPICS COMPETITORS COVER \(structure only, never wording\)/);
    expect(joined).not.toMatch(/a\.example|b\.example/);
    expect(joined).toMatch(/no mundo atual|contexto genérico/i);
    expect(joined).toMatch(/PENDENTE/);
    expect(reqs.every((r) => r.maxTokens <= 4000)).toBe(true);
  });
  it('texto montado sem IA e o detector: pendências não contam como "cara de IA"', async () => {
    const r = await runPipeline(input() as never);
    expect(detectAiPatterns(assembleBody(r.state, input() as never), 'pt').score).toBeLessThan(35);
  });
});
