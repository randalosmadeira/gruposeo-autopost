import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Eye, EyeOff, Copy, Check, ShieldAlert, Key, Download, Loader2,
  Code2, Database, AlertTriangle, Info, FileCode, Rocket, XCircle, CheckCircle2,
} from 'lucide-react';

interface MigrationData {
  credentials: {
    project_url: string;
    anon_key: string;
    service_role_key: string;
  };
  secrets: Record<string, string>;
  edge_functions: string[];
  edge_functions_count: number;
  database: {
    tables: Array<{
      table_name: string;
      columns_count: number;
      has_user_id: boolean;
      encrypted_columns: number;
      row_count: number;
    }>;
    tables_count: number;
  };
}

const ESSENTIAL_TABLES = new Set([
  'profiles', 'articles', 'projects', 'user_settings',
  'wordpress_sites', 'news_agents', 'article_versions',
]);
const HISTORY_HINTS = ['log', 'history', 'audit', 'queue', 'stats', 'tracking'];

function classifyTable(name: string): 'Essencial' | 'Histórico' | 'Ignorar' {
  if (ESSENTIAL_TABLES.has(name)) return 'Essencial';
  if (HISTORY_HINTS.some((h) => name.includes(h))) return 'Histórico';
  return 'Ignorar';
}

function maskValue(v: string): string {
  if (!v) return '';
  if (v.length <= 20) return '•'.repeat(v.length);
  return `${v.slice(0, 12)}•••••${v.slice(-8)}`;
}

function SecretRow({ label, value }: { label: string; value: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label} copiado`);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground font-medium mb-1">{label}</div>
        <code className="text-sm font-mono break-all block">
          {visible ? value : maskValue(value)}
        </code>
      </div>
      <Button size="icon" variant="ghost" onClick={() => setVisible((v) => !v)}>
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </Button>
      <Button size="icon" variant="ghost" onClick={doCopy}>
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
}

function SectionDivider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 my-2">
      <Separator className="flex-1" />
      {label && <span className="text-xs text-muted-foreground font-mono">══ {label} ══</span>}
      <Separator className="flex-1" />
    </div>
  );
}

interface RemoteResult {
  success: boolean;
  message?: string;
  error?: string;
  code?: string;
  detail?: string;
  position?: string;
  elapsed_ms?: number;
  sql_bytes?: number;
  destination?: { db?: string; version?: string; role?: string };
}

export default function PainelMigracao() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MigrationData | null>(null);
  const [destDbUrl, setDestDbUrl] = useState('');
  const [showDbUrl, setShowDbUrl] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [remoteResult, setRemoteResult] = useState<RemoteResult | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  // Pré-requisitos de execução remota
  const dbUrlValid = /^postgres(ql)?:\/\/[^@]+@[^:/]+(:\d+)?\/[^?]+/i.test(destDbUrl.trim());
  const confirmOk = confirmText.trim().toUpperCase() === 'EXECUTAR';
  const preReqs = {
    dbUrlValid,
    hasPassword: /:\/\/[^:]+:[^@]+@/.test(destDbUrl),
    hasSslHint: destDbUrl.includes('sslmode=') || destDbUrl.includes('supabase.co') || destDbUrl.includes('pooler.supabase.com'),
    confirmOk,
  };
  const canExecute = preReqs.dbUrlValid && preReqs.hasPassword && preReqs.confirmOk && !executing;

  const buildMigrationsSql = (): string => {
    const modules = import.meta.glob('/supabase/migrations/*.sql', {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>;
    const entries = Object.entries(modules).sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([p, src]) => `-- ═════════ ${p.split('/').pop()} ═════════\n${src}`).join('\n\n');
  };

  const executeRemoteMigration = async () => {
    setExecuting(true);
    setRemoteResult(null);
    try {
      const sql = buildMigrationsSql();
      const res = await fetch(`${supabaseUrl}/functions/v1/execute-migration-remote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db_url: destDbUrl.trim(), sql }),
      });
      const json = (await res.json()) as RemoteResult;
      setRemoteResult(json);
      if (json.success) toast.success('Migração executada com sucesso!');
      else toast.error(`Falha: ${json.error ?? 'erro desconhecido'}`);
    } catch (e) {
      const msg = (e as Error).message;
      setRemoteResult({ success: false, error: msg });
      toast.error(`Erro de rede: ${msg}`);
    } finally {
      setExecuting(false);
    }
  };


  const revealAll = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/painel-migracao`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MigrationData;
      setData(json);
      toast.success('Dados de migração carregados');
    } catch (e) {
      toast.error(`Falha ao carregar: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadEdgeFunctions = () => {
    const modules = import.meta.glob('/supabase/functions/*/index.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    const parts: string[] = [];
    let count = 0;
    for (const [path, source] of Object.entries(modules)) {
      const name = path.split('/').slice(-2, -1)[0];
      parts.push(`// ═════════ ${name} ═════════\n${source}`);
      count++;
    }
    const blob = new Blob([parts.join('\n\n')], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edge-functions.ts';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${count} edge functions exportadas`);
  };

  const downloadMigrations = () => {
    const modules = import.meta.glob('/supabase/migrations/*.sql', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    const entries = Object.entries(modules).sort(([a], [b]) => a.localeCompare(b));
    const parts: string[] = [
      '-- ═══════════════════════════════════════════════════════════',
      '-- MIGRATIONS CONSOLIDADAS — execute em ordem no destino',
      `-- Total: ${entries.length} arquivos`,
      '-- ═══════════════════════════════════════════════════════════',
      '',
    ];
    for (const [path, source] of entries) {
      const name = path.split('/').pop();
      parts.push(`-- ═════════ ${name} ═════════\n${source}`);
    }
    const blob = new Blob([parts.join('\n\n')], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'migrations.sql';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${entries.length} migrations exportadas`);
  };

  const downloadSecrets = () => {
    if (!data) return;
    const entries = Object.entries(data.secrets)
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join('\n');
    const content =
      `export const SECRETS = {\n${entries}\n} as const;\nexport type SecretKey = keyof typeof SECRETS;\n`;
    const blob = new Blob([content], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'secrets.ts';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('secrets.ts baixado');
  };

  const copyAll = async () => {
    if (!data) return;
    const text = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(text);
    toast.success('Tudo copiado como JSON');
  };

  const classified = useMemo(() => {
    if (!data) return { Essencial: 0, Histórico: 0, Ignorar: 0 };
    const acc = { Essencial: 0, Histórico: 0, Ignorar: 0 } as Record<string, number>;
    for (const t of data.database.tables) acc[classifyTable(t.table_name)]++;
    return acc;
  }, [data]);

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Painel de Migração</h1>
        <p className="text-muted-foreground">
          Copie os itens abaixo na ordem e cole na extensão LoveX Migrate.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={revealAll} disabled={loading} size="lg">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
          Revelar Tudo
        </Button>
        {data && (
          <Button variant="outline" onClick={copyAll}>
            <Copy className="w-4 h-4 mr-2" /> Copiar Tudo
          </Button>
        )}
      </div>

      {!data && !loading && (
        <Alert>
          <Info className="w-4 h-4" />
          <AlertTitle>Aguardando</AlertTitle>
          <AlertDescription>
            Clique em <strong>Revelar Tudo</strong> para carregar credenciais, secrets, edge functions e tabelas.
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          <SectionDivider label="PASSO 1" />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-destructive" />
                Passo 1 — Credenciais
              </CardTitle>
              <CardDescription>Chaves de acesso do projeto Supabase.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <SecretRow label="Project URL" value={data.credentials.project_url} />
              <SecretRow label="Anon Key" value={data.credentials.anon_key} />
              <SecretRow label="Service Role Key" value={data.credentials.service_role_key} />
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(data.credentials.project_url);
                    toast.success('Project URL copiado');
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" /> Copiar Project URL
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(data.credentials.service_role_key);
                    toast.success('Service Role Key copiado');
                  }}
                >
                  <Copy className="w-4 h-4 mr-2" /> Copiar Service Role Key
                </Button>
              </div>
            </CardContent>
          </Card>

          <SectionDivider label="PASSO 2" />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-primary" />
                Passo 2 — Edge Functions ({data.edge_functions_count})
              </CardTitle>
              <CardDescription>Funções detectadas ativas no projeto.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {data.edge_functions.map((name) => (
                  <Badge key={name} variant="secondary">{name}</Badge>
                ))}
              </div>
              <Button onClick={downloadEdgeFunctions}>
                <Download className="w-4 h-4 mr-2" /> Baixar edge-functions.ts
              </Button>
            </CardContent>
          </Card>

          <SectionDivider label="PASSO 3" />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-500" />
                Passo 3 — Secrets ({Object.keys(data.secrets).length})
              </CardTitle>
              <CardDescription>Variáveis de ambiente disponíveis para as edge functions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(data.secrets).map(([k, v]) => (
                <SecretRow key={k} label={k} value={v} />
              ))}
              <Button onClick={downloadSecrets} className="mt-2">
                <Download className="w-4 h-4 mr-2" /> Baixar secrets.ts
              </Button>
            </CardContent>
          </Card>

          <SectionDivider label="PASSO 4" />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-500" />
                Passo 4 — Conferência ({data.database.tables_count} tabelas)
              </CardTitle>
              <CardDescription>Classificação para orientar o que migrar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-green-500/15 text-green-600 hover:bg-green-500/20">
                  Essencial: {classified.Essencial}
                </Badge>
                <Badge className="bg-blue-500/15 text-blue-600 hover:bg-blue-500/20">
                  Histórico: {classified.Histórico}
                </Badge>
                <Badge variant="outline">Ignorar: {classified.Ignorar}</Badge>
              </div>
              <div className="max-h-64 overflow-y-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="text-left p-2">Tabela</th>
                      <th className="text-left p-2">Registros</th>
                      <th className="text-left p-2">Colunas</th>
                      <th className="text-left p-2">Classe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.database.tables.map((t) => (
                      <tr key={t.table_name} className="border-t">
                        <td className="p-2 font-mono">{t.table_name}</td>
                        <td className="p-2">{t.row_count ?? 0}</td>
                        <td className="p-2">{t.columns_count}</td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-xs">
                            {classifyTable(t.table_name)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Alert>
                <AlertTriangle className="w-4 h-4" />
                <AlertTitle>Sobre senhas</AlertTitle>
                <AlertDescription>
                  As senhas permanecem como hash bcrypt. Se o JWT Secret mudar no projeto de destino,
                  os usuários apenas precisarão fazer login novamente; as senhas continuarão válidas.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <SectionDivider label="PASSO 5" />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-purple-500" />
                Passo 5 — Migrations SQL
              </CardTitle>
              <CardDescription>
                Todos os arquivos de <code>supabase/migrations/</code> consolidados em um único SQL,
                em ordem cronológica. Execute no banco de destino para recriar schema, policies, funções e triggers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={downloadMigrations}>
                <Download className="w-4 h-4 mr-2" /> Baixar migrations.sql
              </Button>
              <Alert>
                <Info className="w-4 h-4" />
                <AlertTitle>Ordem de execução no destino</AlertTitle>
                <AlertDescription>
                  1) Rodar <code>migrations.sql</code> → 2) Deploy das edge functions → 3) Configurar secrets → 4) Importar dados das tabelas essenciais.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
