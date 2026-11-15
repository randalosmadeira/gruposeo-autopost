/**
 * Entrada própria do novo Perfil do projeto (marco P2): uma página à parte, publicada em /perfil-projeto/.
 *
 * Por que existe: a versão publicada do painel recebeu ajustes direto nos arquivos compilados que ainda não estão no Git
 * (integração pendente, decisão D13). Recompilar o painel inteiro a partir do Git os perderia. Esta página é um pacote
 * independente, acrescentado à versão atual sem tocar em nenhum arquivo dela. Usa o mesmo login (mesma origem) e a mesma função.
 * Quando o painel for integrado ao Git, a rota /projects/:id/perfil do App passa a servir a mesma tela e esta entrada some.
 */
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import './index.css';
import { supabase } from '@/integrations/supabase/client';
import ProjectProfile from '@/pages/ProjectProfile';

interface ProjectRow { id: string; name: string; nexus_profile_status: string }

// eslint-disable-next-line react-refresh/only-export-components
export function projectFromSearch(search: string): string {
  const id = new URLSearchParams(search).get('project') || '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : '';
}

export function ProjectPicker() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['perfil-projetos'],
    retry: false,
    queryFn: async () => {
      const { data: body, error } = await supabase.functions.invoke('nexus-business', { body: { action: 'bootstrap' } });
      if (error) throw error;
      return (body?.projects || []) as ProjectRow[];
    },
  });
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Perfil do projeto</h1>
      {isLoading && <p aria-busy="true">Carregando projetos…</p>}
      {isError && <p role="alert">Não foi possível listar os projetos. <a className="underline" href="/auth">Entre no painel</a> e volte.</p>}
      {data && !data.length && <p>Nenhum projeto encontrado para o seu login.</p>}
      {data && data.length > 0 && (
        <ul className="space-y-2">
          {data.map((p) => (
            <li key={p.id}><a className="block rounded border p-3 hover:bg-accent" href={`?project=${p.id}`}>{p.name} <span className="text-xs text-muted-foreground">· perfil {p.nexus_profile_status === 'complete' ? 'preenchido' : 'pendente'}</span></a></li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function PerfilApp({ search }: { search: string }) {
  const id = projectFromSearch(search);
  if (!id) return <ProjectPicker />;
  return (
    <MemoryRouter initialEntries={[`/projects/${id}/perfil`]}>
      <Routes><Route path="/projects/:id/perfil" element={<ProjectProfile />} /></Routes>
    </MemoryRouter>
  );
}

const rootElement = typeof document !== 'undefined' ? document.getElementById('root') : null;
if (rootElement) {
  createRoot(rootElement).render(
    <QueryClientProvider client={new QueryClient()}><PerfilApp search={window.location.search} /></QueryClientProvider>,
  );
}
