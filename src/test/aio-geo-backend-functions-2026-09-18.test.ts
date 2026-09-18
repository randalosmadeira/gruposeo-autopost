import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('sync-homepage-schema — Bloco C edge function', () => {
  const source = read('supabase/functions/sync-homepage-schema/index.ts');

  it('authenticates the same way as other simple functions (resolveRequestActor), not byok-resolver', () => {
    expect(source).toContain('resolveRequestActor');
    expect(source).not.toContain('byok-resolver');
    expect(source).not.toContain('getOrchestratorForUser');
  });

  it('confirms project ownership before touching WordPress', () => {
    expect(source).toContain('loadProjectForUser');
  });

  it('builds the homepage schema and injects it via the plugin route', () => {
    expect(source).toContain('buildHomepageJsonLd(project)');
    expect(source).toContain('"homepage-schema/inject"');
  });

  it('rejects projects without a configured WordPress plugin connection', () => {
    expect(source).toContain('wordpress_not_configured');
    expect(source).toContain('plugin_not_configured');
  });
});

describe('ai-geo-audit-proxy — Bloco H backend proxy', () => {
  const source = read('supabase/functions/ai-geo-audit-proxy/index.ts');

  it('authenticates the same way as other simple functions, not byok-resolver', () => {
    expect(source).toContain('resolveRequestActor');
    expect(source).not.toContain('byok-resolver');
    expect(source).not.toContain('getOrchestratorForUser');
  });

  it('confirms project ownership before proxying to WordPress', () => {
    expect(source).toContain('loadProjectForUser');
  });

  it('is a thin GET proxy to the plugin ai-audit route, with no scoring logic of its own', () => {
    expect(source).toContain('"ai-audit"');
    expect(source).toMatch(/method:\s*"GET"/);
    expect(source).not.toMatch(/score\s*[:=]\s*\d/); // never computes a score itself
  });
});

describe('manage-article-translation — Bloco D link/unlink + hreflang sync', () => {
  const source = read('supabase/functions/manage-article-translation/index.ts');

  it('authenticates the same way as other simple functions, not byok-resolver', () => {
    expect(source).toContain('resolveRequestActor');
    expect(source).not.toContain('byok-resolver');
    expect(source).not.toContain('getOrchestratorForUser');
  });

  it('confirms project ownership and blocks cross-project linking', () => {
    expect(source).toContain('loadProjectForUser');
    expect(source).toContain('cross_project_translation_blocked');
    expect(source).toContain('sibling.project_id !== article.project_id');
  });

  it('generates a fresh group id only when neither article has one, and reuses an existing group otherwise', () => {
    expect(source).toContain('crypto.randomUUID()');
    expect(source).toMatch(/groupA\s*&&\s*groupB\s*&&\s*groupA\s*!==\s*groupB/);
    expect(source).toContain('translation_group_conflict');
  });

  it('never attempts to merge two different existing translation groups', () => {
    expect(source).toMatch(/Fundir grupos não é suportado/);
  });

  it('dissolves a group left with a single member after unlink', () => {
    expect(source).toContain('groupDissolved');
    expect(source).toMatch(/remainingCount \|\| 0\)\s*===\s*1/);
  });

  it('reuses the shared hreflang sync helper instead of re-implementing the plugin call', () => {
    expect(source).toContain('import { syncHreflangForTranslationGroup } from "../_shared/hreflang-sync.ts";');
    expect(source).toContain('syncHreflangForTranslationGroup(admin, project,');
  });
});

describe('_shared/hreflang-sync.ts — single source of truth for the hreflang push', () => {
  const source = read('supabase/functions/_shared/hreflang-sync.ts');

  it('exports syncHreflangForTranslationGroup', () => {
    expect(source).toContain('export async function syncHreflangForTranslationGroup(');
  });

  it('never syncs with fewer than 2 published members', () => {
    expect(source).toMatch(/published\.length < 2/);
  });

  it('uses the article id as external_id, matching what publish-to-wordpress sends as zica_ai_id', () => {
    expect(source).toContain('external_id: articleId');
  });

  it('treats a 404 from the plugin as a skip, not a hard error', () => {
    expect(source).toMatch(/PluginRequestError.*status === 404/s);
  });
});

describe('publish-to-wordpress — post-publish hreflang family sync', () => {
  const source = read('supabase/functions/publish-to-wordpress/index.ts');

  it('imports the shared hreflang sync helper instead of duplicating its logic', () => {
    expect(source).toContain('import { syncHreflangForTranslationGroup } from "../_shared/hreflang-sync.ts";');
  });

  it('calls it after publishing when the article belongs to a translation group', () => {
    expect(source).toMatch(/status === "publish" && article\.translation_group_id/);
    expect(source).toContain('syncHreflangForTranslationGroup(admin, project, String(article.translation_group_id))');
  });

  it('reuses the shared plugin client instead of its own local pluginRequest/resolvePluginKey', () => {
    expect(source).toContain('from "../_shared/wordpress-plugin-client.ts"');
    expect(source).not.toContain('async function pluginRequest(');
    expect(source).not.toContain('async function resolvePluginKey(');
  });
});

describe('_shared/project-access.ts — shared project ownership check', () => {
  const source = read('supabase/functions/_shared/project-access.ts');

  it('exports loadProjectForUser and ProjectAccessError', () => {
    expect(source).toContain('export class ProjectAccessError');
    expect(source).toContain('export async function loadProjectForUser(');
  });

  it('grants access to the project owner or an active organization member', () => {
    expect(source).toContain('project.user_id === userId');
    expect(source).toContain('organization_members');
    expect(source).toMatch(/eq\("status",\s*"active"\)/);
  });
});

describe('_shared/wordpress-plugin-client.ts — shared plugin REST client', () => {
  const source = read('supabase/functions/_shared/wordpress-plugin-client.ts');

  it('exports the pieces publish-to-wordpress used to define locally', () => {
    expect(source).toContain('export async function pluginRequest(');
    expect(source).toContain('export async function resolvePluginKey(');
    expect(source).toContain('export function isPluginModeProject(');
  });

  it('uses the same X-ZICA-POSTS-Key header as before', () => {
    expect(source).toContain('"X-ZICA-POSTS-Key"');
  });
});
