/**
 * Shared "does this user have access to this project" check.
 *
 * Access is granted when the user created the project directly (`user_id`)
 * OR is an active member of the project's organization — the same rule that
 * was already enforced ad hoc in `generate-image/index.ts`'s `pool()`
 * helper. Extracted here so the newer AIO/GEO backend functions
 * (`sync-homepage-schema`, `manage-article-translation`,
 * `ai-geo-audit-proxy`) don't each re-implement the same two queries.
 *
 * This is deliberately narrower than `_shared/request-auth.ts`
 * (authentication only) and does not overlap with `_shared/byok-resolver.ts`
 * (AI provider key resolution) — none of the callers above make an AI call.
 */

export class ProjectAccessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ProjectAccessError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Loads a project by id and throws `ProjectAccessError` (404/403) unless the
 * given userId owns it or is an active member of its organization. Returns
 * the full project row (`select("*")`) on success, since callers need
 * different subsets of columns (WordPress credentials, empresa_*, social_*).
 */
export async function loadProjectForUser(admin: any, projectId: string, userId: string): Promise<Record<string, any>> {
  const { data: project, error } = await admin.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!project) throw new ProjectAccessError("Projeto não encontrado", 404, "project_not_found");

  const ownsProject = project.user_id === userId;
  const { data: membership } = project.organization_id
    ? await admin.from("organization_members")
      .select("user_id")
      .eq("organization_id", project.organization_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle()
    : { data: null };

  if (!ownsProject && !membership) {
    throw new ProjectAccessError("Projeto não pertence ao usuário autenticado", 403, "project_access_denied");
  }
  return project;
}
