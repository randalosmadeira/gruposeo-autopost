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
        "Accept": "application/json",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const responseText = await response.text();
    
    console.log(`Response status: ${response.status}, Content-Type: ${contentType}`);
    console.log(`Response preview: ${responseText.substring(0, 200)}`);

    if (response.ok) {
      // Verify the response is actually JSON (not an HTML error page)
      if (!contentType.includes("application/json")) {
        // Check if it's a login page or blocked by security plugin
        let detailedError = "WordPress REST API retornou HTML ao invés de JSON.";
        
        if (responseText.includes("login") || responseText.includes("wp-login")) {
          detailedError = "REST API requer autenticação. Verifique se as credenciais estão corretas.";
        } else if (responseText.includes("security") || responseText.includes("blocked") || responseText.includes("firewall")) {
          detailedError = "Um plugin de segurança pode estar bloqueando a REST API. Desative temporariamente ou adicione exceção.";
        } else if (responseText.includes("rest_disabled") || responseText.includes("disabled")) {
          detailedError = "A REST API do WordPress está desabilitada. Verifique nas configurações do WordPress.";
        } else {
          detailedError = "REST API retornou HTML. Possíveis causas: plugin de segurança, cache, ou REST API desabilitada.";
        }
        
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: detailedError,
            contentType,
            hint: "Acesse " + baseUrl + "/wp-json/ no navegador para verificar se a REST API está ativa."
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try to parse the response as JSON
      let postsData;
      try {
        postsData = JSON.parse(responseText);
      } catch {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "WordPress retornou resposta inválida. Verifique se a REST API está funcionando." 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try to parse the response as JSON
      let postsData;
      try {
        postsData = JSON.parse(responseText);
      } catch {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "WordPress retornou resposta inválida. Verifique se a REST API está funcionando." 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
      console.error("WordPress API error:", response.status, responseText.substring(0, 500));

      let errorMessage = "Falha na conexão";
      
      if (response.status === 401) {
        errorMessage = "Autenticação falhou. Verifique usuário e senha de aplicação.";
      } else if (response.status === 403) {
        errorMessage = "Acesso negado. Verifique se o usuário tem permissões adequadas.";
      } else if (response.status === 404) {
        errorMessage = "REST API não encontrada. Verifique se está ativada no WordPress.";
      } else {
        errorMessage = `Erro ${response.status}: ${responseText.substring(0, 100)}`;
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
