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

    // Bootstrap idempotente do exec_sql ANTES do payload (evita PGRST202 no destino).
    const bootstrapExecSql = `
CREATE OR REPLACE FUNCTION public.exec_sql(sql_query text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'information_schema', 'auth', 'storage'
AS $fn$
DECLARE result json; caller_role text; clean_query text;
BEGIN
  caller_role := current_setting('request.jwt.claims', true)::json->>'role';
  IF caller_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Acesso negado: apenas service_role pode executar esta função.';
  END IF;
  clean_query := rtrim(sql_query, '; ');
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || clean_query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$fn$;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
`;
    await sqlClient.unsafe(bootstrapExecSql);

    // Executa o migrations.sql inteiro
    await sqlClient.unsafe(sql);

    // Força PostgREST a recarregar o schema cache no destino
    await sqlClient.unsafe(`NOTIFY pgrst, 'reload schema';`);

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
