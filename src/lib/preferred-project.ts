// Projeto padrão das telas do NEXUS (Visibilidade, Motores & APIs).
// Antes: sempre o primeiro da lista (podia ser um projeto vazio). Agora: o último escolhido pela pessoa; sem escolha anterior,
// o projeto mais "pronto" (perfil do negócio completo, site WordPress conectado, domínio cadastrado). Função pura, testada.

export type ProjectLike = {
  id: string;
  wordpress_url?: string | null;
  domain?: string | null;
  /** Coluna real de `projects`; não consta nos tipos gerados do Supabase, por isso o tipo estrutural. */
  nexus_profile_status?: string | null;
};

export const PREFERRED_PROJECT_KEY = 'zica:nexus:projeto';

const filled = (v: string | null | undefined) => typeof v === 'string' && v.trim() !== '';

/** Quanto o projeto está "pronto" para mostrar dados: perfil completo pesa mais, depois site conectado e domínio. */
export function projectReadiness(p: ProjectLike): number {
  return (p.nexus_profile_status === 'complete' ? 4 : 0) + (filled(p.wordpress_url) ? 2 : 0) + (filled(p.domain) ? 1 : 0);
}

/** Escolhe o projeto: o último usado (se ainda existir); senão o mais pronto; empate: o primeiro da lista. Lista vazia: ''. */
export function pickDefaultProject(projects: readonly ProjectLike[], storedId?: string | null): string {
  if (!projects.length) return '';
  if (storedId && projects.some((p) => p.id === storedId)) return storedId;
  let best = projects[0];
  let bestScore = projectReadiness(best);
  for (const p of projects) {
    const score = projectReadiness(p);
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best.id;
}

export function readStoredProject(): string | null {
  try { return typeof window !== 'undefined' ? window.localStorage.getItem(PREFERRED_PROJECT_KEY) : null; } catch { return null; }
}

export function storeProject(id: string): void {
  try { if (typeof window !== 'undefined') window.localStorage.setItem(PREFERRED_PROJECT_KEY, id); } catch { /* navegação privada ou armazenamento bloqueado: segue sem lembrar */ }
}
