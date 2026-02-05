import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TestConnectionRequest {
  wordpress_url: string;
  wordpress_username?: string;
  wordpress_app_password?: string;
  use_plugin?: boolean;
  api_key?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: TestConnectionRequest = await req.json();
    const { wordpress_url, use_plugin, api_key, wordpress_username, wordpress_app_password } = body;

    if (!wordpress_url) {
      return new Response(
        JSON.stringify({ success: false, error: "URL do WordPress não fornecida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = wordpress_url.replace(/\/$/, "");

    // Plugin-based authentication
    if (use_plugin && api_key) {
      console.log(`Testing plugin connection to: ${baseUrl}/wp-json/cfrdm/v1/test`);
      
      try {
        const pluginResponse = await fetch(`${baseUrl}/wp-json/cfrdm/v1/test`, {
          method: "GET",
          headers: {
            "X-CFRDM-API-Key": api_key,
            "Accept": "application/json",
          },
        });

        const contentType = pluginResponse.headers.get("content-type") || "";
        const responseText = await pluginResponse.text();
        
        console.log(`Plugin response status: ${pluginResponse.status}, Content-Type: ${contentType}`);
        console.log(`Plugin response preview: ${responseText.substring(0, 300)}`);

        if (!contentType.includes("application/json")) {
          // Try health check endpoint first (doesn't require auth)
          const healthResponse = await fetch(`${baseUrl}/wp-json/cfrdm/v1/health`, {
            method: "GET",
            headers: { "Accept": "application/json" },
          });

          const healthContentType = healthResponse.headers.get("content-type") || "";
          
          if (!healthContentType.includes("application/json")) {
            return new Response(
              JSON.stringify({ 
                success: false, 
                error: "Plugin ContentFactory RDM não encontrado ou não ativado.",
                hint: "Verifique se o plugin está instalado e ativo no WordPress."
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({ 
              success: false, 
              error: "API Key inválida ou expirada.",
              hint: "Verifique a API Key no WordPress em ContentFactory → Dashboard."
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const pluginData = JSON.parse(responseText);

        if (pluginResponse.ok && pluginData.success) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: "Conexão via plugin estabelecida",
              site: pluginData.site,
              canPublish: true
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: pluginData.message || "Falha na autenticação via plugin.",
              hint: "Verifique se a API Key está correta."
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (pluginError) {
        console.error("Plugin connection error:", pluginError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Não foi possível conectar via plugin.",
            hint: "Verifique se o plugin ContentFactory RDM está instalado e ativo."
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Standard Application Password authentication
    if (!wordpress_username || !wordpress_app_password) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais não fornecidas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiUrl = `${baseUrl}/wp-json/wp/v2/posts?per_page=1`;
    const auth = btoa(`${wordpress_username}:${wordpress_app_password}`);

    console.log(`Testing standard connection to: ${apiUrl}`);

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
      if (!contentType.includes("application/json")) {
        let detailedError = "WordPress REST API retornou HTML ao invés de JSON.";
        
        if (responseText.includes("login") || responseText.includes("wp-login")) {
          detailedError = "REST API requer autenticação. Verifique se as credenciais estão corretas.";
        } else if (responseText.includes("security") || responseText.includes("blocked") || responseText.includes("firewall")) {
          detailedError = "Um plugin de segurança pode estar bloqueando a REST API. Tente usar a conexão via Plugin.";
        } else if (responseText.includes("rest_disabled") || responseText.includes("disabled")) {
          detailedError = "A REST API do WordPress está desabilitada. Tente usar a conexão via Plugin.";
        } else {
          detailedError = "REST API retornou HTML. Possíveis causas: plugin de segurança, cache, ou REST API desabilitada. Tente usar a conexão via Plugin.";
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

      let canPublish = true;
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
          canPublish = userData.capabilities?.publish_posts === true || 
                       userData.roles?.includes('administrator') ||
                       userData.roles?.includes('editor') ||
                       userData.roles?.includes('author');
        }
      } catch (userError) {
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
      let hint = "";
      
      if (response.status === 401) {
        errorMessage = "Autenticação falhou.";
        hint = "Verifique se o usuário e a Senha de Aplicação estão corretos. A senha deve ser criada em Usuários → Perfil → Senhas de Aplicação.";
      } else if (response.status === 403) {
        errorMessage = "Acesso negado.";
        hint = "Verifique se o usuário tem permissões de autor/editor/administrador para criar posts.";
      } else if (response.status === 404) {
        errorMessage = "REST API não encontrada.";
        hint = "Verifique se a REST API está ativada. Acesse " + baseUrl + "/wp-json/ no navegador para testar.";
      } else if (response.status === 500) {
        errorMessage = "Erro interno do WordPress.";
        hint = "Verifique os logs do WordPress ou desative plugins temporariamente para identificar o problema.";
      } else {
        errorMessage = `Erro HTTP ${response.status}.`;
        hint = "Verifique se o site está acessível e a REST API está funcionando.";
      }

      return new Response(
        JSON.stringify({ success: false, error: errorMessage, hint, status: response.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Connection test error:", error);
    
    let errorMessage = "Não foi possível conectar ao site WordPress.";
    let hint = "Verifique se a URL está correta e o site está acessível.";
    
    if (error instanceof Error) {
      if (error.message.includes("fetch") || error.message.includes("network")) {
        errorMessage = "Não foi possível acessar o site.";
        hint = "Verifique se a URL está correta, incluindo https://. Confirme que o site está online.";
      } else if (error.message.includes("certificate") || error.message.includes("SSL")) {
        errorMessage = "Erro de certificado SSL.";
        hint = "O site pode ter problemas com o certificado HTTPS. Verifique se o SSL está configurado corretamente.";
      } else {
        errorMessage = error.message;
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage, hint }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
