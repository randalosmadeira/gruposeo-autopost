import { describe, expect, it } from 'vitest';
import { validateBulkGenerationSelection } from '@/lib/bulk-generation-validation';

describe('bulk keyword generation guard', () => {
  it('blocks the exact silent-click regression when a spreadsheet has no project', () => {
    expect(validateBulkGenerationSelection('', false, 300)).toBe(
      'Selecione um projeto válido antes de iniciar a geração em massa.',
    );
  });

  it('blocks a project id that no longer resolves to an accessible project', () => {
    expect(validateBulkGenerationSelection('stale-project', false, 300)).toBe(
      'Selecione um projeto válido antes de iniciar a geração em massa.',
    );
  });

  it('allows a valid project with selected keywords', () => {
    expect(validateBulkGenerationSelection('project-id', true, 300)).toBeNull();
  });
});
