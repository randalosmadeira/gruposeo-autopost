import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PublishRequest {
  articleId: string;
  projectId: string;
}

interface WordPressCredentials {
  wordpress_url: string;
  wordpress_username: string;
  wordpress_app_password: string;
}

async function publishToWordPress(
  credentials: WordPressCredentials,
  article: {
    title: string;
    content: string;
    excerpt: string;
    slug: string;
    featured_image_url: string | null;
    categories?: number[];
    tags?: number[];
  },
  status: string = "draft"
): Promise<{ success: boolean; postId?: number; postUrl?: string; error?: string }> {
  const { wordpress_url, wordpress_username, wordpress_app_password } = credentials;

  // Validate credentials
  if (!wordpress_url || !wordpress_username || !wordpress_app_password) {
    return { success: false, error: "WordPress credentials not configured" };
  }

  // Clean URL and build API endpoint
  const baseUrl = wordpress_url.replace(/\/$/, "");
  const apiUrl = `${baseUrl}/wp-json/wp/v2/posts`;

  // Build Basic Auth header
  const auth = btoa(`${wordpress_username}:${wordpress_app_password}`);

  try {
    // First, upload featured image if exists
    let featuredMediaId: number | undefined;
    
    if (article.featured_image_url && article.featured_image_url.startsWith("data:image")) {
      // Extract base64 data and upload to WordPress
      const mediaApiUrl = `${baseUrl}/wp-json/wp/v2/media`;
      
      // Convert base64 to blob
      const base64Data = article.featured_image_url.split(",")[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const imageResponse = await fetch(mediaApiUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "image/png",
          "Content-Disposition": `attachment; filename="${article.slug || "featured"}.png"`,
        },
        body: bytes,
      });

      if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        featuredMediaId = imageData.id;
        console.log("Featured image uploaded:", featuredMediaId);
      } else {
        console.warn("Failed to upload featured image:", await imageResponse.text());
      }
    }

    // Create the post
    const postData: Record<string, unknown> = {
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      slug: article.slug,
      status: status === "publish" ? "publish" : "draft",
    };

    // Add categories if provided
    if (article.categories && article.categories.length > 0) {
      postData.categories = article.categories;
    }

    // Add tags if provided
    if (article.tags && article.tags.length > 0) {
      postData.tags = article.tags;
    }

    if (featuredMediaId) {
      postData.featured_media = featuredMediaId;
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("WordPress API error:", response.status, errorText);
      
      if (response.status === 401) {
        return { success: false, error: "Authentication failed. Check your WordPress credentials." };
      }
      if (response.status === 403) {
        return { success: false, error: "Permission denied. Ensure the user has permission to create posts." };
      }
      
      return { success: false, error: `WordPress API error: ${response.status}` };
    }

    const post = await response.json();
    console.log("Post created successfully:", post.id, post.link);

    return {
      success: true,
      postId: post.id,
      postUrl: post.link,
    };
  } catch (error) {
    console.error("WordPress publish error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { articleId, projectId }: PublishRequest = await req.json();

    if (!articleId || !projectId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing articleId or projectId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch article
    const { data: article, error: articleError } = await supabase
      .from("articles")
      .select("*")
      .eq("id", articleId)
      .single();

    if (articleError || !article) {
      return new Response(
        JSON.stringify({ success: false, error: "Article not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch project with WordPress credentials
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("wordpress_url, wordpress_username, wordpress_app_password")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ success: false, error: "Project not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!project.wordpress_url || !project.wordpress_username || !project.wordpress_app_password) {
      return new Response(
        JSON.stringify({ success: false, error: "WordPress credentials not configured for this project" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse wordpress_categories from article config if exists
    const config = article.config as { wordpress_categories?: number[]; wordpress_tags?: number[] } | null;
    const categories = config?.wordpress_categories || [];
    const tags = config?.wordpress_tags || [];

    // Publish to WordPress
    const result = await publishToWordPress(
      {
        wordpress_url: project.wordpress_url,
        wordpress_username: project.wordpress_username,
        wordpress_app_password: project.wordpress_app_password,
      },
      {
        title: article.title || "Untitled",
        content: article.content || "",
        excerpt: article.excerpt || "",
        slug: article.slug || "",
        featured_image_url: article.featured_image_url,
        categories,
        tags,
      },
      "publish"
    );

    if (result.success) {
      // Update article status in database
      await supabase
        .from("articles")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          published_url: result.postUrl,
        })
        .eq("id", articleId);
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Publish error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
