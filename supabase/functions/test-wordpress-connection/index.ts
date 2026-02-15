
import { createLogger, createRequestId } from "../_shared/logger.ts";

const FUNCTION_NAME = "test-wordpress-connection";
import { PLUGIN_MINIMUM_VERSION } from "../_shared/plugin-version.ts";
const MINIMUM_PLUGIN_VERSION = PLUGIN_MINIMUM_VERSION;

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

/**
 * Compare semantic versions: returns -1 if a < b, 0 if equal, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

// Common WordPress subpaths to try when root fails
const COMMON_WP_SUBPATHS = [
  "/blog",
  "/wordpress",
  "/wp",
  "/site",
  "/news",
  "/artigos",
  "/noticias",
];

/**
 * Attempts to find WordPress REST API by trying common subpaths
 */
async function discoverWordPressPath(baseUrl: string): Promise<{ found: boolean; path: string; wpJsonUrl: string }> {
  // First try root
  const rootWpJson = `${baseUrl}/wp-json/`;
  console.log(`Discovering WP path: trying root ${rootWpJson}`);
  
  try {
    const rootResponse = await fetch(rootWpJson, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });
    const contentType = rootResponse.headers.get("content-type") || "";
    
    if (rootResponse.ok && contentType.includes("application/json")) {
      console.log("WordPress found at root");
      return { found: true, path: "", wpJsonUrl: rootWpJson };
    }
  } catch (e) {
    console.log("Root check failed:", e);
  }

  // Try common subpaths
  for (const subpath of COMMON_WP_SUBPATHS) {
    const testUrl = `${baseUrl}${subpath}/wp-json/`;
    console.log(`Discovering WP path: trying ${testUrl}`);
    
    try {
      const response = await fetch(testUrl, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });
      const contentType = response.headers.get("content-type") || "";
      
      if (response.ok && contentType.includes("application/json")) {
        console.log(`WordPress found at subpath: ${subpath}`);
        return { found: true, path: subpath, wpJsonUrl: testUrl };
      }
    } catch (e) {
      console.log(`Subpath ${subpath} check failed:`, e);
    }
  }

  return { found: false, path: "", wpJsonUrl: "" };
}

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    log.requestStart(req.method);

    const body: TestConnectionRequest = await req.json();
    const { wordpress_url, use_plugin, api_key, wordpress_username, wordpress_app_password } = body;

    if (!wordpress_url) {
      log.warn("missing_url");
      log.requestEnd(400, Date.now() - startTime);
      return new Response(
        JSON.stringify({ success: false, error: "URL do WordPress não fornecida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let baseUrl = wordpress_url.replace(/\/$/, "");
    
    // Clean up URL: remove any existing wp-json or cfrdm paths that may have been incorrectly included
    baseUrl = baseUrl.replace(/\/wp-json(\/.*)?$/, "");
    baseUrl = baseUrl.replace(/\/(cfrdm|wp)(\/.*)?$/, "");
    
    // Track if URL was modified for correctedUrl response
    const originalUrl = wordpress_url.replace(/\/$/, "");
    const urlWasCleaned = baseUrl !== originalUrl;
    log.info("testing_connection", { baseUrl, originalUrl, urlWasCleaned, use_plugin: !!use_plugin });

    // Plugin-based authentication
    if (use_plugin && api_key) {
      // First, discover the WordPress path
      const discovery = await discoverWordPressPath(baseUrl);
      
      if (discovery.found && discovery.path) {
        baseUrl = `${baseUrl}${discovery.path}`;
        log.info("discovered_wp_path", { path: discovery.path });
      }

      // Try to get version info first (public endpoint, no auth required)
      let versionInfo: { version?: string; is_current?: boolean; features?: Record<string, boolean> } | null = null;
      try {
        const versionResponse = await fetch(`${baseUrl}/wp-json/cfrdm/v1/version`, {
          method: "GET",
          headers: { "Accept": "application/json" },
        });
        
        if (versionResponse.ok) {
          const versionContentType = versionResponse.headers.get("content-type") || "";
          if (versionContentType.includes("application/json")) {
            versionInfo = await versionResponse.json();
            log.info("version_endpoint_found", { version: versionInfo?.version });
          }
        }
      } catch (versionError) {
        log.info("version_endpoint_not_available", { error: "non-critical" });
      }

      log.info("testing_plugin", { url: `${baseUrl}/wp-json/cfrdm/v1/test` });
      
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
        
        log.info("plugin_response", { status: pluginResponse.status, contentType });

        if (!contentType.includes("application/json")) {
          // Try health check endpoint first (doesn't require auth)
          const healthResponse = await fetch(`${baseUrl}/wp-json/cfrdm/v1/health`, {
            method: "GET",
            headers: { "Accept": "application/json" },
          });

          const healthContentType = healthResponse.headers.get("content-type") || "";
          
          if (!healthContentType.includes("application/json")) {
            const pathHint = !discovery.found 
              ? " Se o WordPress está em uma subpasta (ex: /blog), inclua na URL."
              : "";
            
            log.warn("plugin_not_found", { discoveredPath: discovery.path });
            log.requestEnd(200, Date.now() - startTime);
            return new Response(
              JSON.stringify({ 
                success: false, 
                error: "Plugin ContentFactory RDM não encontrado ou não ativado.",
                hint: `Verifique se o plugin está instalado e ativo no WordPress.${pathHint}`,
                discoveredPath: discovery.path || null,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          log.warn("invalid_api_key");
          log.requestEnd(200, Date.now() - startTime);
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
          // Get version from multiple sources: /version endpoint, test response, or site info
          const pluginVersion = versionInfo?.version || pluginData.version || pluginData.site?.version || "1.0.0";
          const isOutdated = compareVersions(pluginVersion, MINIMUM_PLUGIN_VERSION) < 0;
          
          // Get feature availability from version endpoint if available
          const features = versionInfo?.features || {
            gsc_integration: !isOutdated,
            ai_auto_fix: !isOutdated,
            ubersuggest_sync: !isOutdated,
            https_enforcer: !isOutdated,
            content_enhancer: !isOutdated,
          };
          
          log.info("plugin_connection_success", { 
            site: pluginData.site, 
            version: pluginVersion,
            isOutdated,
            versionSource: versionInfo ? "version_endpoint" : "test_response"
          });
          log.requestEnd(200, Date.now() - startTime);
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: "Conexão via plugin estabelecida",
              site: pluginData.site,
              canPublish: true,
              discoveredPath: discovery.path || null,
              correctedUrl: (discovery.path || urlWasCleaned) ? baseUrl : null,
              pluginVersion,
              minimumVersion: MINIMUM_PLUGIN_VERSION,
              isOutdated,
              updateRequired: isOutdated,
              features,
              updateMessage: isOutdated 
                ? `⚠️ Atualização obrigatória: seu plugin está na v${pluginVersion}, mas a v${MINIMUM_PLUGIN_VERSION}+ é necessária para GSC, AI Auto-Fix e novas funcionalidades.`
                : null,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          log.warn("plugin_auth_failed", { message: pluginData.message });
          log.requestEnd(200, Date.now() - startTime);
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
        log.error("plugin_connection_error", { error: pluginError instanceof Error ? pluginError.message : "unknown" });
        log.requestEnd(200, Date.now() - startTime);
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
      log.warn("missing_credentials");
      log.requestEnd(400, Date.now() - startTime);
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais não fornecidas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Discover WordPress path for standard auth too
    const discovery = await discoverWordPressPath(baseUrl);
    
    if (discovery.found && discovery.path) {
      baseUrl = `${baseUrl}${discovery.path}`;
      log.info("discovered_wp_path", { path: discovery.path });
    }

    const apiUrl = `${baseUrl}/wp-json/wp/v2/posts?per_page=1`;
    const auth = btoa(`${wordpress_username}:${wordpress_app_password}`);

    log.info("testing_standard_api", { url: apiUrl });

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        "Accept": "application/json",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const responseText = await response.text();
    
    log.info("standard_api_response", { status: response.status, contentType });

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
        
        const pathHint = !discovery.found 
          ? " Se o WordPress está em uma subpasta (ex: /blog), inclua na URL."
          : "";
        
        log.warn("rest_api_html_response");
        log.requestEnd(200, Date.now() - startTime);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: detailedError,
            contentType,
            hint: `Acesse ${baseUrl}/wp-json/ no navegador para verificar se a REST API está ativa.${pathHint}`,
            discoveredPath: discovery.path || null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let postsData;
      try {
        postsData = JSON.parse(responseText);
      } catch {
        log.warn("invalid_json_response");
        log.requestEnd(200, Date.now() - startTime);
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
        log.info("user_info_fetch_failed", { error: "non-critical" });
      }

      log.info("connection_success", { canPublish });
      log.requestEnd(200, Date.now() - startTime);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Connection successful",
          canPublish,
          user: userInfo ? { name: userInfo.name, roles: userInfo.roles } : null,
          discoveredPath: discovery.path || null,
          correctedUrl: (discovery.path || urlWasCleaned) ? baseUrl : null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      log.warn("wordpress_api_error", { status: response.status });

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
        const pathHint = !discovery.found 
          ? " Se o WordPress está em uma subpasta (ex: /blog), inclua na URL."
          : "";
        hint = `Verifique se a REST API está ativada. Acesse ${baseUrl}/wp-json/ no navegador para testar.${pathHint}`;
      } else if (response.status === 500) {
        errorMessage = "Erro interno do WordPress.";
        hint = "Verifique os logs do WordPress ou desative plugins temporariamente para identificar o problema.";
      } else {
        errorMessage = `Erro HTTP ${response.status}.`;
        hint = "Verifique se o site está acessível e a REST API está funcionando.";
      }

      log.requestEnd(200, Date.now() - startTime);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage, 
          hint, 
          status: response.status,
          discoveredPath: discovery.path || null, 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    log.error("connection_test_error", { error: error instanceof Error ? error.message : "unknown" });
    
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

    log.requestEnd(200, Date.now() - startTime);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage, hint }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
