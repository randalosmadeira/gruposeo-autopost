import { Navigate } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useElectoralAccess } from '@/hooks/useElectoralAccess';

export function ElectoralRoute({ children }: { children: React.ReactNode }) {
  const { canManageElectoral, loading, error } = useElectoralAccess();

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Verificando acesso eleitoral"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }
  if (error) {
    return <div className="mx-auto mt-16 max-w-md rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center"><ShieldAlert className="mx-auto h-8 w-8 text-amber-400" /><h1 className="mt-3 font-semibold">Acesso eleitoral não pôde ser confirmado</h1><p className="mt-2 text-sm text-muted-foreground">Tente novamente em instantes. Nenhuma informação eleitoral foi carregada.</p></div>;
  }
  if (!canManageElectoral) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
