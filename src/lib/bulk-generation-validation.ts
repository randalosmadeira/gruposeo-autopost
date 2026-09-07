export function validateBulkGenerationSelection(projectId: string, projectExists: boolean, selectedCount: number) {
  if (!projectId || !projectExists) return 'Selecione um projeto válido antes de iniciar a geração em massa.';
  if (selectedCount < 1) return 'Selecione ao menos uma palavra-chave para iniciar a fila.';
  return null;
}
