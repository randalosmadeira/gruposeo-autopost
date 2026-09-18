
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";

const FUNCTION_NAME = "webhooks";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Webhook secret for validation. No fallback: an unset env var must fail
// closed, never accept a known literal as a valid secret (auditoria 2026-09-18, CRÍTICO 2).
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || "";

function hostnameOf(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0].toLowerCase();
  }
}

/**
 * The webhook secret is a single value shared across every organization's
 * WordPress site, so it cannot by itself prove which organization a payload
 * belongs to. When the payload carries a site/post URL, this cross-checks it
 * against the project that owns the target article before any write is
 * applied, so a manipulated payload cannot reach another organization's data.
 * Returns true when there is no URL to check (e.g. a bare cfrdm_id lookup),
 * since that path is already scoped to one specific, unguessable article id.
 */
async function articleBelongsToSite(supabase: any, projectId: string | null | undefined, candidateUrl: string | null | undefined): Promise<boolean> {
  const candidateHost = hostnameOf(candidateUrl);
  if (!candidateHost) return true;
  if (!projectId) return false;
  const { data: project } = await supabase.from("projects").select("wordpress_url, domain").eq("id", projectId).maybeSingle();
  if (!project) return false;
  const projectHosts = [hostnameOf(project.wordpress_url), hostnameOf(project.domain)].filter(Boolean);
  return projectHosts.includes(candidateHost);
}

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const source = url.searchParams.get("source");
    const event = url.searchParams.get("event");

    log.requestStart(req.method, `${source}/${event}`);

    // Fail closed: without a configured secret, no payload can be trusted.
    if (!WEBHOOK_SECRET) {
      log.error("webhook_secret_not_configured", {});
      log.requestEnd(500, Date.now() - startTime);
      return new Response(
        JSON.stringify({ success: false, error: "Webhook não configurado no servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate webhook secret for security
    const providedSecret = req.headers.get("x-webhook-secret");
    if (providedSecret !== WEBHOOK_SECRET) {
      log.authFailure("invalid_webhook_secret");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    
    log.info("webhook_received", { source, event, bodyLength: JSON.stringify(body).length });

    switch (source) {
      // === WORDPRESS WEBHOOKS ===
      case "wordpress": {
        switch (event) {
          case "post_published": {
            // WordPress notifies when a post is published
            const { data } = body;
            const { post_id, post_url, post_title, site_url, cfrdm_id, schema_validation, article_type, word_count, has_featured_image } = data || body;
            
            // Find matching article by cfrdm_id (article UUID) or title
            let article = null;

            if (cfrdm_id) {
              const { data: articleData } = await supabase
                .from("articles")
                .select("id, config, project_id")
                .eq("id", cfrdm_id)
                .single();
              article = articleData;
            }

            if (!article && site_url) {
              // No cfrdm_id: only search by title inside the project whose
              // wordpress_url/domain matches the caller's own site_url, never
              // a global title search across every organization's articles.
              const candidateHost = hostnameOf(site_url);
              const { data: candidateProjects } = await supabase.from("projects").select("id, wordpress_url, domain");
              const matchingProjectIds = (candidateProjects || [])
                .filter((p: any) => [hostnameOf(p.wordpress_url), hostnameOf(p.domain)].includes(candidateHost))
                .map((p: any) => p.id);
              if (matchingProjectIds.length > 0) {
                const { data: articleData } = await supabase
                  .from("articles")
                  .select("id, config, project_id")
                  .eq("title", post_title)
                  .in("project_id", matchingProjectIds)
                  .maybeSingle();
                article = articleData;
              }
            }

            if (article && !(await articleBelongsToSite(supabase, article.project_id, site_url || post_url))) {
              log.warn("post_published_organization_mismatch", { article_id: article.id });
              article = null;
            }

            if (article) {
              // Merge schema validation into config
              const updatedConfig = {
                ...(article.config || {}),
                wordpress_post_id: post_id,
                schema_validation: schema_validation || null,
                last_validation_at: new Date().toISOString(),
              };

              await supabase
                .from("articles")
                .update({
                  status: "published",
                  published_at: new Date().toISOString(),
                  published_url: post_url,
                  word_count: word_count || null,
                  config: updatedConfig,
                })
                .eq("id", article.id);

              log.info("article_marked_published", { 
                article_id: article.id,
                schema_valid: schema_validation?.valid ?? null,
                schema_errors: schema_validation?.errors?.length ?? 0,
                schema_warnings: schema_validation?.warnings?.length ?? 0,
              });
            }
            break;
          }

          case "post_deleted": {
            // WordPress notifies when a post is deleted
            const { data } = body;
            const { post_id, post_url, cfrdm_id } = data || body;
            
            let articleId = cfrdm_id;
            let articleProjectId: string | null = null;

            if (articleId) {
              const { data: articleData } = await supabase
                .from("articles")
                .select("id, project_id")
                .eq("id", articleId)
                .maybeSingle();
              articleProjectId = articleData?.project_id ?? null;
            }

            if (!articleId && post_url) {
              const { data: articleData } = await supabase
                .from("articles")
                .select("id, project_id")
                .eq("published_url", post_url)
                .single();
              articleId = articleData?.id;
              articleProjectId = articleData?.project_id ?? null;
            }

            if (articleId && !(await articleBelongsToSite(supabase, articleProjectId, post_url))) {
              log.warn("post_deleted_organization_mismatch", { article_id: articleId });
              articleId = null;
            }

            if (articleId) {
              await supabase
                .from("articles")
                .update({
                  status: "draft",
                  published_at: null,
                  published_url: null,
                })
                .eq("id", articleId);

              log.info("article_unpublished", { article_id: articleId });
            }
            break;
          }

          case "post_updated": {
            // WordPress notifies when a post is updated - update schema validation
            const { data } = body;
            const { post_id, cfrdm_id, schema_validation } = data || body;
            
            if (cfrdm_id && schema_validation) {
              const { data: article } = await supabase
                .from("articles")
                .select("id, config")
                .eq("id", cfrdm_id)
                .single();

              if (article) {
                const updatedConfig = {
                  ...(article.config || {}),
                  schema_validation: schema_validation,
                  last_validation_at: new Date().toISOString(),
                };

                await supabase
                  .from("articles")
                  .update({ config: updatedConfig })
                  .eq("id", article.id);

                log.info("article_schema_updated", { 
                  article_id: article.id,
                  schema_valid: schema_validation?.valid,
                });
              }
            }
            break;
          }

          case "schema_validation": {
            // Dedicated schema validation webhook
            const { data } = body;
            const { cfrdm_id, schema_validation, post_url } = data || body;
            
            if (cfrdm_id && schema_validation) {
              const { data: article } = await supabase
                .from("articles")
                .select("id, config, project_id")
                .eq("id", cfrdm_id)
                .single();

              if (article && !(await articleBelongsToSite(supabase, article.project_id, post_url))) {
                log.warn("schema_validation_organization_mismatch", { article_id: article.id });
              } else if (article) {
                const updatedConfig = {
                  ...(article.config || {}),
                  schema_validation: schema_validation,
                  last_validation_at: new Date().toISOString(),
                  google_test_url: `https://search.google.com/test/rich-results?url=${encodeURIComponent(post_url || '')}`,
                };

                await supabase
                  .from("articles")
                  .update({ config: updatedConfig })
                  .eq("id", article.id);

                log.info("schema_validation_received", { 
                  article_id: article.id,
                  valid: schema_validation?.valid,
                  errors: schema_validation?.errors?.length || 0,
                  warnings: schema_validation?.warnings?.length || 0,
                });
              }
            }
            break;
          }

          default:
            log.warn("unknown_wordpress_event", { event });
        }
        break;
      }

      // === EXTERNAL AI SERVICE WEBHOOKS ===
      case "ai-service": {
        switch (event) {
          case "generation_complete": {
            const { article_id, content, title, status } = body;
            
            if (article_id) {
              await supabase
                .from("articles")
                .update({
                  content,
                  title,
                  status: status || "ready",
                  word_count: content ? content.split(/\s+/).length : 0,
                })
                .eq("id", article_id);

              log.info("article_updated_from_ai", { article_id });
            }
            break;
          }

          case "generation_failed": {
            const { article_id, error_message } = body;
            
            if (article_id) {
              await supabase
                .from("articles")
                .update({
                  status: "error",
                  error_message,
                })
                .eq("id", article_id);

              log.warn("article_generation_failed", { article_id, error: error_message });
            }
            break;
          }

          default:
            log.warn("unknown_ai_service_event", { event });
        }
        break;
      }

      // === NEWS AGENT WEBHOOKS ===
      case "news-agent": {
        switch (event) {
          case "news_found": {
            const { agent_id, user_id, news_items } = body;

            if (agent_id && user_id && Array.isArray(news_items)) {
              // The webhook secret alone cannot prove which organization this
              // payload belongs to, so the agent_id/user_id pair is verified
              // against the real ownership row before any insert is applied —
              // a forged payload cannot attribute news to another user's agent.
              const { data: agent } = await supabase
                .from("news_agents")
                .select("id, user_id")
                .eq("id", agent_id)
                .maybeSingle();

              if (!agent || agent.user_id !== user_id) {
                log.warn("news_found_organization_mismatch", { agent_id, provided_user_id: user_id });
                break;
              }

              const inserts = news_items.map((item: any) => ({
                agent_id,
                user_id,
                title: item.title,
                content: item.content,
                source_url: item.source_url,
                source_name: item.source_name,
                original_title: item.original_title,
                status: "pending",
              }));

              const { error } = await supabase
                .from("agent_news")
                .insert(inserts);

              if (error) {
                log.error("news_insert_failed", { error: error.message });
              } else {
                log.info("news_items_inserted", { agent_id, count: inserts.length });
              }
            }
            break;
          }

          case "agent_error": {
            const { agent_id, error_message } = body;
            
            if (agent_id) {
              await supabase
                .from("news_agents")
                .update({
                  last_error: error_message,
                  last_run_at: new Date().toISOString(),
                })
                .eq("id", agent_id);

              log.warn("agent_error_logged", { agent_id, error: error_message });
            }
            break;
          }

          default:
            log.warn("unknown_news_agent_event", { event });
        }
        break;
      }

      // === GENERIC/TEST WEBHOOK ===
      case "test": {
        log.info("test_webhook_received");
        log.requestEnd(200, Date.now() - startTime);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Test webhook received",
            received: body,
            timestamp: new Date().toISOString(),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        log.warn("unknown_webhook_source", { source });
        log.requestEnd(400, Date.now() - startTime);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Fonte de webhook não reconhecida",
            availableSources: ["wordpress", "ai-service", "news-agent", "test"],
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    log.requestEnd(200, Date.now() - startTime);
    return new Response(
      JSON.stringify({ success: true, message: "Webhook processado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.error("webhook_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
