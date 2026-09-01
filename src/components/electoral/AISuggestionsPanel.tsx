import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, Plus, Sparkles, X } from 'lucide-react';
import { CAMPAIGN_TOPICS, ELECTORAL_KEYWORD_SUGGESTIONS } from '@/data/sp-cities';

interface AISuggestionsPanelProps {
  candidateRole: string;
  candidateName: string;
  city: string;
  onSelectKeyword: (keyword: string) => void;
  onSelectTopics: (topics: string[]) => void;
  selectedTopics: string[];
}

export function AISuggestionsPanel({
  candidateRole,
  city,
  onSelectKeyword,
  onSelectTopics,
  selectedTopics,
}: AISuggestionsPanelProps) {
  const roleSuggestions = (ELECTORAL_KEYWORD_SUGGESTIONS[candidateRole] || []).map((keyword) =>
    keyword.replace(/\{city\}/g, city || 'São Paulo'),
  );

  const toggleTopic = (topic: string) => {
    const updated = selectedTopics.includes(topic)
      ? selectedTopics.filter((item) => item !== topic)
      : [...selectedTopics, topic];
    onSelectTopics(updated);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-orange-500" /> Pautas e consultas factuais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Sugestões editoriais sobre competências, propostas e temas públicos. O módulo não gera consultas do tipo “melhor candidato”, “em quem votar” ou rankings eleitorais.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {roleSuggestions.map((keyword) => (
              <Badge
                key={keyword}
                variant="outline"
                className="cursor-pointer text-xs transition-colors hover:bg-primary/10"
                onClick={() => onSelectKeyword(keyword)}
              >
                <Plus className="mr-1 h-3 w-3" /> {keyword}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-5 w-5 text-yellow-500" /> Editorias e pautas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {CAMPAIGN_TOPICS.map((topic) => (
              <Badge
                key={topic}
                variant={selectedTopics.includes(topic) ? 'default' : 'outline'}
                className="cursor-pointer text-xs transition-all"
                onClick={() => toggleTopic(topic)}
              >
                {selectedTopics.includes(topic) && <X className="mr-1 h-3 w-3" />}
                {topic}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
