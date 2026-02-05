import { Newspaper } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';

interface NewsAgentsSummaryProps {
  activeAgents: number;
  publishedToday: number;
}

export function NewsAgentsSummary({ activeAgents, publishedToday }: NewsAgentsSummaryProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Newspaper className="w-5 h-5 text-primary" />
          <Link to="/news-agents" className="hover:underline">
            Agências de jornais
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-4 bg-amber-50 rounded-xl">
            <p className="text-3xl font-bold text-amber-500">{activeAgents}</p>
            <p className="text-sm text-muted-foreground mt-1">Agentes Ativos</p>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-xl">
            <p className="text-3xl font-bold text-amber-500">{publishedToday}</p>
            <p className="text-sm text-muted-foreground mt-1">Publicados Hoje</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
