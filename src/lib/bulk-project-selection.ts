import type { AnalyzedKeyword } from '@/lib/keyword-analyzer';

export interface BulkProjectTarget {
  id: string;
  name: string;
}

export interface BulkJobSeed {
  id: string;
  keyword: AnalyzedKeyword;
  projectId?: string;
  projectName?: string;
}

export const MAX_BULK_PROJECTS = 10;

/**
 * Expands the reviewed keyword list across every selected project so the same
 * editorial plan produces one independent article per project. Each article keeps
 * its own project_id, which is what supplies persona, CTA, links and the
 * WordPress connection downstream; nothing is shared between projects.
 *
 * With no projects the seeds carry no project (legacy single-project callers pass
 * the project id to startGeneration instead).
 */
export function expandKeywordsAcrossProjects(
  keywords: AnalyzedKeyword[],
  projects: BulkProjectTarget[] = [],
  now: number = Date.now(),
): BulkJobSeed[] {
  const unique = new Map<string, BulkProjectTarget>();
  for (const project of projects) if (project?.id && !unique.has(project.id)) unique.set(project.id, project);
  const targets = Array.from(unique.values()).slice(0, MAX_BULK_PROJECTS);

  if (!targets.length) {
    return keywords.map((keyword, index) => ({ id: `job-${index}-${now}`, keyword }));
  }

  const seeds: BulkJobSeed[] = [];
  targets.forEach((project, projectIndex) => {
    keywords.forEach((keyword, index) => {
      seeds.push({
        id: `job-${projectIndex}-${index}-${now}`,
        keyword,
        projectId: project.id,
        projectName: project.name,
      });
    });
  });
  return seeds;
}

/** Validation for the multi-project form. Returns a user-facing message or null. */
export function validateBulkProjectSelection(selectedIds: string[], knownIds: string[], selectedKeywords: number): string | null {
  const known = new Set(knownIds);
  if (!selectedIds.length) return 'Selecione ao menos um projeto antes de iniciar a geração em massa.';
  if (selectedIds.some((id) => !known.has(id))) return 'Um dos projetos selecionados não está mais disponível. Atualize a lista de projetos.';
  if (selectedIds.length > MAX_BULK_PROJECTS) return `Selecione no máximo ${MAX_BULK_PROJECTS} projetos por lote.`;
  if (selectedKeywords < 1) return 'Selecione ao menos uma palavra-chave para iniciar a fila.';
  return null;
}

export function describeBulkVolume(keywords: number, projects: number): string {
  const articles = keywords * Math.max(projects, 1);
  if (projects <= 1) return `${keywords} artigo(s)`;
  return `${keywords} palavra(s)-chave × ${projects} projetos = ${articles} artigos`;
}
