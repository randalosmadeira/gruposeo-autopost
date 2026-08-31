import { Link } from 'react-router-dom';
import { ArrowRight, BrainCircuit, Radar, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { CentralCortex } from './CentralCortex';
import { ZicaLogo } from './ZicaLogo';

type TrafficBrainHeroProps = {
  totalWaves: number;
  activeWaves: number;
  indexingSubmitted: number;
  indexingConfirmed: number;
  llmVisibility: number | null;
  semanticAuthority: number | null;
};

const MetricValue = ({ value }: { value: number | null }) => (
  <strong className="text-2xl font-black tracking-tight text-white">{value === null ? 'N/D' : `${value}%`}</strong>
);

export function TrafficBrainHero({ totalWaves, activeWaves, indexingSubmitted, indexingConfirmed, llmVisibility, semanticAuthority }: TrafficBrainHeroProps) {
  return (
    <section className="zica-command-hero relative isolate overflow-hidden rounded-[30px] border border-[#26313d] bg-[#071018] p-4 shadow-[0_35px_100px_rgba(0,0,0,.5)] sm:p-6 xl:p-7">
      <div className="zica-command-grid pointer-events-none absolute inset-0" />
      <div className="zica-command-scan pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -left-24 top-20 h-80 w-80 rounded-full bg-[#00F0FF]/[.055] blur-3xl" />
      <div className="pointer-events-none absolute left-[45%] top-[-18%] h-96 w-96 rounded-full bg-[#D4FF00]/[.055] blur-3xl" />
      <div className="relative z-10 grid gap-5 xl:grid-cols-[.88fr_1.45fr_.82fr] xl:items-stretch">
        <div className="flex flex-col justify-between rounded-[24px] border border-[#24313b]/65 bg-[#09121a]/55 p-5 backdrop-blur-sm sm:p-6">
          <div>
            <div className="mb-5 flex items-center justify-between gap-3">
              <ZicaLogo showSubtitle />
              <span className="hidden rounded-full border border-[#D4FF00]/30 bg-[#D4FF00]/[.06] px-3 py-1.5 text-[9px] font-black uppercase tracking-[.16em] text-[#D4FF00] sm:inline-flex sm:items-center sm:gap-1.5"><Sparkles className="h-3 w-3" /> 24/7</span>
            </div>
            <p className="text-[11px] font-black uppercase tracking-[.22em] text-slate-400">O cérebro de tráfego viral</p>
            <h1 className="mt-2 text-[clamp(2.4rem,4.2vw,4.7rem)] font-black leading-[.88] tracking-[-.065em] text-white">ZICA<span className="text-[#D4FF00]">.</span><span className="text-[#D4FF00]">AI</span></h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-slate-400">Seu tráfego tá na zica? <strong className="text-white">Deszica com <span className="text-[#D4FF00]">Zica.ai.</span></strong><span className="mt-1 block">SEO, GEO e semântica para LLMs em um único sistema nervoso.</span></p>
          </div>
          <div className="mt-6">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="zica-live-stat"><Zap className="h-5 w-5 text-[#D4FF00]" /><div><strong>{totalWaves}</strong><span>Ondas criadas</span></div></div>
              <div className="zica-live-stat"><Radar className="h-5 w-5 text-[#00F0FF]" /><div><strong>{activeWaves}</strong><span>Ondas ativas</span></div></div>
            </div>
            <Link to="/articles/new" className="zica-primary-cta mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#D4FF00] px-5 text-sm font-black uppercase tracking-[.02em] text-[#071018] transition"><Zap className="h-4 w-4 fill-current" /> Gerar nova onda de conteúdo <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
        <div className="relative min-h-[410px] overflow-hidden rounded-[24px] border border-[#20313b]/55 bg-[radial-gradient(circle_at_50%_50%,rgba(0,240,255,.055),transparent_45%)] sm:min-h-[465px] xl:min-h-[520px]">
          <div className="absolute left-4 top-4 z-30 inline-flex items-center gap-2 rounded-full border border-[#D4FF00]/25 bg-[#071018]/80 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.16em] text-[#D4FF00] backdrop-blur"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#D4FF00] shadow-[0_0_10px_#D4FF00]" /> Central Cortex ativa</div>
          <CentralCortex variant="dashboard" className="absolute inset-0" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <article className="zica-kpi-panel"><div className="flex items-start justify-between gap-3"><div><p>IndexNow / LLMs</p><strong>{indexingSubmitted}</strong><span className="ml-1 text-sm font-semibold text-slate-400">submetidos</span></div><Radar className="h-6 w-6 text-[#00F0FF]" /></div><div className="zica-sparkline zica-sparkline--cyan" /><span>{indexingConfirmed} com indexação confirmada</span></article>
          <article className="zica-kpi-panel"><div className="flex items-start justify-between gap-3"><div><p>Visibilidade em LLMs</p><MetricValue value={llmVisibility} /></div><BrainCircuit className="h-6 w-6 text-[#D4FF00]" /></div><div className="zica-sparkline zica-sparkline--volt" /><span>{llmVisibility === null ? 'Aguardando auditoria real' : 'Média dos artigos auditados'}</span></article>
          <article className="zica-kpi-panel"><div className="flex items-start justify-between gap-3"><div><p>Autoridade Semântica</p><MetricValue value={semanticAuthority} /></div><ShieldCheck className="h-6 w-6 text-[#00F0FF]" /></div><div className="zica-sparkline zica-sparkline--cyan" /><span>{semanticAuthority === null ? 'Sem score fabricado' : 'Score semântico auditado'}</span></article>
        </div>
      </div>
      <div className="relative z-10 mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-[#22303a] pt-4 text-[9px] font-black uppercase tracking-[.18em] text-slate-500"><span>Artigos de Blog</span><i className="h-1.5 w-1.5 rounded-full bg-[#00F0FF] shadow-[0_0_8px_#00F0FF]" /><span>Posts Sociais</span><i className="h-1.5 w-1.5 rounded-full bg-[#D4FF00] shadow-[0_0_8px_#D4FF00]" /><span>Ondas Virais</span><i className="h-1.5 w-1.5 rounded-full bg-[#00F0FF] shadow-[0_0_8px_#00F0FF]" /><span>GEO & Semântica LLMs</span></div>
    </section>
  );
}
