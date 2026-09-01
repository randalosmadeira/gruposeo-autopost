import { createLogger, createRequestId } from "../_shared/logger.ts";
import { PLUGIN_API_NAMESPACE, PLUGIN_MINIMUM_VERSION, PLUGIN_NAME, PLUGIN_SOFTWARE_ID } from "../_shared/plugin-version.ts";

const FUNCTION_NAME = "test-wordpress-connection";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Body = { wordpress_url: string; wordpress_username?: string; wordpress_app_password?: string; use_plugin?: boolean; api_key?: string };
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

async function discover(base: string) {
  for (const path of subpaths) {
    const candidate = `${base}${path}`.replace(/\/$/, "");
    try {
      const res = await fetch(`${candidate}/wp-json/`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (res.ok && (res.headers.get("content-type") || "").includes("application/json")) return { baseUrl: candidate, subpath: path, found: true };
    } catch { /* continue */ }
  }
  return { baseUrl: base, subpath: "", found: false };
}

async function tryPlugin(baseUrl: string, apiKey: string, log: ReturnType<typeof createLogger>) {
  for (const contract of contracts) {
    try {
      const vr = await fetch(`${baseUrl}/wp-json/${contract.namespace}/version`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      const versionData = await readJson(vr);
      if (!vr.ok || !versionData) continue;
      const tr = await fetch(`${baseUrl}/wp-json/${contract.namespace}/test`, { headers: { Accept: "application/json", [contract.header]: apiKey }, signal: AbortSignal.timeout(12000) });
      const testData = await readJson(tr);
      if (!tr.ok || !testData?.success) {
        if (tr.status === 401 || tr.status === 403) return { success: false, authFailure: true, contract, versionData, testData };
        continue;
      }
      const version = String(versionData.version || testData.version || testData.site?.version || "0.0.0");
      const outdated = compareVersions(version, PLUGIN_MINIMUM_VERSION) < 0;
      log.info("plugin_connection_success", { contract: contract.id, version, outdated });
      return { success: true, contract, versionData, testData, version, outdated };
    } catch (e) {
      log.info("plugin_contract_failed", { contract: contract.id, error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return { success: false, authFailure: false };
}

Deno.serve(async (req) => {
  const started = Date.now();
  const log = createLogger(FUNCTION_NAME, createRequestId());
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    log.requestStart(req.method);
    const body = await req.json() as Body;
    if (!body.wordpress_url) return json({ success: false, error: "URL do WordPress não fornecida" }, 400);
    const discovery = await discover(normalizeUrl(body.wordpress_url));
    const baseUrl = discovery.baseUrl;

    if (body.use_plugin && body.api_key) {
      const result = await tryPlugin(baseUrl, body.api_key, log);
      log.requestEnd(200, Date.now() - started);
      if (result.success) return json({
        success: true,
        message: `Conexão via ${PLUGIN_NAME} estabelecida`,
        softwareId: result.versionData?.software_id || PLUGIN_SOFTWARE_ID,
        pluginVersion: result.version,
        minimumVersion: PLUGIN_MINIMUM_VERSION,
        isOutdated: result.outdated,
        updateRequired: result.outdated,
        namespace: result.contract?.namespace,
        contract: result.contract?.id,
        site: result.testData?.site,
        canPublish: true,
        discoveredPath: discovery.subpath || null,
        correctedUrl: baseUrl,
        features: result.versionData?.features || {},
        updateMessage: result.outdated ? `Atualize o conector para ${PLUGIN_NAME} v${PLUGIN_MINIMUM_VERSION} ou superior.` : null,
      });
      if (result.authFailure) return json({ success: false, error: "API Key inválida para o plugin encontrado.", hint: "Copie novamente a API Key no painel Zica Posts do WordPress." });
      return json({ success: false, error: `${PLUGIN_NAME} não encontrado ou não ativado.`, hint: `Instale o Zica Posts v${PLUGIN_MINIMUM_VERSION}.`, discoveredPath: discovery.subpath || null });
    }

    if (!body.wordpress_username || !body.wordpress_app_password) return json({ success: false, error: "Credenciais não fornecidas" }, 400);
    const auth = btoa(`${body.wordpress_username}:${body.wordpress_app_password}`);
    const pr = await fetch(`${baseUrl}/wp-json/wp/v2/posts?per_page=1&context=edit`, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    const pdata = await readJson(pr);
    if (!pr.ok || !pdata) {
      const status = pr.status;
      const error = status === 401 ? "Autenticação falhou." : status === 403 ? "Usuário sem permissão de publicação." : status === 404 ? "REST API do WordPress não encontrada." : `WordPress respondeu HTTP ${status}.`;
      log.requestEnd(200, Date.now() - started);
      return json({ success: false, error, status, hint: `Use uma Senha de Aplicação do WordPress ou prefira o Zica Posts ${PLUGIN_MINIMUM_VERSION}.`, discoveredPath: discovery.subpath || null });
    }

    let user: Record<string, any> | null = null;
    try {
      const ur = await fetch(`${baseUrl}/wp-json/wp/v2/users/me?context=edit`, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      user = await readJson(ur);
    } catch { /* optional */ }
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const canPublish = Boolean(user?.capabilities?.publish_posts || roles.some((r: string) => ["administrator", "editor", "author"].includes(r)));
    log.requestEnd(200, Date.now() - started);
    return json({ success: true, message: "Conexão WordPress via Application Password estabelecida", canPublish, user: user ? { name: user.name, roles } : null, correctedUrl: baseUrl, mode: "application_password" });
  } catch (e) {
    log.error("connection_test_error", { error: e instanceof Error ? e.message : "unknown" });
    log.requestEnd(400, Date.now() - started);
    return json({ success: false, error: e instanceof Error ? e.message : "Não foi possível conectar ao WordPress." }, 400);
  }
});
