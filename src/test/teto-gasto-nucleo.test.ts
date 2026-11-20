import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ABSOLUTE_HARD_MAX_MICROS, DEFAULT_CAP_MICROS, DEFAULT_EXTRA_MICROS, DEFAULT_PRICE_BOOK, METERING_MAP, absoluteLimit, classifyRequest, computeState, dayKey,
  decideReserve, denyMessage, estimateRequest, estimateTextMicros, extractBodyHints, extractUsage, formatBrl, formatUsd, moduleFromUrl, priceBookFromRows,
  textCostMicros, textPriceFor,
} from '../../supabase/functions/_shared/spend-gate-core';

const usd = (v: number) => Math.round(v * 1_000_000);
const base = { cap: usd(7), extra: usd(2.2), extraUnlocked: false, started: false };

describe('teto diário: regra de decisão (espelho da função SQL)', () => {
  it('as decisões do dono: 7,00 + 2,20 = 9,20, e a trava fixa nunca passa de 9,20', () => {
    expect(DEFAULT_CAP_MICROS).toBe(7_000_000);
    expect(DEFAULT_EXTRA_MICROS).toBe(2_200_000);
    expect(ABSOLUTE_HARD_MAX_MICROS).toBe(9_200_000);
    expect(absoluteLimit(usd(7), usd(2.2))).toBe(9_200_000);
    // política adulterada (teto 100, adicional 100): o limite absoluto continua 9,20
    expect(absoluteLimit(usd(100), usd(100))).toBe(9_200_000);
  });

  it('teto exato: 6,99 + 0,01 cabe; 6,99 + 0,02 não cabe para operação nova', () => {
    expect(decideReserve({ ...base, spent: usd(6.99), reserved: 0, estimate: usd(0.01) }).allow).toBe(true);
    const no = decideReserve({ ...base, spent: usd(6.99), reserved: 0, estimate: usd(0.02) });
    expect(no).toMatchObject({ allow: false, code: 'daily_cap_reached', reason: 'cap' });
  });

  it('contas contam gasto + reservas ativas, não só o gasto confirmado', () => {
    expect(decideReserve({ ...base, spent: usd(4), reserved: usd(2.5), estimate: usd(0.6) }).allow).toBe(false);
    expect(decideReserve({ ...base, spent: usd(4), reserved: usd(2.5), estimate: usd(0.5) }).allow).toBe(true);
  });

  it('operação nova é bloqueada em 7,00; operação já iniciada termina usando o adicional, até 9,20', () => {
    const at7 = { ...base, spent: usd(7), reserved: 0 };
    expect(decideReserve({ ...at7, estimate: usd(0.01) })).toMatchObject({ allow: false, code: 'daily_cap_reached', reason: 'cap' });
    expect(decideReserve({ ...at7, estimate: usd(2.2), started: true }).allow).toBe(true);
    expect(decideReserve({ ...at7, estimate: usd(2.21), started: true })).toMatchObject({ allow: false, reason: 'absolute_cap' });
  });

  it('adicional liberado pelo dono: operação nova passa a caber até 9,20, e nunca além', () => {
    const unlocked = { ...base, extraUnlocked: true };
    expect(decideReserve({ ...unlocked, spent: usd(7), reserved: 0, estimate: usd(2) }).allow).toBe(true);
    expect(decideReserve({ ...unlocked, spent: usd(9), reserved: 0, estimate: usd(0.2) }).allow).toBe(true);
    expect(decideReserve({ ...unlocked, spent: usd(9), reserved: 0, estimate: usd(0.21) })).toMatchObject({ allow: false, reason: 'absolute_cap' });
    expect(decideReserve({ ...unlocked, spent: usd(9.2), reserved: 0, estimate: 1 }).allow).toBe(false);
  });

  it('nunca acima de 9,20 em hipótese alguma: nem iniciada, nem liberada, nem com política adulterada', () => {
    for (const started of [false, true]) {
      for (const extraUnlocked of [false, true]) {
        const d = decideReserve({ cap: usd(100), extra: usd(100), spent: usd(9.2), reserved: 0, estimate: 1, started, extraUnlocked });
        expect(d.allow).toBe(false);
      }
    }
  });

  it('organização pausada nega tudo (código spend_paused)', () => {
    expect(decideReserve({ ...base, spent: 0, reserved: 0, estimate: 1, enabled: false })).toMatchObject({ allow: false, code: 'spend_paused' });
  });
});

describe('teto diário: estados', () => {
  const st = (spent: number, extraUnlocked = false) => computeState({ spent: usd(spent), reserved: 0, cap: usd(7), extra: usd(2.2), extraUnlocked });
  it('livre, aviso aos 80%, teto atingido, adicional liberado, esgotado', () => {
    expect(st(0)).toBe('livre');
    expect(st(5.59)).toBe('livre');
    expect(st(5.6)).toBe('aviso');
    expect(st(6.99)).toBe('aviso');
    expect(st(7)).toBe('teto_atingido');
    expect(st(7, true)).toBe('adicional_liberado');
    expect(st(9.2, true)).toBe('esgotado');
    expect(st(9.2)).toBe('esgotado');
  });
  it('o aviso respeita o percentual configurado', () => {
    expect(computeState({ spent: usd(3.5), reserved: 0, cap: usd(7), extra: usd(2.2), extraUnlocked: false, alertPct: 50 })).toBe('aviso');
    expect(computeState({ spent: usd(3.49), reserved: 0, cap: usd(7), extra: usd(2.2), extraUnlocked: false, alertPct: 50 })).toBe('livre');
  });
});

describe('teto diário: dia em America/Sao_Paulo (zera à meia-noite de Brasília)', () => {
  it('23:59:59 de Brasília ainda é o dia anterior; meia-noite de Brasília é o dia novo', () => {
    expect(dayKey(Date.UTC(2026, 10, 20, 2, 59, 59))).toBe('2026-11-19');
    expect(dayKey(Date.UTC(2026, 10, 20, 3, 0, 0))).toBe('2026-11-20');
    expect(dayKey(Date.UTC(2026, 10, 20, 12, 0, 0))).toBe('2026-11-20');
    // UTC já virou o dia, Brasília não
    expect(dayKey(Date.UTC(2026, 10, 21, 1, 30, 0))).toBe('2026-11-20');
  });
});

describe('teto diário: mensagens em português', () => {
  it('formatação em dólar (e em reais só com o câmbio informado)', () => {
    expect(formatUsd(7_000_000)).toBe('US$ 7,00');
    expect(formatUsd(1_570_000)).toBe('US$ 1,57');
    expect(formatUsd(3_400)).toBe('US$ 0,0034');
    expect(formatBrl(2_000_000, 5.5)).toBe('R$ 11,00');
  });
  it('423 do teto diz o gasto e o teto', () => {
    const m = denyMessage({ code: 'daily_cap_reached', reason: 'cap', spent: usd(7), reserved: 0, cap: usd(7), extra: usd(2.2), extraUnlocked: false });
    expect(m).toMatch(/US\$ 7,00 gastos hoje de US\$ 7,00/);
    expect(m).toMatch(/meia-noite de Brasília/);
    expect(m).toMatch(/crédito adicional de até US\$ 2,20/);
    expect(denyMessage({ code: 'daily_cap_reached', reason: 'absolute_cap', spent: usd(9.2), reserved: 0, cap: usd(7), extra: usd(2.2) })).toMatch(/limite absoluto é US\$ 9,20/);
    expect(denyMessage({ code: 'spend_status_unavailable' })).toMatch(/nenhuma chamada paga foi feita/);
  });
});

describe('teto diário: preços e estimativa', () => {
  it('todo preço padrão é "não verificado"', () => {
    expect(Object.values(DEFAULT_PRICE_BOOK.text).every((p) => p.verified === false)).toBe(true);
    expect(Object.values(DEFAULT_PRICE_BOOK.units).every((p) => p.verified === false)).toBe(true);
    expect(DEFAULT_PRICE_BOOK.textFallback.verified).toBe(false);
  });
  it('estimativa de texto é um teto máximo: entrada ~ caracteres/3 + saída no máximo pedido', () => {
    const m = estimateTextMicros(DEFAULT_PRICE_BOOK, ['claude-sonnet-4-5-20250929'], 3000, 16384);
    // 1000 tokens x 3 + 16384 x 15 = 248.760
    expect(m).toBe(248_760);
    expect(textCostMicros(textPriceFor(DEFAULT_PRICE_BOOK, 'gpt-4.1'), 1000, 500)).toBe(6_000); // 1000x2 + 500x8
  });
  it('modelo com sufixo de data usa o prefixo conhecido; modelo desconhecido cai no preço conservador (e é marcado)', () => {
    expect(textPriceFor(DEFAULT_PRICE_BOOK, 'gpt-4.1-mini-2025-04-14')).toMatchObject({ inMicrosPerM: 400_000, fallback: false });
    const unknown = textPriceFor(DEFAULT_PRICE_BOOK, 'modelo-novo-x');
    expect(unknown.fallback).toBe(true);
    expect(unknown.outMicrosPerM).toBeGreaterThanOrEqual(15_000_000);
  });
  it('gpt-4.1 reserva pelo mais caro entre ele e o plano B (gpt-4o)', () => {
    const cls = classifyRequest('https://api.openai.com/v1/responses', 'POST', JSON.stringify({ model: 'gpt-4.1', max_output_tokens: 1000 }));
    const est = estimateRequest(cls, JSON.stringify({ model: 'gpt-4.1', max_output_tokens: 1000 }), DEFAULT_PRICE_BOOK);
    expect(est.micros).toBeGreaterThanOrEqual(estimateTextMicros(DEFAULT_PRICE_BOOK, ['gpt-4.1'], 60, 1000));
    expect(est.verified).toBe(false);
  });
  it('imagem e busca usam o preço por unidade (não verificado) e a quantidade pedida', () => {
    const img = classifyRequest('https://api.openai.com/v1/images/generations', 'POST', JSON.stringify({ n: 3 }));
    expect(estimateRequest(img, JSON.stringify({ n: 3 }), DEFAULT_PRICE_BOOK)).toMatchObject({ micros: 750_000, verified: false });
    const search = classifyRequest('https://google.serper.dev/search', 'POST', '{}');
    expect(estimateRequest(search, '{}', DEFAULT_PRICE_BOOK).micros).toBe(2_000);
  });
  it('tabela do banco por cima dos padrões; linha inválida é ignorada', () => {
    const book = priceBookFromRows([
      { provider: 'openai', route: 'gpt-4.1', unit: 'million_input_tokens', usd_micros_per_unit: 1_000_000, verified: true },
      { provider: 'openai', route: 'gpt-4.1', unit: 'million_output_tokens', usd_micros_per_unit: 4_000_000, verified: true },
      { provider: 'serper', route: 'search', unit: 'search', usd_micros_per_unit: 500, verified: true },
      { provider: 'x', route: 'y', unit: 'search', usd_micros_per_unit: -5 },
      { nada: true },
    ]);
    expect(book.text['gpt-4.1']).toMatchObject({ inMicrosPerM: 1_000_000, outMicrosPerM: 4_000_000, verified: true });
    expect(book.units['serper:search']).toMatchObject({ micros: 500, verified: true });
    expect(book.units['x:search']).toBeUndefined();
    expect(book.text['gpt-4o']).toBeTruthy();
    expect(priceBookFromRows('lixo').text['gpt-4.1']).toBeTruthy();
  });
  it('lê o uso real das respostas dos provedores', () => {
    expect(extractUsage('openai', { usage: { input_tokens: 10, output_tokens: 5 } })).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(extractUsage('openai', { usage: { prompt_tokens: 7, completion_tokens: 3 } })).toEqual({ inputTokens: 7, outputTokens: 3 });
    expect(extractUsage('anthropic', { usage: { input_tokens: 1, output_tokens: 2 } })).toEqual({ inputTokens: 1, outputTokens: 2 });
    expect(extractUsage('gemini', { usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 6 } })).toEqual({ inputTokens: 4, outputTokens: 6 });
    expect(extractUsage('openai', { sem: 'uso' })).toBeNull();
    expect(extractUsage('openai', null)).toBeNull();
  });
});

describe('teto diário: classificação das chamadas pagas', () => {
  it('provedores pagos são reconhecidos com rota e modelo', () => {
    expect(classifyRequest('https://api.openai.com/v1/responses', 'POST', '{"model":"gpt-4.1"}')).toMatchObject({ billable: true, provider: 'openai', route: 'text', model: 'gpt-4.1' });
    expect(classifyRequest('https://api.openai.com/v1/images/edits', 'POST')).toMatchObject({ billable: true, route: 'image' });
    expect(classifyRequest('https://api.anthropic.com/v1/messages', 'POST', '{"model":"claude-haiku-4-5-20251001"}')).toMatchObject({ provider: 'anthropic', route: 'text' });
    expect(classifyRequest('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=x', 'POST')).toMatchObject({ provider: 'gemini', route: 'text', model: 'gemini-2.5-flash' });
    expect(classifyRequest('https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict', 'POST')).toMatchObject({ provider: 'gemini', route: 'image' });
    expect(classifyRequest('https://google.serper.dev/places', 'POST')).toMatchObject({ provider: 'serper', route: 'search' });
    expect(classifyRequest('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', 'POST')).toMatchObject({ provider: 'dataforseo', route: 'task' });
    expect(classifyRequest('https://api.search.brave.com/res/v1/web/search?q=x', 'GET')).toMatchObject({ provider: 'brave', route: 'search' });
    expect(classifyRequest('https://api.perplexity.ai/search', 'POST')).toMatchObject({ provider: 'perplexity', route: 'search' });
  });
  it('listar modelos, contas e chamadas do Google gratuito não são gasto', () => {
    expect(classifyRequest('https://api.openai.com/v1/models', 'GET').billable).toBe(false);
    expect(classifyRequest('https://api.anthropic.com/v1/models?limit=1', 'GET').billable).toBe(false);
    expect(classifyRequest('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', 'GET').billable).toBe(false);
    expect(classifyRequest('https://serpapi.com/account.json?api_key=x', 'GET').billable).toBe(false);
    expect(classifyRequest('https://api.dataforseo.com/v3/appendix/user_data', 'GET').billable).toBe(false);
    expect(classifyRequest('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=x', 'GET').billable).toBe(false);
    expect(classifyRequest('https://chromeuxreport.googleapis.com/v1/records:queryRecord', 'POST').billable).toBe(false);
    expect(classifyRequest('https://meusite.com.br/blog', 'GET').billable).toBe(false);
    expect(classifyRequest('https://x.supabase.co/rest/v1/projects', 'POST').billable).toBe(false);
  });
  it('host pago conhecido pela trava antiga, sem preço cadastrado: marcado como desconhecido (o gate nega)', () => {
    for (const url of ['https://api.replicate.com/v1/predictions', 'https://openrouter.ai/api/v1/chat/completions', 'https://api.tavily.com/search', 'https://api.openai.com/v1/audio/speech']) {
      expect(classifyRequest(url, 'POST')).toMatchObject({ billable: true, unknown: true });
    }
  });
  it('pistas de identidade só aceitam UUID', () => {
    const id = '00000000-0000-4000-8000-0000000000b1';
    expect(extractBodyHints(JSON.stringify({ projectId: id, articleId: 'x', user_id: id }))).toEqual({ projectId: id, articleId: undefined, userId: id });
    expect(extractBodyHints('não é json')).toEqual({});
    expect(moduleFromUrl('https://x.supabase.co/functions/v1/generate-image?x=1')).toBe('generate-image');
  });
  it('o mapa de medição documenta o que é medido pelo ledger e o que é estimado', () => {
    expect(METERING_MAP.some((m) => m.metered === 'estimativa' && /Imagem/.test(m.route))).toBe(true);
    expect(METERING_MAP.some((m) => m.metered === 'ledger' && /AIOrchestrator/.test(m.route))).toBe(true);
  });
});

describe('teto diário: migração (verificação estrutural; o SQL não foi executado)', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261120400000_teto_diario_gasto.sql'), 'utf8');
  const down = readFileSync(resolve(process.cwd(), 'supabase/rollbacks/20261120400000_teto_diario_gasto_rollback.sql'), 'utf8');
  it('cria as três tabelas com os padrões decididos pelo dono', () => {
    expect(sql).toMatch(/create table if not exists public\.organization_spend_policy/);
    expect(sql).toMatch(/daily_cap_usd_micros bigint not null default 7000000/);
    expect(sql).toMatch(/extra_allowance_usd_micros bigint not null default 2200000/);
    expect(sql).toMatch(/timezone text not null default 'America\/Sao_Paulo'/);
    expect(sql).toMatch(/alert_pct integer not null default 80/);
    expect(sql).toMatch(/fx_brl_per_usd numeric check \(fx_brl_per_usd is null or fx_brl_per_usd > 0\)/);
    expect(sql).toMatch(/enabled boolean not null default true/);
    expect(sql).toMatch(/create table if not exists public\.provider_price_table/);
    expect(sql).toMatch(/verified boolean not null default false/);
    expect(sql).toMatch(/create table if not exists public\.spend_reservations/);
  });
  it('reserva atômica: lock por organização, trava fixa de 9,20, expiração de 15 minutos e idempotência', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\(p_org::text \|\| ':spend', 0\)\)/);
    expect(sql).toMatch(/least\(v_cap \+ v_extra, 9200000\)/);
    expect(sql).toMatch(/interval '15 minutes'/);
    expect(sql).toMatch(/constraint spend_reservations_idem_unique unique \(organization_id, idempotency_key\)/);
    expect(sql).toMatch(/v_used \+ p_estimate_usd_micros > v_limit/);
    expect(sql).toMatch(/'absolute_cap'/);
  });
  it('mesma ordem de decisão do núcleo: nova até o teto; iniciada ou liberada até o absoluto', () => {
    expect(sql).toMatch(/case when v_started or v_unlocked then v_abs else least\(v_cap, v_abs\) end/);
  });
  it('RLS ligada, nenhum grant para anon/authenticated, funções só para service_role', () => {
    for (const t of ['organization_spend_policy', 'provider_price_table', 'spend_reservations']) expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
    expect(sql).toMatch(/revoke all on table public\.organization_spend_policy, public\.provider_price_table, public\.spend_reservations from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant [^;]*to[^;]*\b(anon|authenticated)\b/i);
    expect(sql).toMatch(/\) to service_role;|\)\s+to service_role;/);
    expect(sql).not.toMatch(/drop |alter table public\.(articles|projects|organizations|organization_usage_ledger)/i);
  });
  it('o rollback remove tudo o que a migração cria (e só isso)', () => {
    const created = [...sql.matchAll(/create (?:or replace )?function ((?:private|public)\.spend_\w+)\(/g)].map((m) => m[1]);
    expect(new Set(created).size).toBeGreaterThanOrEqual(20);
    for (const f of new Set(created)) expect(down).toContain(`drop function if exists ${f}(`);
    for (const t of ['organization_spend_policy', 'provider_price_table', 'spend_reservations']) expect(down).toContain(`drop table if exists public.${t}`);
  });
});
