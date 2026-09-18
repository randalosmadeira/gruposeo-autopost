import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";
import { loadProjectForUser, ProjectAccessError } from "../_shared/project-access.ts";
import { isPluginModeProject, pluginRequest, resolvePluginKey, resolvePluginNamespace } from "../_shared/wordpress-plugin-client.ts";

// Bloco H (backend half) — thin authenticated proxy in front of the
// plugin's own `GET /ai-audit` (Bloco E's `run_audit()`, exposed via REST so
// the SaaS dashboard can pull the report remotely). No business logic here
// beyond resolving the project's credential and checking ownership — the
// scoring/checks all live in the plugin.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = { projectId?: string; userId?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({})) as Body;
    const projectId = String(body.projectId || "").trim();
    if (!projectId) return json({ success: false, error: "projectId é obrigatório", request_id: requestId }, 400);

    const actor = await resolveRequestActor(req, body.userId);
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    let project: Record<string, any>;
    try {
      project = await loadProjectForUser(admin, projectId, actor.userId);
    } catch (accessError) {
      if (accessError instanceof ProjectAccessError) {
        return json({ success: false, error: accessError.message, code: accessError.code, request_id: requestId }, accessError.status);
      }
      throw accessError;
    }

    if (!project.wordpress_url) {
      return json({ success: false, error: "Projeto sem conexão WordPress configurada", code: "wordpress_not_configured", request_id: requestId }, 400);
    }
    if (!isPluginModeProject(project)) {
      return json({
        success: false,
        error: "Projeto não usa o plugin Zica Posts — o Auditor de IA exige o conector zica_posts",
        code: "plugin_not_configured",
        request_id: requestId,
      }, 400);
    }

    const credential = await resolvePluginKey(admin, project);
    const baseUrl = String(project.wordpress_url).replace(/\/+$/, "");
    const namespace = resolvePluginNamespace(project);

    const result = await pluginRequest(baseUrl, credential.apiKey, "ai-audit", {
      method: "GET",
      signal: AbortSignal.timeout(30000),
    }, namespace);

    if (!result.data?.success) {
      return json({
        success: false,
        error: String(result.data?.message || result.data?.error || "Auditor de IA recusado pelo plugin"),
        request_id: requestId,
      }, 502);
    }

    return json({
      success: true,
      score: result.data.score,
      checks: result.data.checks,
      generated_at: result.data.generated_at,
      projectId: project.id,
      request_id: requestId,
    });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return json({ success: false, error: error.message, code: error.code, request_id: requestId }, error.status);
    }
    return json({ success: false, error: error instanceof Error ? error.message : "Falha ao executar o Auditor de IA", request_id: requestId }, 502);
  }
});
