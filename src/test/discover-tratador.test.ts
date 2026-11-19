import { describe, expect, it } from 'vitest';
import { fakeAdmin, type Row } from './helpers/fake-admin';
import { DISCOVER_ACTIONS, handleDiscoverAction } from '../../supabase/functions/_shared/profile-discover-handler';
import type { Deps } from '../../supabase/functions/_shared/profile-analyze-core';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OTHER_ORG = '00000000-0000-4000-8000-0000000000a2';
const PROJECT = '00000000-0000-4000-8000-0000000000b1';
const NO_DOMAIN = '00000000-0000-4000-8000-0000000000b3';
const USER = '00000000-0000-4000-8000-0000000000c1';
const home = '<!doctype html><html lang="pt-BR"><head><title>Exemplo</title><meta name="description" content="Loja de exemplo com produtos para você, frete grátis e parcelamento."></head><body><nav><a href="/sobre">Sobre a loja</a></nav><h1>Exemplo</h1><p>Comprar agora, adicionar ao carrinho.</p></body></html>';

function deps() {
  const calls: string[] = [];
  const d: Deps = {
    now: () => Date.UTC(2026, 10, 16),
    lookupA: async () => ['93.184.216.34'],
    fetchFn: (async (input: RequestInfo | URL) => {
      const url = String(input); calls.push(url);
      if (/robots|llms|sitemap/.test(url)) return new Response('nao', { status: 404, headers: { 'content-type': 'text/html' } });
      return new Response(home, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch,
  };
  return { d, calls };
}
const seed = (): Record<string, Row[]> => ({
  projects: [
    { id: PROJECT, name: 'Exemplo', domain: 'exemplo.com.br', organization_id: ORG, wordpress_url: null },
    { id: NO_DOMAIN, name: 'Sem site', domain: null, organization_id: ORG, wordpress_url: null },
  ],
});
const run = (action: string, body: Record<string, unknown>, role: string | null = 'owner', tables = seed()) => {
  const { d, calls } = deps();
  const roleByOrg = new Map<string, string>(role ? [[ORG, role]] : [[OTHER_ORG, 'owner']]);
  return handleDiscoverAction(fakeAdmin(tables).admin, { action, body: { projectId: PROJECT, ...body }, userId: USER, roleByOrg, deps: d }).then((r) => ({ ...r, calls }));
};

describe('descoberta: função de borda', () => {
  it('expõe só as ações map e pages', () => { expect(DISCOVER_ACTIONS).toEqual(['map', 'pages']); });

  it('map lê o site do projeto e devolve estrutura, sem gravar nada', async () => {
    const tables = seed();
    const r = await run('map', {}, 'owner', tables);
    expect(r.status).toBe(200);
    const map = r.body.map as { homeKind: string; host: string; home: { title: string } };
    expect(map).toMatchObject({ homeKind: 'site', host: 'exemplo.com.br' });
    expect(map.home.title).toBe('Exemplo');
    expect(JSON.stringify(tables)).toBe(JSON.stringify(seed())); // nenhuma tabela foi alterada
  });

  it('aceita subdomínio do próprio domínio do projeto e recusa outro domínio', async () => {
    expect((await run('map', { site: 'blog.exemplo.com.br' })).status).toBe(200);
    const bad = await run('map', { site: 'outro.com' });
    expect(bad).toMatchObject({ status: 422, body: { error: 'site_outside_project_domain' } });
    expect(bad.calls).toHaveLength(0); // nem chegou a visitar
    expect((await run('map', { site: 'http://127.0.0.1' })).status).toBe(422);
  });

  it('pages valida cada endereço contra o domínio do projeto', async () => {
    const ok = await run('pages', { urls: ['https://exemplo.com.br/sobre', 'https://www.exemplo.com.br/'] });
    expect(ok.status).toBe(200);
    expect((ok.body.pages as unknown[]).length).toBe(2);
    const bad = await run('pages', { urls: ['https://exemplo.com.br/sobre', 'https://evil.com/'] });
    expect(bad).toMatchObject({ status: 422, body: { error: 'url_outside_project_domain' } });
    expect(bad.calls).toHaveLength(0);
    expect((await run('pages', { urls: [] })).body.error).toBe('urls_required');
  });

  it('exige papel de escrita, participação na organização e projeto com site', async () => {
    expect((await run('map', {}, 'viewer')).body.error).toBe('role_not_allowed');
    expect((await run('map', {}, null)).body.error).toBe('organization_membership_required');
    expect((await run('map', { projectId: NO_DOMAIN })).body.error).toBe('project_domain_required');
    expect((await run('map', { projectId: 'x' })).body.error).toBe('project_id_required');
    expect((await run('map', { projectId: '00000000-0000-4000-8000-0000000000ff' })).status).toBe(404);
    expect((await run('nada', {})).status).toBe(400);
  });
});
