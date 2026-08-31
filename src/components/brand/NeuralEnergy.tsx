import { useId } from 'react';
import { cn } from '@/lib/utils';

type NeuralEnergyProps = {
  variant?: 'ambient' | 'hero' | 'compact';
  className?: string;
};

const paths = [
  'M-80 520 C 180 280, 350 660, 620 350 S 1010 120, 1320 340',
  'M-40 160 C 230 420, 430 40, 690 300 S 1050 600, 1280 260',
  'M120 760 C 320 430, 520 520, 730 250 S 1050 80, 1300 160',
  'M-60 360 C 190 160, 420 300, 610 500 S 980 600, 1280 430',
];

export function NeuralEnergy({ variant = 'ambient', className }: NeuralEnergyProps) {
  const id = useId().replace(/:/g, '');
  const glowId = `zica-glow-${id}`;
  const cyanId = `zica-cyan-${id}`;
  const voltId = `zica-volt-${id}`;

  return (
    <div
      aria-hidden="true"
      className={cn(
        'neural-energy pointer-events-none absolute inset-0 overflow-hidden',
        variant === 'hero' && 'neural-energy--hero',
        variant === 'compact' && 'neural-energy--compact',
        className,
      )}
    >
      <svg viewBox="0 0 1200 760" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={cyanId} x1="0" x2="1">
            <stop offset="0%" stopColor="#00F0FF" stopOpacity="0" />
            <stop offset="35%" stopColor="#00F0FF" stopOpacity="0.95" />
            <stop offset="80%" stopColor="#D4FF00" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#D4FF00" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={voltId} x1="1" x2="0">
            <stop offset="0%" stopColor="#D4FF00" stopOpacity="0" />
            <stop offset="36%" stopColor="#D4FF00" stopOpacity="0.9" />
            <stop offset="76%" stopColor="#00F0FF" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g fill="none" strokeLinecap="round" filter={`url(#${glowId})`}>
          {paths.map((path, index) => (
            <path
              key={`cyan-${index}`}
              d={path}
              stroke={`url(#${cyanId})`}
              strokeWidth={index % 2 ? 1.35 : 2}
              className={`neural-current neural-current-${index + 1}`}
              pathLength="1"
            />
          ))}
          {paths.slice().reverse().map((path, index) => (
            <path
              key={`volt-${index}`}
              d={path}
              stroke={`url(#${voltId})`}
              strokeWidth={index % 2 ? 1 : 1.6}
              className={`neural-current neural-current-reverse neural-current-${index + 1}`}
              pathLength="1"
            />
          ))}
        </g>

        <g className="neural-nodes" filter={`url(#${glowId})`}>
          <circle cx="208" cy="326" r="4" fill="#D4FF00" />
          <circle cx="406" cy="222" r="3.5" fill="#00F0FF" />
          <circle cx="617" cy="351" r="4.5" fill="#D4FF00" />
          <circle cx="844" cy="248" r="3.5" fill="#00F0FF" />
          <circle cx="1014" cy="415" r="4" fill="#D4FF00" />
        </g>
      </svg>
    </div>
  );
}
