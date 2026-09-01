import { useState } from 'react';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Activity, Bot, Braces, CheckCircle2, Clock3, CloudCog, Download,
  FileCode2, Gauge, Globe2, KeyRound, Network, PlugZap, Radar,
  RefreshCw, ShieldCheck, Sparkles, Workflow, Zap,
} from 'lucide-react';
import {
  PLUGIN_API_NAMESPACE, PLUGIN_LAST_UPDATE, PLUGIN_NAME,
  PLUGIN_SOFTWARE_ID, PLUGIN_VERSION,
} from '@/lib/plugin-version';

type PackageFile = { path: string; url: string };

const pluginFiles: PackageFile[] = [
  { path: 'zica-posts.php', url: 'wordpress-plugin/zica-posts-3.10.1/zica-posts.php' },
  { path: 'readme.txt', url: 'wordpress-plugin/zica-posts-3.10.1/readme.txt' },
  { path: 'version.json', url: 'wordpress-plugin/zica-posts-3.10.1/version.json' },
  { path: 'assets/admin.css', url: 'wordpress-plugin/zica-posts-3.10.1/assets/admin.css' },
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
  { icon: Workflow, title: 'Outbox persistente', text: 'save_post registra o sinal e libera o PHP. O processamento ocorre fora da requisição HTTP.' },
  { icon: ShieldCheck, title: 'HMAC + anti-replay', text: 'Timestamp, nonce, SHA-256 e correlation ID protegem o canal Hub → WordPress.' },
  { icon: Radar, title: 'IndexNow em lote', text: 'URLs são agrupadas e submetidas em batches, com submissão separada de confirmação de indexação.' },
  { icon: Bot, title: 'Discovery para IA', text: 'llms.txt, llms-full.txt, ai.txt, manifest, sitemap e regras auditáveis para crawlers conhecidos.' },
  { icon: Braces, title: 'Schema dinâmico', text: 'JSON-LD recebido da Zica.ai ou fallback seguro sem duplicar Rank Math/Yoast.' },
  { icon: CloudCog, title: 'Orchestrator-ready', text: 'Webhook assíncrono com retry exponencial para Redis/BullMQ e workers externos.' },
  { icon: FileCode2, title: 'Arquivos atômicos', text: 'Gravação temp → lock → rename, com fallback virtual quando a hospedagem bloqueia escrita.' },
  { icon: Clock3, title: '15:00 São Paulo', text: 'Reconciliação diária no fuso America/Sao_Paulo, mantendo o WordPress como fallback operacional.' },
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
  const a = document.createElement('a');
  a.href = url;
  a.download = outputName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function WordPressPluginPage() {
  const [downloading, setDownloading] = useState<'plugin' | 'theme' | null>(null);
  const { toast } = useToast();

  const downloadPlugin = async () => {
    setDownloading('plugin');
    try {
      await buildZip('zica-posts', pluginFiles, `zica-posts-${PLUGIN_VERSION}.zip`);
      toast({ title: 'Zica Posts preparado', description: `Pacote ${PLUGIN_VERSION} gerado com a pasta canônica zica-posts/.` });
    } catch (error) {
      toast({ title: 'Falha ao gerar o ZIP', description: error instanceof Error ? error.message : 'Erro inesperado.', variant: 'destructive' });
    } finally { setDownloading(null); }
  };

  const downloadTheme = async () => {
    setDownloading('theme');
    try {
      await buildZip('zica-neural', themeFiles, 'zica-neural-theme-1.0.0.zip');
      toast({ title: 'Tema Zica Neural preparado', description: 'Pacote responsivo para desktop, tablet e mobile.' });
    } catch (error) {
      toast({ title: 'Falha ao gerar o tema', description: error instanceof Error ? error.message : 'Erro inesperado.', variant: 'destructive' });
    } finally { setDownloading(null); }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0D1117] text-white">
      <style>{`
        @keyframes zicaOrbit { to { transform: rotate(360deg); } }
        @keyframes zicaPulse { 50% { transform: scale(1.045); filter: brightness(1.35); } }
        @keyframes zicaFlow { 0% { stroke-dashoffset: 180; opacity:.25 } 50% { opacity:1 } 100% { stroke-dashoffset:0; opacity:.25 } }
      `}</style>
      <div className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: 'linear-gradient(rgba(0,240,255,.035) 1px, transparent 1px),linear-gradient(90deg,rgba(0,240,255,.035) 1px,transparent 1px)', backgroundSize: '34px 34px' }} />
      <div className="pointer-events-none absolute -right-48 -top-52 h-[700px] w-[700px] rounded-full border border-[#00F0FF]/10 shadow-[0_0_120px_rgba(0,240,255,.08)]" />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-7 md:px-7 md:py-10">
        <section className="relative overflow-hidden rounded-[28px] border border-[#00F0FF]/20 bg-[#10171d]/95 p-6 shadow-2xl md:p-9">
          <div className="absolute right-[8%] top-1/2 hidden h-56 w-56 -translate-y-1/2 md:block">
            <div className="absolute inset-0 rounded-full border border-[#00F0FF]/25" style={{ animation: 'zicaOrbit 16s linear infinite' }} />
            <div className="absolute inset-6 rounded-full border border-[#D4FF00]/20" style={{ animation: 'zicaOrbit 11s linear infinite reverse' }} />
            <div className="absolute inset-[58px] rounded-[48%_52%_45%_55%] border-2 border-[#00F0FF] bg-[#071015] shadow-[0_0_45px_rgba(0,240,255,.55),inset_0_0_35px_rgba(212,255,0,.12)]" style={{ animation: 'zicaPulse 3.4s ease-in-out infinite' }}>
              <Network className="absolute inset-0 m-auto h-16 w-16 text-[#D4FF00]" />
            </div>
            <svg className="absolute -left-44 -top-16 h-[350px] w-[560px] overflow-visible" viewBox="0 0 560 350" aria-hidden="true">
              {[55, 105, 175, 245, 300].map((y, i) => (
                <path key={y} d={`M0 ${y} C120 ${y - 55},180 ${y + 65},285 ${175 + (i - 2) * 14} S445 ${y - 35},560 ${y}`} fill="none" stroke={i % 2 ? '#D4FF00' : '#00F0FF'} strokeOpacity=".7" strokeWidth="1.5" strokeDasharray="10 12" style={{ animation: `zicaFlow ${2.5 + i * .35}s linear infinite` }} />
              ))}
            </svg>
          </div>

          <div className="relative max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className="border-[#D4FF00]/40 bg-[#D4FF00]/10 text-[#D4FF00]">ZICA.AI NEURAL DISTRIBUTION</Badge>
              <Badge variant="outline" className="border-[#00F0FF]/30 text-[#00F0FF]">{PLUGIN_SOFTWARE_ID}</Badge>
              <Badge variant="outline" className="border-white/10 text-slate-300">v{PLUGIN_VERSION}</Badge>
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-5xl">Zica Posts <span className="text-[#D4FF00]">3.10.1</span></h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">O WordPress vira um nó leve do Cérebro Zica.ai: publica, registra sinais e distribui energia de conteúdo sem executar IA pesada dentro da requisição PHP.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={downloadPlugin} disabled={!!downloading} className="bg-[#D4FF00] font-black text-[#071014] hover:bg-[#c5ef00] shadow-[0_0_26px_rgba(212,255,0,.18)]">
                {downloading === 'plugin' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Baixar Zica Posts {PLUGIN_VERSION}
              </Button>
              <Button onClick={downloadTheme} disabled={!!downloading} variant="outline" className="border-[#00F0FF]/40 bg-[#00F0FF]/5 text-[#00F0FF] hover:bg-[#00F0FF]/10 hover:text-[#00F0FF]">
                {downloading === 'theme' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Baixar Tema Zica Neural
              </Button>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [Activity, 'Agente leve', 'PHP não vira worker de IA'],
            [KeyRound, 'Canal assinado', 'HMAC + nonce + correlation'],
            [Gauge, 'Backpressure-ready', 'Outbox + retry exponencial'],
            [Zap, 'Distribuição neural', 'IndexNow + LLM discovery'],
          ].map(([Icon, title, text]) => (
            <Card key={String(title)} className="border-[#30363D] bg-[#161B22]/90 text-white">
              <CardContent className="flex gap-3 p-4"><div className="rounded-xl border border-[#00F0FF]/20 bg-[#00F0FF]/5 p-2"><Icon className="h-5 w-5 text-[#00F0FF]" /></div><div><div className="font-bold">{String(title)}</div><div className="mt-1 text-xs text-slate-400">{String(text)}</div></div></CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {capabilities.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="group border-[#30363D] bg-[#12191f]/95 text-white transition hover:-translate-y-0.5 hover:border-[#00F0FF]/45 hover:shadow-[0_0_30px_rgba(0,240,255,.07)]">
              <CardHeader className="pb-2"><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-[#D4FF00]/20 bg-[#D4FF00]/5"><Icon className="h-5 w-5 text-[#D4FF00]" /></div><CardTitle className="text-base">{title}</CardTitle></CardHeader>
              <CardContent className="text-sm leading-6 text-slate-400">{text}</CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-7 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
          <Card className="border-[#30363D] bg-[#10171d]/95 text-white">
            <CardHeader><CardTitle className="flex items-center gap-2"><Network className="h-5 w-5 text-[#00F0FF]" />Rotas neurais da publicação</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-5">
                {['WordPress', 'Outbox', 'Orchestrator', 'Distribuição', 'Discovery'].map((step, index) => (
                  <div key={step} className="relative rounded-xl border border-[#30363D] bg-[#0D1117] p-3 text-center">
                    <div className="text-[10px] font-black tracking-[.15em] text-[#D4FF00]">0{index + 1}</div><div className="mt-1 text-sm font-bold">{step}</div>
                    {index < 4 && <div className="absolute -right-3 top-1/2 hidden h-px w-6 bg-gradient-to-r from-[#00F0FF] to-[#D4FF00] md:block" />}
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-xl border border-[#00F0FF]/15 bg-[#00F0FF]/[.035] p-4 text-sm leading-6 text-slate-300">
                <strong className="text-[#00F0FF]">Fluxo seguro:</strong> publicação → evento idempotente → fila → IA/mídia/SEO fora do PHP → WordPress → IndexNow em batch → sitemap/llms/manifest → métricas.
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#30363D] bg-[#10171d]/95 text-white">
            <CardHeader><CardTitle className="flex items-center gap-2"><PlugZap className="h-5 w-5 text-[#D4FF00]" />Contrato atual</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg bg-[#0D1117] p-3"><span className="text-slate-500">API</span><div className="mt-1 font-mono text-[#00F0FF]">/wp-json/{PLUGIN_API_NAMESPACE}/</div></div>
              <div className="rounded-lg bg-[#0D1117] p-3"><span className="text-slate-500">ID</span><div className="mt-1 font-mono text-[#D4FF00]">{PLUGIN_SOFTWARE_ID}</div></div>
              <div className="flex items-center gap-2 text-slate-300"><CheckCircle2 className="h-4 w-4 text-[#D4FF00]" />Aliases legados preservados</div>
              <div className="flex items-center gap-2 text-slate-300"><Globe2 className="h-4 w-4 text-[#00F0FF]" />15:00 America/Sao_Paulo</div>
            </CardContent>
          </Card>
        </section>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#30363D] pt-5 text-xs text-slate-500">
          <span>{PLUGIN_NAME} {PLUGIN_VERSION} · atualizado em {new Date(PLUGIN_LAST_UPDATE).toLocaleString('pt-BR')}</span>
          <span>Discovery não significa indexação/citação garantida.</span>
        </div>
      </main>
    </div>
  );
}
