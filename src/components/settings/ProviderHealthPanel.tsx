import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock3, Loader2, RefreshCw, Wifi, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { ProviderHealth, providerLabels, statusLabels } from '@/lib/providerHealth';

const providers: ProviderHealth['provider'][] = ['gemini', 'openai', 'anthropic', 'serper'];

export function ProviderHealthPanel() {
  const [health, setHealth] = useState<ProviderHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('provider-health', { body: {} });
    if (!error && Array.isArray(data?.providers)) setHealth(data.providers as ProviderHealth[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const channel = supabase.channel('ai-provider-health-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_provider_health' }, (payload) => {
        const row = payload.new as unknown as ProviderHealth;
        if (!row?.provider) return;
        setHealth((current) => [...current.filter((item) => item.provider !== row.provider), row]);
      })
      .subscribe();
    const onRefresh = () => void refresh();
    window.addEventListener('provider-health-refresh', onRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('provider-health-refresh', onRefresh);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const ordered = useMemo(() => providers.map((provider) => health.find((item) => item.provider === provider) || {
    user_id: '', provider, configured: false, status: 'not_configured' as const,
    latency_ms: null, capabilities: [], checked_at: '',
  }), [health]);
  const operational = ordered.filter((item) => item.status === 'operational').length;
  const creditBlocks = ordered.filter((item) => item.status === 'insufficient_credit');

  return (
    <div className="space-y-3" aria-live="polite">
      {creditBlocks.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Geração bloqueada por falta de crédito</p>
              <p className="text-sm">Regularize o saldo ou faturamento em {creditBlocks.map((item) => providerLabels[item.provider]).join(', ')}. A chave continua armazenada com segurança.</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium flex items-center gap-2"><Wifi className="h-4 w-4 text-primary" />Saúde das integrações em tempo real</p>
            <p className="text-xs text-muted-foreground">{operational}/4 operacionais. Atualização automática a cada 60 segundos e por evento.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Verificar agora
          </Button>
        </div>
        <Progress value={(operational / 4) * 100} />

        <div className="grid gap-3 md:grid-cols-2">
          {ordered.map((item) => {
            const positive = item.status === 'operational';
            const warning = item.status === 'unverified' || item.status === 'rate_limited';
            return (
              <div key={item.provider} className="rounded-md border bg-background/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{providerLabels[item.provider]}</span>
                  <Badge className={positive ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : warning ? 'bg-amber-500/15 text-amber-600 border-amber-500/30' : 'bg-red-500/15 text-red-500 border-red-500/30'}>
                    {positive ? <Check className="mr-1 h-3 w-3" /> : <X className="mr-1 h-3 w-3" />}{statusLabels[item.status]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Funções: {item.capabilities.length ? item.capabilities.join(', ') : 'aguardando configuração'}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Latência: {item.latency_ms === null ? 'não medida' : `${item.latency_ms} ms`}</span>
                  <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" />{item.checked_at ? new Date(item.checked_at).toLocaleTimeString('pt-BR') : 'aguardando'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
