/**
 * Shared client for the `zica-posts` WordPress plugin REST namespace
 * (`/wp-json/zica-posts/v1/...`).
 *
 * This lived unexported inside `publish-to-wordpress/index.ts` until
 * 2026-09-18. It was extracted here so the newer AIO/GEO backend functions
 * (`sync-homepage-schema`, `ai-geo-audit-proxy`, and
 * `_shared/hreflang-sync.ts` used by `manage-article-translation`) reuse the
 * exact same request/auth pattern instead of re-implementing it — same
 * dual `wp_json`/`rest_route` endpoint fallback, same `X-ZICA-POSTS-Key`
 * header, same credential resolution (Vault ref first, legacy project field
 * as fallback).
 */
import { PLUGIN_API_NAMESPACE } from "./plugin-version.ts";

/**
 * Thrown by `pluginRequest` when every endpoint candidate fails. Carries the
 * last HTTP status/code seen so callers can distinguish e.g. a 404 (plugin
 * route not found / resource not found on this site — often expected, see
 * `_shared/hreflang-sync.ts`) from a real failure, without parsing
 * `error.message` text.
 */
export class PluginRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "PluginRequestError";
    this.status = status;
    this.code = code;
  }
}

export function endpointCandidates(baseUrl: string, path: string, namespace: string = PLUGIN_API_NAMESPACE) {
  const base = baseUrl.replace(/\/$/, "");
  const clean = path.replace(/^\/+/, "");
  return [`${base}/wp-json/${namespace}/${clean}`, `${base}/?rest_route=/${namespace}/${clean}`];
}

export async function pluginRequest(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit,
  namespace: string = PLUGIN_API_NAMESPACE,
): Promise<{ data: Record<string, any>; endpointMode: "rest_route" | "wp_json" }> {
  let lastError = "Zica Posts WordPress indisponível";
  let lastStatus = 502;
  let lastCode: string | undefined;
  for (const endpoint of endpointCandidates(baseUrl, path, namespace)) {
    try {
      const response = await fetch(endpoint, {
        ...init,
        headers: { ...(init.headers || {}), "X-ZICA-POSTS-Key": apiKey, Accept: "application/json" },
      });
      const text = await response.text();
      let data: Record<string, any> | null = null;
      try { data = JSON.parse(text); } catch { /* WordPress may return HTML on routing failures. */ }
      if (response.ok && data) return { data, endpointMode: endpoint.includes("rest_route=") ? "rest_route" : "wp_json" };
      if (response.status === 401 || response.status === 403) {
        throw new PluginRequestError("API Key Zica Posts recusada", response.status, data?.code ? String(data.code) : "invalid_api_key");
      }
      lastStatus = response.status;
      lastCode = data?.code ? String(data.code) : undefined;
      lastError = String(data?.message || data?.error || (text.trim().startsWith("<") ? `WordPress retornou HTML (HTTP ${response.status})` : `HTTP ${response.status}`));
    } catch (error) {
      if (error instanceof PluginRequestError) throw error;
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new PluginRequestError(lastError, lastStatus, lastCode);
}

export async function resolvePluginKey(admin: any, project: Record<string, any>) {
  const ref = String(project.wordpress_credential_ref || "").trim();
  if (ref) {
    const { data, error } = await admin.rpc("get_zica_wordpress_credential", { p_ref: ref });
    if (error || !data) throw new Error("Credencial WordPress do Vault indisponível");
    return { apiKey: String(data), source: "vault" as const };
  }
  const legacy = String(project.wordpress_app_password || "").trim();
  if (!legacy) throw new Error("Credencial WordPress não configurada");
  return { apiKey: legacy, source: "legacy-project-field" as const };
}

/** Same "is this project on the zica-posts plugin connector" check used across publish/test/sync functions. */
export function isPluginModeProject(project: Record<string, any>): boolean {
  return String(project?.wordpress_connector_mode) === "zica_posts" || String(project?.wordpress_username) === "__ZICA_POSTS_PLUGIN__";
}

export function resolvePluginNamespace(project: Record<string, any>): string {
  return String(project?.wordpress_plugin_namespace || PLUGIN_API_NAMESPACE);
}
