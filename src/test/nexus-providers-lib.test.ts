import { describe, expect, it } from 'vitest';
import {
  BRAVE_NOTICE, CONFIRM_WORD, COST_TEST_PROVIDERS, PROVIDER_CATALOG, PROVIDER_IDS, REFERENCE_NOTICE, allCatalogUrls, budgetUsedPercent,
  canAdministerOrganization, categoryLabel, confirmCostText, connectedProviderIds, credentialStatusLabel, deviceLabel, emptyOverviewItem,
  executionEnableBlocker, filterByCategory, formatLatency, formatPosition, formatRelative, formatUsdMicros, getCatalogEntry, healthStripText,
  isSafeInternalRoute, latestCheckAt, mergeCatalogWithOverview, needsGuidedActivation, normalizeSyncResponse, overallLabel, overallTone,
  parseBudgetUsd, providerErrorMessage, providerHealthMessage, quotaText, safeDetail, statusLabel, statusTone, successRate7d,
  summarizeHealthResults, syncSummaryText, validateSecretFormat,
} from '@/lib/nexus-providers';
import type { ProviderOverviewItem, ProvidersOverview } from '@/types/nexus-providers';

// Todas as URLs das colunas "Contratar" e "Documentação" da tabela do contrato (docs/NEXUS_PROVIDERS_CONTRACT.md).
const CONTRACT_URLS = [
  'https://search.google.com/search-console',
  'https://developers.google.com/webmaster-tools/v1/searchanalytics/query',
  'https://console.cloud.google.com/apis/library/searchconsole.googleapis.com',
  'https://www.bing.com/webmasters',
  'https://learn.microsoft.com/en-us/bingwebmaster/getting-access',
  'https://serper.dev',
  'https://app.dataforseo.com/register',
  'https://docs.dataforseo.com/v3/appendix/user_data/',
  'https://serpapi.com/users/sign_up',
  'https://serpapi.com/account-api',
  'https://api-dashboard.search.brave.com',
  'https://api-dashboard.search.brave.com/documentation',
  'https://api-dashboard.search.brave.com/documentation/guides/rate-limiting',
  'https://platform.openai.com/api-keys',
  'https://platform.openai.com/docs/api-reference/models/list',
  'https://aistudio.google.com/apikey',
  'https://ai.google.dev/gemini-api/docs/google-search',
  'https://platform.claude.com/settings/keys',
  'https://platform.claude.com/docs/en/api/models/list',
  'https://www.perplexity.ai/account/api/keys',
  'https://docs.perplexity.ai/',
];

// Endpoints de teste de saúde do contrato (sem a parte de credencial).
const CONTRACT_TEST_ENDPOINTS = [
  'https://oauth2.googleapis.com/token',
  'https://www.googleapis.com/webmasters/v3/sites',
  'https://ssl.bing.com/webmaster/api.svc/json/GetUserSites',
  'https://google.serper.dev/search',
  'https://api.dataforseo.com/v3/appendix/user_data',
  'https://serpapi.com/account.json',
  'https://api.search.brave.com/res/v1/web/search',
  'https://api.openai.com/v1/models',
  'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
  'https://api.anthropic.com/v1/models?limit=1',
  'https://api.perplexity.ai/search',
];

function item(id: ProviderOverviewItem['id'], over: Partial<ProviderOverviewItem> = {}): ProviderOverviewItem {
  return { ...emptyOverviewItem(id), ...over };
}

describe('catálogo', () => {
  it('tem os 12 provedores (11 do contrato + ga4 depois do Bing), ids únicos e na ordem', () => {
    expect(PROVIDER_IDS).toEqual(['gsc', 'bing_webmaster', 'ga4', 'serper', 'dataforseo', 'serpapi', 'brave', 'openai', 'gemini', 'anthropic', 'perplexity', 'copilot']);
    expect(new Set(PROVIDER_IDS).size).toBe(12);
  });

  it('contém exatamente as URLs de contratar/documentação do contrato', () => {
    const urls = allCatalogUrls();
    for (const u of CONTRACT_URLS) expect(urls, u).toContain(u);
  });

  it('documenta os endpoints de teste de saúde do contrato', () => {
    const urls = allCatalogUrls();
    for (const u of CONTRACT_TEST_ENDPOINTS) expect(urls, u).toContain(u);
  });

  it('todas as URLs são https e o catálogo não tem credenciais reais', () => {
    for (const u of allCatalogUrls()) expect(u.startsWith('https://')).toBe(true);
    const text = JSON.stringify(PROVIDER_CATALOG);
    expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
    expect(text).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
    expect(text).not.toMatch(/BEGIN PRIVATE KEY-----\s*[A-Za-z0-9+/]{20,}/);
  });

  it('Brave destaca que o plano gratuito acabou e a cobrança é por crédito', () => {
    const brave = getCatalogEntry('brave');
    expect(brave?.costWarning).toBe(BRAVE_NOTICE);
    expect(BRAVE_NOTICE).toMatch(/plano gratuito/i);
    expect(BRAVE_NOTICE).toMatch(/crédito/);
    expect(brave?.doc.warnings).toContain(BRAVE_NOTICE);
  });

  it('só Serper, Brave e Perplexity têm teste com custo', () => {
    expect([...COST_TEST_PROVIDERS].sort()).toEqual(['brave', 'perplexity', 'serper']);
  });

  it('cada provedor tem passo a passo, formato, erros comuns e uso', () => {
    for (const p of PROVIDER_CATALOG) {
      expect(p.doc.steps.length, p.id).toBeGreaterThan(0);
      expect(p.doc.commonErrors.length, p.id).toBeGreaterThan(0);
      expect(p.doc.zicaUsage.length, p.id).toBeGreaterThan(10);
      expect(p.costLabel.length, p.id).toBeGreaterThan(0);
    }
  });

  it('o aviso de referência está padronizado', () => {
    expect(REFERENCE_NOTICE).toBe('Valores de referência — confirmar no site do provedor.');
  });
});

describe('rótulos e tons', () => {
  it('statusLabel e statusTone cobrem todos os estados', () => {
    expect(statusLabel('healthy')).toBe('Saudável');
    expect(statusLabel('degraded')).toBe('Com atenção');
    expect(statusLabel('error')).toBe('Com erro');
    expect(statusLabel('not_configured')).toBe('Não configurado');
    expect(statusLabel('stored_unverified')).toBe('Guardada, sem teste');
    expect(statusLabel('manual')).toBe('Manual');
    expect(statusLabel('zzz')).toBe('Desconhecido');
    expect(statusTone('healthy')).toBe('success');
    expect(statusTone('degraded')).toBe('warning');
    expect(statusTone('error')).toBe('danger');
    expect(statusTone('stored_unverified')).toBe('info');
    expect(statusTone('not_configured')).toBe('neutral');
    expect(statusTone('manual')).toBe('neutral');
  });

  it('categoryLabel', () => {
    expect(categoryLabel('search_truth')).toBe('Verdade dos buscadores');
    expect(categoryLabel('serp')).toBe('Posições e SERP');
    expect(categoryLabel('ai_citations')).toBe('Citações em IAs');
    expect(categoryLabel('manual')).toBe('Manual');
  });

  it('overall', () => {
    expect(overallTone('ok')).toBe('success');
    expect(overallTone('attention')).toBe('warning');
    expect(overallTone('critical')).toBe('danger');
    expect(overallTone('empty')).toBe('neutral');
    expect(overallLabel('critical')).toBe('Crítico');
  });

  it('credentialStatusLabel', () => {
    expect(credentialStatusLabel('active')).toBe('ativa');
    expect(credentialStatusLabel('invalid')).toBe('recusada pelo provedor');
    expect(credentialStatusLabel(null)).toBe('sem informação');
  });
});

describe('formatação', () => {
  const now = new Date('2026-11-12T12:00:00Z').getTime();
  it('formatRelative', () => {
    expect(formatRelative(null, now)).toBe('nunca');
    expect(formatRelative('lixo', now)).toBe('nunca');
    expect(formatRelative('2026-11-12T12:00:00Z', now)).toBe('agora');
    expect(formatRelative('2026-11-12T11:59:30Z', now)).toBe('há 30 s');
    expect(formatRelative('2026-11-12T11:55:00Z', now)).toBe('há 5 min');
    expect(formatRelative('2026-11-12T09:00:00Z', now)).toBe('há 3 h');
    expect(formatRelative('2026-11-09T12:00:00Z', now)).toBe('há 3 d');
    expect(formatRelative('2026-11-12T12:00:10Z', now)).toBe('agora'); // futuro
    expect(formatRelative('2026-11-12T11:59:00Z', new Date(now))).toBe('há 1 min'); // aceita Date
  });

  it('formatLatency', () => {
    expect(formatLatency(null)).toBe('—');
    expect(formatLatency(undefined)).toBe('—');
    expect(formatLatency(-1)).toBe('—');
    expect(formatLatency(320)).toBe('320 ms');
    expect(formatLatency(999.6)).toBe('1000 ms');
    expect(formatLatency(1200)).toBe('1,2 s');
    expect(formatLatency(6000)).toBe('6,0 s');
  });

  it('formatUsdMicros', () => {
    expect(formatUsdMicros(null)).toBe('—');
    expect(formatUsdMicros(0)).toBe('US$ 0,00');
    expect(formatUsdMicros(5_000_000)).toBe('US$ 5,00');
    expect(formatUsdMicros(1_230_000)).toBe('US$ 1,23');
    expect(formatUsdMicros(1000)).toBe('US$ 0,001');
    expect(formatUsdMicros(5000)).toBe('US$ 0,005');
    expect(formatUsdMicros(200_000_000)).toBe('US$ 200,00');
  });

  it('confirmCostText usa o custo de referência de cada provedor', () => {
    expect(confirmCostText('serper')).toBe('Este teste consome 1 consulta (~US$ 0,001). Continuar?');
    expect(confirmCostText('brave')).toBe('Este teste consome 1 consulta (~US$ 0,005). Continuar?');
    expect(confirmCostText('perplexity')).toBe('Este teste consome 1 consulta (~US$ 0,005). Continuar?');
  });

  it('quotaText', () => {
    expect(quotaText(null)).toBeNull();
    expect(quotaText({})).toBeNull();
    expect(quotaText({ label: 'créditos', remaining: 1200, limit: 2500 })).toBe('créditos: 1.200 de 2.500 restantes');
    expect(quotaText({ remaining: 40 })).toBe('40 restantes');
    expect(quotaText({ limit: 100 })).toBe('limite 100');
    expect(quotaText({ label: 'plano pago' })).toBe('plano pago');
  });

  it('formatPosition e deviceLabel', () => {
    expect(formatPosition(null)).toBe('—');
    expect(formatPosition(7.25)).toBe('7,3');
    expect(deviceLabel('MOBILE')).toBe('Celular');
    expect(deviceLabel('')).toBe('Não informado');
    expect(deviceLabel('SMART_TV')).toBe('SMART_TV');
  });

  it('successRate7d', () => {
    expect(successRate7d(item('openai'))).toBeNull();
    expect(successRate7d(item('openai', { health: { last: null, checks_7d: 8, ok_7d: 6, avg_latency_ms_7d: 100 } }))).toBe(0.75);
  });
});

describe('mensagens', () => {
  it('providerHealthMessage', () => {
    expect(providerHealthMessage(null)).toBe('Ainda sem teste.');
    expect(providerHealthMessage({ ok: true })).toBe('Conexão confirmada.');
    expect(providerHealthMessage({ ok: false, skipped: 'not_configured' })).toBe('Sem credencial guardada.');
    expect(providerHealthMessage({ ok: false, skipped: 'manual' })).toMatch(/manual/);
    expect(providerHealthMessage({ ok: false, skipped: 'cost_confirmation_required' })).toMatch(/custo/);
    expect(providerHealthMessage({ ok: false, http_status: 401 })).toMatch(/recusou a credencial \(HTTP 401\)/);
    expect(providerHealthMessage({ ok: false, http_status: 403 })).toMatch(/HTTP 403/);
    expect(providerHealthMessage({ ok: false, http_status: 429 })).toMatch(/limite de uso/);
    expect(providerHealthMessage({ ok: false, http_status: 503 })).toMatch(/instável.*HTTP 503/);
    expect(providerHealthMessage({ ok: false, http_status: 400, detail: 'sem créditos' })).toBe('sem créditos');
    expect(providerHealthMessage({ ok: false })).toBe('O teste falhou. Tente novamente.');
  });

  it('safeDetail mascara padrões de chave e limita o tamanho', () => {
    expect(safeDetail('erro com sk-abcdefghijklmnop1234 no meio')).toBe('erro com [oculto] no meio');
    expect(safeDetail('x'.repeat(500))).toHaveLength(300);
    expect(safeDetail('-----BEGIN PRIVATE KEY-----\nabc')).toBe('[oculto]');
    expect(safeDetail(null)).toBe('');
  });

  it('providerErrorMessage', () => {
    expect(providerErrorMessage(new Error('secret_format_invalid:A chave começa com "sk-".'))).toBe('A credencial não está no formato esperado. A chave começa com "sk-".');
    expect(providerErrorMessage('secret_format_invalid')).toBe('A credencial não está no formato esperado.');
    expect(providerErrorMessage(new Error('401'))).toMatch(/HTTP 401/);
    expect(providerErrorMessage(new Error('forbidden'))).toMatch(/proprietário ou administrador/);
    expect(providerErrorMessage(new Error('gsc_forbidden'))).toMatch(/conta de serviço/);
    expect(providerErrorMessage(new Error('audit_rate_limited'))).toMatch(/Aguarde/);
    expect(providerErrorMessage(new Error('budget_paused'))).toMatch(/nenhuma chamada paga/);
    expect(providerErrorMessage(new Error('algo_novo'))).toBe('algo_novo');
    expect(providerErrorMessage(null)).toBe('Falha inesperada.');
  });
});

describe('validateSecretFormat (espelha o servidor)', () => {
  const sa = JSON.stringify({ type: 'service_account', client_email: 'x@y.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n' });
  it('openai/anthropic/gemini/perplexity por prefixo', () => {
    expect(validateSecretFormat('openai', 'sk-abc')).toBeNull();
    expect(validateSecretFormat('openai', 'abc')).toMatch(/sk-/);
    expect(validateSecretFormat('anthropic', 'sk-ant-abc')).toBeNull();
    expect(validateSecretFormat('anthropic', 'sk-abc')).toMatch(/sk-ant-/);
    expect(validateSecretFormat('gemini', 'AIzaXYZ')).toBeNull();
    expect(validateSecretFormat('gemini', 'aiza')).toMatch(/AIza/);
    // formato novo do Google AI Studio (sem prefixo AIza), valores fictícios
    expect(validateSecretFormat('gemini', 'AQ.' + 'x'.repeat(44))).toBeNull();
    expect(validateSecretFormat('gemini', 'nome da chave com espaço 1234567890123456')).toMatch(/AIza/);
    expect(validateSecretFormat('perplexity', 'pplx-1')).toBeNull();
    expect(validateSecretFormat('perplexity', 'sk-1')).toMatch(/pplx-/);
  });
  it('serper/serpapi/bing/brave: 16–200 de [A-Za-z0-9_-]', () => {
    for (const id of ['serper', 'serpapi', 'bing_webmaster', 'brave']) {
      expect(validateSecretFormat(id, 'a'.repeat(16)), id).toBeNull();
      expect(validateSecretFormat(id, 'a'.repeat(200)), id).toBeNull();
      expect(validateSecretFormat(id, 'a'.repeat(15)), id).toMatch(/16 a 200/);
      expect(validateSecretFormat(id, 'a'.repeat(201)), id).toMatch(/16 a 200/);
      expect(validateSecretFormat(id, `${'a'.repeat(16)}!`), id).toMatch(/16 a 200/);
    }
  });
  it('dataforseo: exatamente um ":" com os dois lados', () => {
    expect(validateSecretFormat('dataforseo', 'login@x.com:senha')).toBeNull();
    expect(validateSecretFormat('dataforseo', 'semdoispontos')).toMatch(/login:senha/);
    expect(validateSecretFormat('dataforseo', 'a:b:c')).toMatch(/login:senha/);
    expect(validateSecretFormat('dataforseo', ':senha')).toMatch(/login:senha/);
    expect(validateSecretFormat('dataforseo', 'login:')).toMatch(/login:senha/);
  });
  it('gsc: JSON de conta de serviço', () => {
    expect(validateSecretFormat('gsc', sa)).toBeNull();
    expect(validateSecretFormat('gsc', 'nao json')).toMatch(/JSON/);
    expect(validateSecretFormat('gsc', JSON.stringify({ type: 'authorized_user' }))).toMatch(/JSON/);
    expect(validateSecretFormat('gsc', JSON.stringify({ type: 'service_account', client_email: 'a', private_key: 'x' }))).toMatch(/JSON/);
  });
  it('vazio, grande demais e copilot', () => {
    expect(validateSecretFormat('openai', '   ')).toBe('Cole a credencial.');
    expect(validateSecretFormat('openai', `sk-${'a'.repeat(5000)}`)).toMatch(/4096/);
    expect(validateSecretFormat('copilot', 'x')).toMatch(/não usa credencial/);
    expect(validateSecretFormat('inexistente', 'x')).toMatch(/não usa credencial/);
  });
  it('ignora espaços nas pontas (colagem com quebra de linha)', () => {
    expect(validateSecretFormat('openai', '  sk-abc\n')).toBeNull();
  });
});

describe('visão geral', () => {
  const overview = (providers: ProviderOverviewItem[]): ProvidersOverview => ({
    generated_at: '2026-11-12T12:00:00Z', organization_id: 'org-1',
    program: { execution_enabled: false, budget_usd_micros: 5_000_000, reserved_usd_micros: 0, consumed_usd_micros: 1_230_000, providers_enabled: [] },
    summary: { total: 11, connected: 3, healthy: 2, degraded: 1, error: 0, not_configured: 7, manual: 1, overall: 'attention', score: 80 },
    providers,
  });
  const now = new Date('2026-11-12T12:00:30Z').getTime();

  it('mergeCatalogWithOverview devolve os 12 na ordem do catálogo, completando os ausentes', () => {
    const merged = mergeCatalogWithOverview(overview([item('openai', { status: 'healthy' })]));
    expect(merged.map((m) => m.id)).toEqual([...PROVIDER_IDS]);
    expect(merged.find((m) => m.id === 'openai')?.status).toBe('healthy');
    expect(merged.find((m) => m.id === 'serper')?.status).toBe('not_configured');
    expect(merged.find((m) => m.id === 'copilot')?.status).toBe('manual');
    expect(mergeCatalogWithOverview(undefined)).toHaveLength(12);
  });

  it('filterByCategory e connectedProviderIds (sem manuais)', () => {
    const items = mergeCatalogWithOverview(undefined).map((i) => (i.id === 'openai' || i.id === 'copilot' ? { ...i, credential: { ...i.credential, stored: true } } : i));
    expect(filterByCategory(items, 'all')).toHaveLength(12);
    expect(filterByCategory(items, 'search_truth').map((i) => i.id)).toEqual(['gsc', 'bing_webmaster', 'ga4']);
    expect(filterByCategory(items, 'ai_citations')).toHaveLength(4);
    expect(filterByCategory(items, 'manual').map((i) => i.id)).toEqual(['copilot']);
    expect(connectedProviderIds(items)).toEqual(['openai']);
  });

  it('connectedProviderIds só oferece chave aceita (ativa ou não testada): inválida, revogada e pausada ficam de fora, como no servidor', () => {
    const com = (id: string, status: string | null) => (i: ReturnType<typeof mergeCatalogWithOverview>[number]) => (i.id === id ? { ...i, credential: { ...i.credential, stored: true, status } } : i);
    let items = mergeCatalogWithOverview(undefined);
    for (const [id, status] of [['openai', 'active'], ['anthropic', 'stored_unverified'], ['dataforseo', 'invalid'], ['serper', 'paused'], ['brave', 'revoked'], ['gemini', null]] as const) items = items.map(com(id, status));
    expect(connectedProviderIds(items).sort()).toEqual(['anthropic', 'gemini', 'openai']);
    expect(connectedProviderIds(items)).not.toContain('dataforseo');
  });

  it('o erro provider_not_connected vira mensagem em português (não o código cru)', () => {
    expect(providerErrorMessage(new Error('provider_not_connected'))).toMatch(/não está conectado ou está com a chave recusada/);
  });

  it('latestCheckAt e healthStripText', () => {
    const a = item('openai', { health: { last: { checked_at: '2026-11-12T11:59:00Z', ok: true }, checks_7d: 1, ok_7d: 1, avg_latency_ms_7d: 10 } });
    const b = item('gemini', { health: { last: { checked_at: '2026-11-12T12:00:00Z', ok: true }, checks_7d: 1, ok_7d: 1, avg_latency_ms_7d: 10 } });
    expect(latestCheckAt([a, b])).toBe('2026-11-12T12:00:00Z');
    expect(latestCheckAt([])).toBeNull();
    expect(healthStripText(overview([a, b]), [a, b], now)).toBe(
      '3 de 11 conectados · 2 saudáveis · 1 com atenção · 0 com erro · custo do mês US$ 1,23 de US$ 5,00 · última verificação há 30 s',
    );
  });

  it('needsGuidedActivation some só quando GSC, Bing e GA4 estão saudáveis', () => {
    const base = mergeCatalogWithOverview(undefined);
    expect(needsGuidedActivation(base)).toBe(true);
    const only = base.map((i) => (i.id === 'gsc' ? { ...i, status: 'healthy' as const } : i));
    expect(needsGuidedActivation(only)).toBe(true);
    const both = base.map((i) => (i.id === 'gsc' || i.id === 'bing_webmaster' ? { ...i, status: 'healthy' as const } : i));
    expect(needsGuidedActivation(both)).toBe(true); // falta o GA4
    const all = base.map((i) => (i.id === 'gsc' || i.id === 'bing_webmaster' || i.id === 'ga4' ? { ...i, status: 'healthy' as const } : i));
    expect(needsGuidedActivation(all)).toBe(false);
  });

  it('summarizeHealthResults', () => {
    expect(summarizeHealthResults([])).toBe('Nenhuma conexão gratuita para testar.');
    expect(summarizeHealthResults([
      { provider: 'gsc', ok: true }, { provider: 'openai', ok: false }, { provider: 'serper', ok: false, skipped: 'cost_confirmation_required' },
    ])).toBe('2 testada(s) · 1 ok · 1 com falha · 1 ignorada(s)');
  });
});

describe('liberação de execução paga', () => {
  it('parseBudgetUsd aceita vírgula e ponto, rejeita fora de [0,200]', () => {
    expect(parseBudgetUsd('5')).toBe(5);
    expect(parseBudgetUsd('5,5')).toBe(5.5);
    expect(parseBudgetUsd('5.25')).toBe(5.25);
    expect(parseBudgetUsd('0')).toBe(0);
    expect(parseBudgetUsd('200')).toBe(200);
    expect(parseBudgetUsd('200,01')).toBeNull();
    expect(parseBudgetUsd('-1')).toBeNull();
    expect(parseBudgetUsd('')).toBeNull();
    expect(parseBudgetUsd('abc')).toBeNull();
    expect(parseBudgetUsd('1,234')).toBeNull();
  });

  it('executionEnableBlocker só libera com orçamento > 0, provedor e LIBERAR', () => {
    const ok = { budgetText: '5', providers: ['openai'], confirm: CONFIRM_WORD };
    expect(executionEnableBlocker(ok)).toBeNull();
    expect(executionEnableBlocker({ ...ok, budgetText: '0' })).toMatch(/maior que zero/);
    expect(executionEnableBlocker({ ...ok, budgetText: '' })).toMatch(/orçamento mensal/);
    expect(executionEnableBlocker({ ...ok, budgetText: '201' })).toMatch(/orçamento mensal/);
    expect(executionEnableBlocker({ ...ok, providers: [] })).toMatch(/ao menos um provedor/);
    expect(executionEnableBlocker({ ...ok, confirm: '' })).toMatch(/Digite LIBERAR/);
    expect(executionEnableBlocker({ ...ok, confirm: 'liberar' })).toMatch(/Digite LIBERAR/);
    expect(executionEnableBlocker({ ...ok, confirm: ' LIBERAR ' })).toBeNull();
  });

  it('budgetUsedPercent', () => {
    expect(budgetUsedPercent({ budget_usd_micros: 0, reserved_usd_micros: 0, consumed_usd_micros: 0 })).toBeNull();
    expect(budgetUsedPercent({ budget_usd_micros: 10_000_000, reserved_usd_micros: 1_000_000, consumed_usd_micros: 2_000_000 })).toBe(30);
    expect(budgetUsedPercent({ budget_usd_micros: 1_000_000, reserved_usd_micros: 1_000_000, consumed_usd_micros: 2_000_000 })).toBe(100);
  });

  it('canAdministerOrganization', () => {
    expect(canAdministerOrganization({ role: 'owner', membershipOrgId: 'o1', activeOrgId: 'o1' })).toBe(true);
    expect(canAdministerOrganization({ role: 'admin', membershipOrgId: 'o1', activeOrgId: 'o1' })).toBe(true);
    expect(canAdministerOrganization({ role: 'editor', membershipOrgId: 'o1', activeOrgId: 'o1' })).toBe(false);
    expect(canAdministerOrganization({ role: 'owner', membershipOrgId: 'o1', activeOrgId: 'o2' })).toBe(false);
    expect(canAdministerOrganization({ role: 'owner', membershipOrgId: 'o1', activeOrgId: undefined })).toBe(false);
    expect(canAdministerOrganization({ role: 'viewer', isPlatformAdmin: true })).toBe(true);
    expect(canAdministerOrganization({})).toBe(false);
  });
});

describe('sincronização de busca', () => {
  it('normalizeSyncResponse aceita o formato único e o por fonte', () => {
    expect(normalizeSyncResponse(null)).toEqual([]);
    expect(normalizeSyncResponse({ property: 'sc-domain:x.com', rows_upserted: 120, truncated: false })).toEqual([{ source: 'gsc', ok: true, rows: 120, truncated: false }]);
    expect(normalizeSyncResponse({ results: [
      { source: 'gsc', ok: true, rows_upserted: 10, truncated: true },
      { source: 'bing', ok: false, error: 'bing_unreachable' },
    ] })).toEqual([
      { source: 'gsc', ok: true, rows: 10, truncated: true },
      { source: 'bing', ok: false, rows: 0, truncated: false, error: 'bing_unreachable' },
    ]);
  });

  it('syncSummaryText', () => {
    expect(syncSummaryText([])).toBe('Nada foi sincronizado.');
    expect(syncSummaryText([
      { source: 'gsc', ok: true, rows: 1200, truncated: true },
      { source: 'bing', ok: false, rows: 0, truncated: false, error: 'bing_unreachable' },
    ])).toBe('Google Search Console: 1.200 linha(s) gravada(s) (resultado truncado) · Bing Webmaster: O Bing Webmaster está instável ou fora do ar. Tente de novo em alguns minutos.');
  });

  it('isSafeInternalRoute rejeita URL externa e protocolo relativo', () => {
    expect(isSafeInternalRoute('/nexus/motores')).toBe(true);
    expect(isSafeInternalRoute('//evil.com')).toBe(false);
    expect(isSafeInternalRoute('https://evil.com')).toBe(false);
    expect(isSafeInternalRoute('/\\evil')).toBe(false);
    expect(isSafeInternalRoute(undefined)).toBe(false);
  });
});
