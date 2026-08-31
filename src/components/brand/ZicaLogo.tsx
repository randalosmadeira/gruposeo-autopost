import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

type ZicaLogoProps = {
  compact?: boolean;
  className?: string;
  showSubtitle?: boolean;
};

export function ZicaLogo({ compact = false, className, showSubtitle = false }: ZicaLogoProps) {
  return (
    <div className={cn('zica-brand flex items-center gap-3', className)}>
      <span className={cn('zica-brand-mark relative grid shrink-0 place-items-center rounded-full', compact ? 'h-10 w-10' : 'h-12 w-12')}>
        <span className="absolute inset-[3px] rounded-full border border-[#D4FF00]/70" />
        <Zap className={cn('relative z-10 fill-[#D4FF00] text-[#D4FF00] drop-shadow-[0_0_10px_rgba(212,255,0,.7)]', compact ? 'h-5 w-5' : 'h-6 w-6')} strokeWidth={2.6} />
        <span className="absolute inset-0 rounded-full shadow-[0_0_26px_rgba(212,255,0,.18)]" />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block whitespace-nowrap text-2xl font-black tracking-[-.055em] text-white">
            ZICA<span className="text-[#D4FF00]">.</span><span className="text-[#D4FF00]">AI</span>
          </span>
          {showSubtitle && (
            <span className="block whitespace-nowrap text-[9px] font-bold uppercase tracking-[.2em] text-slate-500">
              Cérebro de Tráfego Viral
            </span>
          )}
        </span>
      )}
    </div>
  );
}
