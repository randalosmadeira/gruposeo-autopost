import { isSafeInternalRoute, providerErrorMessage, type Tone } from '@/lib/nexus-providers';
import type { AuditCategory, AuditFinding, AuditFixAction, AuditFixType, AuditRun, AuditSeverity } from '@/types/nexus-providers';

export const AUDIT_CADENCE_MINUTES = 15;
export const CATEGORY_ORDER_AUDIT: readonly AuditCategory[] = ['corrective', 'preventive', 'improvement'];
export const SEVERITY_ORDER: readonly AuditSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

const CATEGORY_LABELS: Record<AuditCategory, string> = { corrective: 'Corretivas', preventive: 'Preventivas', improvement: 'Melhorias' };
const CATEGORY_HINTS: Record<AuditCategory, string> = {
  corrective: 'Algo está quebrado agora.', preventive: 'Pode quebrar ou ficar caro em breve.', improvement: 'Melhoria ou upgrade possível.',
};
const SEVERITY_LABELS: Record<AuditSeverity, string> = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa', info: 'Informativa' };
const FIX_LABELS: Record<AuditFixType, string> = {
  provider_health_check: 'Testar as conexões gratuitas agora',
  search_performance_sync: 'Sincronizar os dados de busca agora',
  analytics_sync: 'Sincronizar os dados do Google Analytics agora',
  plugin_discovery_refresh: 'Atualizar a descoberta (llms.txt e robots) no plugin do site',
  open_route: 'Abrir a tela indicada',
};

export function auditCategoryLabel(c: AuditCategory | string): string { return CATEGORY_LABELS[c as AuditCategory] ?? String(c); }
export function auditCategoryHint(c: AuditCategory | string): string { return CATEGORY_HINTS[c as AuditCategory] ?? ''; }
export function severityLabel(s: AuditSeverity | string): string { return SEVERITY_LABELS[s as AuditSeverity] ?? String(s); }
export function severityTone(s: AuditSeverity | string): Tone {
  switch (s) {
    case 'critical': case 'high': return 'danger';
    case 'medium': return 'warning';
    case 'low': return 'info';
    default: return 'neutral';
  }
}
export function fixLabel(type: AuditFixType | string): string { return FIX_LABELS[type as AuditFixType] ?? 'Aplicar correção'; }

const STATUS_LABELS: Record<string, string> = { open: 'Aberto', acknowledged: 'Reconhecido', snoozed: 'Adiado', resolved: 'Resolvido' };
export function findingStatusLabel(s: string): string { return STATUS_LABELS[s] ?? s; }

/** Apenas os tipos de correção permitidos pelo contrato aparecem como botão. */
export function isApplicableFix(fix: AuditFixAction | null | undefined): fix is AuditFixAction {
  return !!fix && (['provider_health_check', 'search_performance_sync', 'analytics_sync', 'plugin_discovery_refresh', 'open_route'] as string[]).includes(fix.type);
}

/** `open_route` navega no próprio app (sem chamada ao servidor). Aceita params.route|path|to e params.tab opcional. */
export function fixRoute(fix: AuditFixAction | null | undefined): { route: string; tab?: string } | null {
  if (!fix || fix.type !== 'open_route') return null;
  const p = fix.params ?? {};
  const route = [p.route, p.path, p.to].find((v) => isSafeInternalRoute(v));
  if (!route) return null;
  return { route: route as string, ...(typeof p.tab === 'string' && p.tab ? { tab: p.tab } : {}) };
}

export function groupFindings(findings: AuditFinding[]): { active: Record<AuditCategory, AuditFinding[]>; resolved: AuditFinding[] } {
  const active: Record<AuditCategory, AuditFinding[]> = { corrective: [], preventive: [], improvement: [] };
  const resolved: AuditFinding[] = [];
  for (const f of findings) {
    if (f.status === 'resolved') resolved.push(f);
    else if (active[f.category]) active[f.category].push(f);
  }
  const rank = (s: string) => { const i = SEVERITY_ORDER.indexOf(s as AuditSeverity); return i < 0 ? SEVERITY_ORDER.length : i; };
  const byImportance = (a: AuditFinding, b: AuditFinding) => {
    // Abertos antes de reconhecidos/adiados; depois severidade; depois o mais recente.
    const open = (x: AuditFinding) => (x.status === 'open' ? 0 : 1);
    return open(a) - open(b) || rank(a.severity) - rank(b.severity) || new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
  };
  CATEGORY_ORDER_AUDIT.forEach((c) => active[c].sort(byImportance));
  resolved.sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime());
  return { active, resolved };
}

/** Minutos até a próxima execução agendada (a cada 15 min); 0 = atrasada/imediata; null = sem execução agendada conhecida. */
export function minutesToNextAudit(runs: AuditRun[], lastRun: AuditRun | null, now: number | Date = Date.now()): number | null {
  const n = typeof now === 'number' ? now : now.getTime();
  const scheduled = [...runs].filter((r) => r.trigger === 'schedule').sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0]
    ?? (lastRun?.trigger === 'schedule' ? lastRun : null);
  if (!scheduled) return null;
  const next = new Date(scheduled.started_at).getTime() + AUDIT_CADENCE_MINUTES * 60_000;
  if (!Number.isFinite(next)) return null;
  return Math.max(0, Math.ceil((next - n) / 60_000));
}

export function snoozeHoursLabel(hours: number): string { return hours === 1 ? '1 hora' : hours === 24 ? '24 horas' : hours === 168 ? '7 dias' : `${hours} horas`; }
export const SNOOZE_OPTIONS: readonly number[] = [1, 24, 168];

export function runStatusLabel(status: AuditRun['status']): string {
  return status === 'ok' ? 'Concluída' : status === 'partial' ? 'Parcial' : status === 'error' ? 'Com erro' : 'Em andamento';
}
export function runStatusTone(status: AuditRun['status']): Tone {
  return status === 'ok' ? 'success' : status === 'partial' ? 'warning' : status === 'error' ? 'danger' : 'neutral';
}

/** Mensagem curta do resultado de uma correção aplicada. */
export function fixResultMessage(r: { ok: boolean; result?: unknown; finding?: { status?: string } | null }): string {
  const res = r.result as { message?: unknown; detail?: unknown; error?: unknown } | null | undefined;
  const text = typeof res?.message === 'string' ? res.message : typeof res?.detail === 'string' ? res.detail : null;
  const resolved = r.finding?.status === 'resolved';
  if (!r.ok) {
    const err = typeof res?.error === 'string' ? providerErrorMessage(res.error) : null;
    return `A correção não pôde ser concluída.${err ? ` ${err}` : text ? ` ${text}` : ''}`;
  }
  return `Correção aplicada${resolved ? ' e o achado foi resolvido' : '; a regra foi reavaliada e o achado segue aberto'}.${text ? ` ${text}` : ''}`;
}

export function auditErrorMessage(error: unknown): string { return providerErrorMessage(error); }
