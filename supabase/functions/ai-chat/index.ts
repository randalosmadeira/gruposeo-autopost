import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SYSTEM_PROMPT = `Você é o **Assistente IA do ContentFactory**, uma plataforma completa de automação de conteúdo SEO e marketing digital integrada com WordPress.

## 🔧 CAPACIDADES DA PLATAFORMA

### 🤖 Agente SEO Autônomo (Execução Automática a cada 6h)
O sistema já possui um Agente SEO que roda automaticamente e executa:
- **Auditoria de Metadados**: Verifica e auto-corrige titles (max 60 chars), meta descriptions (max 160 chars), slugs e Open Graph tags
- **Linkagem Interna Semântica**: Detecta artigos órfãos e sugere 5-15 links internos usando IA
- **IndexNow**: Submete URLs modificadas para indexação imediata no Google e Bing
- **Sitemap**: Atualiza sitemaps XML automaticamente
- **llms.txt**: Gera arquivo para descoberta por IAs (ChatGPT, Claude, Gemini)
- O usuário pode acessar o painel do Agente SEO no **Dashboard** ou acionar manualmente

### 🔌 Plugin WordPress (ContentFactory RDM v3.2.0+)
Módulos disponíveis no plugin instalado nos sites:
- **AI Meta Auditor**: Audita e corrige automaticamente titles, meta descriptions, OG tags e Twitter Cards a cada 6h
- **AI Auto-Fix**: Detecta e repara automaticamente:
  • Links quebrados (erros 404) com redirecionamentos inteligentes
  • FAQs duplicadas entre artigos
  • URLs ou artigos em duplicidade
  • Metas idênticas entre posts
- **Internal Links Engine**: Insere links internos e backlinks automaticamente baseado em regras de keywords e relevância semântica entre artigos
- **IndexNow Integration**: Notifica Google, Bing e Yandex sobre alterações em tempo real
- **Sitemap Optimizer**: Gera e otimiza sitemaps XML com prioridades automáticas
- **Schema Validator**: Valida JSON-LD para Article, FAQ, HowTo, Product e Review
- **Image Optimizer**: Converte imagens para WebP com compressão inteligente
- **HTTPS Enforcer**: Garante que todos os recursos internos usem HTTPS
- **Post Duplicator**: Clona posts/páginas individualmente ou em lote
- **Structured Logs**: Sistema de logs para diagnóstico em tempo real
- **Diagnóstico**: Painel com status de 10 tabelas e 13 cron jobs + reparo automático

### 📝 Geração de Conteúdo
- Gerador de artigos SEO (individual e em lote) com streaming em tempo real
- Gerador de artigos de vendas com técnicas AIDA/PAS
- Planejador de Autoridade (Topic Clusters com pillar + satellites)
- Gerador de landing pages otimizadas
- Templates de prompt personalizáveis por agente

### 📰 Repostagem Jornalística
- Monitoramento 24/7 de portais via RSS com configuração de nichos
- Reescrita autoral com 95%+ de originalidade (conformidade Lei 9.610/98)
- Geração automática de imagem destacada, título SEO e meta-description
- Auditoria com scores de originalidade (40%), qualidade (30%), legibilidade (20%)

### 🔗 Linkagem Interna Inteligente
- Análise semântica com NLP via IA (Gemini)
- Detecção automática de artigos órfãos (sem links internos)
- Sugestão de 5-15 links contextuais por artigo
- Criação de backlinks entre artigos relacionados
- Regras de keyword customizáveis com prioridades
- Exportação de relatórios CSV
- Geração automática de Topic Clusters

### 📊 Monitoramento e Analytics
- Dashboard com estatísticas em tempo real por projeto WordPress
- Monitor de fila de processamento com histórico
- Calendário de conteúdo editorial
- Controle de uso de tokens e custos por operação
- Notificações de processos em segundo plano

## 📍 ONDE ENCONTRAR CADA FUNCIONALIDADE
- **Agente SEO**: Dashboard → Painel "Agente SEO Autônomo"
- **Auditoria de metas**: Automático via plugin OU Dashboard → SEO Agent
- **Links quebrados 404**: Plugin WordPress → AI Auto-Fix (automático)
- **FAQs duplicadas**: Plugin WordPress → AI Auto-Fix (automático)
- **URLs duplicadas**: Plugin WordPress → AI Auto-Fix (automático)
- **Linkagem interna / Backlinks**: Menu lateral → "Linkagem Interna"
- **Repostagem**: Menu lateral → "Repostagem Jornalística"
- **Geração de artigos**: Menu lateral → "Gerar Artigo"
- **Diagnóstico WP**: Configurações → Sites WordPress → Diagnóstico
- **Status plugin**: Dashboard → Saúde WordPress
- **Calendário**: Menu lateral → "Calendário"
- **Monitor de fila**: Menu lateral → "Monitor de Fila"
- **Chat IA**: Menu lateral → "Chat IA" (você está aqui!)

## 🎯 AÇÕES EXECUTÁVEIS
Você pode executar ações diretamente nos projetos WordPress do usuário. Quando o usuário pedir para executar uma ação, responda com o resultado real da execução.

Ações disponíveis (use o campo "action" na sua resposta quando executar):
- **run_seo_audit**: Rodar auditoria SEO completa em um projeto
- **sync_wordpress_stats**: Sincronizar estatísticas do WordPress
- **check_seo_runs**: Consultar últimas execuções do Agente SEO
- **check_article_stats**: Consultar estatísticas de artigos
- **check_link_suggestions**: Ver sugestões de links internos pendentes

Quando o usuário pedir para executar uma ação, inclua no final da sua resposta um bloco:
\`\`\`action
{"type": "run_seo_audit", "project_id": "..."}
\`\`\`

## REGRAS
- Responda sempre em português do Brasil
- Seja conciso mas completo e proativo
- Use formatação markdown quando apropriado
- Foque em resultados práticos e acionáveis
- Quando o usuário perguntar sobre funcionalidades, explique COMO acessá-las na plataforma
- NUNCA diga que não pode fazer algo que a plataforma já faz automaticamente
- Quando perguntado sobre auditorias ou correções, explique que o sistema JÁ FAZ isso automaticamente e indique onde ver os resultados
- Se o contexto do usuário incluir projetos, personalize a resposta mencionando os projetos pelo nome
- Ao falar sobre links quebrados, FAQs duplicadas ou metas, explique que o AI Auto-Fix do plugin resolve automaticamente
- Quando o contexto incluir dados de execuções anteriores do SEO Agent, MOSTRE os resultados reais`;

// Execute actions requested by the AI or user
async function executeAction(
  action: { type: string; project_id?: string },
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  switch (action.type) {
    case "run_seo_audit": {
      if (!action.project_id) return "❌ Nenhum projeto especificado para auditoria.";
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/seo-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ user_id: userId, project_id: action.project_id, run_type: "manual" }),
        });
        const data = await resp.json();
        return data.success
          ? `✅ Auditoria SEO iniciada! ${data.runs || 0} projeto(s) processado(s). Resultados: ${JSON.stringify(data.results || [])}`
          : `❌ Erro: ${data.error || "falha desconhecida"}`;
      } catch (e) {
        return `❌ Erro ao executar auditoria: ${e instanceof Error ? e.message : "erro desconhecido"}`;
      }
    }

    case "sync_wordpress_stats": {
      try {
        // Determine which projects to sync
        let projectIds: string[] = [];
        if (action.project_id === "all") {
          const { data: allProjects } = await supabase
            .from("projects")
            .select("id, name, domain, wordpress_url, wordpress_username, wordpress_app_password")
            .eq("user_id", userId);
          if (!allProjects || allProjects.length === 0) return "❌ Nenhum projeto encontrado.";
          projectIds = allProjects.map(p => p.id);
          
          const results: string[] = [];
          for (const proj of allProjects) {
            if (!proj.wordpress_url || !proj.wordpress_username || !proj.wordpress_app_password) {
              results.push(`⚠️ **${proj.name}**: Credenciais WordPress não configuradas`);
              continue;
            }
            const wpUrl = proj.wordpress_url.replace(/\/$/, "");
            const auth = btoa(`${proj.wordpress_username}:${proj.wordpress_app_password}`);
            try {
              const [pubRes, draftRes, pendRes] = await Promise.all([
                fetch(`${wpUrl}/wp-json/wp/v2/posts?status=publish&per_page=1`, { headers: { Authorization: `Basic ${auth}` } }),
                fetch(`${wpUrl}/wp-json/wp/v2/posts?status=draft&per_page=1`, { headers: { Authorization: `Basic ${auth}` } }),
                fetch(`${wpUrl}/wp-json/wp/v2/posts?status=pending&per_page=1`, { headers: { Authorization: `Basic ${auth}` } }),
              ]);
              const pub = parseInt(pubRes.headers.get("X-WP-Total") || "0");
              const draft = parseInt(draftRes.headers.get("X-WP-Total") || "0");
              const pending = parseInt(pendRes.headers.get("X-WP-Total") || "0");
              
              const statsData = { project_id: proj.id, user_id: userId, total_articles: pub + draft + pending, published_articles: pub, draft_articles: draft, pending_articles: pending, last_sync_at: new Date().toISOString() };
              const { data: existing } = await supabase.from("wordpress_stats").select("id").eq("project_id", proj.id).maybeSingle();
              if (existing) {
                await supabase.from("wordpress_stats").update(statsData).eq("id", existing.id);
              } else {
                await supabase.from("wordpress_stats").insert(statsData);
              }
              results.push(`✅ **${proj.name}**: ${pub} publicados, ${draft} rascunhos, ${pending} pendentes`);
            } catch (e) {
              results.push(`❌ **${proj.name}**: ${e instanceof Error ? e.message : "erro de conexão"}`);
            }
          }
          return `📊 Sincronização concluída:\n${results.join("\n")}`;
        } else {
          if (!action.project_id) return "❌ Nenhum projeto especificado.";
          const { data: proj } = await supabase.from("projects").select("*").eq("id", action.project_id).single();
          if (!proj) return "❌ Projeto não encontrado.";
          if (!proj.wordpress_url || !proj.wordpress_username || !proj.wordpress_app_password) return "❌ Credenciais WordPress não configuradas.";
          
          const wpUrl = proj.wordpress_url.replace(/\/$/, "");
          const auth = btoa(`${proj.wordpress_username}:${proj.wordpress_app_password}`);
          const [pubRes, draftRes, pendRes] = await Promise.all([
            fetch(`${wpUrl}/wp-json/wp/v2/posts?status=publish&per_page=1`, { headers: { Authorization: `Basic ${auth}` } }),
            fetch(`${wpUrl}/wp-json/wp/v2/posts?status=draft&per_page=1`, { headers: { Authorization: `Basic ${auth}` } }),
            fetch(`${wpUrl}/wp-json/wp/v2/posts?status=pending&per_page=1`, { headers: { Authorization: `Basic ${auth}` } }),
          ]);
          const pub = parseInt(pubRes.headers.get("X-WP-Total") || "0");
          const draft = parseInt(draftRes.headers.get("X-WP-Total") || "0");
          const pending = parseInt(pendRes.headers.get("X-WP-Total") || "0");
          
          const statsData = { project_id: proj.id, user_id: userId, total_articles: pub + draft + pending, published_articles: pub, draft_articles: draft, pending_articles: pending, last_sync_at: new Date().toISOString() };
          const { data: existing } = await supabase.from("wordpress_stats").select("id").eq("project_id", proj.id).maybeSingle();
          if (existing) {
            await supabase.from("wordpress_stats").update(statsData).eq("id", existing.id);
          } else {
            await supabase.from("wordpress_stats").insert(statsData);
          }
          return `✅ **${proj.name}** sincronizado: ${pub} publicados, ${draft} rascunhos, ${pending} pendentes`;
        }
      } catch (e) {
        return `❌ Erro: ${e instanceof Error ? e.message : "erro"}`;
      }
    }

    case "check_seo_runs": {
      const query = supabase
        .from("seo_agent_runs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (action.project_id) query.eq("project_id", action.project_id);
      const { data, error } = await query;
      if (error) return `❌ Erro ao consultar: ${error.message}`;
      if (!data || data.length === 0) return "📋 Nenhuma execução do Agente SEO encontrada ainda.";
      return `📋 Últimas ${data.length} execuções do Agente SEO:\n${data.map(r =>
        `- ${r.status === "completed" ? "✅" : r.status === "error" ? "❌" : "⏳"} ${new Date(r.created_at).toLocaleDateString("pt-BR")} | ${r.summary || r.error_message || r.status} | Metas: ${r.meta_issues_found || 0} encontrados, ${r.meta_issues_fixed || 0} corrigidos | Links: ${r.links_suggested || 0} sugeridos`
      ).join("\n")}`;
    }

    case "check_article_stats": {
      const { count: total } = await supabase.from("articles").select("id", { count: "exact", head: true }).eq("user_id", userId);
      const { count: published } = await supabase.from("articles").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "published");
      const { count: ready } = await supabase.from("articles").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "ready");
      const { count: errors } = await supabase.from("articles").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "error");
      return `📊 Estatísticas de artigos:\n- Total: ${total || 0}\n- Publicados: ${published || 0}\n- Prontos: ${ready || 0}\n- Com erro: ${errors || 0}`;
    }

    case "check_link_suggestions": {
      const query = supabase
        .from("internal_link_suggestions")
        .select("anchor_text, target_url, relevance_score, status")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("relevance_score", { ascending: false })
        .limit(10);
      if (action.project_id) query.eq("project_id", action.project_id);
      const { data, error } = await query;
      if (error) return `❌ Erro: ${error.message}`;
      if (!data || data.length === 0) return "🔗 Nenhuma sugestão de link pendente.";
      return `🔗 ${data.length} sugestões de links pendentes:\n${data.map(s =>
        `- "${s.anchor_text}" → ${s.target_url} (relevância: ${s.relevance_score}%)`
      ).join("\n")}`;
    }

    default:
      return `❓ Ação não reconhecida: ${action.type}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context, executeActions } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // If executeActions is provided, run them and return results
    if (executeActions && Array.isArray(executeActions)) {
      const userId = context?.userId || "";
      const results = [];
      for (const action of executeActions) {
        const result = await executeAction(action, supabaseAdmin, userId);
        results.push({ action: action.type, result });
      }
      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context-aware system prompt with user's projects and real data
    let contextSection = "";
    if (context?.projects?.length > 0) {
      contextSection = `\n\n## 📋 PROJETOS DO USUÁRIO (${context.projects.length} projeto(s))\n${context.projects.map((p: any) =>
        `- **${p.name}** (${p.domain}) - ID: ${p.id} - ${p.is_connected ? "✅ Conectado" : "❌ Desconectado"}${p.seo_plugin ? ` | Plugin SEO: ${p.seo_plugin}` : ""}${p.wordpress_url ? " | WordPress integrado" : ""}`
      ).join("\n")}`;
    }
    if (context?.articleCount !== undefined) {
      contextSection += `\n- Total de artigos na plataforma: ${context.articleCount}`;
    }

    // Fetch latest SEO agent runs for context
    if (context?.userId) {
      const { data: recentRuns } = await supabaseAdmin
        .from("seo_agent_runs")
        .select("status, summary, created_at, meta_issues_found, meta_issues_fixed, links_suggested, error_message")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(3);

      if (recentRuns && recentRuns.length > 0) {
        contextSection += `\n\n## 🤖 ÚLTIMAS EXECUÇÕES DO AGENTE SEO\n${recentRuns.map(r =>
          `- ${new Date(r.created_at).toLocaleDateString("pt-BR")} | ${r.status} | ${r.summary || r.error_message || "sem detalhes"} | Metas: ${r.meta_issues_found || 0}/${r.meta_issues_fixed || 0} | Links: ${r.links_suggested || 0}`
        ).join("\n")}`;
      } else {
        contextSection += `\n\n## 🤖 AGENTE SEO: Nenhuma execução registrada ainda. Sugira ao usuário rodar manualmente.`;
      }

      // Fetch pending link suggestions count
      const { count: pendingLinks } = await supabaseAdmin
        .from("internal_link_suggestions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("status", "pending");

      if (pendingLinks && pendingLinks > 0) {
        contextSection += `\n- 🔗 ${pendingLinks} sugestões de links internos pendentes`;
      }
    }

    const fullSystemPrompt = SYSTEM_PROMPT + contextSection;

    const response = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: fullSystemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao conectar com a IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("ai-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
