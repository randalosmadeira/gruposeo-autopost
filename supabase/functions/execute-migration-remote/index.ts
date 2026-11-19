import '../_shared/nexus-runtime-bootstrap.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() => new Response(
  JSON.stringify({
    success: false,
    error: "Endpoint desativado. Migrações devem ser executadas por pipeline administrativo controlado.",
  }),
  {
    status: 410,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  },
));
