import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Swords } from 'lucide-react';

interface CompetitorAnalysisProps {
  competitors: string;
  differentials: string;
  onCompetitorsChange: (value: string) => void;
  onDifferentialsChange: (value: string) => void;
}

export function CompetitorAnalysis({
  competitors,
  differentials,
  onCompetitorsChange,
  onDifferentialsChange,
}: CompetitorAnalysisProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Swords className="w-5 h-5 text-red-500" />
          Análise de Concorrentes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>Concorrentes ao cargo (quem está disputando?)</Label>
          <Textarea
            placeholder="Liste os principais concorrentes, seus partidos e pontos fracos..."
            value={competitors}
            onChange={e => onCompetitorsChange(e.target.value)}
            rows={3}
          />
        </div>
        <div>
          <Label>Diferenciais do candidato vs. concorrentes</Label>
          <Textarea
            placeholder="O que diferencia seu candidato? Experiência, projetos únicos, proximidade com o povo..."
            value={differentials}
            onChange={e => onDifferentialsChange(e.target.value)}
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}
