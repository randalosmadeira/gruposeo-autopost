import { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { format, subDays, startOfDay, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ArticlesChartProps {
  articles: { id: string; created_at: string }[];
}

export function ArticlesChart({ articles }: ArticlesChartProps) {
  const chartData = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const date = subDays(new Date(), 13 - i);
      return { date: startOfDay(date), dateStr: format(date, 'dd/MM', { locale: ptBR }), articles: 0 };
    });
    articles.forEach((article) => {
      const articleDate = startOfDay(new Date(article.created_at));
      const dayData = days.find((d) => isSameDay(d.date, articleDate));
      if (dayData) dayData.articles++;
    });
    return days.map(({ dateStr, articles }) => ({ date: dateStr, articles }));
  }, [articles]);

  const totalArticles = chartData.reduce((sum, item) => sum + item.articles, 0);

  return (
    <div className="bg-card rounded-2xl p-6 shadow-card">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">Artigos Criados</h3>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-primary">{totalArticles}</p>
          <p className="text-xs text-muted-foreground">últimos 14 dias</p>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorArticles" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
            <Area type="monotone" dataKey="articles" stroke="hsl(217, 91%, 60%)" strokeWidth={2} fill="url(#colorArticles)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
