import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, MapPin, Star, TrendingUp, Sparkles } from 'lucide-react';

export default function AuditoriaGBP() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  const auditsQuery = useQuery({
    queryKey: ['gbp-audits', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('gbp_audits')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const currentAudit = auditsQuery.data?.find((a: any) => a.id === selectedAuditId) || auditsQuery.data?.[0];

  const competitorsQuery = useQuery({
    queryKey: ['gbp-competitors', currentAudit?.id],
    queryFn: async () => {
      if (!currentAudit?.id) return [];
      const { data } = await supabase
        .from('gbp_competitors')
        .select('*, gbp_competitor_snapshots(snapshot_date, rating, reviews_count)')
        .eq('audit_id', currentAudit.id)
        .order('reviews_count', { ascending: false, nullsFirst: false });
      return data ?? [];
    },
    enabled: !!currentAudit?.id,
  });

  const runAudit = useMutation({
    mutationFn: async () => {
      if (!businessName.trim() || !city.trim()) throw new Error('Informe nome do negócio e cidade');
      const { data, error } = await supabase.functions.invoke('gbp-audit', {
        body: {
          business_name: businessName.trim(),
          city: city.trim(),
          category: category.trim() || undefined,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast({ title: 'Auditoria concluída', description: `Provider: ${data?.provider ?? 'ai'}` });
      setSelectedAuditId(data?.audit_id ?? null);
      qc.invalidateQueries({ queryKey: ['gbp-audits'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Falha na auditoria',
        description: err?.message ?? String(err),
        variant: 'destructive',
      });
    },
  });

  const insights = currentAudit?.ai_insights as any;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <MapPin className="w-7 h-7 text-primary" />
          Auditoria GBP + Engenharia Reversa
        </h1>
        <p className="text-muted-foreground mt-1">
          SEO Local: analisa seu perfil no Google Maps, mapeia concorrentes, avalia padrões de resposta a reviews e
          monta linha do tempo diária. Usa suas chaves BYOK (OpenAI/Gemini + Serper) de <code>Configurações</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova auditoria</CardTitle>
          <CardDescription>Informe o negócio e a cidade — a IA faz o resto.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>Nome do negócio</Label>
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ex.: RDM Advogados" />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex.: São Paulo, SP" />
          </div>
          <div>
            <Label>Categoria (opcional)</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex.: advocacia trabalhista" />
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => runAudit.mutate()}
              disabled={runAudit.isPending}
              className="w-full"
            >
              {runAudit.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Auditando...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Rodar auditoria</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {auditsQuery.data && auditsQuery.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Auditorias anteriores</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {auditsQuery.data.map((a: any) => (
              <Button
                key={a.id}
                variant={currentAudit?.id === a.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedAuditId(a.id)}
              >
                {a.business_name} — {a.city}
                <Badge variant="secondary" className="ml-2">{a.status}</Badge>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {currentAudit && (
        <Tabs defaultValue="insights">
          <TabsList>
            <TabsTrigger value="insights">Insights IA</TabsTrigger>
            <TabsTrigger value="competitors">Concorrentes ({competitorsQuery.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="space-y-4">
            {!insights && <p className="text-muted-foreground">Sem insights (ainda).</p>}
            {insights?.diagnostico_perfil_proprio && (
              <Card>
                <CardHeader><CardTitle>Diagnóstico do perfil próprio</CardTitle></CardHeader>
                <CardContent><p className="whitespace-pre-wrap">{insights.diagnostico_perfil_proprio}</p></CardContent>
              </Card>
            )}
            <div className="grid md:grid-cols-2 gap-4">
              {['gaps_criticos', 'oportunidades_conteudo', 'recomendacoes_prioritarias', 'palavras_chave_locais'].map((k) =>
                Array.isArray(insights?.[k]) && insights[k].length ? (
                  <Card key={k}>
                    <CardHeader><CardTitle className="capitalize text-base">{k.replace(/_/g, ' ')}</CardTitle></CardHeader>
                    <CardContent>
                      <ul className="list-disc pl-5 space-y-1 text-sm">
                        {insights[k].map((v: string, i: number) => <li key={i}>{v}</li>)}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null,
              )}
            </div>
            {Array.isArray(insights?.concorrentes_top) && (
              <Card>
                <CardHeader><CardTitle>Engenharia reversa dos concorrentes</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {insights.concorrentes_top.map((c: any, i: number) => (
                    <div key={i} className="border rounded-lg p-3 space-y-1">
                      <div className="font-semibold">{c.nome}</div>
                      {c.padrao_resposta_reviews && <p className="text-sm"><b>Respostas a reviews:</b> {c.padrao_resposta_reviews}</p>}
                      {c.frequencia_publicacao_estimada && <p className="text-sm"><b>Frequência publicação:</b> {c.frequencia_publicacao_estimada}</p>}
                      {c.estrategia_conteudo && <p className="text-sm"><b>Estratégia:</b> {c.estrategia_conteudo}</p>}
                      {Array.isArray(c.pontos_fortes) && <p className="text-sm text-green-700"><b>Fortes:</b> {c.pontos_fortes.join(', ')}</p>}
                      {Array.isArray(c.pontos_fracos) && <p className="text-sm text-red-700"><b>Fracos:</b> {c.pontos_fracos.join(', ')}</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="competitors">
            <Card>
              <CardContent className="pt-6 space-y-2">
                {competitorsQuery.data?.map((c: any) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border rounded p-3">
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.address} · {c.category}</div>
                    </div>
                    <div className="flex gap-3 text-sm">
                      {c.rating != null && <span className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-500" /> {c.rating}</span>}
                      {c.reviews_count != null && <span>{c.reviews_count} reviews</span>}
                      {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-primary underline">site</a>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeline">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" /> Evolução diária</CardTitle>
                <CardDescription>Snapshots gravados às 03:15 UTC. Novas linhas surgem a partir de hoje.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {competitorsQuery.data?.map((c: any) => {
                  const snaps = (c.gbp_competitor_snapshots as any[]) || [];
                  if (!snaps.length) return null;
                  const sorted = [...snaps].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
                  const first = sorted[0], last = sorted[sorted.length - 1];
                  const deltaR = (last.reviews_count ?? 0) - (first.reviews_count ?? 0);
                  return (
                    <div key={c.id} className="border rounded p-3">
                      <div className="font-semibold mb-1">{c.name}</div>
                      <div className="text-sm grid grid-cols-3 gap-2">
                        <span>Snapshots: {snaps.length}</span>
                        <span>Reviews: {first.reviews_count ?? '–'} → {last.reviews_count ?? '–'}</span>
                        <span className={deltaR > 0 ? 'text-green-600' : ''}>Δ {deltaR >= 0 ? '+' : ''}{deltaR}</span>
                      </div>
                    </div>
                  );
                })}
                {!competitorsQuery.data?.some((c: any) => (c.gbp_competitor_snapshots as any[])?.length) && (
                  <p className="text-muted-foreground">Aguardando primeiros snapshots — volte amanhã.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
