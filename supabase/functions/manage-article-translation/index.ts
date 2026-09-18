import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RequestAuthError, resolveRequestActor } from "../_shared/request-auth.ts";
import { loadProjectForUser, ProjectAccessError } from "../_shared/project-access.ts";
import { syncHreflangForTranslationGroup } from "../_shared/hreflang-sync.ts";

// Bloco D — links/unlinks two articles into the same `translation_group_id`
// (see migration 20260918020000_article_translation_groups.sql) and keeps
// the WordPress hreflang tags of the whole family in sync afterwards via
// `_shared/hreflang-sync.ts` (the same helper `publish-to-wordpress` calls
// post-publish, so the two never drift).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  action?: "link" | "unlink";
  articleId?: string;
  siblingArticleId?: string;
  userId?: string;
};

const ARTICLE_FIELDS = "id,project_id,organization_id,language,translation_group_id,published_url";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function fetchArticle(admin: any, articleId: string) {
  const { data, error } = await admin.from("articles").select(ARTICLE_FIELDS).eq("id", articleId).maybeSingle();
  if (error) throw error;
  return data as Record<string, any> | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({})) as Body;
    if (body.action !== "link" && body.action !== "unlink") {
      return json({ success: false, error: "action deve ser 'link' ou 'unlink'", request_id: requestId }, 400);
    }
    const articleId = String(body.articleId || "").trim();
    if (!articleId) return json({ success: false, error: "articleId é obrigatório", request_id: requestId }, 400);

    const actor = await resolveRequestActor(req, body.userId);
    const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
    const serviceKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Backend incompleto", request_id: requestId }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const article = await fetchArticle(admin, articleId);
    if (!article) return json({ success: false, error: "Artigo não encontrado", request_id: requestId }, 404);
    if (!article.project_id) {
      return json({
        success: false,
        error: "Artigo sem projeto associado — não é possível gerenciar tradução",
        code: "article_missing_project",
        request_id: requestId,
      }, 409);
    }

    // Ownership/authorization is checked at the PROJECT level (owner or
    // active organization member) — same rule `generate-image`'s `pool()`
    // and `publish-to-wordpress` already apply — because translation groups
    // only ever span one project (enforced below for `link`), so verifying
    // the shared project covers every article in the group.
    let project: Record<string, any>;
    try {
      project = await loadProjectForUser(admin, article.project_id, actor.userId);
    } catch (accessError) {
      if (accessError instanceof ProjectAccessError) {
        return json({ success: false, error: accessError.message, code: accessError.code, request_id: requestId }, accessError.status);
      }
      throw accessError;
    }
    if (article.organization_id && project.organization_id && article.organization_id !== project.organization_id) {
      return json({ success: false, error: "Fronteira organizacional inválida", code: "organization_boundary", request_id: requestId }, 403);
    }

    if (body.action === "unlink") {
      const oldGroup = String(article.translation_group_id || "").trim();
      if (!oldGroup) {
        return json({ success: true, articleId, alreadyUnlinked: true, request_id: requestId });
      }

      const now = new Date().toISOString();
      const { error: unlinkError } = await admin.from("articles")
        .update({ translation_group_id: null, updated_at: now })
        .eq("id", articleId);
      if (unlinkError) throw unlinkError;

      const { count: remainingCount, error: countError } = await admin.from("articles")
        .select("id", { count: "exact", head: true })
        .eq("translation_group_id", oldGroup);
      if (countError) throw countError;

      // A group of 1 no longer means anything for hreflang — dissolve it too.
      let groupDissolved = false;
      if ((remainingCount || 0) === 1) {
        const { data: lastMember } = await admin.from("articles").select("id").eq("translation_group_id", oldGroup).maybeSingle();
        if (lastMember?.id) {
          await admin.from("articles").update({ translation_group_id: null, updated_at: now }).eq("id", lastMember.id);
        }
        groupDissolved = true;
      }

      // Safe to call unconditionally: syncHreflangForTranslationGroup no-ops
      // when fewer than 2 published members remain (dissolved case included
      // — the query for `oldGroup` then returns 0 rows). When the group
      // survives with 2+ published members, this refreshes their maps to
      // drop the article that just left (see module doc for the one
      // documented gap: that departing article's own stale tag is not
      // cleaned up here).
      const hreflangSync = await syncHreflangForTranslationGroup(admin, project, oldGroup);

      return json({
        success: true,
        articleId,
        unlinkedFromGroup: oldGroup,
        groupDissolved,
        hreflangSync,
        request_id: requestId,
      });
    }

    // action === "link"
    const siblingArticleId = String(body.siblingArticleId || "").trim();
    if (!siblingArticleId) return json({ success: false, error: "siblingArticleId é obrigatório", request_id: requestId }, 400);
    if (siblingArticleId === articleId) {
      return json({ success: false, error: "Não é possível vincular um artigo a ele mesmo", code: "self_link_blocked", request_id: requestId }, 400);
    }

    const sibling = await fetchArticle(admin, siblingArticleId);
    if (!sibling) return json({ success: false, error: "Artigo irmão não encontrado", request_id: requestId }, 404);
    if (sibling.project_id !== article.project_id) {
      return json({
        success: false,
        error: "Os dois artigos precisam pertencer ao mesmo projeto para vincular tradução",
        code: "cross_project_translation_blocked",
        request_id: requestId,
      }, 409);
    }
    if (sibling.organization_id && project.organization_id && sibling.organization_id !== project.organization_id) {
      return json({ success: false, error: "Fronteira organizacional inválida", code: "organization_boundary", request_id: requestId }, 403);
    }

    const groupA = String(article.translation_group_id || "").trim();
    const groupB = String(sibling.translation_group_id || "").trim();
    const now = new Date().toISOString();
    let resultGroup: string;
    let alreadyLinked = false;

    if (groupA && groupB && groupA !== groupB) {
      // Deliberately not implemented: merging two existing translation
      // groups is rare and ambiguous (which group's id survives? what if a
      // language collides between the two?). Fail closed instead of
      // guessing — see the plan's Bloco D.
      return json({
        success: false,
        error: "Os dois artigos já pertencem a grupos de tradução diferentes. Fundir grupos não é suportado nesta versão.",
        code: "translation_group_conflict",
        groupA,
        groupB,
        request_id: requestId,
      }, 409);
    } else if (groupA && groupB) {
      resultGroup = groupA; // same group already — no-op
      alreadyLinked = true;
    } else if (groupA) {
      resultGroup = groupA;
      const { error } = await admin.from("articles").update({ translation_group_id: resultGroup, updated_at: now }).eq("id", siblingArticleId);
      if (error) throw error;
    } else if (groupB) {
      resultGroup = groupB;
      const { error } = await admin.from("articles").update({ translation_group_id: resultGroup, updated_at: now }).eq("id", articleId);
      if (error) throw error;
    } else {
      resultGroup = crypto.randomUUID();
      const { error } = await admin.from("articles").update({ translation_group_id: resultGroup, updated_at: now }).in("id", [articleId, siblingArticleId]);
      if (error) throw error;
    }

    const hreflangSync = await syncHreflangForTranslationGroup(admin, project, resultGroup);

    return json({
      success: true,
      articleId,
      siblingArticleId,
      translationGroupId: resultGroup,
      alreadyLinked,
      hreflangSync,
      request_id: requestId,
    });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return json({ success: false, error: error.message, code: error.code, request_id: requestId }, error.status);
    }
    return json({ success: false, error: error instanceof Error ? error.message : "Falha ao gerenciar tradução do artigo", request_id: requestId }, 500);
  }
});
