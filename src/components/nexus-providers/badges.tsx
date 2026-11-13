import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Hand, HelpCircle, Info, MinusCircle, ShieldAlert, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { severityLabel, severityTone } from '@/lib/nexus-audit';
import { statusLabel, statusTone, toneClasses, type Tone } from '@/lib/nexus-providers';
import type { AuditSeverity, ProviderStatus } from '@/types/nexus-providers';

const TONE_ICON: Record<Tone, typeof Info> = {
  success: CheckCircle2, warning: AlertTriangle, danger: XCircle, info: Info, neutral: MinusCircle,
};

/** Selo com ícone + texto + cor: a cor nunca carrega o significado sozinha. */
export function ToneBadge({ tone, icon, children, className }: { tone: Tone; icon?: typeof Info; children: ReactNode; className?: string }) {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', toneClasses(tone), className)}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

const STATUS_ICON: Record<ProviderStatus, typeof Info> = {
  healthy: CheckCircle2, degraded: AlertTriangle, error: XCircle, stored_unverified: HelpCircle, not_configured: CircleDashed, manual: Hand,
};

export function StatusBadge({ status }: { status: ProviderStatus }) {
  return <ToneBadge tone={statusTone(status)} icon={STATUS_ICON[status] ?? Info}>{statusLabel(status)}</ToneBadge>;
}

export function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  const tone = severityTone(severity);
  return <ToneBadge tone={tone} icon={tone === 'danger' ? ShieldAlert : undefined}>{`Severidade: ${severityLabel(severity)}`}</ToneBadge>;
}
