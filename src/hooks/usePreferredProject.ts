import { useCallback, useState } from 'react';
import { pickDefaultProject, readStoredProject, storeProject, type ProjectLike } from '@/lib/preferred-project';

/** Projeto selecionado nas telas do NEXUS: escolha da pessoa (lembrada no navegador) ou o projeto mais pronto da lista. */
export function usePreferredProject(projects: readonly ProjectLike[]) {
  const [chosen, setChosen] = useState<string>(() => readStoredProject() ?? '');
  const selected = pickDefaultProject(projects, chosen);
  const select = useCallback((id: string) => { setChosen(id); storeProject(id); }, []);
  return { selected, select };
}
