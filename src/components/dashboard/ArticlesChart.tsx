import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { TrendingUp } from 'lucide-react';

const data = [
  { date: '01/01', articles: 4 },
  { date: '02/01', articles: 6 },
  { date: '03/01', articles: 8 },
  { date: '04/01', articles: 5 },
  { date: '05/01', articles: 12 },
  { date: '06/01', articles: 9 },
  { date: '07/01', articles: 7 },
  { date: '08/01', articles: 11 },
  { date: '09/01', articles: 14 },
  { date: '10/01', articles: 8 },
  { date: '11/01', articles: 16 },
  { date: '12/01', articles: 13 },
  { date: '13/01', articles: 10 },
  { date: '14/01', articles: 18 },
];

export function ArticlesChart() {
  const totalArticles = useMemo(() => 
    data.reduce((sum, item) => sum + item.articles, 0), 
    []
  );

  return (
    <div className="bg-card rounded-2xl p-6 shadow-card">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-lg">Artigos Gerados</h3>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-primary">{totalArticles}</p>
          <p className="text-xs text-muted-foreground">últimos 14 dias</p>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorArticles" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: 'var(--shadow-lg)',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Area
              type="monotone"
              dataKey="articles"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              fill="url(#colorArticles)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}