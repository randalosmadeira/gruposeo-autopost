// Portão único dos módulos: { module, action, ...corpo } -> handler registrado em _shared/module-registry.ts (padrão strangler).
// As funções de borda antigas (site-overview, backlinks, taxonomy, site-speed, project-lifecycle, spend-policy) continuam existindo e funcionando sozinhas.
// Login (JWT de usuário) e papel conferidos aqui e de novo dentro de cada handler; módulos sem custo nunca passam pelo teto de gasto. Nenhuma chave é devolvida.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveRequestActor, RequestAuthError } from '../_shared/request-auth.ts';
import { PAID_SERVICES_BLOCKED, scopedServe } from '../_shared/nexus-spend-lock.ts';
import { providerFetch } from '../_shared/nexus-provider-fetch.ts';
import { getOrchestratorForUser } from '../_shared/byok-resolver.ts';
import { bindSpendIdentity } from '../_shared/spend-gate.ts';
import { loadOAuthLink, resolveOAuthSecret } from '../_shared/nexus-oauth-sync.ts';
import { routeEngineRequest, type EngineDeps } from '../_shared/engine-router.ts';
import { DEFAULT_PRICE_BOOK, textCostMicros, textPriceFor } from '../_shared/spend-gate-core.ts';
import { pluginRequest, resolvePluginKey, resolvePluginNamespace } from '../_shared/wordpress-plugin-client.ts';

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' };
const json = (v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers });

// scopedServe: com o teto diário ligado, a requisição ganha o contexto de gasto (o radar paga pelo fetch guardado); com o bloqueio global é idêntico a Deno.serve
scopedServe(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', message: 'Método não permitido.' }, 405);
  try {
    const actor = await resolveRequestActor(req);
    if (actor.mode !== 'user') return json({ error: 'user_session_required', message: 'Entre com a sua conta para continuar.' }, 403);
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: 'body_invalid', message: 'O pedido está malformado.' }, 400); }
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '', { auth: { persistSession: false } });
    const googleApp = () => ({ clientId: Deno.env.get('NEXUS_GOOGLE_OAUTH_CLIENT_ID') || '', clientSecret: Deno.env.get('NEXUS_GOOGLE_OAUTH_CLIENT_SECRET') || '' });
    const readOrgSecret = async (org: string, provider: string): Promise<string | null> => {
      const { data, error } = await admin.rpc('nexus_provider_secret_read', { p_org: org, p_provider: provider });
      return error || typeof data !== 'string' || !data ? null : data;
    };
    const deps: EngineDeps = {
      fetchFn: fetch, lookupA: (host: string) => Deno.resolveDns(host, 'A'), now: () => Date.now(), sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
      speedApiKey: Deno.env.get('GOOGLE_API_KEY_SPEED') || null,
      paidBlocked: PAID_SERVICES_BLOCKED,
      // Gancho do teto de gasto no portão: com o bloqueio global ligado, ação paga é negada. A reserva/confirmação do valor continua acontecendo
      // dentro do próprio handler, no momento da chamada ao provedor (spend-gate); o portão não duplica essa contabilidade.
      spendGuard: async () => (PAID_SERVICES_BLOCKED ? { allowed: false, status: 423, error: 'global_paid_services_blocked' } : { allowed: true }),
      // Search Console do projeto: conexão OAuth gerenciada primeiro; senão a credencial da organização. O segredo só vive na memória desta execução.
      resolveGoogle: async (organizationId, projectId) => {
        const link = await loadOAuthLink(admin, organizationId, projectId, 'gsc');
        let failure: unknown = null;
        try {
          const viaOAuth = await resolveOAuthSecret(admin, fetch, googleApp(), organizationId, projectId, 'gsc');
          if (viaOAuth) return { secret: viaOAuth, property: link?.property_id ?? null };
        } catch (e) { failure = e; }
        const org = await readOrgSecret(organizationId, 'gsc');
        if (org) return { secret: org, property: link?.property_id ?? null };
        if (failure) throw failure;
        return null;
      },
      resolveBingKey: (organizationId) => readOrgSecret(organizationId, 'bing_webmaster'),
      radar: {
        // fetch guardado pelo teto diário: negação (teto atingido, pausa, status indisponível) vira SpendDeniedError e o radar PARA
        paidFetch: providerFetch,
        readSecret: readOrgSecret,
        youtubeKey: Deno.env.get('YOUTUBE_API_KEY') || Deno.env.get('GOOGLE_API_KEY_SPEED') || null,
        oprKey: Deno.env.get('OPEN_PAGERANK_API_KEY') || null,
        bindOrg: (orgId, projectId, userId) => bindSpendIdentity({ orgId, projectId, ...(userId ? { userId } : {}) }),
        dayBudget: async (orgId) => {
          const { data, error } = await admin.rpc('spend_status', { p_org: orgId });
          if (error || !data || typeof data !== 'object') return null;
          const st = data as Record<string, unknown>;
          const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
          return { remaining_micros: Math.max(0, num(st.extra_unlocked === true ? st.remaining_absolute_usd_micros : st.remaining_to_cap_usd_micros)), used_micros: num(st.used_usd_micros), cap_micros: num(st.cap_usd_micros) };
        },
        unitPrices: async () => {
          const { data } = await admin.rpc('spend_price_table', {});
          const { priceBookFromRows } = await import('../_shared/spend-gate-core.ts');
          return priceBookFromRows(Array.isArray(data) ? data : []).units;
        },
        // IA em modo barato (tarefa seo_analysis = tier econômico), pelo orquestrador: cada chamada é reservada e confirmada no teto diário
        aiJson: async ({ system, user, maxTokens }) => {
          const orchestrator = await getOrchestratorForUser(actor.userId);
          return await orchestrator.call('seo_analysis', [{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens, temperature: 0.1, prioritizeCost: true });
        },
      },
      // Estúdio de Páginas: IA por orquestrador (cada chamada é reservada e confirmada no teto diário; negada = SpendDeniedError e o pipeline PARA) e plugin do WordPress.
      // A geração de imagem (gpt-image-2 via generate-image) NÃO está ligada ao portão: sem porta de imagem, os slots ficam do acervo ou pendentes.
      studio: {
        ai: async ({ organizationId, projectId, userId }) => {
          bindSpendIdentity({ orgId: organizationId, projectId, userId });
          const orchestrator = await getOrchestratorForUser(userId);
          return {
            async call(req) {
              const r = await orchestrator.callWithMeta(req.task, [{ role: 'system', content: req.system }, { role: 'user', content: req.user }], { maxTokens: Math.max(100, Math.min(req.maxTokens, 4000)), temperature: req.temperature, correlationId: `estudio-${crypto.randomUUID()}` });
              const usage = r.usage ?? { inputTokens: 0, outputTokens: 0 };
              return { content: r.content, model: r.model, usage, costMicros: textCostMicros(textPriceFor(DEFAULT_PRICE_BOOK, r.model), usage.inputTokens, usage.outputTokens) };
            },
          };
        },
        plugin: async ({ organizationId, projectId }, path, init) => {
          const { data: project } = await admin.from('projects').select('*').eq('id', projectId).eq('organization_id', organizationId).maybeSingle();
          if (!project?.wordpress_url) throw new Error('Projeto sem WordPress conectado.');
          const { apiKey } = await resolvePluginKey(admin, project);
          const r = await pluginRequest(String(project.wordpress_url), apiKey, path, { method: init.method, headers: { 'Content-Type': 'application/json' }, ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}) }, resolvePluginNamespace(project));
          return r.data;
        },
      },
    };
    const result = await routeEngineRequest(admin, { userId: actor.userId, body }, deps);
    return json(result.body, result.status);
  } catch (e) {
    if (e instanceof RequestAuthError) return json({ error: e.code, message: 'Não foi possível confirmar o seu acesso.' }, e.status);
    console.error('[engine] operation_failed');
    return json({ error: 'engine_operation_failed', message: 'Não foi possível concluir agora. Tente de novo.' }, 500);
  }
}, { module: 'engine' });
