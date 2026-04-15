import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Plus, X, Lightbulb } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ELECTORAL_KEYWORD_SUGGESTIONS, CAMPAIGN_TOPICS } from '@/data/sp-cities';

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
  candidateName,
  city,
  onSelectKeyword,
  onSelectTopics,
  selectedTopics,
}: AISuggestionsPanelProps) {
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const { toast } = useToast();

  const roleSuggestions = (ELECTORAL_KEYWORD_SUGGESTIONS[candidateRole] || []).map(
    kw => kw.replace(/\{city\}/g, city || 'São Paulo')
  );

  const handleGenerateAISuggestions = async () => {
    if (!candidateName.trim()) {
      toast({ title: 'Informe o nome do candidato primeiro', variant: 'destructive' });
      return;
    }
    setIsLoadingAI(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-secondary-keywords`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            keyword: `${candidateName} candidato ${candidateRole} ${city || 'São Paulo'} eleições 2026`,
            segment: 'general',
            count: 12,
            language: 'pt-BR',
          }),
        }
      );
      const data = await res.json();
      if (data.keywords) {
        setAiSuggestions(data.keywords.split(',').map((k: string) => k.trim()).filter(Boolean));
      }
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro ao gerar sugestões', variant: 'destructive' });
    } finally {
      setIsLoadingAI(false);
    }
  };

  const toggleTopic = (topic: string) => {
    const updated = selectedTopics.includes(topic)
      ? selectedTopics.filter(t => t !== topic)
      : [...selectedTopics, topic];
    onSelectTopics(updated);
  };

  return (
    <div className="space-y-4">
      {/* Keyword Suggestions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500" />
              Sugestões de Palavras-Chave
            </CardTitle>
            <Button size="sm" variant="outline" onClick={handleGenerateAISuggestions} disabled={isLoadingAI}>
              {isLoadingAI ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
              Gerar com IA
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Pre-built suggestions */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Sugestões para {candidateRole.replace('-', ' ')}:</p>
            <div className="flex flex-wrap gap-1.5">
              {roleSuggestions.slice(0, 8).map(kw => (
                <Badge
                  key={kw}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 transition-colors text-xs"
                  onClick={() => onSelectKeyword(kw)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {kw}
                </Badge>
              ))}
            </div>
          </div>

          {/* AI-generated suggestions */}
          {aiSuggestions.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Sugestões da IA:</p>
              <div className="flex flex-wrap gap-1.5">
                {aiSuggestions.map(kw => (
                  <Badge
                    key={kw}
                    variant="secondary"
                    className="cursor-pointer hover:bg-primary/20 transition-colors text-xs"
                    onClick={() => onSelectKeyword(kw)}
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Topics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-500" />
            Pautas & Bandeiras (selecione várias)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {CAMPAIGN_TOPICS.map(topic => (
              <Badge
                key={topic}
                variant={selectedTopics.includes(topic) ? 'default' : 'outline'}
                className="cursor-pointer transition-all text-xs"
                onClick={() => toggleTopic(topic)}
              >
                {selectedTopics.includes(topic) && <X className="w-3 h-3 mr-1" />}
                {topic}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
