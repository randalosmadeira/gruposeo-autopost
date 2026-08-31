import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BrainCircuit,
  CircleCheckBig,
  Gauge,
  Globe2,
  Network,
  Radar,
  Sparkles,
  Zap,
} from 'lucide-react';
import { NeuralEnergy } from './NeuralEnergy';

type TrafficBrainHeroProps = {
  totalWaves: number;
  activeWaves: number;
  indexingSubmitted: number;
  indexingConfirmed: number;
  llmVisibility: number | null;
  semanticAuthority: number | null;
};

const Score = ({ value }: { value: number | null }) => (
  <span className="text-xl font-black text-white">{value === null ? 'N/D' : `${value}/100`}</span>
);

export function TrafficBrainHero({
  totalWaves,
  activeWaves,
  indexingSubmitted,
  indexingConfirmed,
  llmVisibility,
  semanticAuthority,
}: TrafficBrainHeroProps) {
  return (
    <section className="neural-hero relative overflow-hidden rounded-[28px] border border-[#30363D]/90 bg-[#0B1016] p-5 shadow-[0_30px_100px_rgba(0,0,0,.45)] sm:p-7 lg:p-9">
      <NeuralEnergy variant="hero" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(0,240,255,.12),transparent_22%),radial-gradient(circle_at_48%_46%,rgba(212,255,0,.09),transparent_35%)]" />

      <div className="relative z-10 grid gap-8 xl:grid-cols-[.95fr_1.1fr_.95fr] xl:items-center">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D4FF00]/20 bg-[#D4FF00]/7 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-[#D4FF00]">
            <Sparkles className="h-3.5 w-3.5" /> Operação autônoma 24/7
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[.2em] text-slate-400">O cérebro de tráfego viral</p>
            <h2 className="mt-2 text-4xl font-black tracking-[-.05em] text-white sm:text-5xl">
              ZICA<span className="text-[#D4FF00]">.</span><span className="text-[#00F0FF]">AI</span>
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">
              Seu tráfego tá na zica? <strong className="text-slate-100">Deszica com Zica.ai.</strong> SEO, GEO e semântica para LLMs trabalhando como um único sistema nervoso.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="neural-mini-stat">
              <Zap className="h-4 w-4 text-[#D4FF00]" />
              <div><strong>{totalWaves}</strong><span> ondas criadas</span></div>
            </div>
            <div className="neural-mini-stat">
              <Radar className="h-4 w-4 text-[#00F0FF]" />
              <div><strong>{activeWaves}</strong><span> ondas ativas</span></div>
            </div>
          </div>

          <Link
            to="/articles/new"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D4FF00] px-5 text-sm font-black text-[#0D1117] shadow-[0_0_35px_rgba(212,255,0,.22)] transition hover:-translate-y-0.5 hover:shadow-[0_0_48px_rgba(212,255,0,.34)]"
          >
            Gerar nova onda de conteúdo <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="relative mx-auto flex min-h-[280px] w-full max-w-[520px] items-center justify-center sm:min-h-[340px]">
          <div className="neural-orbit neural-orbit-1" />
          <div className="neural-orbit neural-orbit-2" />
          <div className="neural-orbit neural-orbit-3" />
          <div className="neural-core relative z-10 flex h-36 w-36 items-center justify-center rounded-full border border-[#00F0FF]/45 bg-[#07131A]/90 shadow-[0_0_70px_rgba(0,240,255,.2)] sm:h-44 sm:w-44">
            <div className="absolute inset-4 rounded-full border border-[#D4FF00]/25" />
            <BrainCircuit className="h-20 w-20 text-[#00F0FF] drop-shadow-[0_0_18px_rgba(0,240,255,.55)] sm:h-24 sm:w-24" />
            <div className="absolute -bottom-7 whitespace-nowrap rounded-full border border-[#30363D] bg-[#0D1117]/95 px-3 py-1 text-[10px] font-black uppercase tracking-[.17em] text-[#D4FF00]">
              Zica.ai Central Cortex
            </div>
          </div>
          <div className="absolute left-[5%] top-[18%] neural-node"><Network /></div>
          <div className="absolute right-[6%] top-[21%] neural-node"><Globe2 /></div>
          <div className="absolute bottom-[12%] left-[13%] neural-node"><Gauge /></div>
          <div className="absolute bottom-[10%] right-[12%] neural-node"><CircleCheckBig /></div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="neural-outcome-card">
            <div className="flex items-center justify-between gap-3">
              <div><p>IndexNow / LLMs</p><strong>{indexingSubmitted} submetidos</strong></div>
              <Radar className="h-5 w-5 text-[#00F0FF]" />
            </div>
            <span>{indexingConfirmed} com indexação confirmada</span>
          </div>
          <div className="neural-outcome-card">
            <div className="flex items-center justify-between gap-3">
              <div><p>Visibilidade em LLMs</p><Score value={llmVisibility} /></div>
              <BrainCircuit className="h-5 w-5 text-[#D4FF00]" />
            </div>
            <span>{llmVisibility === null ? 'aguardando auditoria real' : 'média dos artigos auditados'}</span>
          </div>
          <div className="neural-outcome-card">
            <div className="flex items-center justify-between gap-3">
              <div><p>Autoridade semântica</p><Score value={semanticAuthority} /></div>
              <Globe2 className="h-5 w-5 text-[#00F0FF]" />
            </div>
            <span>{semanticAuthority === null ? 'sem score fabricado' : 'score semântico auditado'}</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-[#30363D]/60 pt-4 text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">
        <span>Artigos de blog</span><span className="text-[#00F0FF]">•</span>
        <span>Posts sociais</span><span className="text-[#D4FF00]">•</span>
        <span>Ondas virais</span><span className="text-[#00F0FF]">•</span>
        <span>GEO & Semântica LLMs</span>
      </div>
    </section>
  );
}
