import '../_shared/nexus-runtime-bootstrap.ts';
Deno.serve(()=>new Response('disabled',{status:410}))