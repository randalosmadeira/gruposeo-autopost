import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

/**
 * Aposentada em 2026-09-25. O gerador de apoiadores 1470 roda no orquestrador da
 * VPS (services/zica-orchestrator/src/supporter-avatar), despachado por
 * supporter-avatar-public-v2 -> POST /supporter-avatar/dispatch.
 *
 * Motivos: latência (horas -> ~1 minuto), uma geração de imagem em vez de três,
 * identidade visual em vetor e nenhum selo dentro da imagem.
 */
const PIPELINE_VERSION = 'supporter-avatar-vps-v8';

Deno.serve(() => new Response(JSON.stringify({
  error: 'gone',
  status: 410,
  pipeline: PIPELINE_VERSION,
  detail: 'Geração de apoiadores migrada para o orquestrador da VPS. Use supporter-avatar-public-v2.',
}), { status: 410, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }));
