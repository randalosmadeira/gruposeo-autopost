import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, FileText, AlignLeft, Heading } from 'lucide-react';

interface SEOOptimizationPanelProps {
  content: string | null;
  keyword: string;
}

interface KeywordAnalysis {
  word: string;
  count: number;
  target: number;
  percentage: number;
  status: 'good' | 'warning' | 'bad';
}

export function SEOOptimizationPanel({ content, keyword }: SEOOptimizationPanelProps) {
  const analysis = useMemo(() => {
    const text = content?.replace(/<[^>]*>/g, ' ').toLowerCase() || '';
    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    
    // Count paragraphs and headings
    const paragraphs = (content?.match(/<p[^>]*>/gi) || []).length;
    const headings = (content?.match(/<h[2-6][^>]*>/gi) || []).length;
    
    // Extract keywords and count occurrences
    const wordFrequency: Record<string, number> = {};
    words.forEach(word => {
      if (word.length > 3) {
        wordFrequency[word] = (wordFrequency[word] || 0) + 1;
      }
    });
    
    // Calculate SEO score (simplified)
    let score = 0;
    if (wordCount >= 1500) score += 20;
    else if (wordCount >= 1000) score += 15;
    else if (wordCount >= 500) score += 10;
    
    if (headings >= 5) score += 20;
    else if (headings >= 3) score += 15;
    else if (headings >= 1) score += 10;
    
    if (paragraphs >= 10) score += 20;
    else if (paragraphs >= 5) score += 15;
    else if (paragraphs >= 3) score += 10;
    
    // Check main keyword presence
    const mainKeyword = keyword.toLowerCase();
    const keywordCount = (text.match(new RegExp(mainKeyword.replace(/\s+/g, '\\s+'), 'gi')) || []).length;
    if (keywordCount >= 5) score += 20;
    else if (keywordCount >= 3) score += 15;
    else if (keywordCount >= 1) score += 10;
    
    // Additional factors
    if (content?.includes('<a ')) score += 10;
    if (content?.includes('<img ')) score += 10;
    
    // Generate keyword suggestions with targets
    const topKeywords: KeywordAnalysis[] = Object.entries(wordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => {
        const target = Math.max(3, Math.ceil(wordCount / 300));
        const percentage = Math.min(100, (count / target) * 100);
        return {
          word,
          count,
          target,
          percentage,
          status: count >= target ? 'good' : count >= target / 2 ? 'warning' : 'bad' as 'good' | 'warning' | 'bad',
        };
      });
    
    return {
      score: Math.min(100, score),
      wordCount,
      paragraphs,
      headings,
      keywords: topKeywords,
      analyzedTerms: topKeywords.length,
    };
  }, [content, keyword]);

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-500';
    if (score >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 70) return 'BOM';
    if (score >= 40) return 'MÉDIO';
    return 'RUIM';
  };

  const getStatusColor = (status: 'good' | 'warning' | 'bad') => {
    switch (status) {
      case 'good': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'bad': return 'bg-red-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Otimização SEO</h3>
        </div>
        <span className="text-xs text-muted-foreground">
          {analysis.analyzedTerms} termo(s) analisado(s)
        </span>
      </div>

      {/* Score Circle */}
      <div className="flex flex-col items-center py-4">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-muted/20"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${analysis.score * 2.51} 251`}
              className={getScoreColor(analysis.score)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${getScoreColor(analysis.score)}`}>
              {analysis.score}%
            </span>
            <span className={`text-sm font-medium ${getScoreColor(analysis.score)}`}>
              {getScoreLabel(analysis.score)}
            </span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground mt-2">Nível de otimização</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="flex flex-col items-center">
          <FileText className="w-4 h-4 text-muted-foreground mb-1" />
          <span className="text-lg font-semibold">{analysis.wordCount}</span>
          <span className="text-xs text-muted-foreground">Palavras</span>
        </div>
        <div className="flex flex-col items-center">
          <AlignLeft className="w-4 h-4 text-muted-foreground mb-1" />
          <span className="text-lg font-semibold">{analysis.paragraphs}</span>
          <span className="text-xs text-muted-foreground">Parágrafos</span>
        </div>
        <div className="flex flex-col items-center">
          <Heading className="w-4 h-4 text-muted-foreground mb-1" />
          <span className="text-lg font-semibold">{analysis.headings}</span>
          <span className="text-xs text-muted-foreground">Subtítulos</span>
        </div>
      </div>

      {/* Keywords Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Palavras-chave</span>
          <div className="flex gap-2">
            <Badge variant="secondary" className="text-xs">Todas</Badge>
            <Badge variant="outline" className="text-xs">Melhorar</Badge>
          </div>
        </div>

        <div className="relative">
          <Input
            placeholder="Buscar palavra-chave..."
            className="pl-8 h-9 text-sm"
          />
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>

        <ScrollArea className="h-48">
          <div className="space-y-3 pr-2">
            {analysis.keywords.map((kw, index) => (
              <div key={index} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">{kw.word}</span>
                  <span className={`text-xs ${
                    kw.status === 'good' ? 'text-green-600' : 
                    kw.status === 'warning' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {kw.status === 'good' ? '✓' : '✗'} {kw.count}/{kw.target}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${getStatusColor(kw.status)}`}
                    style={{ width: `${Math.min(100, kw.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
