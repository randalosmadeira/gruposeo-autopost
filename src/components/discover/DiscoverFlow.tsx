import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Globe2, Loader2, Search, Sparkles, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cleanSiteInput, type Phase, type Progress } from '@/lib/discover-api';

interface StartProps {
  initial?: string;
  busy: boolean;
  error?: string;
  projects: Array<{ id: string; name: string; domain: string | null }>;
  onStart: (site: string) => void;
  onPickProject: (id: string) => void;
}

/** Primeiro contato: UMA pergunta só (o endereço do site). O resto a Zica descobre. */
export function DiscoverStart({ initial = '', busy, error, projects, onStart, onPickProject }: StartProps) {
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const clean = cleanSiteInput(value);
  const invalid = touched && value.trim() !== '' && !clean;
  const withSite = projects.filter((p) => p.domain);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="space-y-3 text-center sm:text-left">
        <p className="text-xs uppercase tracking-widest text-primary">Começar por aqui</p>
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Cole o endereço do site.<br className="hidden sm:block" /> A Zica faz o resto.</h1>
        <p className="text-base text-muted-foreground">Em poucos minutos eu leio o site inteiro (inclusive subdomínios), descubro quem é o negócio, para quem fala e onde atende, e entrego tudo montado. Você só confirma e refina.</p>
      </header>

      <form className="space-y-3 rounded-xl border bg-card/40 p-4 sm:p-6" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (clean) onStart(clean); }} noValidate>
        <label htmlFor="discover-site" className="text-sm font-medium">Endereço do site (domínio principal ou subdomínio)</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="discover-site" inputMode="url" autoComplete="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="meusite.com.br"
              className="h-12 pl-10 text-base" value={value} disabled={busy} aria-invalid={invalid} aria-describedby="discover-site-help"
              onChange={(e) => setValue(e.target.value)} onBlur={() => setTouched(true)} />
          </div>
          <Button type="submit" size="lg" className="h-12 sm:px-8" disabled={busy || !clean}><Search className="mr-2 h-5 w-5" aria-hidden />Analisar meu site</Button>
        </div>
        <p id="discover-site-help" className={`text-xs ${invalid ? 'text-red-400' : 'text-muted-foreground'}`} role={invalid ? 'alert' : undefined}>
          {invalid ? 'Esse endereço não parece um site. Exemplo: minhaempresa.com.br ou blog.minhaempresa.com.br.' : 'Pode colar com ou sem https://. Só leio páginas públicas, sem custo e sem alterar nada no seu site.'}
        </p>
        {error && <p role="alert" className="rounded border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      </form>

      <ol className="grid gap-3 sm:grid-cols-3" aria-label="Como funciona">
        {[
          [Search, '1. Eu leio o site', 'Sitemap, páginas, dados estruturados, redes, menus e estrutura.'],
          [Sparkles, '2. Eu monto o perfil', 'Segmento, público, regiões, ofertas, oportunidades de SEO, GEO e AEO.'],
          [UserCheck, '3. Você confirma e refina', 'Ajusta o que quiser e pede sugestões à Zica por conversa.'],
        ].map(([Icon, title, text]) => {
          const I = Icon as typeof Search;
          return <li key={title as string} className="rounded-lg border p-3"><I className="h-5 w-5 text-primary" aria-hidden /><p className="mt-2 text-sm font-semibold">{title as string}</p><p className="mt-0.5 text-xs text-muted-foreground">{text as string}</p></li>;
        })}
      </ol>

      {withSite.length > 0 && (
        <section aria-labelledby="discover-existing" className="space-y-2">
          <h2 id="discover-existing" className="text-sm font-semibold">Ou reanalise um projeto que você já tem</h2>
          <ul className="flex flex-wrap gap-2">
            {withSite.map((p) => (
              <li key={p.id}><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onPickProject(p.id)} className="h-auto max-w-full whitespace-normal py-1.5 text-left"><span className="font-medium">{p.name}</span><span className="ml-2 break-all text-xs text-muted-foreground">{p.domain}</span></Button></li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-center text-sm text-muted-foreground sm:text-left">Prefere preencher na mão? <Link to="/business-profile" className="underline">Abrir o formulário completo</Link>.</p>
    </div>
  );
}

const STEPS: Array<[Phase, string]> = [
  ['mapa', 'Abrindo o site, robots.txt, llms.txt e sitemaps'],
  ['paginas', 'Lendo as páginas mais importantes'],
  ['sintese', 'Montando perfil, estrutura e oportunidades'],
];
const ORDER: Phase[] = ['mapa', 'paginas', 'sintese', 'pronto'];

export function DiscoverRunning({ host, progress, onCancel }: { host: string; progress: Progress; onCancel: () => void }) {
  const idx = ORDER.indexOf(progress.phase);
  const pct = progress.phase === 'mapa' ? 6 : progress.phase === 'paginas' ? 10 + Math.round((progress.done / Math.max(progress.total, 1)) * 80) : progress.phase === 'sintese' ? 95 : 100;
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 rounded-xl border bg-card/40 p-5 sm:p-8" aria-busy="true">
      <div>
        <p className="text-xs uppercase tracking-widest text-primary">Analisando</p>
        <h1 className="mt-1 break-all text-2xl font-bold leading-tight">{host}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Isso leva de 15 a 60 segundos, conforme o tamanho do site. Pode deixar esta tela aberta.</p>
      </div>
      <div className="h-2 overflow-hidden rounded bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Andamento da análise"><div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} /></div>
      <ol className="space-y-2.5">
        {STEPS.map(([phase, text], i) => {
          const done = idx > i; const active = idx === i;
          return (
            <li key={phase} className={`flex items-center gap-3 text-sm ${active ? 'font-medium' : done ? '' : 'text-muted-foreground'}`}>
              {done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-label="feito" /> : active ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-label="em andamento" /> : <span className="h-5 w-5 shrink-0 rounded-full border" aria-hidden />}
              <span className="min-w-0">{text}</span>
            </li>
          );
        })}
      </ol>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg border p-3"><p className="text-xl font-bold tabular-nums">{progress.sitemapUrls ? progress.sitemapUrls.toLocaleString('pt-BR') : '—'}</p><p className="text-xs text-muted-foreground">páginas no sitemap</p></div>
        <div className="rounded-lg border p-3"><p className="text-xl font-bold tabular-nums">{progress.pagesRead}</p><p className="text-xs text-muted-foreground">páginas lidas</p></div>
      </div>
      <p role="status" aria-live="polite" className="break-words text-sm text-muted-foreground">{progress.message}{progress.current ? ` ${progress.current.replace(/^https?:\/\//, '').slice(0, 70)}` : ''}</p>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
    </div>
  );
}
