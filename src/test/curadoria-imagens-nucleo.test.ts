import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ESTIMATE_MICROS, MAX_ATTEMPTS_PER_ARTICLE, MIN_TEXT_CHARS, buildImageRequest, canAffordOne, estimateMicros, orderTargets, plainText, recordedCost, remainingMicros, stopReasonFor,
  type TargetArticle,
} from '../../supabase/functions/_shared/curadoria-imagens-core.ts';

const text = 'palavra '.repeat(MIN_TEXT_CHARS);
const art = (over: Partial<TargetArticle> = {}): TargetArticle => ({ id: 'a1', user_id: 'u1', project_id: 'p1', status: 'draft', title: 'Título', keyword: 'kw', content: `<p>${text}</p>`, created_at: '2026-11-01T00:00:00Z', ...over });

describe('curadoria-imagens: teto e estimativa', () => {
  it('restante nunca fica negativo', () => { expect(remainingMicros(4_000_000, 1_000_000)).toBe(3_000_000); expect(remainingMicros(4_000_000, 9_000_000)).toBe(0); });
  it('sem medição usa a estimativa padrão; com medição usa 130% do maior custo', () => {
    expect(estimateMicros([])).toBe(DEFAULT_ESTIMATE_MICROS);
    expect(estimateMicros([40_000, 60_000, 0, NaN])).toBe(78_000);
  });
  it('só começa imagem que a estimativa cobre', () => {
    expect(canAffordOne(120_000, 120_000)).toBe(true);
    expect(canAffordOne(119_999, 120_000)).toBe(false);
    expect(canAffordOne(1_000_000, 0)).toBe(false);
  });
  it('medição zerada com sucesso grava a estimativa (teto nunca otimista); falha sem custo grava zero', () => {
    expect(recordedCost(55_000, 120_000, true)).toEqual({ cost: 55_000, source: 'medido' });
    expect(recordedCost(0, 120_000, true)).toEqual({ cost: 120_000, source: 'estimado' });
    expect(recordedCost(0, 120_000, false)).toEqual({ cost: 0, source: 'medido' });
    expect(recordedCost(-5, 120_000, true).source).toBe('estimado');
  });
});

describe('curadoria-imagens: escolha e ordem dos artigos', () => {
  it('Em criação > Na fila > Finalizado, projeto na ordem pedida, mais antigo primeiro', () => {
    const list = [
      art({ id: 'r1', status: 'ready' }), art({ id: 'd2', status: 'draft', project_id: 'p2' }), art({ id: 'd1', status: 'draft', project_id: 'p1', created_at: '2026-11-05T00:00:00Z' }),
      art({ id: 'd0', status: 'draft', project_id: 'p1', created_at: '2026-10-01T00:00:00Z' }), art({ id: 'g1', status: 'generating' }),
    ];
    expect(orderTargets(list, [], ['p1', 'p2']).map((a) => a.id)).toEqual(['g1', 'd0', 'd1', 'd2', 'r1']);
  });
  it('descarta publicado, sem texto de verdade, sem título, já feito e com tentativas esgotadas', () => {
    const list = [art({ id: 'pub', status: 'published' }), art({ id: 'curto', content: '<p>oi</p>' }), art({ id: 'semtitulo', title: ' ' }), art({ id: 'feito' }), art({ id: 'falhou' }), art({ id: 'novo' }), art({ id: 'estranho', status: 'error' })];
    const jobs = [{ article_id: 'feito', status: 'ok' }, ...Array.from({ length: MAX_ATTEMPTS_PER_ARTICLE }, () => ({ article_id: 'falhou', status: 'erro' }))];
    expect(orderTargets(list, jobs, ['p1']).map((a) => a.id)).toEqual(['novo']);
  });
  it('uma falha só ainda deixa tentar de novo', () => {
    expect(orderTargets([art({ id: 'x' })], [{ article_id: 'x', status: 'erro' }], ['p1']).map((a) => a.id)).toEqual(['x']);
  });
});

describe('curadoria-imagens: pedido ao generate-image e parada', () => {
  it('pedido com projectId (a trava de gasto precisa), imagem original forçada, módulo próprio, IA liberada, usuário do artigo', () => {
    const r = buildImageRequest(art({ content: '<p>Texto <b>forte</b>&nbsp;aqui</p>' }), 'medium');
    expect(r).toMatchObject({ articleId: 'a1', projectId: 'p1', userId: 'u1', moduleKey: 'conteudo_original', allowAiGeneration: true, forceOriginalImage: true, quality: 'medium', aspectRatio: '16:9' });
    expect(r.context).toBe('Texto forte aqui');
  });
  it('plainText limpa marcação e corta', () => { expect(plainText('<p>a   b</p>', 3)).toBe('a b'); expect(plainText(null)).toBe(''); });
  it('respostas que param a rodada', () => {
    expect(stopReasonFor(423, { code: 'daily_cap_reached' })).toBe('teto_diario');
    expect(stopReasonFor(500, { error: 'global_paid_services_blocked' })).toBe('teto_diario');
    expect(stopReasonFor(401, { code: 'session_invalid' })).toBe('sem_autorizacao');
    expect(stopReasonFor(503, { code: 'image_provider_missing' })).toBe('servico_indisponivel');
    expect(stopReasonFor(500, { code: 'image_processing_failed' })).toBeNull();
  });
});
