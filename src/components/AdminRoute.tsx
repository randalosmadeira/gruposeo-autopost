import { Navigate } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAdminAccess } from '@/hooks/useAdminAccess';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading, error } = useAdminAccess();

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Verificando permissão"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  }
  if (error) {
    return <div className="mx-auto mt-16 max-w-md rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center"><ShieldAlert className="mx-auto h-8 w-8 text-amber-400" /><h1 className="mt-3 font-semibold">Permissão não pôde ser confirmada</h1><p className="mt-2 text-sm text-muted-foreground">Aguardando sincronização automática do servidor. Tente novamente em instantes.</p></div>;
  }
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
