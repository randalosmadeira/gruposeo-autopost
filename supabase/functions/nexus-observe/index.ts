// `fetch` original do runtime: primeiro import (mesma regra do nexus-intelligence/nexus-audit). Esta função NÃO instala o bloqueio global de gastos
// (nexus-runtime-bootstrap): quem gasta é só `executeObservation`, que passa pelo portão por organização e pela reserva de teto.
import { providerFetch } from '../_shared/nexus-provider-fetch.ts';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { OBSERVE_MAX_OPS_PER_TICK, runObservationTickForOrg, type ObserveAdmin, type TickReport } from '../_shared/nexus-observe.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-zica-automation-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Fetch dos provedores: URL montada pelo servidor, sem seguir redirecionamentos.
const pf = ((input: RequestInfo | URL, init?: RequestInit) => providerFetch(input, { ...init, redirect: 'manual' })) as typeof fetch;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '', { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    let body: Record<string, unknown> = {};
    try { const parsed = await req.json(); if (parsed && typeof parsed === 'object') body = parsed; } catch { body = {}; }

    // Somente o cron: segredo interno (hash em automation_ingress_keys, nome `nexus-observe`). Sem usuário e sem chamada de navegador.
    const automationKey = req.headers.get('x-zica-automation-key') || '';
    if (!automationKey) return json({ error: 'authorization_required' }, 401);
    const { data: rows } = await admin.from('automation_ingress_keys').select('secret_hash').eq('name', 'nexus-observe').eq('enabled', true);
    const hash = await sha256Hex(automationKey);
    if (!(rows || []).some((r: { secret_hash?: string }) => typeof r.secret_hash === 'string' && safeEqual(r.secret_hash, hash))) return json({ error: 'authorization_required' }, 401);

    const dryRun = body.dryRun === true;
    const maxOps = Math.min(Math.max(Math.trunc(Number(body.maxOps) || OBSERVE_MAX_OPS_PER_TICK), 1), 20);
    const only = typeof body.organizationId === 'string' && UUID.test(body.organizationId) ? body.organizationId : null;
    let query = admin.from('nexus_programs').select('organization_id').eq('execution_enabled', true).limit(200);
    if (only) query = query.eq('organization_id', only);
    const { data: programs, error } = await query;
    if (error) return json({ error: 'organizations_unavailable' }, 500);

    const reports: TickReport[] = [];
    const deadline = Date.now() + 110_000;
    for (const p of (programs || []) as Array<{ organization_id: string }>) {
      if (Date.now() > deadline) break;
      reports.push(await runObservationTickForOrg({ admin: admin as unknown as ObserveAdmin, fetchFn: pf, now: Date.now, maxOps, deadlineMs: deadline, dryRun }, p.organization_id));
    }
    return json({ ok: true, dry_run: dryRun, organizations: reports });
  } catch (error) {
    console.error('nexus-observe_failed', error instanceof Error ? error.message.slice(0, 200) : 'unknown');
    return json({ error: 'observe_failed' }, 500);
  }
});
