import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Input = {
  action?: "get-categories" | "categories" | "test" | "publish";
  projectId?: string;
  articleId?: string;
  perPage?: number;
  categories?: Array<number | string>;
  allowCrossProject?: boolean;
  publishStatus?: "draft" | "publish";
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function normalizeBase(input: string) {
  let value = String(input || "").trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/wp-json(?:\/.*)?$/i, "").replace(/\/$/, "");
  return `${url.origin}${url.pathname}`.replace(/\/$/, "");
}

async function readBody(response: Response) {
  const text = await response.text();
  try { return { text, data: JSON.parse(text) as any }; } catch { return { text, data: null as any }; }
}

async function fetchCategories(baseUrl: string, perPage: number) {
  const limit = Math.max(1, Math.min(100, Number(perPage || 100)));
  const candidates = [
    `${baseUrl}/wp-json/wp/v2/categories?per_page=${limit}&hide_empty=false&orderby=name&order=asc`,
    `${baseUrl}/?rest_route=/wp/v2/categories&per_page=${limit}&hide_empty=false&orderby=name&order=asc`,
  ];
  let lastError = "Categorias do WordPress indisponíveis";
  let lastStatus = 502;
  for (const endpoint of candidates) {
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json", "User-Agent": "Zica.ai/3.10.2" },
        signal: AbortSignal.timeout(12000),
      });
      lastStatus = response.status;
      const { text, data } = await readBody(response);
      if (response.ok && Array.isArray(data)) {
        return data.map((item: any) => ({
          id: Number(item.id),
          name: String(item.name || ""),
          slug: String(item.slug || ""),
          count: Number(item.count || 0),
        })).filter((item: any) => Number.isFinite(item.id) && item.id > 0 && item.name);
      }
      if (data && typeof data === "object") lastError = String(data.message || data.error || `WordPress HTTP ${response.status}`);
      else if (text.trim().startsWith("<")) lastError = `O WordPress respondeu HTML em vez da API REST (HTTP ${response.status})`;
      else lastError = `WordPress HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error && error.name === "TimeoutError" ? "Timeout ao consultar categorias do WordPress" : error instanceof Error ? error.message : lastError;
    }
  }
  throw Object.assign(new Error(lastError), { status: lastStatus });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();

  try {
    const input = await req.json().catch(() => ({})) as Input;
    if (!input.action) return json({ success: false, error: "action é obrigatório", request_id: requestId }, 400);
    if (!input.projectId) return json({ success: false, error: "projectId é obrigatório", request_id: requestId }, 400);

    const actor = await resolveRequestActor(req);
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id,user_id,name,domain,wordpress_url,is_connected,wordpress_connector_mode")
      .eq("id", input.projectId)
      .eq("user_id", actor.userId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project?.wordpress_url) return json({ success: false, error: "Projeto WordPress não encontrado ou sem URL configurada", request_id: requestId }, 404);
    const baseUrl = normalizeBase(String(project.wordpress_url));

    if (input.action === "get-categories" || input.action === "categories") {
      const categories = await fetchCategories(baseUrl, Number(input.perPage || 100));
      return json({ success: true, data: categories, projectId: project.id, projectName: project.name, connectorMode: project.wordpress_connector_mode || null, request_id: requestId });
    }

    if (input.action === "test") {
      const response = await fetch(`${supabaseUrl}/functions/v1/test-wordpress-connection`, {
        method: "POST",
        headers: {
          Authorization: req.headers.get("Authorization") || "",
          apikey: req.headers.get("apikey") || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ project_id: project.id }),
        signal: AbortSignal.timeout(20000),
      });
      const { data } = await readBody(response);
      return json(data || { success: false, error: `Teste WordPress HTTP ${response.status}` }, response.status);
    }

    if (input.action === "publish") {
      if (!input.articleId) return json({ success: false, error: "articleId é obrigatório para publicação", request_id: requestId }, 400);
      const response = await fetch(`${supabaseUrl}/functions/v1/publish-to-wordpress`, {
        method: "POST",
        headers: {
          Authorization: req.headers.get("Authorization") || "",
          apikey: req.headers.get("apikey") || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          articleId: input.articleId,
          projectId: project.id,
          publishStatus: input.publishStatus || "publish",
          allowCrossProject: input.allowCrossProject === true,
          categories: input.categories || [],
        }),
        signal: AbortSignal.timeout(90000),
      });
      const { data } = await readBody(response);
      return json(data || { success: false, error: `Publicação WordPress HTTP ${response.status}` }, response.status);
    }

    return json({ success: false, error: "Ação não suportada", request_id: requestId }, 400);
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ success: false, error: error.message, code: error.code, request_id: requestId }, error.status);
    const status = Number((error as any)?.status || 502);
    return json({ success: false, error: error instanceof Error ? error.message : "Falha na API WordPress", request_id: requestId }, status >= 400 && status < 600 ? status : 502);
  }
});
