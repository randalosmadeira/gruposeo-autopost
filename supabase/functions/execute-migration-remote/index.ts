import postgres from 'npm:postgres@3.4.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  db_url?: string;
  sql?: string;
}

function validateDbUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'db_url vazio' };
  if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
    return { ok: false, error: 'db_url deve começar com postgres:// ou postgresql://' };
  }
  try {
    const u = new URL(trimmed);
    if (!u.hostname) return { ok: false, error: 'hostname ausente na db_url' };
    if (!u.password) return { ok: false, error: 'senha ausente na db_url' };
    return { ok: true, url: trimmed };
  } catch {
    return { ok: false, error: 'db_url inválida' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const started = Date.now();
  let sqlClient: ReturnType<typeof postgres> | null = null;

  try {
    const body = (await req.json()) as Body;
    const { db_url, sql } = body ?? {};

    if (!db_url || !sql) {
      return new Response(
        JSON.stringify({ error: 'db_url e sql são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const v = validateDbUrl(db_url);
    if (!v.ok) {
      return new Response(JSON.stringify({ error: v.error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (sql.length > 5_000_000) {
      return new Response(JSON.stringify({ error: 'SQL excede 5MB' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Conecta ao Postgres de destino
    sqlClient = postgres(v.url, {
      max: 1,
      ssl: 'require',
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });

    // Pré-check: valida conexão + versão
    const pre = await sqlClient`SELECT current_database() AS db, version() AS version, current_user AS role`;
    const preInfo = pre[0];

    // Executa o migrations.sql inteiro como um único bloco.
    // Usa unsafe() porque o conteúdo é uma sequência de statements (DDL).
    await sqlClient.unsafe(sql);

    const elapsed = Date.now() - started;

    return new Response(
      JSON.stringify({
        success: true,
        elapsed_ms: elapsed,
        destination: preInfo,
        sql_bytes: sql.length,
        message: 'Migração executada com sucesso no destino',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const err = e as Error & { code?: string; position?: string; detail?: string };
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
        code: err.code,
        position: err.position,
        detail: err.detail,
        elapsed_ms: Date.now() - started,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } finally {
    if (sqlClient) {
      try { await sqlClient.end({ timeout: 5 }); } catch { /* noop */ }
    }
  }
});
