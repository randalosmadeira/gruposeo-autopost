import '../_shared/nexus-runtime-bootstrap.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";
import { editorialFingerprint, signEditorialReceipt } from "../_shared/nexus-approval.ts";
import { normalizeEditorialHtml } from "../_shared/editorial-html.ts";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const actor = await resolveRequestActor(req);
    if (actor.mode !== "user") return json({ error: "Aprovação exige uma pessoa autenticada" }, 403);
    const body = await req.json();
    if (!body.articleId || !["inspect", "approve"].includes(body.action)) return json({ error: "Solicitação inválida" }, 400);
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
    const admin = createClient(Deno.env.get("SUPABASE_URL") || "", key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: article, error } = await admin.from("articles").select("*").eq("id", body.articleId).eq("user_id", actor.userId).maybeSingle();
    if (error) throw error;
    if (!article) return json({ error: "Artigo não encontrado ou acesso negado" }, 404);
    if (body.action === "inspect" && body.expectedUpdatedAt !== article.updated_at) return json({ error: "O artigo mudou. Recarregue a página para revisar o conteúdo atual." }, 409);
    const { data: project } = await admin.from("projects").select("*").eq("id", article.project_id).eq("user_id", actor.userId).maybeSingle();
    if (!project || !article.organization_id || article.organization_id !== project.organization_id) return json({ error: "Projeto ou organização inválidos" }, 403);
    const { data: permission, error: permissionError } = await admin.rpc("check_organization_publication_permission", { p_organization_id: article.organization_id, p_user_id: actor.userId, p_automated: false });
    if (permissionError || permission?.allowed !== true) return json({ error: "Seu papel não permite aprovar publicação" }, 403);
    const config = article.config && typeof article.config === "object" ? article.config : {};
    const hash = await editorialFingerprint(article, project);
    const audit = normalizeEditorialHtml(String(article.content || ""));
    const issues = [...audit.fatalIssues, ...(config.needs_primary_source ? ["Fonte primária pendente"] : []), ...(config.review_pass === false ? ["Revisão anterior reprovada"] : [])];
    if (body.action === "inspect") return json({ hash, issues, metrics: audit.metrics, approval: config.nexus_approval || null });
    if (body.action === "approve") return json({ error: "Aprovação autônoma obrigatória. Revisão por IA pendente enquanto serviços pagos estão bloqueados.", code: "autonomous_review_required" }, 409);
    if (body.expectedHash !== hash) return json({ error: "A versão mudou. Reabra a revisão antes de aprovar." }, 409);
    if (issues.length) return json({ error: "Resolva as pendências antes de aprovar", issues }, 409);
    if (!["facts", "benefits", "urgency", "destination"].every(name => body.checks?.[name] === true)) return json({ error: "Conclua o checklist de revisão" }, 422);
    const receipt = await signEditorialReceipt(hash, actor.userId, key);
    const { data: updated, error: saveError } = await admin.from("articles").update({ config: { ...config, nexus_approval_required: true, nexus_approval: receipt } }).eq("id", article.id).eq("user_id", actor.userId).eq("updated_at", article.updated_at).select("id").maybeSingle();
    if (saveError) throw saveError;
    if (!updated) return json({ error: "O artigo mudou durante a revisão. Atualize e tente novamente." }, 409);
    return json({ success: true, approval: receipt });
  } catch (error) {
    if (error instanceof RequestAuthError) return json({ error: error.message }, error.status);
    console.error("[nexus-editorial-approval] approval_failed");
    return json({ error: "Não foi possível concluir a revisão" }, 500);
  }
});
