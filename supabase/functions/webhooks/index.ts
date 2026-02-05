import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

// Webhook secret for validation (should be set as environment variable)
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || "default-secret";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const source = url.searchParams.get("source");
    const event = url.searchParams.get("event");

    // Validate webhook secret for security
    const providedSecret = req.headers.get("x-webhook-secret");
    if (providedSecret !== WEBHOOK_SECRET) {
      console.warn("Invalid webhook secret provided");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    
    console.log(`Webhook received: source=${source}, event=${event}`, JSON.stringify(body).substring(0, 500));

    switch (source) {
      // === WORDPRESS WEBHOOKS ===
      case "wordpress": {
        switch (event) {
          case "post_published": {
            // WordPress notifies when a post is published
            const { post_id, post_url, post_title, site_url } = body;
            
            // Find matching article by WordPress post ID or title
            const { data: article } = await supabase
              .from("articles")
              .select("id")
              .or(`title.eq.${post_title}`)
              .single();

            if (article) {
              await supabase
                .from("articles")
                .update({
                  status: "published",
                  published_at: new Date().toISOString(),
                  published_url: post_url,
                })
                .eq("id", article.id);

              console.log(`Article ${article.id} marked as published`);
            }
            break;
          }

          case "post_deleted": {
            // WordPress notifies when a post is deleted
            const { post_id, post_url } = body;
            
            const { data: article } = await supabase
              .from("articles")
              .select("id")
              .eq("published_url", post_url)
              .single();

            if (article) {
              await supabase
                .from("articles")
                .update({
                  status: "draft",
                  published_at: null,
                  published_url: null,
                })
                .eq("id", article.id);

              console.log(`Article ${article.id} unpublished due to WordPress deletion`);
            }
            break;
          }

          case "post_updated": {
            // WordPress notifies when a post is updated
            console.log("WordPress post updated:", body);
            break;
          }

          default:
            console.log(`Unknown WordPress event: ${event}`);
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

              console.log(`Article ${article_id} updated from AI service`);
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

              console.log(`Article ${article_id} failed: ${error_message}`);
            }
            break;
          }

          default:
            console.log(`Unknown AI service event: ${event}`);
        }
        break;
      }

      // === NEWS AGENT WEBHOOKS ===
      case "news-agent": {
        switch (event) {
          case "news_found": {
            const { agent_id, user_id, news_items } = body;
            
            if (agent_id && user_id && Array.isArray(news_items)) {
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
                console.error("Failed to insert news items:", error);
              } else {
                console.log(`Inserted ${inserts.length} news items for agent ${agent_id}`);
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

              console.log(`Agent ${agent_id} error logged: ${error_message}`);
            }
            break;
          }

          default:
            console.log(`Unknown news agent event: ${event}`);
        }
        break;
      }

      // === GENERIC/TEST WEBHOOK ===
      case "test": {
        console.log("Test webhook received:", body);
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
        console.log(`Unknown webhook source: ${source}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Fonte de webhook não reconhecida",
            availableSources: ["wordpress", "ai-service", "news-agent", "test"],
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Webhook processado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
