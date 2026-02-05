import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestConnectionRequest {
  wordpress_url: string;
  wordpress_username: string;
  wordpress_app_password: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wordpress_url, wordpress_username, wordpress_app_password }: TestConnectionRequest = await req.json();

    if (!wordpress_url || !wordpress_username || !wordpress_app_password) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required credentials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean URL and build API endpoint
    const baseUrl = wordpress_url.replace(/\/$/, "");
    const apiUrl = `${baseUrl}/wp-json/wp/v2/posts?per_page=1`;

    // Build Basic Auth header
    const auth = btoa(`${wordpress_username}:${wordpress_app_password}`);

    console.log(`Testing connection to: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`Response status: ${response.status}`);

    if (response.ok) {
      // Verify the response is actually JSON (not an HTML error page)
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "WordPress REST API returned invalid response. Ensure REST API is enabled." 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try to parse the response to ensure it's valid JSON
      try {
        await response.json();
      } catch {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "WordPress returned invalid JSON. Check if REST API is working correctly." 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Also try to fetch user info to verify write permissions (optional check)
      let canPublish = true; // Assume true if we can read posts
      let userInfo = null;

      try {
        const userApiUrl = `${baseUrl}/wp-json/wp/v2/users/me`;
        const userResponse = await fetch(userApiUrl, {
          method: "GET",
          headers: {
            Authorization: `Basic ${auth}`,
          },
        });

        const userContentType = userResponse.headers.get("content-type") || "";
        
        if (userResponse.ok && userContentType.includes("application/json")) {
          const userData = await userResponse.json();
          userInfo = userData;
          // Check if user can publish posts
          canPublish = userData.capabilities?.publish_posts === true || 
                       userData.roles?.includes('administrator') ||
                       userData.roles?.includes('editor') ||
                       userData.roles?.includes('author');
        }
      } catch (userError) {
        // User info fetch failed, but posts endpoint worked - connection is valid
        console.log("User info fetch failed (non-critical):", userError);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Connection successful",
          canPublish,
          user: userInfo ? { name: userInfo.name, roles: userInfo.roles } : null
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const errorText = await response.text();
      console.error("WordPress API error:", response.status, errorText);

      let errorMessage = "Connection failed";
      
      if (response.status === 401) {
        errorMessage = "Authentication failed. Check your username and application password.";
      } else if (response.status === 403) {
        errorMessage = "Access denied. Ensure the user has proper permissions.";
      } else if (response.status === 404) {
        errorMessage = "WordPress REST API not found. Ensure REST API is enabled.";
      }

      return new Response(
        JSON.stringify({ success: false, error: errorMessage, status: response.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Connection test error:", error);
    
    let errorMessage = "Could not connect to the WordPress site.";
    if (error instanceof Error) {
      if (error.message.includes("fetch")) {
        errorMessage = "Could not reach the WordPress site. Check if the URL is correct and accessible.";
      } else {
        errorMessage = error.message;
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
