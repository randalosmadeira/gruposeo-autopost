import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Activity, CheckCircle2, Clock3, Download, Gauge, Globe2, History,
  KeyRound, Network, PlugZap, ShieldCheck, Sparkles, Vote, Workflow,
} from 'lucide-react';
import {
  PLUGIN_API_NAMESPACE, PLUGIN_LAST_UPDATE, PLUGIN_NAME,
  PLUGIN_SOFTWARE_ID, PLUGIN_VERSION,
} from '@/lib/plugin-version';

const ELECTORAL_PLUGIN_VERSION = '1.2.1';
const POST_ZIP = `/downloads/zica-posts-${PLUGIN_VERSION}.zip?v=${PLUGIN_VERSION}`;
const ELECTORAL_ZIP = `/downloads/zica-electoral-analytics-${ELECTORAL_PLUGIN_VERSION}.zip?v=${ELECTORAL_PLUGIN_VERSION}`;
const THEME_ZIP = '/downloads/zica-neural-theme-1.0.0.zip?v=1.0.0';

const capabilities = [
  { icon: Workflow, title: 'ZIP gerado no build', text: 'O pacote é montado no servidor a partir da árvore completa da versão, nunca mais no navegador.' },
  { icon: ShieldCheck, title: 'Versão validada', text: 'O build falha se o cabeçalho PHP não declarar exatamente a versão publicada.' },
  { icon: Network, title: 'Arquivos completos', text: 'Includes, assets, manifests e arquivos obrigatórios entram no ZIP de forma recursiva.' },
  { icon: CheckCircle2, title: 'URL imutável', text: 'Cada versão possui um caminho próprio e cache-buster explícito.' },
];

export default function WordPressPluginPage() {
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
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">Downloads estáticos, completos e versionados. O navegador não monta mais ZIPs; ele baixa exatamente o pacote produzido e validado no build da VPS.</p>
            </div>
            <div className="grid min-w-[300px] gap-2">
              <Button asChild className="bg-[#D4FF00] font-black text-[#071014] hover:bg-[#c5ef00]">
                <a href={POST_ZIP} download={`zica-posts-${PLUGIN_VERSION}.zip`}><Download className="mr-2 h-4 w-4" /> Baixar Zica Posts {PLUGIN_VERSION}</a>
              </Button>
              <Button asChild className="bg-[#00F0FF] font-black text-[#071014] hover:bg-[#00dce9]">
                <a href={ELECTORAL_ZIP} download={`zica-electoral-analytics-${ELECTORAL_PLUGIN_VERSION}.zip`}><Vote className="mr-2 h-4 w-4" /> Baixar Plugin Eleitoral {ELECTORAL_PLUGIN_VERSION}</a>
              </Button>
              <Button asChild variant="outline" className="border-white/20 bg-white/[.03] text-white hover:bg-white/[.06]">
                <a href={THEME_ZIP} download="zica-neural-theme-1.0.0.zip"><Sparkles className="mr-2 h-4 w-4" /> Baixar Tema Zica Neural</a>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {capabilities.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="border-[#30363D] bg-[#12191f]/95 text-white">
              <CardHeader className="pb-2"><Icon className="h-5 w-5 text-[#D4FF00]" /><CardTitle className="text-base">{title}</CardTitle></CardHeader>
              <CardContent className="text-sm leading-6 text-slate-400">{text}</CardContent>
            </Card>
          ))}
        </section>

        <section id="electoral-plugin" className="scroll-mt-6">
          <Card className="border-[#00F0FF]/35 bg-gradient-to-br from-[#0f1c22] to-[#11171d] text-white shadow-[0_0_35px_rgba(0,240,255,.07)]">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl"><Vote className="h-5 w-5 text-[#D4FF00]" /> Zica Electoral Analytics {ELECTORAL_PLUGIN_VERSION}</CardTitle>
                  <CardDescription className="mt-2 text-slate-400">Pacote completo com analytics agregado, Consent Mode, pop-up de cadastro e CTA do Instagram.</CardDescription>
                </div>
                <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-300">PACOTE ESTÁTICO VALIDADO</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Configuração central', 'GA4, GTM Web, GTM Server, pop-up e desligamento vêm do Zica.ai.'],
                  ['Consent Mode', 'analytics_storage inicia negado e só muda conforme consentimento.'],
                  ['Cadastro consentido', 'Pop-up por scroll/exit intent, com e-mail, WhatsApp e voluntariado.'],
                  ['Instagram', 'CTA opcional para @rdmadvogados com evento agregado de clique.'],
                ].map(([title, text]) => <div key={title} className="rounded-xl border border-[#263541] bg-[#0D1117] p-4"><div className="font-bold text-[#00F0FF]">{title}</div><p className="mt-2 text-xs leading-5 text-slate-400">{text}</p></div>)}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="bg-[#D4FF00] font-black text-[#071014] hover:bg-[#c5ef00]"><a href={ELECTORAL_ZIP} download={`zica-electoral-analytics-${ELECTORAL_PLUGIN_VERSION}.zip`}><Download className="mr-2 h-4 w-4" /> Baixar zica-electoral-analytics-{ELECTORAL_PLUGIN_VERSION}.zip</a></Button>
                <Button asChild variant="outline" className="border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/5 hover:text-[#00F0FF]"><Link to="/electoral-campaign/portal-network"><Globe2 className="mr-2 h-4 w-4" /> Configurar Rede Eleitoral</Link></Button>
                <Button asChild variant="outline" className="border-white/15 text-slate-200 hover:bg-white/[.04]"><Link to="/electoral-campaign/editorial-console"><History className="mr-2 h-4 w-4" /> Abrir Central Editorial</Link></Button>
              </div>
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/[.05] p-3 text-xs leading-5 text-amber-100">No WordPress: Plugins → Adicionar plugin → Enviar plugin → selecione o ZIP → Instalar → Substituir o atual pelo enviado. Confirme que a coluna “Enviado” mostra 3.11.0 para Zica Posts e 1.2.1 para Zica Electoral Analytics.</div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
          <Card className="border-[#30363D] bg-[#10171d]/95 text-white">
            <CardHeader><CardTitle className="flex items-center gap-2"><PlugZap className="h-5 w-5 text-[#D4FF00]" /> Contrato atual</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg bg-[#0D1117] p-3"><span className="text-slate-500">Zica Posts</span><div className="mt-1 font-mono text-[#00F0FF]">{PLUGIN_NAME} {PLUGIN_VERSION}</div></div>
              <div className="rounded-lg bg-[#0D1117] p-3"><span className="text-slate-500">Eleitoral</span><div className="mt-1 font-mono text-[#00F0FF]">Zica Electoral Analytics {ELECTORAL_PLUGIN_VERSION}</div></div>
              <div className="rounded-lg bg-[#0D1117] p-3"><span className="text-slate-500">API</span><div className="mt-1 font-mono text-[#00F0FF]">/wp-json/{PLUGIN_API_NAMESPACE}/</div></div>
              <div className="rounded-lg bg-[#0D1117] p-3"><span className="text-slate-500">Atualização</span><div className="mt-1 text-slate-300">{PLUGIN_LAST_UPDATE}</div></div>
            </CardContent>
          </Card>
          <Card className="border-[#30363D] bg-[#10171d]/95 text-white">
            <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-[#00F0FF]" /> Garantias do pacote</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-300">
              <div className="flex gap-2"><KeyRound className="mt-0.5 h-4 w-4 text-[#D4FF00]" /> Sem segredos dentro do ZIP.</div>
              <div className="flex gap-2"><Activity className="mt-0.5 h-4 w-4 text-[#D4FF00]" /> Pacote completo validado antes do Vite build.</div>
              <div className="flex gap-2"><Clock3 className="mt-0.5 h-4 w-4 text-[#D4FF00]" /> Nome de arquivo e versão ficam imutáveis.</div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
