import { BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';

interface AuthorityPlannerSummaryProps {
  plansCreated: number;
  totalArticles: number;
  lastPlanName?: string;
}

export function AuthorityPlannerSummary({ 
  plansCreated, 
  totalArticles,
  lastPlanName 
}: AuthorityPlannerSummaryProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <BookOpen className="w-5 h-5 text-primary" />
          <Link to="/authority-planner" className="hover:underline">
            Planejador de Autoridade
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-xl">
            <p className="text-3xl font-bold text-primary">{plansCreated}</p>
            <p className="text-sm text-muted-foreground mt-1">Planos Criados</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-xl">
            <p className="text-3xl font-bold text-primary">{totalArticles}</p>
            <p className="text-sm text-muted-foreground mt-1">Artigos no Total</p>
          </div>
        </div>
        {lastPlanName && (
          <p className="text-sm text-muted-foreground mt-3">
            Último: <span className="text-primary font-medium">{lastPlanName}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
