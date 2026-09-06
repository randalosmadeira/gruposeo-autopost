import { BrainCircuit, FileText, Gauge, Globe2, ShieldCheck, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';

type CentralCortexProps = {
  variant?: 'dashboard' | 'auth' | 'compact';
  className?: string;
};

const nodes = [
  { label: 'Conteúdo GEO', Icon: Globe2, cls: 'zica-cortex-node--geo' },
  { label: 'Artigos de Blog', Icon: FileText, cls: 'zica-cortex-node--blog' },
  { label: 'Posts Sociais', Icon: UsersRound, cls: 'zica-cortex-node--social' },
  { label: 'Autoridade Semântica', Icon: ShieldCheck, cls: 'zica-cortex-node--authority' },
  { label: 'Ondas Virais de Tráfego', Icon: Gauge, cls: 'zica-cortex-node--viral' },
];

const circuitPaths = [
  'M259 139 C229 130 204 145 195 168 C175 175 164 195 170 215 C151 229 151 255 169 269 C163 292 181 313 205 315 C216 337 243 344 265 332',
  'M381 139 C411 130 436 145 445 168 C465 175 476 195 470 215 C489 229 489 255 471 269 C477 292 459 313 435 315 C424 337 397 344 375 332',
  'M272 153 C246 153 225 172 225 197 C205 207 200 234 214 250 C202 274 218 300 244 302 C250 321 266 330 284 327',
  'M368 153 C394 153 415 172 415 197 C435 207 440 234 426 250 C438 274 422 300 396 302 C390 321 374 330 356 327',
  'M320 143 L320 330',
  'M286 178 C304 181 309 194 309 210 L309 257 C309 277 298 289 279 292',
  'M354 178 C336 181 331 194 331 210 L331 257 C331 277 342 289 361 292',
  'M243 220 H288 M352 220 H397 M248 265 H288 M352 265 H392',
];

export function CentralCortex({ variant = 'dashboard', className }: CentralCortexProps) {
  const compact = variant === 'compact';
  return (
    <div className={cn('zica-cortex-stage relative', `zica-cortex-stage--${variant}`, className)} aria-label="Núcleo visual do Zica.IA Posts">
      <svg className="zica-cortex-svg absolute inset-0 h-full w-full" viewBox="0 0 640 460" role="img" aria-hidden="true">
        <defs>
          <radialGradient id="cortexGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#00F0FF" stopOpacity=".2" />
            <stop offset=".55" stopColor="#00F0FF" stopOpacity=".05" />
            <stop offset="1" stopColor="#00F0FF" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="energyGradient" x1="0" x2="1">
            <stop offset="0" stopColor="#00F0FF" />
            <stop offset=".48" stopColor="#D4FF00" />
            <stop offset="1" stopColor="#00F0FF" />
          </linearGradient>
          <filter id="cyanGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="voltGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <ellipse cx="320" cy="235" rx="300" ry="68" fill="none" stroke="#00F0FF" strokeOpacity=".14" strokeWidth="1" />
        <ellipse className="zica-cortex-orbit zica-cortex-orbit--a" cx="320" cy="235" rx="270" ry="102" fill="none" stroke="#00F0FF" strokeOpacity=".5" strokeWidth="2" strokeDasharray="10 15" />
        <ellipse className="zica-cortex-orbit zica-cortex-orbit--b" cx="320" cy="235" rx="228" ry="132" fill="none" stroke="#D4FF00" strokeOpacity=".48" strokeWidth="2.2" strokeDasharray="18 10 2 10" />
        <ellipse className="zica-cortex-orbit zica-cortex-orbit--c" cx="320" cy="235" rx="190" ry="165" fill="none" stroke="#00F0FF" strokeOpacity=".26" strokeWidth="1.4" strokeDasharray="4 12" />
        <ellipse cx="320" cy="235" rx="126" ry="116" fill="url(#cortexGlow)" />
        <g className="zica-energy-network" fill="none" strokeLinecap="round">
          <path className="zica-shock zica-shock--1" d="M24 188 L86 174 L119 189 L163 165 L198 177 L233 150" stroke="#00F0FF" strokeWidth="2" />
          <path className="zica-shock zica-shock--2" d="M414 156 L452 174 L485 158 L518 177 L555 157 L616 174" stroke="#D4FF00" strokeWidth="2" />
          <path className="zica-shock zica-shock--3" d="M36 296 L101 281 L129 296 L171 278 L210 292 L252 270" stroke="#00F0FF" strokeWidth="1.6" />
          <path className="zica-shock zica-shock--4" d="M388 294 L432 277 L472 293 L509 274 L548 289 L618 270" stroke="#D4FF00" strokeWidth="1.6" />
          <path className="zica-signal-wave" d="M12 232 C52 206 83 258 123 232 S194 206 234 232" stroke="url(#energyGradient)" strokeWidth="1.6" />
          <path className="zica-signal-wave zica-signal-wave--reverse" d="M406 232 C446 206 477 258 517 232 S588 206 628 232" stroke="url(#energyGradient)" strokeWidth="1.6" />
        </g>
        <g className="zica-brain" fill="none" stroke="#00F0FF" strokeLinecap="round" strokeLinejoin="round" filter="url(#cyanGlow)">
          {circuitPaths.map((d) => <path key={d} d={d} strokeWidth="2.4" />)}
          <circle cx="320" cy="235" r="104" stroke="#00F0FF" strokeOpacity=".18" strokeWidth="1" strokeDasharray="3 8" />
        </g>
        <g className="zica-cortex-data" fill="#D4FF00" filter="url(#voltGlow)">
          <circle cx="210" cy="166" r="3"/><circle cx="435" cy="192" r="3"/><circle cx="388" cy="314" r="3"/><circle cx="244" cy="304" r="3"/>
        </g>
        <g className="zica-cortex-pedestal" fill="none">
          <path d="M320 340 V405" stroke="#00F0FF" strokeOpacity=".55" strokeWidth="1.8" strokeDasharray="3 5" />
          <ellipse cx="320" cy="408" rx="78" ry="15" stroke="#00F0FF" strokeOpacity=".55" />
          <ellipse cx="320" cy="408" rx="48" ry="9" stroke="#00F0FF" strokeOpacity=".3" />
          <circle cx="320" cy="408" r="5" fill="#00F0FF" filter="url(#cyanGlow)" />
        </g>
      </svg>
      <div className="zica-cortex-core absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-[52%] flex-col items-center justify-center text-center">
        <BrainCircuit className={cn('text-[#00F0FF] drop-shadow-[0_0_22px_rgba(0,240,255,.65)]', compact ? 'h-12 w-12' : 'h-16 w-16 sm:h-20 sm:w-20')} strokeWidth={1.5} />
        <strong className="mt-2 text-xl font-black tracking-[-.04em] text-[#D4FF00] sm:text-2xl">ZICA.AI</strong>
        <span className="text-[8px] font-black uppercase tracking-[.18em] text-white sm:text-[9px]">Zica Posts</span>
      </div>
      {!compact && nodes.map(({ label, Icon, cls }) => (
        <div key={label} className={cn('zica-cortex-node absolute z-30', cls)}>
          <span className="zica-cortex-node-icon"><Icon /></span>
          <span className="zica-cortex-node-label">{label}</span>
        </div>
      ))}
      <div className="zica-viral-pulse absolute inset-0 pointer-events-none" />
    </div>
  );
}
