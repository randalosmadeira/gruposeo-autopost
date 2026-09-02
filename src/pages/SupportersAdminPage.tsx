import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, RefreshCw, Search, ShieldCheck, Users, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const ADMIN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/supporter-avatar-admin`;

type Supporter = {
  id: string;
  supporter_name: string | null;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  status: string;
  source_count: number;
  generation_count: number;
  max_generations: number;
  candidate_preset_slug: string | null;
  output_format: string | null;
  consent_image_use: boolean;
  consent_terms: boolean;
  consent_public_gallery: boolean;
  consent_at: string | null;
  supporter_approved_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type Payload = {
  items: Supporter[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
  stats: { total: number; completed: number; failed: number; processing: number; galleryAuthorized: number };
};

function formatPhone(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value || 'Não informado';
}

function dateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    completed: 'bg-green-500/10 text-green-300 border-green-500/20',
    failed: 'bg-red-500/10 text-red-300 border-red-500/20',
    processing: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
    queued: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
    qa: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    uploading: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  };
  return map[status] || 'bg-slate-500/10 text-slate-300 border-slate-500/20';
}

export default function SupportersAdminPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Supporter[]>([]);
  const [stats, setStats] = useState<Payload['stats']>({ total: 0, completed: 0, failed: 0, processing: 0, galleryAuthorized: 0 });
  const [pagination, setPagination] = useState<Payload['pagination']>({ page: 1, pageSize: 50, total: 0, pages: 1 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão administrativa ausente.');
      const response = await fetch(ADMIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ page, pageSize: 50, search: search.trim(), status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setForbidden(false);
      setItems(payload.items || []);
      setStats(payload.stats || stats);
      setPagination(payload.pagination || pagination);
    } catch (error) {
      toast({ title: 'Falha ao carregar apoiadores', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
    // filtros são aplicados explicitamente no botão para evitar consultas a cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = useMemo(() => [
    { label: 'Apoiadores', value: stats.total, icon: Users },
    { label: 'Concluídos', value: stats.completed, icon: CheckCircle2 },
    { label: 'Em processamento', value: stats.processing, icon: Activity },
    { label: 'Falhas', value: stats.failed, icon: XCircle },
  ], [stats]);

  if (forbidden) {
    return (
      <div className="p-6">
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="flex min-h-[360px] flex-col items-center justify-center text-center">
            <ShieldCheck className="mb-4 h-10 w-10 text-red-300" />
            <h1 className="text-xl font-bold">Acesso restrito ao CEO</h1>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">A base de apoiadores contém dados pessoais e somente perfis com papel CEO podem consultá-la.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-primary"><ShieldCheck className="h-4 w-4" /> Central Eleitoral</div>
          <h1 className="text-2xl font-bold">Base de Apoiadores</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cadastros do gerador 1470. Dados de contato são privados e não são expostos na rota pública.</p>
        </div>
        <Button variant="outline" onClick={() => void load(pagination.page)} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-5"><div className="rounded-xl bg-primary/10 p-2"><Icon className="h-5 w-5 text-primary" /></div><div><div className="text-2xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Pesquisa e filtros</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(1); }} placeholder="Nome, e-mail, WhatsApp ou cidade" className="pl-9" /></div>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full lg:w-[220px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="completed">Concluído</SelectItem><SelectItem value="processing">Processando</SelectItem><SelectItem value="queued">Na fila</SelectItem><SelectItem value="qa">QA</SelectItem><SelectItem value="failed">Falhou</SelectItem><SelectItem value="uploading">Upload</SelectItem></SelectContent></Select>
          <Button onClick={() => void load(1)} disabled={loading}>Aplicar</Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3">Apoiador</th><th className="px-4 py-3">Contato</th><th className="px-4 py-3">Localidade</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Fotos</th><th className="px-4 py-3">Gerações</th><th className="px-4 py-3">Consentimentos</th><th className="px-4 py-3">Cadastro</th><th className="px-4 py-3">Última atividade</th></tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">Carregando base de apoiadores...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-16 text-center text-muted-foreground">Nenhum apoiador encontrado para os filtros atuais.</td></tr>
                ) : items.map((item) => {
                  const wa = String(item.whatsapp || '').replace(/\D/g, '');
                  return (
                    <tr key={item.id} className="border-t align-top hover:bg-muted/20">
                      <td className="px-4 py-4"><div className="font-semibold">{item.supporter_name || 'Sem nome'}</div><div className="mt-1 font-mono text-[10px] text-muted-foreground">{item.id.slice(0, 8)}</div></td>
                      <td className="px-4 py-4"><div>{item.email || 'Não informado'}</div>{wa ? <a className="mt-1 inline-block text-primary hover:underline" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">{formatPhone(item.whatsapp)}</a> : <div className="mt-1 text-muted-foreground">WhatsApp não informado</div>}</td>
                      <td className="px-4 py-4">{[item.city, item.state].filter(Boolean).join(' / ') || '-'}</td>
                      <td className="px-4 py-4"><Badge variant="outline" className={statusBadge(item.status)}>{item.status}</Badge></td>
                      <td className="px-4 py-4">{item.source_count}</td>
                      <td className="px-4 py-4">{item.generation_count}/{item.max_generations}</td>
                      <td className="px-4 py-4 text-xs"><div>{item.consent_image_use && item.consent_terms ? 'Imagem e termos: OK' : 'Consentimento incompleto'}</div><div className="mt-1 text-muted-foreground">Galeria: {item.consent_public_gallery ? 'autorizada' : 'não autorizada'}</div></td>
                      <td className="px-4 py-4 text-xs">{dateTime(item.created_at)}</td>
                      <td className="px-4 py-4 text-xs">{dateTime(item.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">{pagination.total} registro(s) · página {pagination.page} de {pagination.pages}</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={pagination.page <= 1 || loading} onClick={() => void load(pagination.page - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={pagination.page >= pagination.pages || loading} onClick={() => void load(pagination.page + 1)}>Próxima</Button></div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
        LGPD e segurança: esta tela exige sessão autenticada e papel CEO. A consulta administrativa não retorna os hashes internos, tokens públicos, fingerprints nem as fotografias privadas dos apoiadores.
      </div>
    </div>
  );
}
