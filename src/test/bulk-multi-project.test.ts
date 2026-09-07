import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AnalyzedKeyword } from '@/lib/keyword-analyzer';
import {
  MAX_BULK_PROJECTS,
  describeBulkVolume,
  expandKeywordsAcrossProjects,
  validateBulkProjectSelection,
} from '@/lib/bulk-project-selection';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const kw = (keyword: string) => ({ keyword } as AnalyzedKeyword);

describe('bulk generation across several projects', () => {
  it('creates one independent job per keyword per project, keeping project identity on each job', () => {
    const seeds = expandKeywordsAcrossProjects([kw('habeas corpus'), kw('fraude pix')], [
      { id: 'p1', name: 'Blog RDM Advogados' },
      { id: 'p2', name: 'Direitos News' },
    ], 42);
    expect(seeds).toHaveLength(4);
    expect(seeds.map((seed) => `${seed.projectId}:${seed.keyword.keyword}`)).toEqual([
      'p1:habeas corpus', 'p1:fraude pix', 'p2:habeas corpus', 'p2:fraude pix',
    ]);
    expect(seeds.map((seed) => seed.projectName)).toEqual(['Blog RDM Advogados', 'Blog RDM Advogados', 'Direitos News', 'Direitos News']);
    expect(new Set(seeds.map((seed) => seed.id)).size).toBe(4);
  });

  it('keeps the legacy single-project behaviour when no project list is given', () => {
    const seeds = expandKeywordsAcrossProjects([kw('a'), kw('b')], [], 7);
    expect(seeds).toEqual([{ id: 'job-0-7', keyword: kw('a') }, { id: 'job-1-7', keyword: kw('b') }]);
  });

  it('ignores duplicated projects and caps the batch at the project limit', () => {
    const many = Array.from({ length: MAX_BULK_PROJECTS + 3 }, (_, index) => ({ id: `p${index}`, name: `P${index}` }));
    const seeds = expandKeywordsAcrossProjects([kw('x')], [...many, many[0], { id: '', name: 'vazio' }]);
    expect(seeds).toHaveLength(MAX_BULK_PROJECTS);
    expect(new Set(seeds.map((seed) => seed.projectId)).size).toBe(MAX_BULK_PROJECTS);
  });

  it('validates the selection before anything is queued', () => {
    expect(validateBulkProjectSelection([], ['p1'], 3)).toMatch(/ao menos um projeto/);
    expect(validateBulkProjectSelection(['ghost'], ['p1'], 3)).toMatch(/não está mais disponível/);
    expect(validateBulkProjectSelection(Array.from({ length: MAX_BULK_PROJECTS + 1 }, (_, i) => `p${i}`), Array.from({ length: 20 }, (_, i) => `p${i}`), 3)).toMatch(/no máximo/);
    expect(validateBulkProjectSelection(['p1'], ['p1'], 0)).toMatch(/ao menos uma palavra-chave/);
    expect(validateBulkProjectSelection(['p1', 'p2'], ['p1', 'p2'], 3)).toBeNull();
  });

  it('describes the resulting volume', () => {
    expect(describeBulkVolume(12, 1)).toBe('12 artigo(s)');
    expect(describeBulkVolume(12, 3)).toBe('12 palavra(s)-chave × 3 projetos = 36 artigos');
  });

  it('wires the page and the hook to per-job projects without touching the publication path', () => {
    const page = read('src/pages/BulkKeywordGenerator.tsx');
    const hook = read('src/hooks/useBulkGeneration.tsx');
    expect(page).toContain('useState<string[]>([])');
    expect(page).toContain('validateBulkProjectSelection(projectIds');
    expect(page).toContain('bulk.initializeJobs(selectedKeywords, selectedProjects.map((item) => ({ id: item.id, name: item.name })))');
    expect(page).not.toContain('<Select value={projectId}');
    expect(hook).toContain('expandKeywordsAcrossProjects(keywords, projects)');
    expect(hook).toContain('const projectFor = (job: GenerationJob) => job.projectId || fallbackProjectId;');
    expect(hook).toContain('project_id: projectFor(job) ?? null');
    expect(hook).toContain('projectId: projectFor(job),');
    expect(hook).toContain("companyName: job.projectName || bulkConfig?.companyName || ''");
    expect(hook).not.toContain('publish-to-wordpress');
  });
});
