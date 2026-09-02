import { useState } from 'react';
import JSZip from 'jszip';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Activity, Braces, CheckCircle2, Clock3, CloudCog, Download, FileCode2,
  Gauge, Globe2, History, KeyRound, Network, PlugZap, Radar, RefreshCw,
  ShieldCheck, Sparkles, Vote, Workflow,
} from 'lucide-react';
import {
  PLUGIN_API_NAMESPACE, PLUGIN_LAST_UPDATE, PLUGIN_NAME,
  PLUGIN_SOFTWARE_ID, PLUGIN_VERSION,
} from '@/lib/plugin-version';

type PackageFile = { path: string; url: string };
type DownloadKind = 'plugin' | 'theme' | 'electoral';

const ELECTORAL_PLUGIN_VERSION = '1.2.1';

const pluginFiles: PackageFile[] = [
  { path: 'zica-posts.php', url: 'wordpress-plugin/zica-posts-3.10.2/zica-posts.php' },
  { path: 'readme.txt', url: 'wordpress-plugin/zica-posts-3.10.2/readme.txt' },
  { path: 'version.json', url: 'wordpress-plugin/zica-posts-3.10.2/version.json' },
  { path: 'assets/admin.css', url: 'wordpress-plugin/zica-posts-3.10.2/assets/admin.css' },
];

const electoralPluginFiles: PackageFile[] = [
  { path: 'zica-electoral-analytics.php', url: 'wordpress-electoral/zica-electoral-analytics/zica-electoral-analytics.php' },
  { path: 'README.txt', url: 'wordpress-electoral/zica-electoral-analytics/README.txt' },
  { path: 'assets/zica-electoral-analytics.js', url: 'wordpress-electoral/zica-electoral-analytics/assets/zica-electoral-analytics.js' },
  { path: 'assets/zica-electoral-optin.js', url: 'wordpress-electoral/zica-electoral-analytics/assets/zica-electoral-optin.js' },
  { path: 'assets/zica-electoral-optin.css', url: 'wordpress-electoral/zica-electoral-analytics/assets/zica-electoral-optin.css' },
];

const themeFiles: PackageFile[] = [
  { path: 'style.css', url: 'wordpress-theme/zica-neural/style.css' },
  { path: 'functions.php', url: 'wordpress-theme/zica-neural/functions.php' },
  { path: 'header.php', url: 'wordpress-theme/zica-neural/header.php' },
  { path: 'footer.php', url: 'wordpress-theme/zica-neural/footer.php' },
  { path: 'index.php', url: 'wordpress-theme/zica-neural/index.php' },
  { path: 'archive.php', url: 'wordpress-theme/zica-neural/archive.php' },
  { path: 'single.php', url: 'wordpress-theme/zica-neural/single.php' },
  { path: 'theme.json', url: 'wordpress-theme/zica-neural/theme.json' },
];

const capabilities = [
  { icon: Workflow, title: 'Outbox persistente', text: 'save_post registra o sinal e libera o PHP; processamento pesado permanece fora da requisição WordPress.' },
  { icon: ShieldCheck, title: 'Canal assinado', text: 'HMAC, nonce, timestamp e correlation ID protegem as integrações do plugin principal.' },
  { icon: Radar, title: 'Distribuição técnica', text: 'IndexNow, sitemap e discovery são sinais técnicos, sem promessa de ranking ou indexação.' },
  { icon: CloudCog, title: 'Orchestrator-ready', text: 'Fila, retry e workers externos mantêm o WordPress como nó leve.' },
  { icon: Braces, title: 'Schema', text: 'JSON-LD dinâmico com fallback seguro e sem duplicar plugins SEO quando detectados.' },
  { icon: FileCode2, title: 'Pacotes versionados', text: 'Os ZIPs são montados no navegador a partir dos arquivos publicados no mesmo build do Zica.ai.' },
];

function baseAsset(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${path}`.replace(/\/+/g, '/').replace(':/', '://');
}

async function buildZip(folderName: string, files: PackageFile[], outputName: string) {
  const zip = new JSZip();
  const folder = zip.folder(folderName);
  if (!folder) throw new Error('Não foi possível preparar o pacote.');
  for (const file of files) {
    const response = await fetch(baseAsset(file.url), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Arquivo ausente no build: ${file.path}`);
    folder.file(file.path, await response.arrayBuffer());
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = outputName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function WordPressPluginPage() {
  const [downloading, setDownloading] = useState<DownloadKind | null>(null);
  const { toast } = useToast();

  const download = async (kind: DownloadKind) => {
    setDownloading(kind);
    try {
      if (kind === 'plugin') {
        await buildZip('zica-posts', pluginFiles, `zica-posts-${PLUGIN_VERSION}.zip`);
        toast({ title: 'Zica Posts preparado', description: `Pacote ${PLUGIN_VERSION} gerado com a pasta canônica zica-posts/.` });
      } else if (kind === 'theme') {
        await buildZip('zica-neural', themeFiles, 'zica-neural-theme-1.0.0.zip');
        toast({ title: 'Tema Zica Neural preparado', description: 'Pacote responsivo pronto para instalação.' });
      } else {
        await buildZip('zica-electoral-analytics', electoralPluginFiles, `zica-electoral-analytics-${ELECTORAL_PLUGIN_VERSION}.zip`);
        toast({ title: 'Plugin Eleitoral preparado', description: `ZIP ${ELECTORAL_PLUGIN_VERSION} com analytics, pop-up e CTA do Instagram.` });
      }
    } catch (error) {
      toast({ title: 'Falha ao gerar o ZIP', description: error instanceof Error ? error.message : 'Erro inesperado.', variant: 'destructive' });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 md:px-7 md:py-10">
        <section className="overflow-hidden rounded-[28px] border border-[#00F0FF]/20 bg-[#10171d]/95 p-6 shadow-2xl md:p-9">
          <div className="flex flex-col gap-7 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className="border-[#D4FF00]/40 bg-[#D4FF00]/10 text-[#D4FF00]">ZICA.AI WORDPRESS DISTRIBUTION</Badge>
                <Badge variant="outline" className="border-[#00F0FF]/30 text-[#00F0FF]">{PLUGIN_SOFTWARE_ID}</Badge>
              </div>
              <h1 className="text-3xl font-black tracking-tight md:text-5xl">Plugins WordPress <span className="text-[#D4FF00]">Zica.ai</span></h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">Central única de download dos pacotes WordPress. Cada botão gera o ZIP usando os arquivos da versão indicada no próprio build.</p>
            </div>
            <div className="grid min-w-[280px] gap-2">
              <Button onClick={() => void download('plugin')} disabled={!!downloading} className="bg-[#D4FF00] font-black text-[#071014] hover:bg-[#c5ef00]">
                {downloading === 'plugin' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Baixar Zica Posts {PLUGIN_VERSION}
              </Button>
              <Button onClick={() => void download('electoral')} disabled={!!downloading} className="bg-[#00F0FF] font-black text-[#071014] hover:bg-[#00dce9]">
                {downloading === 'electoral' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Vote className="mr-2 h-4 w-4" />} Baixar Plugin Eleitoral {ELECTORAL_PLUGIN_VERSION}
              </Button>
              <Button onClick={() => void download('theme')} disabled={!!downloading} variant="outline" className="border-white/20 bg-white/[.03] text-white hover:bg-white/[.06]">
                {downloading === 'theme' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Baixar Tema Zica Neural
              </Button>
            </div>
          </div>
        </section>

        <section id="electoral-plugin" className="scroll-mt-6">
          <Card className="border-[#00F0FF]/35 bg-gradient-to-br from-[#0f1c22] to-[#11171d] text-white shadow-[0_0_35px_rgba(0,240,255,.07)]">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl"><Vote className="h-5 w-5 text-[#D4FF00]" /> Zica Electoral Analytics {ELECTORAL_PLUGIN_VERSION}</CardTitle>
                  <CardDescription className="mt-2 text-slate-400">Analytics agregado, Consent Mode, pop-up de cadastro e CTA opcional do Instagram.</CardDescription>
                </div>
                <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300">PACOTE ATUALIZADO</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Configuração central', 'GA4, GTM Web, GTM Server, pop-up e data de desligamento vêm do Zica.ai.'],
                  ['Consent Mode', 'analytics_storage inicia negado e só muda com consentimento da CMP.'],
                  ['Cadastro consentido', 'Pop-up por scroll/exit intent, com e-mail, WhatsApp, voluntariado e consentimento.'],
                  ['Instagram', 'CTA opcional Seguir @rdmadvogados e evento agregado de clique.'],
                ].map(([title, text]) => <div key={title} className="rounded-xl border border-[#263541] bg-[#0D1117] p-4"><div className="font-bold text-[#00F0FF]">{title}</div><p className="mt-2 text-xs leading-5 text-slate-400">{text}</p></div>)}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void download('electoral')} disabled={!!downloading} className="bg-[#D4FF00] font-black text-[#071014] hover:bg-[#c5ef00]">
                  {downloading === 'electoral' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Baixar zica-electoral-analytics-{ELECTORAL_PLUGIN_VERSION}.zip
                </Button>
                <Button asChild variant="outline" className="border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/5 hover:text-[#00F0FF]"><Link to="/electoral-campaign/portal-network"><Globe2 className="mr-2 h-4 w-4" /> Configurar Rede Eleitoral</Link></Button>
                <Button asChild variant="outline" className="border-white/15 text-slate-200 hover:bg-white/[.04]"><Link to="/electoral-campaign/editorial-console"><History className="mr-2 h-4 w-4" /> Abrir Central Editorial</Link></Button>
              </div>
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/[.05] p-3 text-xs leading-5 text-amber-100">Instalação: WordPress → Plugins → Adicionar plugin → Enviar plugin → selecione o ZIP acima → Instalar → substituir a versão antiga → Ativar. Sem configuração central válida, a coleta permanece fail-closed.</div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {capabilities.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="border-[#30363D] bg-[#12191f]/95 text-white">
              <CardHeader className="pb-2"><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-[#D4FF00]/20 bg-[#D4FF00]/5"><Icon className="h-5 w-5 text-[#D4FF00]" /></div><CardTitle className="text-base">{title}</CardTitle></CardHeader>
              <CardContent className="text-sm leading-6 text-slate-400">{text}</CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
          <Card className="border-[#30363D] bg-[#10171d]/95 text-white">
            <CardHeader><CardTitle className="flex items-center gap-2"><Network className="h-5 w-5 text-[#00F0FF]" /> Fluxo WordPress</CardTitle></CardHeader>
            <CardContent><div className="grid gap-3 md:grid-cols-5">{['WordPress', 'Outbox', 'Orchestrator', 'Distribuição', 'Métricas'].map((step, index) => <div key={step} className="rounded-xl border border-[#30363D] bg-[#0D1117] p-3 text-center"><div className="text-[10px] font-black tracking-[.15em] text-[#D4FF00]">0{index + 1}</div><div className="mt-1 text-sm font-bold">{step}</div></div>)}</div></CardContent>
          </Card>
          <Card className="border-[#30363D] bg-[#10171d]/95 text-white">
            <CardHeader><CardTitle className="flex items-center gap-2"><PlugZap className="h-5 w-5 text-[#D4FF00]" /> Contrato atual</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg bg-[#0D1117] p-3"><span className="text-slate-500">Plugin</span><div className="mt-1 font-mono text-[#00F0FF]">{PLUGIN_NAME} {PLUGIN_VERSION}</div></div>
              <div className="rounded-lg bg-[#0D1117] p-3"><span className="text-slate-500">Eleitoral</span><div className="mt-1 font-mono text-[#00F0FF]">Zica Electoral Analytics {ELECTORAL_PLUGIN_VERSION}</div></div>
              <div className="rounded-lg bg-[#0D1117] p-3"><span className="text-slate-500">API</span><div className="mt-1 font-mono text-[#00F0FF]">/wp-json/{PLUGIN_API_NAMESPACE}/</div></div>
              <div className="rounded-lg bg-[#0D1117] p-3"><span className="text-slate-500">Atualização</span><div className="mt-1 text-slate-300">{PLUGIN_LAST_UPDATE}</div></div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [Activity, 'Nó leve', 'IA pesada fora do PHP'],
            [KeyRound, 'Segredos separados', 'Nenhuma chave OpenAI no ZIP eleitoral'],
            [Gauge, 'Fail-closed', 'Sem configuração central, sem tracking'],
            [CheckCircle2, 'Instalável', 'ZIP montado pelo próprio Zica.ai'],
          ].map(([Icon, title, text]) => <Card key={String(title)} className="border-[#30363D] bg-[#161B22]/90 text-white"><CardContent className="flex gap-3 p-4"><Icon className="h-5 w-5 text-[#00F0FF]" /><div><div className="font-bold">{String(title)}</div><div className="mt-1 text-xs text-slate-400">{String(text)}</div></div></CardContent></Card>)}
        </section>

        <div className="flex items-center justify-center gap-2 pb-4 text-xs text-slate-600"><Clock3 className="h-3.5 w-3.5" /> Pacotes são gerados no navegador e não enviam credenciais ao servidor.</div>
      </main>
    </div>
  );
}
