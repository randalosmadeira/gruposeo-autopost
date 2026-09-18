import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('auditoria 2026-09-18 — CRÍTICO 1: IDOR em analyze-seo-advanced', () => {
  const fn = read('supabase/functions/analyze-seo-advanced/index.ts');

  it('exige um ator autenticado antes de processar article_ids (fail-closed)', () => {
    expect(fn).toContain('resolveRequestActor');
    expect(fn).toContain('RequestAuthError');
    expect(fn).toMatch(/import\s*\{\s*RequestAuthError,\s*resolveRequestActor\s*\}\s*from\s*"\.\.\/_shared\/request-auth\.ts"/);
  });

  it('nunca mais confia em um userId nulo para seguir executando com o service role', () => {
    expect(fn).not.toContain('let userId: string | null = null;');
  });

  it('filtra article_ids fora da organização do usuário antes de ler ou escrever qualquer artigo', () => {
    expect(fn).toContain('organization_members');
    expect(fn).toContain('allowedOrgIds');
    expect(fn).toContain('code: "organization_boundary"');
    // A checagem de fronteira precisa vir antes da leitura de credenciais WordPress do projeto.
    const boundaryIdx = fn.indexOf('allowedOrgIds');
    const projectSelectIdx = fn.indexOf('.from("projects")');
    expect(boundaryIdx).toBeGreaterThan(-1);
    expect(projectSelectIdx).toBeGreaterThan(boundaryIdx);
  });

  it('não seleciona mais credenciais WordPress de projetos para montar o contexto de prompt', () => {
    expect(fn).not.toContain('wordpress_username, wordpress_app_password');
  });

  it('usa organization_id como filtro extra nos updates de artigo (defesa em profundidade)', () => {
    const updateCalls = fn.match(/\.eq\("id", article\.id\)(\.eq\("organization_id", article\.organization_id\))?/g) || [];
    expect(updateCalls.length).toBeGreaterThan(0);
    for (const call of updateCalls) {
      expect(call).toContain('.eq("organization_id", article.organization_id)');
    }
  });
});

describe('auditoria 2026-09-18 — CRÍTICO 2: segredo hardcoded em webhooks', () => {
  const fn = read('supabase/functions/webhooks/index.ts');

  it('não aceita mais "default-secret" como fallback do WEBHOOK_SECRET', () => {
    expect(fn).not.toContain('default-secret');
    expect(fn).toContain('const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || "";');
  });

  it('falha fechado (500) quando WEBHOOK_SECRET não está configurado, antes de comparar o header', () => {
    expect(fn).toContain('webhook_secret_not_configured');
    const failClosedIdx = fn.indexOf('webhook_secret_not_configured');
    const compareIdx = fn.indexOf('providedSecret !== WEBHOOK_SECRET');
    expect(failClosedIdx).toBeGreaterThan(-1);
    expect(compareIdx).toBeGreaterThan(failClosedIdx);
  });

  it('liga publicação/despublicação de post ao projeto do artigo via site/post URL antes de aplicar mudanças', () => {
    expect(fn).toContain('articleBelongsToSite');
    expect(fn).toContain('post_published_organization_mismatch');
    expect(fn).toContain('post_deleted_organization_mismatch');
  });

  it('verifica a posse real do agente antes de inserir agent_news para um agent_id/user_id do payload', () => {
    expect(fn).toContain('news_found_organization_mismatch');
    expect(fn).toMatch(/agent\.user_id !== user_id/);
  });
});

describe('auditoria 2026-09-18 — ALTO: funções migradas para o byok-resolver', () => {
  const analyzeSeoAdvanced = read('supabase/functions/analyze-seo-advanced/index.ts');
  const generateContentVariations = read('supabase/functions/generate-content-variations/index.ts');
  const analyzeUrlContent = read('supabase/functions/analyze-url-content/index.ts');

  it('analyze-seo-advanced usa getOrchestratorForUser em vez de ler user_settings diretamente', () => {
    expect(analyzeSeoAdvanced).toContain('getOrchestratorForUser');
    expect(analyzeSeoAdvanced).not.toMatch(/\.from\("user_settings"\)\s*\.select\("gemini_api_key,\s*openai_api_key,\s*anthropic_api_key"\)/);
    expect(analyzeSeoAdvanced).not.toContain('orchestrator.setKeys({');
  });

  it('generate-content-variations usa fetchUserKeys em vez de ler user_settings diretamente', () => {
    expect(generateContentVariations).toContain('fetchUserKeys');
    expect(generateContentVariations).not.toMatch(/\.from\("user_settings"\)\s*\.select\("gemini_api_key,\s*openai_api_key"\)/);
  });

  it('analyze-url-content usa fetchUserKeys em vez de ler user_settings diretamente', () => {
    expect(analyzeUrlContent).toContain('fetchUserKeys');
    expect(analyzeUrlContent).not.toMatch(/\.from\("user_settings"\)\s*\.select\("gemini_api_key"\)/);
  });

  it('as 3 funções importam do _shared/byok-resolver.ts (mesmo módulo que ai-chat/gbp-audit)', () => {
    for (const fn of [analyzeSeoAdvanced, generateContentVariations, analyzeUrlContent]) {
      expect(fn).toMatch(/from\s*"\.\.\/_shared\/byok-resolver\.ts"/);
    }
  });
});

describe('auditoria 2026-09-18 — MÉDIO: contador de notícias hoje deixa de ser fabricado', () => {
  const page = read('src/pages/NewsAgents.tsx');
  const hook = read('src/hooks/useNewsAgents.tsx');

  it('a página não fixa mais "0" como contagem de notícias do dia', () => {
    expect(page).not.toContain('const newsToday = 0;');
  });

  it('a página usa o valor real (ou um estado vazio honesto durante o carregamento) vindo do hook', () => {
    expect(page).toContain('newsFoundToday');
    expect(page).toContain('isLoadingNewsToday');
    expect(page).toContain('newsTodayDisplay');
  });

  it('o hook calcula a contagem a partir de agent_news filtrando por usuário e por hoje', () => {
    expect(hook).toContain("from('agent_news')");
    expect(hook).toMatch(/count:\s*'exact'/);
    expect(hook).toContain("eq('user_id', user.id)");
    expect(hook).toMatch(/gte\('created_at',\s*startOfDay\.toISOString\(\)\)/);
  });
});
