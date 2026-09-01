import { useState } from 'react';
import JSZip from 'jszip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Bot,
  Braces,
  CheckCircle2,
  Clock3,
  Download,
  FileCode2,
  Globe2,
  Network,
  PlugZap,
  Radar,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import {
  PLUGIN_API_NAMESPACE,
  PLUGIN_LAST_UPDATE,
  PLUGIN_NAME,
  PLUGIN_SOFTWARE_ID,
  PLUGIN_VERSION,
} from '@/lib/plugin-version';

type PackageFile = { path: string; url: string };

const pluginFiles: PackageFile[] = [
  { path: 'zica-posts.php', url: '/wordpress-plugin/zica-posts/zica-posts.php' },
  { path: 'readme.txt', url: '/wordpress-plugin/zica-posts/readme.txt' },
  { path: 'version.json', url: '/wordpress-plugin/zica-posts/version.json' },
  { path: 'assets/admin.css', url: '/wordpress-plugin/zica-posts/assets/admin.css' },
];

const themeFiles: PackageFile[] = [
  { path: 'style.css', url: '/wordpress-theme/zica-neural/style.css' },
  { path: 'functions.php', url: '/wordpress-theme/zica-neural/functions.php' },
  { path: 'header.php', url: '/wordpress-theme/zica-neural/header.php' },
  { path: 'footer.php', url: '/wordpress-theme/zica-neural/footer.php' },
  { path: 'index.php', url: '/wordpress-theme/zica-neural/index.php' },
  { path: 'single.php', url: '/wordpress-theme/zica-neural/single.php' },
  { path: 'archive.php', url: '/wordpress-theme/zica-neural/archive.php' },
  { path: 'theme.json', url: '/wordpress-theme/zica-neural/theme.json' },
  { path: 'readme.txt', url: '/wordpress-theme/zica-neural/readme.txt' },
  { path: 'assets/theme.css', url: '/wordpress-theme/zica-neural/assets/theme.css' },
];

const capabilities = [
  { icon: PlugZap, title: 'Contrato único de conexão', text: `/wp-json/${PLUGIN_API_NAMESPACE}/ com API Key e aliases de migração.` },
  { icon: Clock3, title: 'Sincronização às 15h', text: 'Varredura diária no fuso America/Sao_Paulo, além de atualização assíncrona após publicação.' },
  { icon: Bot, title: 'Descoberta para IAs', text: 'llms.txt, llms-full.txt, ai.txt, manifest JSON e regras de crawlers conhecidas no robots.txt.' },
  { icon: Radar, title: 'IndexNow', text: 'Submissão em batch de URLs novas ou modificadas aos mecanismos participantes, com retorno registrado.' },
  { icon: Braces, title: 'Schema sem duplicação', text: 'JSON-LD recebido da Zica.ai e fallback Article apenas quando Rank Math/Yoast não assumem a tarefa.' },
  { icon: FileCode2, title: 'File Manager resiliente', text: 'Escrita física atômica quando permitida e fallback virtual se a hospedagem bloquear escrita na raiz.' },
  { icon: Network, title: 'Cards automáticos', text: 'Relacionados antes/depois do conteúdo ou após 2º/4º parágrafo, com 1 a 6 cards.' },
  { icon: Globe2, title: 'Tema dinâmico complementar', text: 'Zica Neural Publisher para desktop, tablet e mobile, sem tornar o plugin dependente do tema.' },
];

async function buildZip(folderName: string, files: PackageFile[], fileName: string) {
  const zip = new JSZip();
  const folder = zip.folder(folderName);
  if (!folder) throw new Error('Não foi possível criar o pacote ZIP.');

  for (const file of files) {
    const response = await fetch(`${import.meta.env.BASE_URL}${file.url.replace(/^\//, '')}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Arquivo ausente no pacote: ${file.path}`);
    folder.file(file.path, await response.text());
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 7 } });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export default function WordPressPluginPage() {
  const [downloading, setDownloading] = useState<'plugin' | 'theme' | null>(null);
  const { toast } = useToast();

  const downloadPlugin = async () => {
    setDownloading('plugin');
    try {
      await buildZip('zica-posts', pluginFiles, `zica-posts-${PLUGIN_VERSION}.zip`);
      toast({ title: 'Zica Posts pronto', description: `Pacote ${PLUGIN_VERSION} gerado com a estrutura correta para o WordPress.` });
    } catch (error) {
      toast({ title: 'Falha ao montar o pacote', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setDownloading(null);
    }
  };

  const downloadTheme = async () => {
    setDownloading('theme');
    try {
      await buildZip('zica-neural', themeFiles, 'zica-neural-theme-1.0.0.zip');
      toast({ title: 'Tema Zica Neural pronto', description: 'O ZIP pode ser instalado em Aparência → Temas → Enviar tema.' });
    } catch (error) {
      toast({ title: 'Falha ao montar o tema', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-[#30363D] bg-[#0D1117] p-6 md:p-9">
        <div className="absolute -right-20 -top-28 h-80 w-80 rounded-full border border-cyan-400/20 shadow-[0_0_90px_rgba(0,240,255,0.10)]" />
        <div className="absolute right-16 top-12 h-36 w-72 rotate-12 rounded-[50%] border border-[#D4FF00]/20" />
        <div className="relative z-10 max-w-4xl">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge className="border border-[#D4FF00]/40 bg-[#D4FF00]/10 text-[#D4FF00]">SOFTWARE ID: {PLUGIN_SOFTWARE_ID}</Badge>
            <Badge variant="outline" className="border-cyan-400/30 text-cyan-300">v{PLUGIN_VERSION}</Badge>
            <Badge variant="outline" className="border-slate-700 text-slate-400">Reconstrução limpa</Badge>
          </div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">WordPress ↔ Cérebro Zica.ai</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl">{PLUGIN_NAME}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400 md:text-base">
            Conector oficial para publicação, GEO, Schema, LLM discovery, sitemaps, IndexNow, cards automáticos e sincronização editorial 24/7. A versão 3.10.0 substitui o pacote 3.9.0 e não depende dele para instalação.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={downloadPlugin} disabled={downloading !== null} className="bg-[#D4FF00] font-black text-[#071014] hover:bg-[#D4FF00]/90">
              <Download className="mr-2 h-4 w-4" />
              {downloading === 'plugin' ? 'Montando ZIP...' : `Baixar Zica Posts ${PLUGIN_VERSION}`}
            </Button>
            <Button onClick={downloadTheme} disabled={downloading !== null} variant="outline" className="border-cyan-400/40 bg-cyan-400/5 text-cyan-200 hover:bg-cyan-400/10">
              <Sparkles className="mr-2 h-4 w-4" />
              {downloading === 'theme' ? 'Montando tema...' : 'Baixar Tema Zica Neural'}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {capabilities.map(({ icon: Icon, title, text }) => (
          <Card key={title} className="border-[#30363D] bg-[#161B22]">
            <CardHeader className="pb-3">
              <div className="mb-2 grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/5 text-cyan-300"><Icon className="h-5 w-5" /></div>
              <CardTitle className="text-base text-white">{title}</CardTitle>
            </CardHeader>
            <CardContent><p className="text-sm leading-6 text-slate-400">{text}</p></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-[#30363D] bg-[#161B22]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><ShieldCheck className="h-5 w-5 text-[#D4FF00]" /> Conexão canônica 3.10.0</CardTitle>
            <CardDescription>O backend deve preferir o contrato novo e usar os aliases somente durante a migração.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl border border-[#30363D] bg-[#0D1117] p-4 font-mono text-cyan-200">/wp-json/{PLUGIN_API_NAMESPACE}/</div>
            <div className="rounded-xl border border-[#30363D] bg-[#0D1117] p-4 font-mono text-slate-300">X-ZICA-POSTS-Key: &lt;api-key&gt;</div>
            <p className="text-slate-400">Compatibilidade: <code>/zica-ai/v1</code> e <code>/cfrdm/v1</code>. O pacote antigo 3.9.0 não é pré-requisito.</p>
          </CardContent>
        </Card>

        <Card className="border-[#30363D] bg-[#161B22]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><Workflow className="h-5 w-5 text-cyan-300" /> Fluxo de atualização</CardTitle>
            <CardDescription>Descoberta imediata e reconciliação diária.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-400">
            {[
              'Publicar/alterar conteúdo → agenda sincronização curta sem travar o editor.',
              'Regenera llms.txt, llms-full.txt, ai.txt, manifest e sitemap.',
              'Submete URLs alteradas ao IndexNow e registra o retorno.',
              'Às 15:00 America/Sao_Paulo executa nova varredura integral.',
              'Se a raiz não for gravável, mantém os documentos por fallback virtual.',
            ].map((item) => <div key={item} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#D4FF00]" /><span>{item}</span></div>)}
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-500/20 bg-amber-500/[0.04]">
        <CardHeader>
          <CardTitle className="text-base text-amber-100">Critério técnico de indexação</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-amber-100/70">
          A Zica.ai aumenta a descoberta técnica e envia URLs por protocolos suportados, mas não declara “indexação garantida” em Google, ChatGPT, Claude ou qualquer LLM. O Google não possui mais o antigo endpoint de ping de sitemap; a 3.10 usa sitemap/lastmod corretos e Search Console, enquanto o IndexNow atende os mecanismos participantes.
        </CardContent>
      </Card>

      <p className="text-xs text-slate-600">Atualização do contrato: {PLUGIN_LAST_UPDATE}</p>
    </div>
  );
}
