import { createLogger, createRequestId } from "../_shared/logger.ts";
import {
  PLUGIN_API_NAMESPACE,
  PLUGIN_MINIMUM_VERSION,
  PLUGIN_NAME,
  PLUGIN_SOFTWARE_ID,
} from "../_shared/plugin-version.ts";

const FUNCTION_NAME = "test-wordpress-connection";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TestConnectionRequest {
  wordpress_url: string;
  wordpress_username?: string;
  wordpress_app_password?: string;
  use_plugin?: boolean;
  api_key?: string;
}

type PluginContract = { namespace: string; header: string; id: string };
const pluginContracts: PluginContract[] = [
  { namespace: PLUGIN_API_NAMESPACE, header: "X-ZICA-POSTS-Key", id: "zica-posts" },
  { namespace: "zica-ai/v1", header: "X-ZICA-AI-API-Key", id: "zica-ai" },
  { namespace: "cfrdm/v1", header: "X-CFRDM-API-Key", id: "legacy-cfrdm" },
];
const commonWpSubpaths = ["", "/blog", "/wordpress", "/wp", "/site", "/news", "/artigos", "/noticias"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number(part) || 0);
  const pb = b.split(".").map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

function normalizeAndValidateUrl(input: string): URL {
  let value = input.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use uma URL HTTP/HTTPS válida.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const forbidden = host === "localhost" || host === "::1" || host.endsWith(".local") || host.endsWith(".internal") || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^0\./.test(host);
  if (forbidden) throw new Error("Endereços locais ou de rede privada não são aceitos.");
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/wp-json(?:\/.*)?$/i, "").replace(/\/$/, "");
  return url;
}

async function isWordPressAt(baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl}/wp-json/`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    return response.ok && (response.headers.get("content-type") || "").includes("application/json");
  } catch { return false; }
}

async function discoverWordPress(baseUrl: string) {
  for (const subpath of commonWpSubpaths) {
    const candidate = `${baseUrl}${subpath}`.replace(/\/$/, "");
    if (await isWordPressAt(candidate)) return { baseUrl: candidate, subpath, found: true };
  }
  return { baseUrl, subpath: "", found: false };
}

async function readJson(response: Response): Promise<Record<string, any> | null> {
  if (!(response.headers.get("content-type") || "").includes("application/json")) return null;
  try { return await response.json(); } catch { return null; }
}

async function tryPlugin(baseUrl: string, apiKey: string, log: ReturnType<typeof createLogger>) {
  for (const contract of pluginContracts) {
    try {
      const versionResponse = await fetch(`${baseUrl}/wp-json/${contract.namespace}/version`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      const versionData = await readJson(versionResponse);
      if (!versionResponse.ok || !versionData) continue;
      const testResponse = await fetch(`${baseUrl}/wp-json/${contract.namespace}/test`, { headers: { Accept: "application/json", [contract.header]: apiKey }, signal: AbortSignal.timeout(12000) });
      const testData = await readJson(testResponse);
      if (!testResponse.ok || !testData?.success) {
        if (testResponse.status === 401 || testResponse.status === 403) return { success: false, authFailure: true, contract, versionData, testData };
        continue;
      }
      const version = String(versionData.version || testData.version || testData.site?.version || "0.0.0");
      const outdated = compareVersions(version, PLUGIN_MINIMUM_VERSION) < 0;
      log.info("plugin_connection_success", { contract: contract.id, namespace: contract.namespace, version, outdated });
      return { success: true, contract, versionData, testData, version, outdated };
    } catch (error) {
      log.info("plugin_contract_failed", { contract: contract.id, error: error instanceof Error ? error.message : "unknown" });
    }
  }
  return { success: false, authFailure: false };
}

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const started = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    log.requestStart(req.method);
    const body = await req.json() as TestConnectionRequest;
    if (!body.wordpress_url) return json({ success: false, error: "URL do WordPress não fornecida" }, 400);

    const normalized = normalizeAndValidateUrl(body.wordpress_url);
    const originPlusPath = `${normalized.origin}${normalized.pathname}`.replace(/\/$/, "");
    const discovery = await discoverWordPress(originPlusPath);
    const baseUrl = discovery.baseUrl;

    if (body.use_plugin && body.api_key) {
      const result = await tryPlugin(baseUrl, body.api_key, log);
      if (result.success) {
        log.requestEnd(200, Date.now() - started);
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
          site: result.testData?.site,
          canPublish: true,
          discoveredPath: discovery.subpath || null,
          correctedUrl: baseUrl,
          features: result.versionData?.features || {},
          updateMessage: result.outdated ? `Atualize o conector para ${PLUGIN_NAME} v${PLUGIN_MINIMUM_VERSION} ou superior.` : null,
        });
      }
      if (result.authFailure) {
        log.requestEnd(200, Date.now() - started);
        return json({ success: false, error: "API Key inválida para o plugin encontrado.", hint: "Copie novamente a API Key no painel Zica Posts do WordPress." });
      }
      log.requestEnd(200, Date.now() - started);
      return json({ success: false, error: `${PLUGIN_NAME} não encontrado ou não ativado.`, hint: `Instale o Zica Posts v${PLUGIN_MINIMUM_VERSION}. Aliases zica-ai/v1 e cfrdm/v1 continuam reconhecidos durante a migração.`, discoveredPath: discovery.subpath || null });
    }

    if (!body.wordpress_username || !body.wordpress_app_password) return json({ success: false, error: "Credenciais não fornecidas" }, 400);

    const auth = btoa(`${body.wordpress_username}:${body.wordpress_app_password}`);
    const postsResponse = await fetch(`${baseUrl}/wp-json/wp/v2/posts?per_page=1&context=edit`, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    const postsData = await readJson(postsResponse);
    if (!postsResponse.ok || !postsData) {
      const status = postsResponse.status;
      const error = status === 401 ? "Autenticação falhou." : status === 403 ? "Usuário sem permissão de publicação." : status === 404 ? "REST API do WordPress não encontrada." : `WordPress respondeu HTTP ${status}.`;
      log.requestEnd(200, Date.now() - started);
      return json({ success: false, error, status, discoveredPath: discovery.subpath || null, hint: "Use uma Senha de Aplicação do WordPress ou prefira o Zica Posts 3.10.0." });
    }

    let user: Record<string, any> | null = null;
    try {
      const userResponse = await fetch(`${baseUrl}/wp-json/wp/v2/users/me?context=edit`, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      user = await readJson(userResponse);
    } catch { /* optional */ }

    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const canPublish = Boolean(user?.capabilities?.publish_posts || roles.some((role: string) => ["administrator", "editor", "author"].includes(role)));
    log.requestEnd(200, Date.now() - started);
    return json({ success: true, message: "Conexão WordPress via Application Password estabelecida", canPublish, user: user ? { name: user.name, roles } : null, discoveredPath: discovery.subpath || null, correctedUrl: baseUrl, mode: "application_password" });
  } catch (error) {
    log.error("connection_test_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(400, Date.now() - started);
    return json({ success: false, error: error instanceof Error ? error.message : "Não foi possível conectar ao WordPress." }, 400);
  }
});
