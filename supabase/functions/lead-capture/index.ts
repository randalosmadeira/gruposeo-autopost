// Captação de leads (atalho público -> /comecar -> cadastro). Função ABERTA (sem JWT) para `challenge`, `submit`, `peek` e `activate` (cadastro direto da fase de teste);`claim`, `list` e `update`
// exigem login (e `list`/`update` exigem ser gestor). Não instala o bloqueio global de gastos: não faz nenhuma chamada paga.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveRequestActor, RequestAuthError } from '../_shared/request-auth.ts';
import { LEAD_ACTIONS, handleLeadAction } from '../_shared/lead-capture-handler.ts';
import { ALLOWED_ORIGINS, hmacHex, type Crypto2 } from '../_shared/lead-capture-core.ts';

const corsFor = (req: Request) => {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version,x-supabase-api-version',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
};
const json = (req: Request, v: unknown, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { ...corsFor(req), 'Content-Type': 'application/json' } });

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cryptoApi: Crypto2 = { subtle: crypto.subtle, getRandomValues: (a: Uint8Array) => crypto.getRandomValues(a) };

// segredo de assinatura derivado da chave de serviço no próprio servidor: nunca é enviado a lugar nenhum
let secretPromise: Promise<string> | null = null;
const signingSecret = () => (secretPromise ??= hmacHex(cryptoApi, serviceKey, 'lead-capture-signing-v1'));

const clientIp = (req: Request) => req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsFor(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);
  try {
    if (!serviceKey) return json(req, { error: 'backend_not_configured' }, 500);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || !LEAD_ACTIONS.includes((body as { action?: string }).action || '')) return json(req, { error: 'unknown_action' }, 400);
    const action = (body as { action: string }).action;

    // login só é exigido nas ações que precisam; nas públicas, um token inválido simplesmente não conta
    let userId: string | null = null;
    if (req.headers.get('authorization')?.startsWith('Bearer ') && !['challenge', 'submit', 'peek', 'activate'].includes(action)) {
      try {
        const actor = await resolveRequestActor(req);
        if (actor.mode === 'user') userId = actor.userId;
      } catch (e) {
        if (e instanceof RequestAuthError) return json(req, { error: e.code }, e.status);
        throw e;
      }
    }
    const isManager = async () => {
      if (!userId) return false;
      try {
        const { data, error } = await admin.auth.admin.getUserById(userId);
        return !error && data?.user?.app_metadata?.app_role === 'ceo';
      } catch { return false; }
    };
    const result = await handleLeadAction(admin, {
      action, body: body as Record<string, unknown>, ip: clientIp(req), origin: req.headers.get('origin'), crypto: cryptoApi, secret: await signingSecret(),
      now: () => Date.now(), userId, isManager,
    });
    return json(req, result.body, result.status);
  } catch (_e) {
    console.error('[lead-capture] operation_failed');
    return json(req, { error: 'lead_operation_failed' }, 500);
  }
});
