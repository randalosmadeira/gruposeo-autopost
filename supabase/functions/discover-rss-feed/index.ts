import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";
import { discoverFeed, isSafePublicHttpUrl } from "../_shared/rss-discovery.ts";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Input = {
  siteUrl?: string;
  directCandidate?: string | null;
  projectId?: string | null;
  articleId?: string | null;
  portalId?: string | null;
  userId?: string;
  persist?: boolean;
};

const J = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...H, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

function validationPayload(discovery: any) {
  return {
    url: discovery.url,
    site_url: discovery.site_url,
    format: discovery.format,
    http_status: discovery.status,
    content_type: discovery.content_type,
    content_type_valid: discovery.content_type_valid,
    structure_valid: discovery.structure_valid,
    bytes: discovery.bytes,
    discovery_method: discovery.discovery_method,
    attempted: discovery.attempted,
    validated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: H });
  if (req.method !== "POST") return J({ success: false, error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID();
  try {
    const input = await req.json().catch(() => ({})) as Input;
    const actor = await resolveRequestActor(req, input.userId);
    const userId = actor.userId;
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "");
    if (!supabaseUrl || !serviceKey) return J({ success: false, error: "Backend incompleto", request_id: requestId }, 500);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let projectId = input.projectId || null;
    let siteUrl = String(input.siteUrl || "").trim();

    if (input.articleId) {
      const { data: article, error } = await admin.from("articles")
        .select("id,user_id,project_id,published_url,source_canonical_url,rss_feed_url")
        .eq("id", input.articleId).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!article) return J({ success: false, error: "Artigo não encontrado", request_id: requestId }, 404);
      projectId = projectId || article.project_id || null;
      if (!siteUrl) siteUrl = String(article.published_url || article.source_canonical_url || "");
    }

    let project: Record<string, any> | null = null;
    if (projectId) {
      const { data, error } = await admin.from("projects").select("*").eq("id", projectId).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!data) return J({ success: false, error: "Projeto não encontrado", request_id: requestId }, 404);
      project = data;
      if (!siteUrl) siteUrl = String(project.wordpress_url || project.domain || "");
      if (siteUrl && !/^https?:\/\//i.test(siteUrl)) siteUrl = `https://${siteUrl}`;
    }

    if (!siteUrl || !isSafePublicHttpUrl(siteUrl)) {
      return J({ success: false, error: "siteUrl pública e válida é obrigatória", code: "invalid_site_url", request_id: requestId }, 422);
    }

    const directCandidate = String(input.directCandidate || project?.rss_feed_url || "").trim() || null;
    const discovery = await discoverFeed(siteUrl, { directCandidate, timeoutMs: 15000 });
    if (!discovery.valid) {
      return J({
        success: false,
        error: "Feed RSS/Atom válido não encontrado",
        code: "rss_not_found",
        discovery,
        request_id: requestId,
      }, 422);
    }

    const persist = input.persist !== false;
    const validatedAt = new Date().toISOString();
    const validation = validationPayload(discovery);

    if (persist) {
      const writes: PromiseLike<any>[] = [];
      if (projectId) {
        writes.push(admin.from("projects").update({
          rss_feed_url: discovery.url,
          rss_feed_validation: validation,
          rss_feed_validated_at: validatedAt,
          updated_at: validatedAt,
        }).eq("id", projectId).eq("user_id", userId));
      }
      if (input.articleId) {
        writes.push(admin.from("articles").update({
          rss_feed_url: discovery.url,
          rss_feed_validation: validation,
          rss_feed_validated_at: validatedAt,
          updated_at: validatedAt,
        }).eq("id", input.articleId).eq("user_id", userId));
      }
      if (input.portalId) {
        writes.push(admin.from("monitored_portals").update({
          rss_feed_url: discovery.url,
          rss_feed_validation: validation,
          rss_feed_validated_at: validatedAt,
          last_error: null,
          updated_at: validatedAt,
        }).eq("id", input.portalId).eq("user_id", userId));
      }
      const settled = await Promise.all(writes);
      for (const result of settled) if (result?.error) throw result.error;
    }

    return J({
      success: true,
      canonical_url_preserved: true,
      rss_feed_url: discovery.url,
      validation,
      discovery,
      persisted: persist,
      project_id: projectId,
      article_id: input.articleId || null,
      portal_id: input.portalId || null,
      request_id: requestId,
    });
  } catch (error) {
    if (error instanceof RequestAuthError) return J({ success: false, error: error.message, code: error.code, request_id: requestId }, error.status);
    return J({ success: false, error: error instanceof Error ? error.message : "Falha na descoberta RSS", request_id: requestId }, 500);
  }
});
