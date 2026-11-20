/**
 * Portão único dos módulos (função de borda `engine`): recebe { module, action, ...corpo } e despacha para o handler registrado.
 *
 * Padrão "strangler": os handlers antigos NÃO mudaram e as funções de borda antigas continuam deployáveis sozinhas. O portão só
 *  1) confere o módulo e a ação no manifesto (module-registry.ts),
 *  2) resolve usuário -> organização -> papel NO BANCO e recusa papel abaixo do mínimo declarado,
 *  3) passa pelo gancho do teto de gasto SÓ se o módulo/ação declarar custo,
 *  4) entrega ao handler o mesmo corpo que a função própria receberia (sem o campo `module`) e devolve exatamente a resposta dele.
 * O handler continua sendo a autoridade (ele repete as conferências dele): o portão é uma segunda trava, nunca mais permissiva.
 */
import {
  checkSpend, fail, guarded, hasRole, isUuid, loadMemberships, resolveRequestOrganization, type Admin, type Reply, type SpendGuard,
} from './engine-kernel.ts';
import { engineSpec } from './module-registry.ts';
import { recordEvent, handleEventsAction } from './project-events.ts';
import { handleOverviewAction } from './overview-handler.ts';
import { handleBacklinkAction } from './backlinks-handler.ts';
import { handleTaxonomyAction } from './taxonomy-handler.ts';
import { handleSpeedAction } from './speed-handler.ts';
import { handleLifecycleAction } from './project-lifecycle-handler.ts';
import { handleSpendPolicyAction } from './spend-policy-handler.ts';
import { handleIndexationAction, type GoogleLink } from './indexation-handler.ts';
import { handleRadarAction, type RadarDeps } from './radar-handler.ts';
import { handleStudioAction, type StudioDeps } from './studio-handler.ts';
import { handleCuradoriaAction } from './curadoria-handler.ts';

export interface EngineDeps {
  fetchFn: typeof fetch;
  lookupA: (host: string) => Promise<string[]>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Chave de serviço do Google para velocidade (segredo da função; nunca devolvida). */
  speedApiKey: string | null;
  /** Constante PAID_SERVICES_BLOCKED (os testes injetam). */
  paidBlocked: boolean;
  spendGuard?: SpendGuard;
  resolveGoogle?: (organizationId: string, projectId: string) => Promise<GoogleLink | null>;
  resolveBingKey?: (organizationId: string) => Promise<string | null>;
  budgetMs?: number;
  /**
   * Radar de mercado: ligações que só a função de borda conhece. `paidFetch` DEVE ser o fetch guardado pelo teto diário (providerFetch); ausente = nenhuma chamada paga sai
   * (falha fechada). Chaves vêm do cofre pela organização do projeto (readSecret), nunca do corpo do pedido.
   */
  /** Estúdio de Páginas: IA, imagem e plugin do WordPress, ligados pela função de borda (a IA e a imagem passam pelo teto diário). Ausentes = rascunho sem IA, imagens pendentes, publicação indisponível. */
  studio?: Partial<Pick<StudioDeps, 'ai' | 'image' | 'plugin'>>;
  radar?: Partial<Pick<RadarDeps, 'paidFetch' | 'readSecret' | 'aiJson' | 'youtubeKey' | 'oprKey' | 'speedApiKey' | 'dayBudget' | 'bindOrg' | 'unitPrices' | 'overpassUrl' | 'geonamesUser'>>;
}
interface AdapterCtx { action: string; body: Record<string, unknown>; userId: string; roleByOrg: Map<string, string> }
export type Adapter = (admin: Admin, ctx: AdapterCtx, deps: EngineDeps) => Promise<Reply>;

const net = (d: EngineDeps) => ({ fetchFn: d.fetchFn, lookupA: d.lookupA, now: d.now });
/** Sem fetch guardado configurado: toda chamada paga é negada (nunca usa o fetch cru). */
const denyingFetch = (async () => { throw Object.assign(new Error('spend_guard_unavailable'), { name: 'SpendDeniedError', info: { code: 'spend_status_unavailable' } }); }) as unknown as typeof fetch;
const radarDeps = (d: EngineDeps): RadarDeps => ({
  fetchFn: d.fetchFn, lookupA: d.lookupA, now: d.now, sleep: d.sleep, paidFetch: d.radar?.paidFetch ?? denyingFetch, readSecret: d.radar?.readSecret ?? (async () => null),
  youtubeKey: d.radar?.youtubeKey ?? null, oprKey: d.radar?.oprKey ?? null, speedApiKey: d.radar?.speedApiKey ?? d.speedApiKey, dayBudget: d.radar?.dayBudget, bindOrg: d.radar?.bindOrg, unitPrices: d.radar?.unitPrices,
  overpassUrl: d.radar?.overpassUrl, geonamesUser: d.radar?.geonamesUser, aiJson: d.radar?.aiJson, budgetMs: d.budgetMs,
});

/** Adaptadores: cada um chama o handler EXISTENTE com os mesmos argumentos que a função de borda própria usa. */
export const ADAPTERS: Record<string, Adapter> = {
  overview: (admin, c, d) => handleOverviewAction(admin, { ...c, deps: net(d) }),
  backlinks: (admin, c, d) => handleBacklinkAction(admin, { ...c, deps: net(d) }),
  taxonomy: (admin, c, d) => handleTaxonomyAction(admin, { ...c, deps: net(d) }),
  speed: (admin, c, d) => handleSpeedAction(admin, { ...c, deps: { fetchFn: d.fetchFn, now: d.now, apiKey: d.speedApiKey } }),
  lifecycle: (admin, c, d) => handleLifecycleAction(admin, { ...c, deps: { now: d.now } }),
  'spend-policy': (admin, c, d) => handleSpendPolicyAction(admin, { ...c, paidBlocked: d.paidBlocked }),
  events: (admin, c) => handleEventsAction(admin, c),
  indexacao: (admin, c, d) => handleIndexationAction(admin, { ...c, deps: { ...net(d), sleep: d.sleep, resolveGoogle: d.resolveGoogle, resolveBingKey: d.resolveBingKey, budgetMs: d.budgetMs } }),
  radar: (admin, c, d) => handleRadarAction(admin, { ...c, deps: radarDeps(d) }),
  curadoria: (admin, c, d) => handleCuradoriaAction(admin, { ...c, deps: { now: d.now, budgetMs: d.budgetMs } }),
  estudio: (admin, c, d) => handleStudioAction(admin, { ...c, deps: { ...net(d), ai: d.studio?.ai, image: d.studio?.image, plugin: d.studio?.plugin } }),
};

/** Fatos que módulos ANTIGOS passam a publicar, só pelo adaptador (sem mexer neles): resposta 200 -> evento. */
const AFTER: Record<string, (body: Record<string, unknown>) => { kind: string; payload: Record<string, unknown> } | null> = {
  'visao_geral.refresh_structure': (b) => (typeof b.refreshed === 'number' ? { kind: 'estrutura.mapa_atualizado', payload: { count: b.refreshed } } : null),
  'backlinks.verify': (b) => (typeof b.checked === 'number' ? { kind: 'backlinks.verificados', payload: { count: b.checked, changes: typeof b.changes === 'number' ? b.changes : 0 } } : null),
};

export interface EngineInput { userId: string; body: unknown }

export async function routeEngineRequest(admin: Admin, input: EngineInput, deps: EngineDeps): Promise<Reply> {
  return guarded('engine', async () => {
    const raw = input.body;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(400, 'body_invalid');
    const { module: mod, ...body } = raw as Record<string, unknown>;
    if (typeof mod !== 'string' || !mod) return fail(400, 'module_required');
    if (typeof body.action !== 'string' || !body.action) return fail(400, 'action_required');
    const spec = engineSpec(mod);
    if (!spec) return fail(404, 'unknown_module');
    const act = Object.prototype.hasOwnProperty.call(spec.actions, body.action) ? spec.actions[body.action] : undefined;
    if (!act) return fail(400, 'unknown_action');
    const adapter = ADAPTERS[spec.handler];
    if (!adapter) return fail(501, 'handler_missing');

    const roleByOrg = await loadMemberships(admin, input.userId, { includeOwner: spec.roleSource === 'members+owner' });
    let orgId = await resolveRequestOrganization(admin, body);
    if (!orgId && spec.scope === 'organization' && roleByOrg.size === 1) orgId = [...roleByOrg.keys()][0];
    if (orgId) {
      const role = roleByOrg.get(orgId) || null;
      if (!role) return fail(403, 'organization_membership_required');
      if (!hasRole(role, act.minRole)) return fail(403, 'role_not_allowed');
    }
    // Teto de gasto: só módulos/ações com custo passam pelo gancho (cost 'none' nunca chama o guarda).
    const denied = await checkSpend(spec.cost, !!act.paid, deps.spendGuard, { module: mod, action: body.action, organizationId: orgId || '', projectId: isUuid(body.projectId) ? body.projectId : null, userId: input.userId });
    if (denied) return denied;

    const reply = await adapter(admin, { action: body.action, body, userId: input.userId, roleByOrg }, deps);
    const after = AFTER[`${mod}.${body.action}`];
    if (after && reply.status === 200 && orgId && isUuid(body.projectId)) {
      const fact = after(reply.body);
      if (fact) await recordEvent(admin, { organization_id: orgId, project_id: body.projectId, module: mod, kind: fact.kind, subject: {}, payload: fact.payload });
    }
    return reply;
  });
}
