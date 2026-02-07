import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTokenUsage } from '@/hooks/useTokenUsage';
import { 
  Activity, 
  DollarSign, 
  Zap, 
  TrendingUp,
  FileText,
  Image,
  List,
  Loader2 
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const OPERATION_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  content: { label: 'Conteúdo', icon: <FileText className="w-4 h-4" /> },
  title: { label: 'Títulos', icon: <FileText className="w-4 h-4" /> },
  image: { label: 'Imagens', icon: <Image className="w-4 h-4" /> },
  outline: { label: 'Esboços', icon: <List className="w-4 h-4" /> },
  secondary_keywords: { label: 'Keywords', icon: <TrendingUp className="w-4 h-4" /> },
  other: { label: 'Outros', icon: <Activity className="w-4 h-4" /> },
};

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(4)}`;
}

export function TokenUsageCard() {
  const { summary, isLoading, logs } = useTokenUsage(30);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Uso de Tokens e Créditos
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const hasData = summary.totalRequests > 0;

  // Calculate provider percentages
  const openaiPercent = summary.totalTokens > 0 
    ? (summary.byProvider.openai.tokens / summary.totalTokens) * 100 
    : 0;
  const geminiPercent = 100 - openaiPercent;

  // Chart data - last 7 days
  const chartData = summary.dailyUsage.slice(-7).map(day => ({
    date: new Date(day.date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
    tokens: day.tokens,
    custo: day.cost,
    requests: day.requests,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Uso de Tokens e Créditos
          <Badge variant="secondary" className="ml-auto text-xs">
            Últimos 30 dias
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Zap className="w-4 h-4" />
              Total de Tokens
            </div>
            <p className="text-2xl font-bold">{formatNumber(summary.totalTokens)}</p>
          </div>
          
          <div className="p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="w-4 h-4" />
              Custo Estimado
            </div>
            <p className="text-2xl font-bold">{formatCurrency(summary.totalCostUsd)}</p>
          </div>
          
          <div className="p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Activity className="w-4 h-4" />
              Requisições
            </div>
            <p className="text-2xl font-bold">{summary.totalRequests}</p>
          </div>
          
          <div className="p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Média/Artigo
            </div>
            <p className="text-2xl font-bold">
              {summary.totalRequests > 0 
                ? formatNumber(Math.round(summary.totalTokens / (summary.byOperation.content?.requests || 1)))
                : '0'}
            </p>
          </div>
        </div>

        {hasData ? (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="providers">Provedores</TabsTrigger>
              <TabsTrigger value="operations">Operações</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {/* Usage Chart */}
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={formatNumber} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number, name: string) => [
                        name === 'tokens' ? formatNumber(value) : formatCurrency(value),
                        name === 'tokens' ? 'Tokens' : 'Custo'
                      ]}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="tokens" 
                      stroke="hsl(var(--primary))" 
                      fill="hsl(var(--primary) / 0.2)" 
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="providers" className="space-y-4">
              {/* Provider Breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    OpenAI
                  </span>
                  <span className="font-mono">{formatNumber(summary.byProvider.openai.tokens)} tokens</span>
                  <span className="font-mono text-muted-foreground">{formatCurrency(summary.byProvider.openai.cost)}</span>
                </div>
                <Progress value={openaiPercent} className="h-2" />
                
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-secondary" />
                    Gemini
                  </span>
                  <span className="font-mono">{formatNumber(summary.byProvider.gemini.tokens)} tokens</span>
                  <span className="font-mono text-muted-foreground">{formatCurrency(summary.byProvider.gemini.cost)}</span>
                </div>
                <Progress value={geminiPercent} className="h-2 [&>div]:bg-secondary" />
              </div>
            </TabsContent>

            <TabsContent value="operations" className="space-y-4">
              {/* Operation Breakdown */}
              <div className="space-y-2">
                {Object.entries(summary.byOperation).map(([operation, stats]) => (
                  <div key={operation} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="flex items-center gap-2 text-sm">
                      {OPERATION_LABELS[operation]?.icon || <Activity className="w-4 h-4" />}
                      {OPERATION_LABELS[operation]?.label || operation}
                    </span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-mono">{stats.requests}x</span>
                      <span className="font-mono">{formatNumber(stats.tokens)}</span>
                      <span className="font-mono text-muted-foreground">{formatCurrency(stats.cost)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum uso registrado ainda.</p>
            <p className="text-sm">O consumo será rastreado a partir da próxima geração de artigo.</p>
          </div>
        )}

        {/* Info Footer */}
        <div className="p-3 bg-muted/30 rounded-lg border text-xs text-muted-foreground">
          <p>
            💡 <strong>Dica:</strong> Os custos são estimados com base nos preços públicos das APIs. 
            O consumo real pode variar ligeiramente. Imagens DALL-E 3 HD custam ~$0.08 cada.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
