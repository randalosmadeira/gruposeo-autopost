import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getOrchestrator } from "../_shared/ai-orchestrator.ts";
import { getOrchestratorForUser } from "../_shared/byok-resolver.ts";
import { PLUGIN_VERSION, PLUGIN_PROMPT_BLOCK } from "../_shared/plugin-version.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é o **Assistente IA Premium do ContentFactory**, uma plataforma completa de automação de conteúdo SEO e marketing digital integrada com WordPress.

Você é um especialista sênior em SEO, marketing digital e automação de conteúdo. Suas respostas devem ser profundas, analíticas e estratégicas — nunca superficiais.

## 🧠 DIRETRIZES DE QUALIDADE
- **Pense passo a passo** antes de responder: analise o contexto completo do usuário
- **Seja proativo**: quando o usuário perguntar algo, vá além e ofereça insights adicionais relevantes
- **Use dados reais**: sempre que possível, baseie suas recomendações nos dados do usuário (projetos, artigos, execuções do agente SEO)
- **Dê exemplos concretos**: não fale em termos genéricos, use os domínios e keywords do usuário
- **Priorize ações**: quando houver múltiplos problemas, ordene por impacto (prioridade)
- **Explique o PORQUÊ**: não apenas diga o que fazer, explique o raciocínio estratégico por trás

## 🔧 CAPACIDADES DA PLATAFORMA

### 🤖 Agente SEO Autônomo (Execução Automática a cada 6h)
O sistema já possui um Agente SEO que roda automaticamente e executa:
- **Auditoria de Metadados**: Verifica e auto-corrige titles (max 60 chars), meta descriptions (max 160 chars), slugs e Open Graph tags
- **Linkagem Interna Semântica**: Detecta artigos órfãos e sugere 5-15 links internos usando IA
- **IndexNow**: Submete URLs modificadas para indexação imediata no Google e Bing
- **Sitemap**: Atualiza sitemaps XML automaticamente
- **llms.txt**: Gera arquivo para descoberta por IAs (ChatGPT, Claude, Gemini)
- O usuário pode acessar o painel do Agente SEO no **Dashboard** ou acionar manualmente

${PLUGIN_PROMPT_BLOCK}

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

## 🎯 AÇÕES EXECUTÁVEIS (LISTA COMPLETA — NADA ALÉM DISSO)
Você SOMENTE pode executar as ações abaixo. Se o usuário pedir algo que NÃO está nesta lista, diga claramente: "Essa ação não está disponível para execução automática pelo chat. Veja como fazer manualmente: [instruções]."

Lista EXAUSTIVA de ações:
- **run_seo_audit**: Rodar auditoria SEO (meta audit, links, indexação, sitemap)
- **sync_wordpress_stats**: Sincronizar estatísticas do WordPress
- **check_seo_runs**: Consultar últimas execuções do Agente SEO
- **check_article_stats**: Consultar estatísticas de artigos
- **check_link_suggestions**: Ver sugestões de links internos pendentes
- **apply_link_suggestions**: Aplicar sugestões de links internos no WordPress
- **trigger_indexnow**: Submeter URLs recentes para indexação
- **check_orphan_articles**: Listar artigos órfãos
- **check_wp_health**: Verificar saúde da conexão WordPress
- **check_token_usage**: Consultar uso de tokens e custos
- **run_all_projects_audit**: Rodar auditoria SEO em TODOS os projetos

Para executar, inclua no final da resposta:
\`\`\`action
{"type": "nome_da_acao", "project_id": "id_do_projeto_ou_all"}
\`\`\`

## 🚨 REGRA ANTI-ALUCINAÇÃO (INVIOLÁVEL)

**PROIBIDO FABRICAR RESULTADOS.** Esta é a regra mais importante do sistema:

1. **NUNCA invente números** de URLs removidas, links criados, duplicatas excluídas, redirects aplicados, artigos corrigidos, etc. Se você não executou a ação via bloco \`action\`, você NÃO sabe o resultado.

2. **NUNCA afirme que uma ação foi concluída** a menos que você tenha recebido o resultado REAL da execução (via executeAction). Frases como "289 duplicatas foram removidas" ou "1.200 links internos foram inseridos" são PROIBIDAS quando fabricadas.

3. **NUNCA diga "operação em andamento" ou "executando agora"** para ações que você não tem capacidade de executar. Isso é mentira e o usuário sabe.

4. **O que você NÃO PODE fazer** (e deve dizer claramente ao usuário):
   - Excluir posts/páginas do WordPress
   - Criar redirecionamentos 301 diretamente
   - Remover tags noindex
   - Modificar robots.txt
   - Regenerar sitemaps
   - Limpar cache do WordPress
   - Executar consultas no Google Search Console
   - Qualquer ação que NÃO esteja na lista de ações executáveis acima

5. **Quando o usuário pedir algo que você não pode fazer**, responda:
   - "Essa ação requer execução direta no WordPress ou via plugin. Aqui está como fazer: [instruções específicas]"
   - OU "O Agente SEO Autônomo pode fazer isso no próximo ciclo automático (a cada 6h). Para forçar, use o botão 'Auditoria SEO' no Dashboard."

6. **Dados reais SOMENTE**: Quando citar números, use APENAS os dados fornecidos na seção de contexto (ÚLTIMAS EXECUÇÕES DO AGENTE SEO, ESTATÍSTICAS WORDPRESS, etc). Se os dados não estão lá, diga "não tenho dados recentes sobre isso".

7. **Seja honesto sobre limitações**: É infinitamente melhor dizer "não tenho essa capacidade" do que fabricar um relatório falso. O usuário prefere a verdade.

## REGRAS DE QUALIDADE PREMIUM
- Responda sempre em português do Brasil
- **Analise profundamente** antes de responder — não dê respostas genéricas
- Use formatação markdown rica: headers, listas, negrito, tabelas quando apropriado
- **Sempre** inclua recomendações acionáveis com prioridades
- Quando o usuário perguntar sobre funcionalidades, explique COMO acessá-las na plataforma
- Se o contexto do usuário incluir projetos, personalize TODA a resposta mencionando os projetos pelo nome
- Quando o contexto incluir dados de execuções anteriores do SEO Agent, MOSTRE os resultados reais
- **Ofereça proativamente** executar ações que você REALMENTE pode executar (da lista acima)

## 🧬 FILOSOFIA "MADEIRA SEM VERNIZ" (APLICAR EM TODAS AS RESPOSTAS)
Quando o usuário pedir ajuda com criação de conteúdo, SEO ou estratégia:
- Flesch Reading Ease >= 60 (ideal 70-100): frases curtas (máx 25 palavras), parágrafos 3-4 linhas
- Vocabulário simples e acessível
- PROIBIDO: "Neste artigo...", "Vale ressaltar...", "Cabe mencionar...", parágrafos > 4 linhas
- HTML semântico limpo: <article>, <section>, <figure> (PROIBIDO: <div>, <span>, <b>, <i>)
- Meta-descriptions SEMPRE 145-160 chars com keyword nos primeiros 60
- NUNCA inventar ou alucinar URLs de CTAs ou redes sociais — usar APENAS do projeto

## CHECKLIST SEO INEGOCIÁVEL (aplicar em toda geração/otimização)
✅ Meta-description 145-160 chars ✅ Flesch >= 60 ✅ Links externos >= 2
✅ Links internos >= 10 ✅ FAQ 3-8 perguntas ✅ H1 = 1, H2 >= 5
✅ CTAs >= 5 (Urgência, Autoridade, Lead, Comunidade, Fechamento)
✅ Conteúdo original >= 40% ✅ Schema markup (Article, FAQPage)
✅ Todas redes sociais do projeto citadas ✅ Disclaimers de nicho`;

// Execute actions requested by the AI or user
async function executeAction(
  action: { type: string; project_id?: string },
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  switch (action.type) {
    case "run_seo_audit":
    case "run_all_projects_audit": {
      try {
        const body: Record<string, string> = { user_id: userId, run_type: "manual" };
        if (action.type === "run_seo_audit" && action.project_id && action.project_id !== "all") {
          body.project_id = action.project_id;
        }
        const resp = await fetch(`${supabaseUrl}/functions/v1/seo-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(body),
        });
        const text = await resp.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          console.error(`[ai-chat] seo-agent returned non-JSON (status ${resp.status}):`, text.substring(0, 500));
          return `❌ Erro ao executar auditoria: o agente SEO retornou uma resposta inválida (HTTP ${resp.status}). Tente novamente em alguns minutos ou acione manualmente pelo Dashboard.`;
        }
        return data.success
          ? `✅ Auditoria SEO concluída! ${data.runs || 0} projeto(s) processado(s).\n\n${(data.results || []).map((r: any) =>
            `**${r.project}**: ${r.status === "completed" ? r.summary : `❌ ${r.error}`}`
          ).join("\n")}`
          : `❌ Erro: ${data.error || "falha desconhecida"}`;
      } catch (e) {
        return `❌ Erro ao executar auditoria: ${e instanceof Error ? e.message : "erro desconhecido"}`;
      }
    }

    case "sync_wordpress_stats": {
      try {
        const { data: allProjects } = await supabase
          .from("projects")
          .select("id, name, domain, wordpress_url, wordpress_username, wordpress_app_password")
          .eq("user_id", userId);
        if (!allProjects || allProjects.length === 0) return "❌ Nenhum projeto encontrado.";

        const projectsToSync = action.project_id && action.project_id !== "all"
          ? allProjects.filter(p => p.id === action.project_id)
          : allProjects;

        const results: string[] = [];
        for (const proj of projectsToSync) {
          if (!proj.wordpress_url || !proj.wordpress_username || !proj.wordpress_app_password) {
            results.push(`⚠️ **${proj.name}**: Credenciais WordPress não configuradas`);
            continue;
          }
          const isPlugin = proj.wordpress_username === "__CFRDM_PLUGIN__";
          const wpUrl = proj.wordpress_url.replace(/\/wp-json\/cfrdm\/v1\/?$/, "").replace(/\/+$/, "");
          
          try {
            let pub = 0, draft = 0, pending = 0, comments = 0;
            let fetched = false;
            
            if (isPlugin) {
              // Try plugin stats endpoint first
              try {
                const statsResp = await fetch(`${wpUrl}/wp-json/cfrdm/v1/stats`, {
                  headers: { "X-CFRDM-API-Key": proj.wordpress_app_password! },
                  signal: AbortSignal.timeout(10000),
                });
                if (statsResp.ok) {
                  const pluginStats = await statsResp.json();
                  pub = pluginStats.published || 0;
                  draft = pluginStats.draft || 0;
                  pending = pluginStats.pending || 0;
                  comments = pluginStats.comments || 0;
                  fetched = pub > 0 || draft > 0 || pending > 0;
                }
              } catch { /* Plugin stats endpoint may not exist, fall through */ }
            }
            
            // Fallback: Use standard WP REST API (public, no auth needed for counts)
            if (!fetched) {
              try {
                const headers: Record<string, string> = {};
                if (!isPlugin) {
                  headers["Authorization"] = `Basic ${btoa(`${proj.wordpress_username}:${proj.wordpress_app_password}`)}`;
                }
                const [pubRes, draftRes, pendRes] = await Promise.all([
                  fetch(`${wpUrl}/wp-json/wp/v2/posts?status=publish&per_page=1`, { 
                    headers: isPlugin ? {} : headers,
                    signal: AbortSignal.timeout(15000),
                  }),
                  fetch(`${wpUrl}/wp-json/wp/v2/posts?status=draft&per_page=1`, { 
                    headers,
                    signal: AbortSignal.timeout(15000),
                  }).catch(() => null),
                  fetch(`${wpUrl}/wp-json/wp/v2/posts?status=pending&per_page=1`, { 
                    headers,
                    signal: AbortSignal.timeout(15000),
                  }).catch(() => null),
                ]);
                pub = parseInt(pubRes.headers.get("X-WP-Total") || "0");
                draft = draftRes ? parseInt(draftRes.headers.get("X-WP-Total") || "0") : 0;
                pending = pendRes ? parseInt(pendRes.headers.get("X-WP-Total") || "0") : 0;
              } catch (e2) {
                // If public API also fails, try to get count from our own index
                const { count: indexCount } = await supabase
                  .from("wordpress_article_index")
                  .select("id", { count: "exact", head: true })
                  .eq("project_id", proj.id);
                pub = indexCount || 0;
              }
            }

            const statsData = {
              project_id: proj.id,
              user_id: userId,
              total_articles: pub + draft + pending,
              published_articles: pub,
              draft_articles: draft,
              pending_articles: pending,
              total_comments: comments,
              last_sync_at: new Date().toISOString(),
            };
            const { data: existing } = await supabase.from("wordpress_stats").select("id").eq("project_id", proj.id).maybeSingle();
            if (existing) {
              await supabase.from("wordpress_stats").update(statsData).eq("id", existing.id);
            } else {
              await supabase.from("wordpress_stats").insert(statsData);
            }
            results.push(`✅ **${proj.name}**: ${pub} publicados, ${draft} rascunhos, ${pending} pendentes${comments > 0 ? `, ${comments} comentários` : ""}`);
          } catch (e) {
            results.push(`❌ **${proj.name}**: ${e instanceof Error ? e.message : "erro de conexão"}`);
          }
        }
        return `📊 Sincronização concluída:\n${results.join("\n")}`;
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
        .limit(10);
      if (action.project_id && action.project_id !== "all") query.eq("project_id", action.project_id);
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
      const { count: generating } = await supabase.from("articles").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "generating");
      const { count: drafts } = await supabase.from("articles").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "draft");
      const { count: errors } = await supabase.from("articles").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "error");
      return `📊 Estatísticas de artigos:\n- Total: ${total || 0}\n- Publicados: ${published || 0}\n- Prontos: ${ready || 0}\n- Em geração: ${generating || 0}\n- Rascunhos: ${drafts || 0}\n- Com erro: ${errors || 0}`;
    }

    case "check_link_suggestions": {
      const query = supabase
        .from("internal_link_suggestions")
        .select("anchor_text, target_url, relevance_score, status, anchor_context")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("relevance_score", { ascending: false })
        .limit(15);
      if (action.project_id && action.project_id !== "all") query.eq("project_id", action.project_id);
      const { data, error } = await query;
      if (error) return `❌ Erro: ${error.message}`;
      if (!data || data.length === 0) return "🔗 Nenhuma sugestão de link pendente.";
      
      const { count: totalPending } = await supabase.from("internal_link_suggestions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending");
      
      return `🔗 ${totalPending || data.length} sugestões de links pendentes (mostrando ${data.length}):\n${data.map(s =>
        `- "${s.anchor_text}" → ${s.target_url} (relevância: ${s.relevance_score}%)${s.anchor_context ? ` | ${s.anchor_context}` : ""}`
      ).join("\n")}`;
    }

    case "apply_link_suggestions": {
      // Get ALL pending suggestions — zero artificial limits
      let sugQuery = supabase
        .from("internal_link_suggestions")
        .select("id, anchor_text, target_url, relevance_score, project_id, source_wp_post_id")
        .eq("user_id", userId)
        .eq("status", "pending")
        .gte("relevance_score", 60)
        .order("relevance_score", { ascending: false });
      if (action.project_id && action.project_id !== "all") sugQuery = sugQuery.eq("project_id", action.project_id);
      const { data: suggestions, error } = await sugQuery;
      if (error) return `❌ Erro: ${error.message}`;
      if (!suggestions || suggestions.length === 0) return "✅ Nenhuma sugestão pendente com relevância ≥60% para aplicar.";

      // Get project info for WP API calls
      const projectIds = [...new Set(suggestions.map(s => s.project_id))];
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, wordpress_url, wordpress_username, wordpress_app_password")
        .in("id", projectIds);

      let applied = 0;
      let failed = 0;
      let skipped = 0;
      const failReasons: string[] = [];

      // Process in batches of 10 for throughput
      const batches: typeof suggestions[] = [];
      for (let i = 0; i < suggestions.length; i += 10) {
        batches.push(suggestions.slice(i, i + 10));
      }

      for (const batch of batches) {
        const batchPromises = batch.map(async (suggestion) => {
          const project = projects?.find(p => p.id === suggestion.project_id);
          if (!project?.wordpress_url || !project?.wordpress_username || !project?.wordpress_app_password) {
            skipped++;
            return;
          }

          const isPlugin = project.wordpress_username === "__CFRDM_PLUGIN__";
          const baseUrl = project.wordpress_url.replace(/\/wp-json\/cfrdm\/v1\/?$/, "").replace(/\/+$/, "");

          // Resolve source_wp_post_id if null
          let sourcePostId = suggestion.source_wp_post_id;
          if (!sourcePostId && suggestion.project_id) {
            const anchorWords = suggestion.anchor_text.split(/\s+/).filter((w: string) => w.length >= 4).slice(0, 3);
            if (anchorWords.length > 0) {
              const { data: candidates } = await supabase
                .from("wordpress_article_index")
                .select("wp_post_id")
                .eq("project_id", suggestion.project_id)
                .eq("wp_post_status", "publish")
                .neq("wp_post_url", suggestion.target_url)
                .order("word_count", { ascending: false })
                .limit(1);
              if (candidates && candidates.length > 0) {
                sourcePostId = candidates[0].wp_post_id;
              }
            }
          }

          if (isPlugin) {
            try {
              const applyResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/apply-internal-link`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-CFRDM-API-Key": project.wordpress_app_password!,
                },
                body: JSON.stringify({
                  target_url: suggestion.target_url,
                  anchor_text: suggestion.anchor_text,
                  source_post_id: sourcePostId || 0,
                }),
                signal: AbortSignal.timeout(20000),
              });

              if (applyResp.ok) {
                const data = await applyResp.json();
                if (data.success !== false) {
                  await supabase.from("internal_link_suggestions").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", suggestion.id);
                  applied++;
                } else {
                  failed++;
                  failReasons.push(`Post ${sourcePostId}: ${data.message || "falha desconhecida"}`);
                }
              } else if (applyResp.status === 422) {
                // 422 = post can't accept link (content structure issue) — mark rejected to avoid retrying
                await supabase.from("internal_link_suggestions").update({ 
                  status: "rejected", 
                  rejected_reason: "Post não suporta inserção de link (422)" 
                }).eq("id", suggestion.id);
                failed++;
                failReasons.push(`Post ${sourcePostId}: conteúdo não suporta inserção (422)`);
              } else if (applyResp.status === 404) {
                // Plugin endpoint missing — try direct WP REST API with plugin auth headers
                if (sourcePostId) {
                  try {
                    const pluginHeaders: Record<string, string> = {
                      "Content-Type": "application/json",
                      "X-CFRDM-API-Key": project.wordpress_app_password!,
                    };
                    // Get post content via plugin REST proxy
                    const getResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/get-post/${sourcePostId}`, {
                      headers: pluginHeaders,
                      signal: AbortSignal.timeout(10000),
                    });
                    
                    let postContent = "";
                    let useStandardApi = false;
                    
                    if (getResp.ok) {
                      const postData = await getResp.json();
                      postContent = postData.content || postData.post_content || "";
                    } else {
                      // Fallback: standard WP REST (public for published posts)
                      useStandardApi = true;
                      const stdResp = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${sourcePostId}?_fields=content`, {
                        signal: AbortSignal.timeout(10000),
                      });
                      if (stdResp.ok) {
                        const stdData = await stdResp.json();
                        postContent = stdData.content?.rendered || "";
                      }
                    }
                    
                    if (postContent && !postContent.includes(suggestion.target_url)) {
                      const paragraphs = postContent.split("</p>");
                      const insertAt = Math.min(3, paragraphs.length - 1);
                      const linkHtml = `<p class="cfrdm-internal-link"><strong>Leia também:</strong> <a href="${suggestion.target_url}" title="${suggestion.anchor_text}">${suggestion.anchor_text}</a></p>`;
                      paragraphs.splice(insertAt, 0, linkHtml);
                      const newContent = paragraphs.join("</p>");

                      // Update via plugin endpoint
                      const updateResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/update-post`, {
                        method: "POST",
                        headers: pluginHeaders,
                        body: JSON.stringify({ post_id: sourcePostId, content: newContent }),
                        signal: AbortSignal.timeout(15000),
                      });
                      if (updateResp.ok) {
                        await supabase.from("internal_link_suggestions").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", suggestion.id);
                        applied++;
                      } else {
                        failed++;
                        failReasons.push(`WP update post ${sourcePostId} falhou (${updateResp.status})`);
                      }
                    } else if (postContent && postContent.includes(suggestion.target_url)) {
                      // Already has the link — mark as applied
                      await supabase.from("internal_link_suggestions").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", suggestion.id);
                      applied++;
                    } else {
                      // Post not found or empty
                      await supabase.from("internal_link_suggestions").update({ 
                        status: "rejected", 
                        rejected_reason: `Post ${sourcePostId} não encontrado ou sem conteúdo` 
                      }).eq("id", suggestion.id);
                      failed++;
                    }
                  } catch (wpErr) {
                    failed++;
                    failReasons.push(`Fallback: ${wpErr instanceof Error ? wpErr.message : "erro"}`);
                  }
                } else {
                  // No source post — mark rejected
                  await supabase.from("internal_link_suggestions").update({ 
                    status: "rejected", 
                    rejected_reason: "Sem source_post_id" 
                  }).eq("id", suggestion.id);
                  failed++;
                }
              } else {
                failed++;
                const errBody = await applyResp.text().catch(() => "");
                failReasons.push(`apply retornou ${applyResp.status}: ${errBody.slice(0, 100)}`);
              }
            } catch (e) {
              failed++;
              failReasons.push(e instanceof Error ? e.message : "timeout");
            }
          } else {
            await supabase.from("internal_link_suggestions").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", suggestion.id);
            applied++;
          }
        });

        await Promise.all(batchPromises);
      }

      let result = `🔗 Resultado da aplicação:\n- ✅ ${applied} links aplicados com sucesso\n- ❌ ${failed} falharam\n- Total processado: ${suggestions.length}`;
      if (skipped > 0) result += `\n- ⚠️ ${skipped} ignorados (sem credenciais WP)`;
      if (failReasons.length > 0) {
        const uniqueReasons = [...new Set(failReasons)].slice(0, 10);
        result += `\n\n**Motivos das falhas:**\n${uniqueReasons.map(r => `- ${r}`).join("\n")}`;
      }
      return result;
    }

    case "trigger_indexnow": {
      try {
        const { data: projects } = await supabase
          .from("projects")
          .select("id, name, wordpress_url, wordpress_username, wordpress_app_password")
          .eq("user_id", userId)
          .eq("is_connected", true);

        if (!projects || projects.length === 0) return "❌ Nenhum projeto conectado encontrado.";

        const projectsToProcess = action.project_id && action.project_id !== "all"
          ? projects.filter(p => p.id === action.project_id)
          : projects;

        const results: string[] = [];
        for (const proj of projectsToProcess) {
          if (!proj.wordpress_url || proj.wordpress_username !== "__CFRDM_PLUGIN__" || !proj.wordpress_app_password) {
            results.push(`⚠️ **${proj.name}**: Plugin não configurado (necessário para IndexNow)`);
            continue;
          }
          const baseUrl = proj.wordpress_url.replace(/\/wp-json\/cfrdm\/v1\/?$/, "").replace(/\/+$/, "");
          try {
            // Get recent articles
            const { data: recentArticles } = await supabase
              .from("wordpress_article_index")
              .select("wp_post_url")
              .eq("project_id", proj.id)
              .gte("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
              .limit(100);

            if (!recentArticles || recentArticles.length === 0) {
              results.push(`ℹ️ **${proj.name}**: Nenhum artigo modificado nas últimas 24h`);
              continue;
            }

            const urls = recentArticles.map(a => a.wp_post_url).filter(Boolean);
            const resp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/indexnow-batch`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CFRDM-API-Key": proj.wordpress_app_password!,
              },
              body: JSON.stringify({ urls }),
            });
            results.push(resp.ok
              ? `✅ **${proj.name}**: ${urls.length} URLs submetidas para indexação`
              : `❌ **${proj.name}**: Erro ao enviar para IndexNow (${resp.status})`);
          } catch (e) {
            results.push(`❌ **${proj.name}**: ${e instanceof Error ? e.message : "erro"}`);
          }
        }
        return `🚀 IndexNow:\n${results.join("\n")}`;
      } catch (e) {
        return `❌ Erro: ${e instanceof Error ? e.message : "erro"}`;
      }
    }

    case "check_orphan_articles": {
      const query = supabase
        .from("wordpress_article_index")
        .select("wp_post_title, wp_post_url, seo_score, internal_links_count, primary_keyword")
        .eq("user_id", userId)
        .lte("internal_links_count", 0)
        .order("seo_score", { ascending: true })
        .limit(20);
      if (action.project_id && action.project_id !== "all") query.eq("project_id", action.project_id);
      const { data, error } = await query;
      if (error) return `❌ Erro: ${error.message}`;
      if (!data || data.length === 0) return "✅ Nenhum artigo órfão encontrado! Todos os artigos possuem links internos.";

      const { count: totalOrphans } = await supabase.from("wordpress_article_index").select("id", { count: "exact", head: true }).eq("user_id", userId).lte("internal_links_count", 0);

      return `🔍 ${totalOrphans || data.length} artigos órfãos (sem links internos):\n${data.map(a =>
        `- **${a.wp_post_title}** | SEO: ${a.seo_score || 0}/100 | Keyword: ${a.primary_keyword || "N/A"}\n  ${a.wp_post_url}`
      ).join("\n")}`;
    }

    case "check_wp_health": {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, domain, wordpress_url, wordpress_username, wordpress_app_password, seo_plugin, is_connected")
        .eq("user_id", userId);

      if (!projects || projects.length === 0) return "❌ Nenhum projeto encontrado.";

      const projectsToCheck = action.project_id && action.project_id !== "all"
        ? projects.filter(p => p.id === action.project_id)
        : projects;

      const results: string[] = [];
      for (const proj of projectsToCheck) {
        if (!proj.wordpress_url) {
          results.push(`⚠️ **${proj.name}** (${proj.domain}): WordPress não configurado`);
          continue;
        }
        
        const isPlugin = proj.wordpress_username === "__CFRDM_PLUGIN__";
        const baseUrl = proj.wordpress_url.replace(/\/wp-json\/cfrdm\/v1\/?$/, "").replace(/\/+$/, "");
        
        try {
          const startTime = Date.now();
          if (isPlugin) {
            const healthResp = await fetch(`${baseUrl}/wp-json/cfrdm/v1/health`, {
              headers: { "X-CFRDM-API-Key": proj.wordpress_app_password! },
            });
            const latency = Date.now() - startTime;
            if (healthResp.ok) {
              const healthData = await healthResp.json();
              results.push(`✅ **${proj.name}** (${proj.domain}):\n  - Plugin: v${healthData.version || "?"} | Latência: ${latency}ms\n  - Módulos: ${healthData.modules_active || "N/A"}\n  - Cron jobs: ${healthData.cron_count || "N/A"}`);
            } else {
              results.push(`⚠️ **${proj.name}** (${proj.domain}): Plugin respondeu com status ${healthResp.status} (${latency}ms)`);
            }
          } else {
            const auth = btoa(`${proj.wordpress_username}:${proj.wordpress_app_password}`);
            const wpResp = await fetch(`${baseUrl}/wp-json/wp/v2/posts?per_page=1`, {
              headers: { Authorization: `Basic ${auth}` },
            });
            const latency = Date.now() - startTime;
            results.push(wpResp.ok
              ? `✅ **${proj.name}** (${proj.domain}): Conexão REST API OK (${latency}ms) | Plugin SEO: ${proj.seo_plugin || "nenhum"}`
              : `❌ **${proj.name}** (${proj.domain}): Conexão falhou (status ${wpResp.status}, ${latency}ms)`);
          }
        } catch (e) {
          results.push(`❌ **${proj.name}** (${proj.domain}): Timeout/erro de conexão — ${e instanceof Error ? e.message : "erro"}`);
        }
      }
      return `🏥 Status de Saúde WordPress:\n${results.join("\n")}`;
    }

    case "check_token_usage": {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: usage } = await supabase
        .from("token_usage_logs")
        .select("provider, model, operation, estimated_cost_usd, total_tokens, created_at")
        .eq("user_id", userId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!usage || usage.length === 0) return "📊 Nenhum uso de tokens registrado nos últimos 30 dias.";

      const totalCost = usage.reduce((sum, u) => sum + (u.estimated_cost_usd || 0), 0);
      const totalTokens = usage.reduce((sum, u) => sum + (u.total_tokens || 0), 0);
      const byProvider: Record<string, { cost: number; count: number }> = {};
      const byOperation: Record<string, { cost: number; count: number }> = {};

      for (const u of usage) {
        const prov = u.provider || "unknown";
        if (!byProvider[prov]) byProvider[prov] = { cost: 0, count: 0 };
        byProvider[prov].cost += u.estimated_cost_usd || 0;
        byProvider[prov].count++;

        const op = u.operation || "unknown";
        if (!byOperation[op]) byOperation[op] = { cost: 0, count: 0 };
        byOperation[op].cost += u.estimated_cost_usd || 0;
        byOperation[op].count++;
      }

      let report = `💰 Uso de Tokens (últimos 30 dias):\n- **Custo total**: $${totalCost.toFixed(4)} USD\n- **Total tokens**: ${totalTokens.toLocaleString()}\n- **Requisições**: ${usage.length}\n\n`;
      report += `**Por provedor:**\n${Object.entries(byProvider).map(([k, v]) => `- ${k}: $${v.cost.toFixed(4)} (${v.count} req)`).join("\n")}\n\n`;
      report += `**Por operação:**\n${Object.entries(byOperation).map(([k, v]) => `- ${k}: $${v.cost.toFixed(4)} (${v.count} req)`).join("\n")}`;

      return report;
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify at least one AI key is available
    // Load user's BYOK keys for AI calls
    const userId = context?.userId || "";
    let orchestrator;
    if (userId) {
      try {
        orchestrator = await getOrchestratorForUser(userId);
      } catch {
        orchestrator = getOrchestrator();
      }
    } else {
      orchestrator = getOrchestrator();
    }
    const availableProviders = orchestrator.getAvailableProviders();
    if (availableProviders.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma chave de IA configurada. Configure GEMINI_API_KEY ou OPENAI_API_KEY nas configurações." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
        .select("status, summary, created_at, meta_issues_found, meta_issues_fixed, links_suggested, links_applied, indexing_submitted, error_message, project_id")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (recentRuns && recentRuns.length > 0) {
        contextSection += `\n\n## 🤖 ÚLTIMAS EXECUÇÕES DO AGENTE SEO\n${recentRuns.map(r =>
          `- ${new Date(r.created_at).toLocaleDateString("pt-BR")} | ${r.status} | ${r.summary || r.error_message || "sem detalhes"} | Metas: ${r.meta_issues_found || 0}/${r.meta_issues_fixed || 0} | Links: ${r.links_suggested || 0} sugeridos, ${r.links_applied || 0} aplicados | IndexNow: ${r.indexing_submitted || 0}`
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

      // Fetch orphan articles count
      const { count: orphanCount } = await supabaseAdmin
        .from("wordpress_article_index")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .lte("internal_links_count", 0);

      if (orphanCount && orphanCount > 0) {
        contextSection += `\n- 🔍 ${orphanCount} artigos órfãos (sem links internos) detectados`;
      }

      // Fetch WordPress stats for context
      const { data: wpStats } = await supabaseAdmin
        .from("wordpress_stats")
        .select("project_id, total_articles, published_articles, draft_articles, seo_issues, broken_links, articles_without_links, last_sync_at")
        .eq("user_id", context.userId);

      if (wpStats && wpStats.length > 0) {
        contextSection += `\n\n## 📊 ESTATÍSTICAS WORDPRESS\n${wpStats.map(s => {
          const proj = context.projects?.find((p: any) => p.id === s.project_id);
          return `- **${proj?.name || s.project_id}**: ${s.total_articles || 0} artigos (${s.published_articles || 0} pub, ${s.draft_articles || 0} rascunhos) | SEO issues: ${s.seo_issues || 0} | Última sync: ${s.last_sync_at ? new Date(s.last_sync_at).toLocaleDateString("pt-BR") : "nunca"}`;
        }).join("\n")}`;
      }

      // Fetch recent token usage
      const { data: recentUsage } = await supabaseAdmin
        .from("token_usage_logs")
        .select("estimated_cost_usd")
        .eq("user_id", context.userId)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (recentUsage && recentUsage.length > 0) {
        const totalCost = recentUsage.reduce((sum, u) => sum + (u.estimated_cost_usd || 0), 0);
        contextSection += `\n- 💰 Custo total últimos 30 dias: $${totalCost.toFixed(4)} USD (${recentUsage.length} operações)`;
      }
    }

    const fullSystemPrompt = SYSTEM_PROMPT + contextSection;

    // Use AIOrchestrator for streaming - prefers Gemini, falls back to OpenAI
    const aiMessages = [
      { role: "system" as const, content: fullSystemPrompt },
      ...messages.map((m: any) => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    ];

    try {
      const streamResponse = await orchestrator.callStream("strategy_planning", aiMessages, {
        maxTokens: 4096,
        temperature: 0.7,
        preferredProvider: "gemini",
      });

      // Merge CORS headers with stream response
      const responseHeaders = new Headers(streamResponse.headers);
      for (const [key, value] of Object.entries(corsHeaders)) {
        responseHeaders.set(key, value);
      }

      return new Response(streamResponse.body, { headers: responseHeaders });
    } catch (aiError) {
      console.error("AI streaming error:", aiError);
      return new Response(
        JSON.stringify({ error: `Erro na IA: ${aiError instanceof Error ? aiError.message : "erro desconhecido"}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("ai-chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
