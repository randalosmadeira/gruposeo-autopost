import { Zap, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface PlanCardProps {
  planName: string;
  articlesUsed: number;
  sitesUsed: number;
  maxSites: number;
  queueLimit: number;
}

export function PlanCard({
  planName,
  articlesUsed,
  sitesUsed,
  maxSites,
  queueLimit,
}: PlanCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Zap className="w-5 h-5 text-amber-500" />
          Seu Plano
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Plano Real</p>
          <p className="text-lg font-bold text-emerald-500">{planName}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Artigos (30 dias)</span>
            <span className="font-semibold">{articlesUsed} / ∞</span>
          </div>
          <Progress value={Math.min(articlesUsed * 10, 100)} className="h-2 bg-muted" />
        </div>

        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span>Sites WP</span>
            </div>
            <span className="font-semibold">{sitesUsed}/{maxSites}</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Limite de Fila</span>
            <span className="font-semibold">{queueLimit} itens</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
