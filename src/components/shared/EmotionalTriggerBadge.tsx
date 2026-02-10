import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Flame,
  Laugh,
  AlertTriangle,
  Angry,
  Frown,
  SmilePlus,
  Drama,
  PartyPopper,
  HelpCircle,
  Search,
  Meh,
} from 'lucide-react';

export type EmotionalTrigger =
  | 'serious'
  | 'humor'
  | 'concern'
  | 'outrage'
  | 'anguish'
  | 'sarcasm'
  | 'satire'
  | 'happiness'
  | 'celebration'
  | 'doubt'
  | 'mystery';

interface TriggerDisplayConfig {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}

const TRIGGER_DISPLAY: Record<EmotionalTrigger, TriggerDisplayConfig> = {
  serious: {
    label: 'Sério',
    icon: Meh,
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-300',
  },
  humor: {
    label: 'Humor',
    icon: Laugh,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
  },
  concern: {
    label: 'Preocupação',
    icon: AlertTriangle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-300',
  },
  outrage: {
    label: 'Revolta',
    icon: Angry,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
  },
  anguish: {
    label: 'Angústia',
    icon: Frown,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
  },
  sarcasm: {
    label: 'Sarcasmo',
    icon: SmilePlus,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
  },
  satire: {
    label: 'Sátira',
    icon: Drama,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
  },
  happiness: {
    label: 'Felicidade',
    icon: PartyPopper,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-300',
  },
  celebration: {
    label: 'Comemoração',
    icon: PartyPopper,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-300',
  },
  doubt: {
    label: 'Dúvida',
    icon: HelpCircle,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-300',
  },
  mystery: {
    label: 'Mistério',
    icon: Search,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-300',
  },
};

interface EmotionalTriggerBadgeProps {
  trigger: string | null | undefined;
  confidence?: number | null;
  compact?: boolean;
  className?: string;
}

export function EmotionalTriggerBadge({ trigger, confidence, compact = false, className }: EmotionalTriggerBadgeProps) {
  if (!trigger || !(trigger in TRIGGER_DISPLAY)) return null;

  const config = TRIGGER_DISPLAY[trigger as EmotionalTrigger];
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-normal border',
        config.bgColor,
        config.color,
        config.borderColor,
        compact && 'px-1.5 py-0 text-[10px]',
        className
      )}
    >
      <Icon className={cn('shrink-0', compact ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
      {config.label}
      {confidence != null && !compact && (
        <span className="opacity-70 text-[10px] ml-0.5">{Math.round(confidence > 1 ? confidence : confidence * 100)}%</span>
      )}
    </Badge>
  );
}

export function EmotionalTriggerSelector({
  value,
  onChange,
  className,
}: {
  value: EmotionalTrigger | null;
  onChange: (trigger: EmotionalTrigger | null) => void;
  className?: string;
}) {
  const triggers = Object.entries(TRIGGER_DISPLAY) as [EmotionalTrigger, TriggerDisplayConfig][];

  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-3 gap-2', className)}>
      {triggers.map(([key, config]) => {
        const Icon = config.icon;
        const isSelected = value === key;
        return (
          <div
            key={key}
            className={cn(
              'p-2 rounded-lg border cursor-pointer transition-all flex items-center gap-2',
              isSelected
                ? `border-2 ${config.borderColor} ${config.bgColor}`
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            )}
            onClick={() => onChange(isSelected ? null : key)}
          >
            <Icon className={cn('w-4 h-4 shrink-0', isSelected ? config.color : 'text-muted-foreground')} />
            <span className={cn('text-xs font-medium', isSelected ? config.color : 'text-foreground')}>
              {config.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export { TRIGGER_DISPLAY };
