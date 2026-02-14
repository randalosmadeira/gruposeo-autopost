import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { uploadId, action } = await req.json();

    // If action is "cleanup" — delete all completed files
    if (action === "cleanup") {
      const { data: completedUploads } = await supabaseAdmin
        .from("analysis_uploads")
        .select("id, file_path")
        .eq("user_id", user.id)
        .eq("status", "completed");

      if (completedUploads && completedUploads.length > 0) {
        // Delete files from storage
        const paths = completedUploads.map(u => u.file_path);
        await supabaseAdmin.storage.from("analysis-uploads").remove(paths);

        // Update status to cleaned
        const ids = completedUploads.map(u => u.id);
        await supabaseAdmin
          .from("analysis_uploads")
          .update({ status: "cleaned", cleaned_at: new Date().toISOString() })
          .in("id", ids);

        return new Response(JSON.stringify({
          success: true,
          cleaned: completedUploads.length,
          message: `${completedUploads.length} arquivo(s) removido(s) do armazenamento.`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        cleaned: 0,
        message: "Nenhum arquivo para limpar.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Analyze a specific upload
    if (!uploadId) {
      return new Response(JSON.stringify({ error: "uploadId obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get upload record (verify ownership)
    const { data: upload, error: uploadError } = await supabaseAdmin
      .from("analysis_uploads")
      .select("*")
      .eq("id", uploadId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!upload || uploadError) {
      return new Response(JSON.stringify({ error: "Upload não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to analyzing
    await supabaseAdmin
      .from("analysis_uploads")
      .update({ status: "analyzing" })
      .eq("id", uploadId);

    try {
      // Download file from storage
      const { data: fileData, error: downloadError } = await supabaseAdmin
        .storage
        .from("analysis-uploads")
        .download(upload.file_path);

      if (downloadError || !fileData) {
        throw new Error(`Erro ao baixar arquivo: ${downloadError?.message || "arquivo não encontrado"}`);
      }

      // Parse file content based on format
      let parsedContent = "";
      const format = upload.file_format;

      if (format === "csv") {
        const text = await fileData.text();
        parsedContent = text;
      } else if (format === "xlsx") {
        // For XLSX, we read as text (tab-separated fallback) or base64
        const text = await fileData.text();
        parsedContent = text;
      } else if (format === "pdf") {
        // For PDF, extract what we can as text
        const text = await fileData.text();
        parsedContent = text.substring(0, 50000); // Limit to 50k chars
      } else {
        const text = await fileData.text();
        parsedContent = text;
      }

      // Truncate to avoid token limits
      if (parsedContent.length > 80000) {
        parsedContent = parsedContent.substring(0, 80000) + "\n\n[... ARQUIVO TRUNCADO POR TAMANHO ...]";
      }

      // Detect file type from content
      const detectedType = detectFileType(parsedContent, upload.file_name);

      // Get user projects for context
      const { data: projects } = await supabaseAdmin
        .from("projects")
        .select("id, name, domain, nicho, wordpress_url")
        .eq("user_id", user.id);

      // Build AI analysis prompt
      const analysisPrompt = buildAnalysisPrompt(detectedType, parsedContent, upload.file_name, projects || []);

      // Get AI orchestrator
      let orchestrator;
      try {
        orchestrator = await getOrchestratorForUser(user.id, supabaseAdmin);
      } catch (orchErr) {
        console.error("Failed to create orchestrator:", orchErr);
        throw new Error("Falha ao inicializar IA para análise. Verifique suas configurações.");
      }

      const aiMessages = [
        {
          role: "system" as const,
          content: `Você é um especialista sênior em SEO e análise de dados. Analise arquivos exportados do Google Search Console, Ubersuggest e outras ferramentas SEO. 
Responda SEMPRE em JSON válido com a estrutura especificada.
Seja extremamente detalhado e acionável nas recomendações.
Priorize problemas por impacto potencial no tráfego.`,
        },
        { role: "user" as const, content: analysisPrompt },
      ];

      console.log(`[analyze-file] Calling AI for file ${upload.file_name} (${detectedType}), content length: ${parsedContent.length}`);

      let response;
      try {
        response = await orchestrator.call("data_analysis", aiMessages, {
          maxTokens: 8192,
          temperature: 0.3,
          preferredProvider: "gemini",
        });
      } catch (aiErr) {
        console.error("[analyze-file] AI call failed:", aiErr);
        throw new Error(`Falha na análise de IA: ${aiErr instanceof Error ? aiErr.message : "erro desconhecido"}`);
      }

      if (!response?.content) {
        throw new Error("A IA não retornou conteúdo na análise.");
      }

      // Parse AI response
      let analysisResult;
      try {
        // Try to extract JSON from response
        const jsonMatch = response.content.match(/```json\s*([\s\S]*?)\s*```/) ||
          response.content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response.content;
        analysisResult = JSON.parse(jsonStr);
      } catch {
        analysisResult = {
          summary: response.content,
          raw_analysis: true,
          issues: [],
          recommendations: [],
        };
      }

      // Update upload with results
      await supabaseAdmin
        .from("analysis_uploads")
        .update({
          status: "completed",
          file_type: detectedType,
          analysis_result: analysisResult,
          analyzed_at: new Date().toISOString(),
        })
        .eq("id", uploadId);

      return new Response(JSON.stringify({
        success: true,
        uploadId,
        fileType: detectedType,
        analysis: analysisResult,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (analysisError) {
      const errMsg = analysisError instanceof Error ? analysisError.message : "Erro desconhecido";
      await supabaseAdmin
        .from("analysis_uploads")
        .update({ status: "error", error_message: errMsg })
        .eq("id", uploadId);

      return new Response(JSON.stringify({ error: errMsg }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("analyze-file error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function detectFileType(content: string, fileName: string): string {
  const lowerName = fileName.toLowerCase();
  const lowerContent = content.substring(0, 2000).toLowerCase();

  // GSC indicators
  if (
    lowerName.includes("search-console") || lowerName.includes("gsc") ||
    lowerName.includes("search_analytics") || lowerName.includes("performance") ||
    lowerContent.includes("clicks") && lowerContent.includes("impressions") && lowerContent.includes("ctr") ||
    lowerContent.includes("coverage") || lowerContent.includes("index status")
  ) {
    return "gsc";
  }

  // Google Ads indicators
  if (
    lowerName.includes("google-ads") || lowerName.includes("googleads") || lowerName.includes("adwords") ||
    lowerContent.includes("campaign") && lowerContent.includes("cost") && lowerContent.includes("conversions") ||
    lowerContent.includes("ad group") || lowerContent.includes("quality score") ||
    lowerContent.includes("cost per click") || lowerContent.includes("search impression share")
  ) {
    return "google_ads";
  }

  // Google AdSense indicators
  if (
    lowerName.includes("adsense") ||
    lowerContent.includes("estimated earnings") || lowerContent.includes("page rpm") ||
    lowerContent.includes("ad requests") || lowerContent.includes("matched ad requests") ||
    lowerContent.includes("adsense") && lowerContent.includes("revenue")
  ) {
    return "adsense";
  }

  // Google Tag Manager indicators
  if (
    lowerName.includes("tag-manager") || lowerName.includes("tagmanager") || lowerName.includes("gtm") ||
    lowerContent.includes("containerId") || lowerContent.includes("gtm-") ||
    lowerContent.includes("\"tag\"") && lowerContent.includes("\"trigger\"") ||
    lowerContent.includes("tagmanager")
  ) {
    return "gtm";
  }

  // Ubersuggest indicators
  if (
    lowerName.includes("ubersuggest") ||
    lowerContent.includes("search volume") && lowerContent.includes("seo difficulty") ||
    lowerContent.includes("keyword suggestions") || lowerContent.includes("content ideas")
  ) {
    return "ubersuggest";
  }

  // SEMrush / Ahrefs indicators
  if (
    lowerName.includes("semrush") || lowerName.includes("ahrefs") ||
    lowerContent.includes("domain rating") || lowerContent.includes("referring domains")
  ) {
    return "seo_tool";
  }

  return "generic";
}

function buildAnalysisPrompt(
  fileType: string,
  content: string,
  fileName: string,
  projects: Array<{ name: string; domain: string; nicho: string | null }>,
): string {
  const projectsCtx = projects.length > 0
    ? `\n\nProjetos do usuário: ${projects.map(p => `${p.name} (${p.domain}, nicho: ${p.nicho || "geral"})`).join(", ")}`
    : "";

  const baseInstructions = `Analise o arquivo "${fileName}" (tipo detectado: ${fileType}).${projectsCtx}

Responda em JSON com esta estrutura:
{
  "file_type": "${fileType}",
  "summary": "Resumo executivo da análise em 2-3 frases",
  "total_records": número de registros/linhas analisados,
  "health_score": 0-100 (saúde geral SEO baseada nos dados),
  "critical_issues": [
    {"title": "...", "description": "...", "impact": "high|medium|low", "fix": "ação corretiva específica", "affected_urls": ["url1", "url2"]}
  ],
  "opportunities": [
    {"title": "...", "description": "...", "potential_traffic": "estimativa", "keywords": ["kw1", "kw2"], "priority": 1-10}
  ],
  "recommendations": [
    {"category": "indexação|conteúdo|técnico|linkagem|keywords", "action": "...", "priority": "alta|média|baixa", "effort": "fácil|médio|difícil"}
  ],
  "keyword_insights": {
    "top_performing": [{"keyword": "...", "clicks": 0, "impressions": 0, "ctr": 0, "position": 0}],
    "declining": [{"keyword": "...", "trend": "queda de X%"}],
    "opportunities": [{"keyword": "...", "reason": "...", "estimated_volume": 0}]
  },
  "technical_issues": [
    {"type": "404|redirect|crawl|index|mobile|speed", "url": "...", "description": "...", "fix": "..."}
  ],
  "content_gaps": [
    {"topic": "...", "reason": "...", "suggested_keywords": ["..."]}
  ],
  "action_plan": [
    {"step": 1, "action": "...", "expected_impact": "...", "timeline": "imediato|1 semana|1 mês"}
  ]
}`;

  let specificInstructions = "";

  if (fileType === "gsc") {
    specificInstructions = `\n\nEste é um relatório do Google Search Console. Foque em:
- Páginas não indexadas e motivos
- Keywords com alto impression mas baixo CTR (oportunidades de otimização de title/meta)
- Keywords próximas da posição 10 (facilmente rankeáveis com otimização)
- Erros de cobertura (404, redirect, blocked)
- Páginas com queda de posição (comparar períodos)
- Mobile usability issues
- Core Web Vitals problems`;
  } else if (fileType === "google_ads") {
    specificInstructions = `\n\nEste é um relatório do Google Ads. Foque em:
- Campanhas com alto CPC e baixa conversão (desperdício de budget)
- Quality Score baixo e como melhorar
- Keywords negativas faltando
- Ad groups com CTR abaixo da média do setor
- Oportunidades de extensões de anúncio
- Otimização de lances e estratégias de bidding
- Landing pages com baixa taxa de conversão`;
  } else if (fileType === "adsense") {
    specificInstructions = `\n\nEste é um relatório do Google AdSense. Foque em:
- Páginas com melhor RPM e como replicar
- Páginas com muitas impressões mas baixo RPM
- Formatos de anúncio mais rentáveis
- Otimização de posicionamento de ads
- Análise de receita por canal/fonte de tráfego
- Oportunidades de aumento de viewability`;
  } else if (fileType === "gtm") {
    specificInstructions = `\n\nEste é um export do Google Tag Manager. Foque em:
- Tags não disparando ou com erros
- Triggers duplicados ou conflitantes
- Variáveis mal configuradas
- Oportunidades de tracking faltando (conversões, scroll, cliques)
- Performance impact das tags
- Recomendações de organização e naming conventions`;
  } else if (fileType === "ubersuggest") {
    specificInstructions = `\n\nEste é um relatório do Ubersuggest. Foque em:
- Keywords com melhor relação volume/dificuldade SEO
- Content gaps vs competidores
- Backlink opportunities
- Keywords de cauda longa de alto potencial
- Clustering de keywords por tema/intenção de busca
- Análise de SERPs features (featured snippets, PAA, etc.)`;
  }

  return `${baseInstructions}${specificInstructions}\n\nDADOS DO ARQUIVO:\n\n${content}`;
}
