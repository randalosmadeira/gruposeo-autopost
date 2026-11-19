/**
 * Ações da "Descoberta do negócio" na função de borda `profile-discover`.
 *
 *  - `map`:   lê a página inicial, robots.txt, llms.txt e os sitemaps do site do projeto e devolve o mapa (estrutura + páginas a ler).
 *  - `pages`: lê até 4 páginas do mesmo site e devolve os fatos extraídos.
 * Só leitura da internet pública, sem custo e sem gravar nada: quem grava é o cliente, ao confirmar, pela função `nexus-business`.
 * O endereço consultado precisa pertencer ao MESMO domínio registrável do projeto (a função não serve para varrer sites de terceiros).
 */
import { WRITE_ROLES } from './profile-service.ts';
import { normalizeSiteInput, parseSafeUrl, registrableDomain, type Deps } from './profile-analyze-core.ts';
import { discoverMap, discoverPages, PAGES_PER_CALL } from './profile-discover-core.ts';

export const DISCOVER_ACTIONS = ['map', 'pages'];

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Reply = { status: number; body: Record<string, unknown> };
export interface DiscoverCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string>; deps: Deps }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Reply => ({ status, body: { error, ...extra } });

export async function handleDiscoverAction(admin: Admin, ctx: DiscoverCtx): Promise<Reply> {
  try {
    const projectId = ctx.body.projectId;
    if (typeof projectId !== 'string' || !UUID.test(projectId)) return fail(422, 'project_id_required');
    const { data: project, error } = await admin.from('projects').select('id,name,domain,organization_id,wordpress_url').eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!project) return fail(404, 'project_not_found');
    const role = ctx.roleByOrg.get(project.organization_id) || null;
    if (!role) return fail(403, 'organization_membership_required');
    if (!WRITE_ROLES.includes(role)) return fail(403, 'role_not_allowed');

    const own = normalizeSiteInput(project.domain) || normalizeSiteInput(project.wordpress_url);
    if (!own) return fail(422, 'project_domain_required');
    const reg = registrableDomain(own.host);

    if (ctx.action === 'map') {
      // o cliente pode pedir um subdomínio do próprio projeto (ex.: blog.empresa.com.br); outro domínio é recusado
      const asked = typeof ctx.body.site === 'string' && ctx.body.site.trim() ? normalizeSiteInput(ctx.body.site) : own;
      if (!asked) return fail(422, 'site_invalid');
      if (registrableDomain(asked.host) !== reg) return fail(422, 'site_outside_project_domain');
      return { status: 200, body: { map: await discoverMap(ctx.deps, asked) } };
    }
    if (ctx.action === 'pages') {
      const urls = Array.isArray(ctx.body.urls) ? ctx.body.urls.filter((u): u is string => typeof u === 'string').slice(0, PAGES_PER_CALL) : [];
      if (!urls.length) return fail(422, 'urls_required');
      for (const u of urls) {
        const p = parseSafeUrl(u);
        if ('error' in p || registrableDomain(p.url.hostname) !== reg) return fail(422, 'url_outside_project_domain');
      }
      return { status: 200, body: await discoverPages(ctx.deps, reg, urls) };
    }
    return fail(400, 'unknown_action');
  } catch (_e) {
    console.error('[profile-discover] operation_failed');
    return fail(500, 'discover_operation_failed');
  }
}
