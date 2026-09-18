/**
 * Shared hreflang-family sync: builds the `{lang: url}` map for a
 * translation group and pushes it to every already-published member's
 * WordPress site via the plugin's `POST /articles/hreflang-sync` route.
 *
 * Used by both `manage-article-translation` (after a link/unlink that
 * leaves a group with 2+ published members) and `publish-to-wordpress`
 * (after a translated article is (re)published), so the two never
 * re-implement the same map-building/dispatch logic and can't drift apart.
 *
 * Scope cut (documented, not a bug): when `manage-article-translation`
 * `unlink`s an article that leaves only 1 (or 0) published siblings behind,
 * this is NOT called for the article that just left the group — its own
 * `_zica_posts_hreflang_map` on the WordPress side stays stale until the
 * next publish/sync touches it. Implementing that cleanup is extra scope
 * for this version (see the plan's Bloco D).
 */
import { isPluginModeProject, PluginRequestError, pluginRequest, resolvePluginKey, resolvePluginNamespace } from "./wordpress-plugin-client.ts";

export type HreflangSyncResult = {
  translationGroupId: string;
  memberCount: number;
  publishedCount: number;
  synced: Array<{ articleId: string; language: string }>;
  skipped: Array<{ articleId: string; reason: string }>;
  errors: Array<{ articleId: string; error: string }>;
};

function emptyResult(translationGroupId: string): HreflangSyncResult {
  return { translationGroupId, memberCount: 0, publishedCount: 0, synced: [], skipped: [], errors: [] };
}

/**
 * `project` must be the WordPress site shared by every member of the group
 * (translation groups only ever span one project — see the migration
 * `20260918020000_article_translation_groups.sql` and
 * `manage-article-translation`, which enforces this at link time).
 */
export async function syncHreflangForTranslationGroup(
  admin: any,
  project: Record<string, any>,
  translationGroupId: string,
): Promise<HreflangSyncResult> {
  const groupId = String(translationGroupId || "").trim();
  if (!groupId) return emptyResult(groupId);

  const { data: members, error } = await admin
    .from("articles")
    .select("id,language,published_url")
    .eq("translation_group_id", groupId);
  if (error) throw error;

  const result = emptyResult(groupId);
  result.memberCount = members?.length || 0;

  const published = (members || []).filter((member: Record<string, any>) => String(member.published_url || "").trim());
  result.publishedCount = published.length;

  // A single (or zero) published member has no sibling to point to — nothing
  // to sync yet. This also safely covers the "group just dissolved" case:
  // once every member's translation_group_id is nulled out, the query above
  // returns 0 rows and this returns the empty result.
  if (published.length < 2) return result;

  if (!isPluginModeProject(project)) {
    for (const member of published) result.skipped.push({ articleId: String(member.id), reason: "wordpress_not_plugin_mode" });
    return result;
  }

  const baseUrl = String(project.wordpress_url || "").replace(/\/+$/, "");
  if (!baseUrl) {
    for (const member of published) result.skipped.push({ articleId: String(member.id), reason: "wordpress_url_missing" });
    return result;
  }

  let apiKey: string;
  try {
    apiKey = (await resolvePluginKey(admin, project)).apiKey;
  } catch (credentialError) {
    const message = credentialError instanceof Error ? credentialError.message : "credencial_wordpress_indisponivel";
    for (const member of published) result.errors.push({ articleId: String(member.id), error: message });
    return result;
  }

  const namespace = resolvePluginNamespace(project);
  const hreflangMap: Record<string, string> = {};
  for (const member of published) {
    const lang = String(member.language || "").trim();
    const url = String(member.published_url || "").trim();
    if (lang && url) hreflangMap[lang] = url;
  }

  for (const member of published) {
    const articleId = String(member.id);
    try {
      const response = await pluginRequest(baseUrl, apiKey, "articles/hreflang-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ external_id: articleId, hreflang_map: hreflangMap }),
        signal: AbortSignal.timeout(30000),
      }, namespace);
      if (response.data?.success) {
        result.synced.push({ articleId, language: String(member.language || "") });
      } else {
        result.errors.push({ articleId, error: String(response.data?.message || "hreflang_sync_recusado") });
      }
    } catch (syncError) {
      // 404 (plugin code zica_posts_hreflang_not_found) means this
      // article's external_id does not exist on THIS WordPress site —
      // expected when a sibling is published on a different domain, not a
      // real error. Anything else is a genuine failure.
      if (syncError instanceof PluginRequestError && syncError.status === 404) {
        result.skipped.push({ articleId, reason: "not_found_on_site" });
      } else {
        result.errors.push({ articleId, error: syncError instanceof Error ? syncError.message : "hreflang_sync_error" });
      }
    }
  }

  return result;
}
