
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { createLogger, createRequestId } from "../_shared/logger.ts";

const FUNCTION_NAME = "articles-api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    log.requestStart(req.method, action || undefined);
    
    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log.authFailure("missing_or_invalid_header");
      return new Response(
        JSON.stringify({ success: false, error: "Autorização necessária" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Create client with user's auth token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user - pass JWT explicitly
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      log.authFailure(authError?.message || "user_not_found");
      return new Response(
        JSON.stringify({ success: false, error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    log.authSuccess(user.id);

    const body = req.method !== "GET" ? await req.json() : {};

    let result;

    switch (action) {
      // === LIST ARTICLES ===
      case "list": {
        const page = parseInt(url.searchParams.get("page") || "1");
        const perPage = parseInt(url.searchParams.get("perPage") || "20");
        const status = url.searchParams.get("status");
        const type = url.searchParams.get("type");
        const projectId = url.searchParams.get("projectId");
        const search = url.searchParams.get("search");

        let query = supabase
          .from("articles")
          .select("*", { count: "exact" })
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .range((page - 1) * perPage, page * perPage - 1);

        if (status) query = query.eq("status", status);
        if (type) query = query.eq("type", type);
        if (projectId) query = query.eq("project_id", projectId);
        if (search) query = query.or(`title.ilike.%${search}%,keyword.ilike.%${search}%`);

        const { data, error, count } = await query;

        if (error) {
          result = { error: error.message };
        } else {
          result = { 
            data: {
              articles: data,
              pagination: {
                page,
                perPage,
                total: count,
                totalPages: Math.ceil((count || 0) / perPage),
              }
            }
          };
        }
        break;
      }

      // === GET SINGLE ARTICLE ===
      case "get": {
        const articleId = url.searchParams.get("id");
        if (!articleId) {
          return new Response(
            JSON.stringify({ success: false, error: "id é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data, error } = await supabase
          .from("articles")
          .select("*")
          .eq("id", articleId)
          .eq("user_id", user.id)
          .single();

        if (error) {
          result = { error: error.message };
        } else {
          result = { data };
        }
        break;
      }

      // === CREATE ARTICLE ===
      case "create": {
        const { data, error } = await supabase
          .from("articles")
          .insert({
            user_id: user.id,
            title: body.title,
            content: body.content,
            excerpt: body.excerpt,
            keyword: body.keyword,
            secondary_keywords: body.secondaryKeywords,
            slug: body.slug,
            type: body.type || "blog",
            status: body.status || "draft",
            project_id: body.projectId,
            featured_image_url: body.featuredImageUrl,
            config: body.config,
          })
          .select()
          .single();

        if (error) {
          result = { error: error.message };
        } else {
          result = { data };
        }
        break;
      }

      // === UPDATE ARTICLE ===
      case "update": {
        if (!body.id) {
          return new Response(
            JSON.stringify({ success: false, error: "id é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const updateData: Record<string, any> = {};
        if (body.title !== undefined) updateData.title = body.title;
        if (body.content !== undefined) updateData.content = body.content;
        if (body.excerpt !== undefined) updateData.excerpt = body.excerpt;
        if (body.keyword !== undefined) updateData.keyword = body.keyword;
        if (body.secondaryKeywords !== undefined) updateData.secondary_keywords = body.secondaryKeywords;
        if (body.slug !== undefined) updateData.slug = body.slug;
        if (body.type !== undefined) updateData.type = body.type;
        if (body.status !== undefined) updateData.status = body.status;
        if (body.projectId !== undefined) updateData.project_id = body.projectId;
        if (body.featuredImageUrl !== undefined) updateData.featured_image_url = body.featuredImageUrl;
        if (body.config !== undefined) updateData.config = body.config;
        if (body.seoScore !== undefined) updateData.seo_score = body.seoScore;
        if (body.wordCount !== undefined) updateData.word_count = body.wordCount;

        const { data, error } = await supabase
          .from("articles")
          .update(updateData)
          .eq("id", body.id)
          .eq("user_id", user.id)
          .select()
          .single();

        if (error) {
          result = { error: error.message };
        } else {
          result = { data };
        }
        break;
      }

      // === DELETE ARTICLE ===
      case "delete": {
        const articleId = body.id || url.searchParams.get("id");
        if (!articleId) {
          return new Response(
            JSON.stringify({ success: false, error: "id é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error } = await supabase
          .from("articles")
          .delete()
          .eq("id", articleId)
          .eq("user_id", user.id);

        if (error) {
          result = { error: error.message };
        } else {
          result = { data: { deleted: true, id: articleId } };
        }
        break;
      }

      // === BULK DELETE ===
      case "bulk-delete": {
        if (!body.ids || !Array.isArray(body.ids)) {
          return new Response(
            JSON.stringify({ success: false, error: "ids (array) é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error } = await supabase
          .from("articles")
          .delete()
          .in("id", body.ids)
          .eq("user_id", user.id);

        if (error) {
          result = { error: error.message };
        } else {
          result = { data: { deleted: body.ids.length, ids: body.ids } };
        }
        break;
      }

      // === BULK UPDATE STATUS ===
      case "bulk-update-status": {
        if (!body.ids || !Array.isArray(body.ids) || !body.status) {
          return new Response(
            JSON.stringify({ success: false, error: "ids (array) e status são obrigatórios" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data, error } = await supabase
          .from("articles")
          .update({ status: body.status })
          .in("id", body.ids)
          .eq("user_id", user.id)
          .select();

        if (error) {
          result = { error: error.message };
        } else {
          result = { data: { updated: data.length, articles: data } };
        }
        break;
      }

      // === STATS ===
      case "stats": {
        const { data: articles, error } = await supabase
          .from("articles")
          .select("status, type, word_count, created_at")
          .eq("user_id", user.id);

        if (error) {
          result = { error: error.message };
        } else {
          const stats = {
            total: articles.length,
            byStatus: {} as Record<string, number>,
            byType: {} as Record<string, number>,
            totalWords: 0,
            thisMonth: 0,
          };

          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

          articles.forEach((article) => {
            // By status
            stats.byStatus[article.status] = (stats.byStatus[article.status] || 0) + 1;
            // By type
            stats.byType[article.type] = (stats.byType[article.type] || 0) + 1;
            // Word count
            stats.totalWords += article.word_count || 0;
            // This month
            if (new Date(article.created_at) >= monthStart) {
              stats.thisMonth++;
            }
          });

          result = { data: stats };
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Ação não reconhecida",
            availableActions: [
              "list", "get", "create", "update", "delete",
              "bulk-delete", "bulk-update-status", "stats"
            ]
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    if (result.error) {
      log.warn("action_error", { action, error: result.error });
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.requestEnd(200, Date.now() - startTime);
    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.error("api_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
