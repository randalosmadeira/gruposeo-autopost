import { describe, expect, it } from 'vitest';
import {
  areaLabel, areaTotals, channelLabel, defaultDirection, formatDuration, formatKeyEvents, isHeuristicClassification, normalizeContentPerformance,
  normalizeGa4Summary, sortAreas, validateGa4PropertyId,
} from '@/lib/nexus-analytics';
import {
  canTriageRequests, emptyOverviewItem, FREE_HEALTH_PROVIDERS, ga4SyncSummaryText, getCatalogEntry, mergeCatalogWithOverview, normalizeOverviewItem,
  providerErrorMessage, providerIsConnected, resolveViewer, sanitizeItemForClient, simpleStatusLabel, simpleStatusOf, summarizeItemsSimple, validateSecretFormat,
} from '@/lib/nexus-providers';
import {
  normalizeRequests, openRequestsCount, providerRequestMessage, requestKindLabel, requestStatusLabel, sortRequests, validateManagerNote, validateRequestMessage,
} from '@/lib/nexus-requests';
import { fixLabel, isApplicableFix } from '@/lib/nexus-audit';
import type { AreaRow } from '@/types/nexus-analytics';
import type { ProvidersOverview, RawProviderOverviewItem } from '@/types/nexus-providers';

describe('papel de quem consulta (gestor × cliente)', () => {
  it('usa `viewer`; sem ele usa `viewer_is_admin`; sem nenhum dos dois é cliente (opção restritiva)', () => {
    expect(resolveViewer({ viewer: { role: 'manager', can_manage_technical: true } })).toEqual({ role: 'manager', can_manage_technical: true });
    expect(resolveViewer({ viewer: { role: 'org_admin', can_manage_technical: true } })).toEqual({ role: 'org_admin', can_manage_technical: true });
    expect(resolveViewer({ viewer: { role: 'client', can_manage_technical: false } })).toEqual({ role: 'client', can_manage_technical: false });
    expect(resolveViewer({ viewer_is_admin: true })).toEqual({ role: 'org_admin', can_manage_technical: true });
    expect(resolveViewer({ viewer_is_admin: false })).toEqual({ role: 'client', can_manage_technical: false });
    expect(resolveViewer({})).toEqual({ role: 'client', can_manage_technical: false });
    expect(resolveViewer(undefined)).toEqual({ role: 'client', can_manage_technical: false });
  });

  it('can_manage_technical=false vence qualquer role (nunca eleva privilégio)', () => {
    expect(resolveViewer({ viewer: { role: 'manager', can_manage_technical: false } })).toEqual({ role: 'client', can_manage_technical: false });
    // `viewer` presente ganha de `viewer_is_admin`
    expect(resolveViewer({ viewer: { role: 'client', can_manage_technical: false }, viewer_is_admin: true }).can_manage_technical).toBe(false);
  });

  it('só o gestor da plataforma responde solicitações', () => {
    expect(canTriageRequests({ role: 'manager', can_manage_technical: true })).toBe(true);
    expect(canTriageRequests({ role: 'org_admin', can_manage_technical: true })).toBe(false);
    expect(canTriageRequests({ role: 'client', can_manage_technical: false })).toBe(false);
  });
});

describe('visão cliente: status simples e sanitização', () => {
  it('converte connected/attention/not_connected para o tipo único da tela', () => {
    const raw = (id: RawProviderOverviewItem['id'], status: RawProviderOverviewItem['status']): RawProviderOverviewItem => ({ id, category: 'search_truth', status, score: null, enabled: false });
    expect(normalizeOverviewItem(raw('gsc', 'connected')).status).toBe('healthy');
    expect(normalizeOverviewItem(raw('gsc', 'attention')).status).toBe('degraded');
    expect(normalizeOverviewItem(raw('gsc', 'not_connected')).status).toBe('not_configured');
    expect(normalizeOverviewItem(raw('gsc', 'error')).status).toBe('error'); // status técnico passa como veio
  });

  it('item de cliente sem credencial/saúde/uso é completado sem quebrar', () => {
    const it = normalizeOverviewItem({ id: 'ga4', category: 'search_truth', status: 'connected', score: null, enabled: false, updated_at: '2026-11-12T10:00:00Z' });
    expect(it.credential).toEqual({ stored: false, last_four: null, status: null, updated_at: null });
    expect(it.health.last).toBeNull();
    expect(it.usage.valid_30d).toBe(0);
    expect(it.updated_at).toBe('2026-11-12T10:00:00Z');
    // conectado por status, mesmo sem credencial visível
    expect(providerIsConnected(it)).toBe(true);
  });

  it('mergeCatalogWithOverview aceita a resposta simplificada', () => {
    const ov: ProvidersOverview = { generated_at: '', organization_id: 'o', providers: [{ id: 'gsc', category: 'search_truth', status: 'connected', score: null, enabled: false }] };
    const items = mergeCatalogWithOverview(ov);
    expect(items.find((i) => i.id === 'gsc')?.status).toBe('healthy');
    expect(items.find((i) => i.id === 'ga4')?.status).toBe('not_configured');
  });

  it('sanitizeItemForClient descarta últimos 4 dígitos, detalhe técnico, quota e habilitação paga', () => {
    const dirty = {
      ...emptyOverviewItem('openai'), status: 'healthy' as const, enabled: true,
      credential: { stored: true, last_four: '9876', status: 'active', updated_at: '2026-11-12T10:00:00Z' },
      health: { last: { checked_at: '2026-11-12T11:00:00Z', ok: true, latency_ms: 10, http_status: 200, detail: 'detalhe tecnico', quota: { label: 'x', remaining: 1, limit: 2 }, cost_micros: 5 }, checks_7d: 3, ok_7d: 3, avg_latency_ms_7d: 10 },
    };
    const clean = sanitizeItemForClient(dirty);
    expect(clean.credential.last_four).toBeNull();
    expect(clean.credential.status).toBeNull();
    expect(clean.enabled).toBe(false);
    expect(clean.health.last).toEqual({ checked_at: '2026-11-12T11:00:00Z', ok: true });
    expect(JSON.stringify(clean)).not.toContain('9876');
    expect(JSON.stringify(clean)).not.toContain('detalhe tecnico');
  });

  it('rótulos e resumo simples', () => {
    expect(simpleStatusOf('healthy')).toBe('connected');
    expect(simpleStatusOf('stored_unverified')).toBe('attention');
    expect(simpleStatusOf('error')).toBe('attention');
    expect(simpleStatusOf('not_configured')).toBe('not_connected');
    expect(simpleStatusLabel('connected')).toBe('Conectado');
    expect(simpleStatusLabel('attention')).toBe('Precisa de atenção');
    expect(simpleStatusLabel('not_connected')).toBe('Não conectado');
    const items = mergeCatalogWithOverview({ generated_at: '', organization_id: 'o', providers: [
      { id: 'gsc', category: 'search_truth', status: 'connected', score: null, enabled: false },
      { id: 'ga4', category: 'search_truth', status: 'attention', score: null, enabled: false },
    ] });
    // o Copilot (manual) não entra na conta
    expect(summarizeItemsSimple(items)).toEqual({ total: 11, connected: 1, attention: 1, notConnected: 9 });
  });
});

describe('catálogo GA4', () => {
  it('ga4 é gratuito, usa JSON de conta de serviço e entra na ativação guiada', () => {
    const ga4 = getCatalogEntry('ga4');
    expect(ga4?.credentialKind).toBe('service_account_json');
    expect(ga4?.testCost).toBeNull();
    expect(FREE_HEALTH_PROVIDERS).toEqual(['gsc', 'bing_webmaster', 'ga4']);
    expect(ga4?.doc.endpoints.map((e) => e.url)).toContain('https://analyticsdata.googleapis.com/v1beta/properties/{propriedade}:runReport');
  });

  it('valida o JSON de conta de serviço do GA4 como o do GSC', () => {
    const ok = JSON.stringify({ type: 'service_account', client_email: 'x@y.iam', private_key: '-----BEGIN PRIVATE KEY-----\nabc' });
    expect(validateSecretFormat('ga4', ok)).toBeNull();
    expect(validateSecretFormat('ga4', '{}')).toMatch(/JSON completo/);
    expect(validateSecretFormat('ga4', 'texto')).toMatch(/JSON completo/);
  });

  it('valida o ID da propriedade (5 a 15 dígitos; vazio remove)', () => {
    expect(validateGa4PropertyId('')).toBeNull();
    expect(validateGa4PropertyId(' 123456789 ')).toBeNull();
    expect(validateGa4PropertyId('1234')).toMatch(/só números/);
    expect(validateGa4PropertyId('1234567890123456')).toMatch(/só números/);
    expect(validateGa4PropertyId('abc12345')).toMatch(/só números/);
    expect(validateGa4PropertyId('properties/12345')).toMatch(/só números/);
  });

  it('traduz os erros novos do servidor', () => {
    expect(providerErrorMessage(new Error('manager_required'))).toMatch(/conta de gerenciamento/);
    expect(providerErrorMessage(new Error('ga4_forbidden'))).toMatch(/Leitor/);
    expect(providerErrorMessage(new Error('ga4_property_required'))).toMatch(/ID da propriedade/);
    expect(providerErrorMessage(new Error('ga4_property_already_used'))).toMatch(/cada site|Cada site/);
    expect(providerErrorMessage(new Error('too_many_open_requests'))).toMatch(/20/);
    expect(providerErrorMessage(new Error('ga4_quota'))).toMatch(/cota/);
  });

  it('resume o ga4_sync com sucesso, truncado e erro', () => {
    expect(ga4SyncSummaryText({ rows_upserted: 1200, results: [{ source: 'ga4', ok: true, rows_upserted: 1200 }] })).toBe('Google Analytics: 1.200 linha(s) gravada(s)');
    expect(ga4SyncSummaryText({ truncated: true, results: [{ source: 'ga4', ok: true, rows_upserted: 5 }] })).toContain('(resultado truncado)');
    expect(ga4SyncSummaryText({ results: [{ source: 'ga4', ok: false, error: 'ga4_forbidden' }] })).toMatch(/Leitor/);
    expect(ga4SyncSummaryText(undefined)).toBe('Nada foi sincronizado.');
  });

  it('a auditoria aceita analytics_sync como correção', () => {
    expect(isApplicableFix({ type: 'analytics_sync' })).toBe(true);
    expect(fixLabel('analytics_sync')).toMatch(/Google Analytics/);
  });
});

describe('normalizadores do Analytics', () => {
  it('campo ausente vira 0/null/lista vazia e nada quebra', () => {
    const s = normalizeGa4Summary(undefined);
    expect(s.totals.sessions).toBe(0);
    expect(s.totals.engagement_rate).toBeNull();
    expect(s.daily).toEqual([]);
    expect(s.ai_referrals.by_source).toEqual([]);
    expect(s.last_synced_at).toBeNull();
    expect(normalizeGa4Summary('lixo').totals.users).toBe(0);
  });

  it('lê o formato do contrato e calcula a taxa de engajamento quando não vem', () => {
    const s = normalizeGa4Summary({
      period: { from: '2026-10-15', to: '2026-11-12' },
      totals: { sessions: 200, engaged_sessions: 150, page_views: 400, users: 120, key_events: '7.5', avg_engagement_seconds: 75 },
      daily: [{ day: '2026-11-11', sessions: 10, engaged_sessions: 8, page_views: 20, users: 9, key_events: 1 }, { sessions: 1 }],
      top_pages: [{ page: '/a', sessions: 5 }],
      by_channel: [{ channel: 'Organic Search', sessions: 100 }],
      ai_referrals: { totals: { sessions: 12 }, by_source: [{ source: 'chatgpt.com', sessions: 12, engaged_sessions: 9, key_events: 2 }] },
      last_synced_at: '2026-11-12T10:00:00Z',
    });
    expect(s.totals.engagement_rate).toBeCloseTo(0.75);
    expect(s.totals.key_events).toBe(7.5);
    expect(s.daily).toHaveLength(1); // linha sem dia é descartada
    expect(s.ai_referrals.by_source[0].source).toBe('chatgpt.com');
    expect(s.period).toEqual({ from: '2026-10-15', to: '2026-11-12' });
  });

  it('desempenho por área: limita a 10 páginas por área e aceita unmatched como número ou lista', () => {
    const pages = Array.from({ length: 14 }, (_, i) => ({ url: `/p${i}`, title: `P${i}`, gsc: { clicks: i }, ga4: { sessions: i } }));
    const p = normalizeContentPerformance({
      areas: [{ area: 'criminal', articles: 3, gsc: { clicks: 5, impressions: 50, ctr: 0.1, position: 8.2 }, ga4: { sessions: 20, engaged_sessions: 10, key_events: 2, ai_sessions: 1 }, top_pages: pages }],
      unmatched: { gsc_pages: 4, ga4_pages: ['/x', { page: '/y' }] },
      notes: 'classificação heurística',
      analysis_version: 1000,
    });
    expect(p.areas[0].top_pages).toHaveLength(10);
    expect(p.unmatched.gsc_pages).toEqual({ count: 4, items: [] });
    expect(p.unmatched.ga4_pages).toEqual({ count: 2, items: ['/x', '/y'] });
    expect(p.notes).toEqual(['classificação heurística']);
    expect(isHeuristicClassification(p)).toBe(true);
  });

  it('aviso de classificação: aparece sem versão (restritivo) e some só quando a versão não é a heurística', () => {
    expect(isHeuristicClassification({ analysis_version: null })).toBe(true);
    expect(isHeuristicClassification({ analysis_version: 1000 })).toBe(true);
    expect(isHeuristicClassification({ analysis_version: 2000 })).toBe(false);
  });

  it('formatadores', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(200)).toBe('3 min 20 s');
    expect(formatDuration(3660)).toBe('1 h 1 min');
    expect(formatDuration(null)).toBe('—');
    expect(formatKeyEvents(7.5)).toBe('7,5');
    expect(formatKeyEvents(undefined)).toBe('—');
    expect(channelLabel('Organic Search')).toBe('Busca orgânica');
    expect(channelLabel('')).toBe('Não informado');
    expect(areaLabel('nao-classificado')).toBe('Não classificado');
    expect(areaLabel('cnh-transito')).toBe('CNH e trânsito');
    expect(areaLabel('Marketing Digital')).toBe('Marketing Digital');
  });
});

describe('ordenação por área', () => {
  const mk = (area: string, over: Partial<AreaRow> & { clicks?: number; position?: number | null; sessions?: number }): AreaRow => ({
    area, articles: over.articles ?? 1,
    gsc: { clicks: over.clicks ?? 0, impressions: 0, ctr: null, position: over.position === undefined ? null : over.position },
    ga4: { sessions: over.sessions ?? 0, engaged_sessions: 0, key_events: 0, ai_sessions: 0 }, top_pages: [],
  });
  const areas = [mk('b', { clicks: 5, position: 9, sessions: 1 }), mk('a', { clicks: 50, position: 3, sessions: 10 }), mk('c', { clicks: 20, position: null, sessions: 5 })];

  it('ordena números e texto sem alterar a lista original', () => {
    expect(sortAreas(areas, 'clicks', 'desc').map((a) => a.area)).toEqual(['a', 'c', 'b']);
    expect(sortAreas(areas, 'clicks', 'asc').map((a) => a.area)).toEqual(['b', 'c', 'a']);
    expect(sortAreas(areas, 'area', 'asc').map((a) => a.area)).toEqual(['a', 'b', 'c']);
    expect(areas.map((a) => a.area)).toEqual(['b', 'a', 'c']);
  });

  it('posição sem dado vai sempre para o fim, nos dois sentidos', () => {
    expect(sortAreas(areas, 'position', 'asc').map((a) => a.area)).toEqual(['a', 'b', 'c']);
    expect(sortAreas(areas, 'position', 'desc').map((a) => a.area)).toEqual(['b', 'a', 'c']);
    expect(defaultDirection('position')).toBe('asc');
    expect(defaultDirection('sessions')).toBe('desc');
  });

  it('totais somam as áreas', () => {
    expect(areaTotals(areas)).toMatchObject({ articles: 3, clicks: 75, sessions: 16 });
  });
});

describe('solicitações', () => {
  it('valida mensagem (3 a 1000) e resposta do gestor (até 1000)', () => {
    expect(validateRequestMessage('  ab ')).toMatch(/ao menos 3/);
    expect(validateRequestMessage('abc')).toBeNull();
    expect(validateRequestMessage('x'.repeat(1001))).toMatch(/1000/);
    expect(validateManagerNote('x'.repeat(1000))).toBeNull();
    expect(validateManagerNote('x'.repeat(1001))).toMatch(/1000/);
  });

  it('rótulos em português e mensagem sugerida do botão Solicitar', () => {
    expect(requestKindLabel('plugin_update')).toBe('Atualizar o plugin');
    expect(requestKindLabel('desconhecido')).toBe('Outro assunto');
    expect(requestStatusLabel('in_progress')).toBe('Em andamento');
    expect(providerRequestMessage('Serper', 'not_connected')).toBe('Quero conectar: Serper.');
    expect(providerRequestMessage('Serper', 'attention')).toBe('Preciso de ajuda com a conexão: Serper.');
  });

  it('normaliza linhas, descarta inválidas e ordena abertas primeiro', () => {
    const rows = normalizeRequests([
      { id: '1', organization_id: 'o', kind: 'report', message: 'm', status: 'done', created_at: '2026-11-12T10:00:00Z' },
      { id: '2', organization_id: 'o', kind: 'access', message: 'm', status: 'open', created_at: '2026-11-11T10:00:00Z' },
      { id: '3', organization_id: 'o', kind: 'xx', message: 'm', status: 'open', created_at: '2026-11-12T09:00:00Z' },
      { id: '4', status: 'invalido' }, null, 'lixo',
    ]);
    expect(rows.map((r) => r.id)).toEqual(['1', '2', '3']);
    expect(rows[2].kind).toBe('other');
    expect(sortRequests(rows).map((r) => r.id)).toEqual(['3', '2', '1']);
    expect(openRequestsCount(rows)).toBe(2);
    expect(normalizeRequests(undefined)).toEqual([]);
  });
});
