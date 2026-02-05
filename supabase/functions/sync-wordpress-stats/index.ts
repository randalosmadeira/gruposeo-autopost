import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cfrdm-api-key, x-wp-nonce",
};

interface WordPressStats {
  site_url: string;
  api_key: string;
  stats: {
    total_posts: number;
    published: number;
    draft: number;
    pending: number;
    synced: number;
    errors: number;
    internal_links: number;
    comments: number;
    categories: number;
    tags: number;
  };
  seo_health?: {
    score: number;
    issues: Array<{
      type: string;
      post_id: number;
      title: string;
      description: string;
      severity: 'info' | 'warning' | 'error';
    }>;
  };
  internal_links_data?: {
    orphan_pages: Array<{ id: number; title: string; url: string }>;
    opportunities: Array<{
      from_id: number;
      from_title: string;
      to_id: number;
      to_title: string;
      relevance: number;
      anchor_text: string;
    }>;
    link_distribution: Array<{
      post_id: number;
      title: string;
      incoming: number;
      outgoing: number;
    }>;
  };
  autocorrect_results?: {
    issues_found: number;
    issues_fixed: number;
    issues: Array<{
      post_id: number;
      title: string;
      issue_type: string;
      description: string;
      fixed: boolean;
    }>;
  };
  logs?: Array<{
    type: string;
    category: string;
    message: string;
    context?: Record<string, unknown>;
    created_at: string;
  }>;
  timestamp: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "sync";
    
    // Validate API Key from WordPress plugin
    const apiKey = req.headers.get("x-cfrdm-api-key");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "API Key required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find project by domain/API key pattern
    const body = await req.json() as WordPressStats;
    
    // Extract domain from site_url
    const siteUrl = body.site_url;
    if (!siteUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "site_url required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the project that matches this WordPress site
    const domain = new URL(siteUrl).hostname;
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, user_id, name")
      .eq("domain", domain)
      .single();

    if (projectError || !project) {
      console.log("Project not found for domain:", domain);
      return new Response(
        JSON.stringify({ success: false, error: "Project not found for this domain" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Syncing stats for project: ${project.name} (${project.id})`);

    // Handle different actions
    switch (action) {
      case "sync": {
        // Store stats in wordpress_stats table
        const { stats, seo_health, internal_links_data, autocorrect_results, logs, timestamp } = body;
        
        // Prepare stats data for database
        const statsData = {
          project_id: project.id,
          user_id: project.user_id,
          total_articles: stats.total_posts || 0,
          published_articles: stats.published || 0,
          draft_articles: stats.draft || 0,
          pending_articles: stats.pending || 0,
          synced_articles: stats.synced || 0,
          sync_errors: stats.errors || 0,
          total_internal_links: stats.internal_links || 0,
          total_comments: stats.comments || 0,
          articles_needing_attention: seo_health?.issues?.filter((i: { severity: string }) => i.severity === 'error').length || 0,
          seo_issues: seo_health?.issues?.length || 0,
          broken_links: internal_links_data?.orphan_pages?.length || 0,
          articles_without_links: internal_links_data?.orphan_pages?.length || 0,
          auto_corrections_applied: autocorrect_results?.issues_fixed || 0,
          missing_featured_images: 0, // To be calculated
          pending_comments: 0, // To be calculated
          approved_comments: stats.comments || 0,
          publishing_trend: [] as { date: string; count: number }[],
          raw_data: {
            stats,
            seo_health,
            internal_links_data,
            autocorrect_results,
            logs_count: logs?.length || 0,
            synced_at: timestamp,
          },
          last_sync_at: new Date().toISOString(),
        };

        // Upsert wordpress_stats
        const { data: existingStats } = await supabase
          .from("wordpress_stats")
          .select("id")
          .eq("project_id", project.id)
          .maybeSingle();

        if (existingStats) {
          const { error: updateError } = await supabase
            .from("wordpress_stats")
            .update(statsData)
            .eq("id", existingStats.id);
          
          if (updateError) {
            console.error("Failed to update wordpress_stats:", updateError);
            throw updateError;
          }
        } else {
          const { error: insertError } = await supabase
            .from("wordpress_stats")
            .insert(statsData);
          
          if (insertError) {
            console.error("Failed to insert wordpress_stats:", insertError);
            throw insertError;
          }
        }

        // Update project timestamp
        await supabase
          .from("projects")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", project.id);

        // Log the sync event
        console.log("Stats synced to database:", {
          project_id: project.id,
          project_name: project.name,
          total_posts: stats.total_posts,
          published: stats.published,
          synced: stats.synced,
          internal_links: stats.internal_links,
          timestamp,
        });

        // Process internal link opportunities if provided
        if (internal_links_data?.opportunities && internal_links_data.opportunities.length > 0) {
          console.log(`Found ${internal_links_data.opportunities.length} internal link opportunities`);
        }

        // Process SEO health issues if provided
        if (seo_health?.issues && seo_health.issues.length > 0) {
          console.log(`Found ${seo_health.issues.length} SEO issues, score: ${seo_health.score}`);
        }

        // Process autocorrect results if provided
        if (autocorrect_results) {
          console.log(`Autocorrect: ${autocorrect_results.issues_found} issues found, ${autocorrect_results.issues_fixed} fixed`);
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Stats synced successfully",
            project_id: project.id,
            project_name: project.name,
            received: {
              stats: true,
              seo_health: !!seo_health,
              internal_links_data: !!internal_links_data,
              autocorrect_results: !!autocorrect_results,
              logs_count: logs?.length || 0,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get-link-suggestions": {
        // Return internal link suggestions based on existing articles
        const { data: articles, error: articlesError } = await supabase
          .from("articles")
          .select("id, title, keyword, secondary_keywords, slug, published_url")
          .eq("project_id", project.id)
          .eq("status", "published");

        if (articlesError) {
          throw articlesError;
        }

        // Generate link suggestions based on keyword matching
        const suggestions: Array<{
          source_keyword: string;
          target_articles: Array<{
            id: string;
            title: string;
            url: string;
            relevance: number;
            anchor_text: string;
          }>;
        }> = [];

        if (articles && articles.length > 0) {
          for (const article of articles) {
            const relatedArticles = articles
              .filter(a => a.id !== article.id)
              .map(a => {
                // Calculate relevance based on keyword matching
                const keyword = article.keyword?.toLowerCase() || "";
                const targetKeyword = a.keyword?.toLowerCase() || "";
                const targetTitle = a.title?.toLowerCase() || "";
                const targetSecondary = a.secondary_keywords?.map(k => k.toLowerCase()) || [];

                let relevance = 0;
                
                // Check if keywords are related
                if (targetKeyword.includes(keyword) || keyword.includes(targetKeyword)) {
                  relevance += 50;
                }
                
                // Check if title contains the keyword
                if (targetTitle.includes(keyword)) {
                  relevance += 30;
                }
                
                // Check secondary keywords
                for (const sk of targetSecondary) {
                  if (keyword.includes(sk) || sk.includes(keyword)) {
                    relevance += 20;
                    break;
                  }
                }

                return {
                  id: a.id,
                  title: a.title || "",
                  url: a.published_url || `/${a.slug}`,
                  relevance,
                  anchor_text: a.keyword || a.title || "",
                };
              })
              .filter(a => a.relevance > 20)
              .sort((a, b) => b.relevance - a.relevance)
              .slice(0, 5);

            if (relatedArticles.length > 0) {
              suggestions.push({
                source_keyword: article.keyword || "",
                target_articles: relatedArticles,
              });
            }
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            suggestions,
            total_articles: articles?.length || 0,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "report-issue": {
        // Log issues reported from WordPress
        const { issue_type, post_id, title, description, severity } = body as unknown as {
          issue_type: string;
          post_id: number;
          title: string;
          description: string;
          severity: string;
        };

        console.log("Issue reported from WordPress:", {
          project_id: project.id,
          issue_type,
          post_id,
          title,
          description,
          severity,
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: "Issue logged successfully",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: "Unknown action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("sync-wordpress-stats error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Internal error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
