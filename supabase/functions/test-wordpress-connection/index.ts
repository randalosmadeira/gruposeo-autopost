import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { PLUGIN_API_NAMESPACE, PLUGIN_MINIMUM_VERSION, PLUGIN_NAME, PLUGIN_SOFTWARE_ID } from "../_shared/plugin-version.ts";

const FUNCTION_NAME = "test-wordpress-connection";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Body = { project_id?: string; wordpress_url?: string; wordpress_username?: string; wordpress_app_password?: string; use_plugin?: boolean; api_key?: string };
type Contract = { namespace: string; header: string; id: string };
const contracts: Contract[] = [
  { namespace: PLUGIN_API_NAMESPACE, header: "X-ZICA-POSTS-Key", id: "zica-posts" },
  { namespace: "zica-ai/v1", header: "X-ZICA-AI-API-Key", id: "zica-ai" },
  { namespace: "cfrdm/v1", header: "X-CFRDM-API-Key", id: "legacy-cfrdm" },
];
const subpaths = ["", "/blog", "/wordpress", "/wp", "/site", "/news", "/artigos", "/noticias"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function compareVersions(a: string, b: string) {
  const aa = a.split(".").map(Number), bb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if ((aa[i] || 0) < (bb[i] || 0)) return -1;
    if ((aa[i] || 0) > (bb[i] || 0)) return 1;
  }
  return 0;
}

function normalizeUrl(input: string) {
  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use uma URL HTTP/HTTPS válida.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const blocked = host === "localhost" || host === "::1" || host.endsWith(".local") || host.endsWith(".internal") || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^0\./.test(host);
  if (blocked) throw new Error("Endereços locais ou de rede privada não são aceitos.");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/wp-json(?:\/.*)?$/i, "").replace(/\/$/, "");
  return `${url.origin}${url.pathname}`.replace(/\/$/, "");
}

async function readJson(res: Response): Promise<Record<string, any> | null> {
  if (!(res.headers.get("content-type") || "").includes("application/json")) return null;
  try { return await res.json(); } catch { return null; }
}

function restRootCandidates(candidate: string) {
  const base = candidate.replace(/\/$/, "");
  return [`${base}/wp-json/`, `${base}/?rest_route=/`];
}

function pluginRouteCandidates(baseUrl: string, namespace: string, path: string) {
  const base = baseUrl.replace(/\/$/, "");
  return [
    { url: `${base}/wp-json/${namespace}/${path}`, mode: "wp_json" },
    { url: `${base}/?rest_route=/${namespace}/${path}`, mode: "rest_route" },
  ];
}

async function discover(base: string) {
  for (const path of subpaths) {
    const candidate = `${base}${path}`.replace(/\/$/, "");
    for (const endpoint of restRootCandidates(candidate)) {
      try {
        const res = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
        if (res.ok && (res.headers.get("content-type") || "").includes("application/json")) {
          return { baseUrl: candidate, subpath: path, found: true, endpointMode: endpoint.includes("rest_route=") ? "rest_route" : "wp_json" };
        }
      } catch { /* continue */ }
    }
  }
  return { baseUrl: base, subpath: "", found: false, endpointMode: null as string | null };
}

async function fetchPluginRoute(baseUrl: string, contract: Contract, path: string, apiKey?: string) {
  let last: { response: Response; data: Record<string, any> | null; mode: string } | null = null;
  for (const candidate of pluginRouteCandidates(baseUrl, contract.namespace, path)) {
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (apiKey) headers[contract.header] = apiKey;
      const response = await fetch(candidate.url, { headers, signal: AbortSignal.timeout(path === "test" ? 12000 : 8000) });
      const data = await readJson(response);
      last = { response, data, mode: candidate.mode };
      if (data) return last;
    } catch { /* try fallback */ }
  }
  return last;
}

async function tryPlugin(baseUrl: string, apiKey: string, log: ReturnType<typeof createLogger>) {
  for (const contract of contracts) {
    try {
      const versionResult = await fetchPluginRoute(baseUrl, contract, "version");
      if (!versionResult?.response.ok || !versionResult.data) continue;
      const testResult = await fetchPluginRoute(baseUrl, contract, "test", apiKey);
      if (!testResult?.response.ok || !testResult.data?.success) {
        if (testResult && (testResult.response.status === 401 || testResult.response.status === 403)) return { success: false, authFailure: true, contract, versionData: versionResult.data, testData: testResult.data };
        continue;
      }
      const version = String(versionResult.data.version || testResult.data.version || testResult.data.site?.version || "0.0.0");
      const outdated = compareVersions(version, PLUGIN_MINIMUM_VERSION) < 0;
      log.info("plugin_connection_success", { contract: contract.id, version, outdated, endpointMode: testResult.mode });
      return { success: true, contract, versionData: versionResult.data, testData: testResult.data, version, outdated, endpointMode: testResult.mode };
    } catch (e) {
      log.info("plugin_contract_failed", { contract: contract.id, error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return { success: false, authFailure: false };
}

async function resolveProjectBody(req: Request, body: Body) {
  if (!body.project_id) return { body, projectId: null as string | null, userId: null as string | null, admin: null as any };
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("unauthorized");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("backend_not_configured");

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser(authHeader.slice(7));
  if (userError || !user) throw new Error("unauthorized");
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id,user_id,wordpress_url,wordpress_username,wordpress_app_password,wordpress_connector_mode,wordpress_credential_ref")
    .eq("id", body.project_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (projectError || !project) throw new Error("project_not_found");

  const resolved: Body = { project_id: body.project_id, wordpress_url: String(project.wordpress_url || "") };
  if (String(project.wordpress_connector_mode) === "zica_posts") {
    const ref = String(project.wordpress_credential_ref || "").trim();
    if (!ref) throw new Error("credential_ref_missing");
    const { data: secret, error: secretError } = await admin.rpc("get_zica_wordpress_credential", { p_ref: ref });
    if (secretError || !secret) throw new Error("credential_unavailable");
    resolved.use_plugin = true;
    resolved.api_key = String(secret);
  } else {
    resolved.wordpress_username = String(project.wordpress_username || "");
    resolved.wordpress_app_password = String(project.wordpress_app_password || "");
  }
  return { body: resolved, projectId: String(project.id), userId: user.id, admin };
}

Deno.serve(async (req) => {
  const started = Date.now();
  const log = createLogger(FUNCTION_NAME, createRequestId());
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    log.requestStart(req.method);
    const incoming = await req.json() as Body;
    const resolved = await resolveProjectBody(req, incoming);
    const body = resolved.body;
    if (!body.wordpress_url) return json({ success: false, error: "URL do WordPress não fornecida" }, 400);
    const discovery = await discover(normalizeUrl(body.wordpress_url));
    const baseUrl = discovery.baseUrl;

    if (body.use_plugin && body.api_key) {
      const result = await tryPlugin(baseUrl, body.api_key, log);
      log.requestEnd(200, Date.now() - started);
      if (result.success) {
        if (resolved.projectId && resolved.admin && resolved.userId) {
          const now = new Date().toISOString();
          await resolved.admin.from("projects").update({
            is_connected: true,
            wordpress_url: baseUrl,
            wordpress_connector_mode: "zica_posts",
            wordpress_plugin_namespace: result.contract?.namespace || PLUGIN_API_NAMESPACE,
            wordpress_plugin_version: result.version,
            wordpress_connected_at: now,
            wordpress_last_verified_at: now,
            updated_at: now,
          }).eq("id", resolved.projectId).eq("user_id", resolved.userId);
        }
        return json({
          success: true,
          message: `Conexão via ${PLUGIN_NAME} estabelecida`,
          softwareId: result.versionData?.software_id || PLUGIN_SOFTWARE_ID,
          pluginVersion: result.version,
          minimumVersion: PLUGIN_MINIMUM_VERSION,
          isOutdated: result.outdated,
          updateRequired: result.outdated,
          namespace: result.contract?.namespace,
          contract: result.contract?.id,
          endpointMode: result.endpointMode,
          site: result.testData?.site,
          canPublish: true,
          discoveredPath: discovery.subpath || null,
          correctedUrl: baseUrl,
          projectId: resolved.projectId,
          credentialSource: resolved.projectId ? "vault" : "request",
          features: result.versionData?.features || {},
          updateMessage: result.outdated ? `Atualize o conector para ${PLUGIN_NAME} v${PLUGIN_MINIMUM_VERSION} ou superior.` : null,
        });
      }
      if (result.authFailure) return json({ success: false, error: "API Key inválida para o plugin encontrado.", hint: "Gere/registre uma nova API Key no painel Zica Posts do WordPress." });
      return json({ success: false, error: `${PLUGIN_NAME} não encontrado ou não ativado.`, hint: `Instale o Zica Posts v${PLUGIN_MINIMUM_VERSION}.`, discoveredPath: discovery.subpath || null });
    }

    if (!body.wordpress_username || !body.wordpress_app_password) return json({ success: false, error: "Credenciais não fornecidas" }, 400);
    const auth = btoa(`${body.wordpress_username}:${body.wordpress_app_password}`);
    const wpCandidates = [
      `${baseUrl}/wp-json/wp/v2/posts?per_page=1&context=edit`,
      `${baseUrl}/?rest_route=/wp/v2/posts&per_page=1&context=edit`,
    ];
    let pr: Response | null = null;
    let pdata: Record<string, any> | null = null;
    for (const endpoint of wpCandidates) {
      const response = await fetch(endpoint, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      const data = await readJson(response);
      if (data) { pr = response; pdata = data; break; }
    }
    if (!pr?.ok || !pdata) {
      const status = pr?.status || 502;
      const error = status === 401 ? "Autenticação falhou." : status === 403 ? "Usuário sem permissão de publicação." : status === 404 ? "REST API do WordPress não encontrada." : `WordPress respondeu HTTP ${status}.`;
      log.requestEnd(200, Date.now() - started);
      return json({ success: false, error, status, hint: `Use uma Senha de Aplicação do WordPress ou prefira o Zica Posts ${PLUGIN_MINIMUM_VERSION}.`, discoveredPath: discovery.subpath || null });
    }

    log.requestEnd(200, Date.now() - started);
    return json({ success: true, message: "Conexão WordPress via Application Password estabelecida", canPublish: true, correctedUrl: baseUrl, mode: "application_password", projectId: resolved.projectId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Não foi possível conectar ao WordPress.";
    log.error("connection_test_error", { error: message });
    log.requestEnd(message === "unauthorized" ? 401 : 400, Date.now() - started);
    return json({ success: false, error: message }, message === "unauthorized" ? 401 : 400);
  }
});