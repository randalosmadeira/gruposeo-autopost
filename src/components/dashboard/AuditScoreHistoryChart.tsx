import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function AuditScoreHistoryChart() {
  const { user } = useAuth();

  const { data: runs } = useQuery({
    queryKey: ['audit-score-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('seo_agent_runs')
        .select('id, started_at, details, status')
        .eq('status', 'completed')
        .order('started_at', { ascending: true })
        .limit(30);
      if (error) throw error;
      return (data || [])
        .filter(r => {
          const d = r.details as any;
          return d?.audit?.score !== undefined;
        })
        .map(r => {
          const d = r.details as any;
          const audit = d.audit;
          return {
            date: format(new Date(r.started_at), 'dd/MM', { locale: ptBR }),
            fullDate: format(new Date(r.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
            score: audit.score,
            indexing: audit.categories?.indexing?.score ?? 0,
            schema: audit.categories?.schema?.score ?? 0,
            content: audit.categories?.content?.score ?? 0,
            geo: audit.categories?.geo?.score ?? 0,
            issues: audit.issues_found ?? 0,
          };
        });
    },
    enabled: !!user?.id,
  });

  if (!runs || runs.length < 2) return null;

  const latest = runs[runs.length - 1];
  const previous = runs[runs.length - 2];
  const trend = latest.score - previous.score;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Evolução do Score de Auditoria
          </CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Último:</span>
            <span className={`font-bold ${latest.score >= 80 ? 'text-green-600' : latest.score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
              {latest.score}
            </span>
            {trend !== 0 && (
              <span className={`text-xs ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {trend > 0 ? '+' : ''}{trend}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={runs} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  score: 'Score Geral',
                  indexing: 'Indexação',
                  schema: 'Schema',
                  content: 'Conteúdo',
                  geo: 'GEO/IA',
                };
                return [value, labels[name] || name];
              }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
            />
            <ReferenceLine y={80} stroke="hsl(var(--primary))" strokeDasharray="5 5" strokeOpacity={0.4} />
            <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="indexing" stroke="#10B981" strokeWidth={1} dot={false} strokeOpacity={0.5} />
            <Line type="monotone" dataKey="content" stroke="#F97316" strokeWidth={1} dot={false} strokeOpacity={0.5} />
            <Line type="monotone" dataKey="geo" stroke="#8B5CF6" strokeWidth={1} dot={false} strokeOpacity={0.5} />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-primary inline-block rounded" /> Score Geral</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block rounded" /> Indexação</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-500 inline-block rounded" /> Conteúdo</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-500 inline-block rounded" /> GEO/IA</span>
        </div>
      </CardContent>
    </Card>
  );
}
