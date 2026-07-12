const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const IGNORE_KEYS = new Set([
  'PATH', 'HOME', 'HOSTNAME', 'PORT', 'USER', 'LANG', 'TERM',
  'TMPDIR', 'DENO_DIR', 'DENO_REGION', 'DENO_DEPLOYMENT_ID', '_',
  'PWD', 'SHELL', 'SHLVL', 'OLDPWD',
]);

const KNOWN_FUNCTION_NAMES = [
  'generate-article','news-agent','generate-authority-plan','generate-authority-plan-stream',
  'publish-to-wordpress','regenerate-content','test-wordpress-connection','wordpress-api',
  'articles-api','webhooks','ai-api','generate-landing-page','rewrite-news','parse-rss',
  'execute-news-agents','generate-secondary-keywords','analyze-url-content','monitor-portals',
  'auto-process-rss','seo-agent','ai-chat','analyze-seo-advanced','analyze-file',
  'generate-electoral-content','generate-image','generate-content-variations',
  'auto-fix-orphans','auto-publish-article','analyze-wp-articles','sync-wordpress-stats',
  'validate-ai-key','migrate-sql','painel-migracao',
];

function filterSecrets(env: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (IGNORE_KEYS.has(k)) continue;
    if (k.startsWith('XDG_')) continue;
    out[k] = v;
  }
  return out;
}

async function discoverEdgeFunctions(supabaseUrl: string): Promise<string[]> {
  const results = await Promise.allSettled(
    KNOWN_FUNCTION_NAMES.map(async (name) => {
      const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: 'OPTIONS',
      });
      if (res.status < 500) return name;
      throw new Error('not found');
    }),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map((r) => r.value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const allEnv = Deno.env.toObject();
    const secrets = filterSecrets(allEnv);

    const edgeFunctions = await discoverEdgeFunctions(supabaseUrl);

    // Query DB stats via exec_sql
    let tables: Array<Record<string, unknown>> = [];
    try {
      const sqlQuery = `
        SELECT
          t.table_name,
          (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.table_name) AS columns_count,
          (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.table_name AND c.column_name='user_id') > 0 AS has_user_id,
          (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.table_name AND c.column_name ILIKE '%encrypted%') AS encrypted_columns,
          (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM public.%I', t.table_name), false, true, '')))[1]::text::bigint AS row_count
        FROM information_schema.tables t
        WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
        ORDER BY t.table_name
      `;
      const r = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ sql_query: sqlQuery }),
      });
      if (r.ok) {
        const data = await r.json();
        tables = Array.isArray(data) ? data : [];
      }
    } catch (_) {
      tables = [];
    }

    const payload = {
      credentials: {
        project_url: supabaseUrl,
        anon_key: anonKey,
        service_role_key: serviceRoleKey,
      },
      secrets,
      edge_functions: edgeFunctions,
      edge_functions_count: edgeFunctions.length,
      database: {
        tables,
        tables_count: tables.length,
      },
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
