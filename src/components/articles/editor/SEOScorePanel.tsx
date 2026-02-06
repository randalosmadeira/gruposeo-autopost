import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  CheckCircle2, 
  AlertCircle,
  XCircle,
  BookOpen,
  Target,
  TrendingUp,
  FileText,
  Lightbulb
} from 'lucide-react';
import { 
  calculateSEOScore, 
  calculateReadability, 
  analyzeKeyword,
  assessContentQuality,
  type SEOScoreResult,
  type ReadabilityResult,
  type KeywordAnalysis,
  type ContentQuality
} from '@/lib/maa-utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SEOScorePanelProps {
  title?: string;
  metaDescription?: string;
  content?: string;
  keyword?: string;
  className?: string;
}

export function SEOScorePanel({ 
  title, 
  metaDescription, 
  content, 
  keyword,
  className 
}: SEOScorePanelProps) {
  const [seoScore, setSeoScore] = useState<SEOScoreResult | null>(null);
  const [readability, setReadability] = useState<ReadabilityResult | null>(null);
  const [keywordAnalysis, setKeywordAnalysis] = useState<KeywordAnalysis | null>(null);
  const [contentQuality, setContentQuality] = useState<ContentQuality | null>(null);

  useEffect(() => {
    // Debounce calculations
    const timer = setTimeout(() => {
      if (content || title || metaDescription) {
        setSeoScore(calculateSEOScore({ title, metaDescription, content, keyword }));
        
        if (content && content.length > 100) {
          setReadability(calculateReadability(content));
          setContentQuality(assessContentQuality(content));
          
          if (keyword) {
            setKeywordAnalysis(analyzeKeyword(content, keyword));
          }
        }
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [title, metaDescription, content, keyword]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getLevelBadge = (level: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      excellent: 'default',
      good: 'default',
      needs_work: 'secondary',
      poor: 'destructive'
    };
    
    const labels: Record<string, string> = {
      excellent: 'Excelente',
      good: 'Bom',
      needs_work: 'Precisa melhorar',
      poor: 'Fraco'
    };
    
    return (
      <Badge variant={variants[level] || 'secondary'}>
        {labels[level] || level}
      </Badge>
    );
  };

  if (!seoScore && !readability) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Search className="h-4 w-4" />
            Análise SEO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Adicione conteúdo para ver a análise de SEO
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Análise SEO
          </div>
          {seoScore && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <span className={`text-2xl font-bold ${getScoreColor(seoScore.total)}`}>
                    {seoScore.total}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Score SEO total (0-100)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="seo" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="seo" className="text-xs">
              <TrendingUp className="h-3 w-3 mr-1" />
              SEO
            </TabsTrigger>
            <TabsTrigger value="readability" className="text-xs">
              <BookOpen className="h-3 w-3 mr-1" />
              Leitura
            </TabsTrigger>
            <TabsTrigger value="keyword" className="text-xs">
              <Target className="h-3 w-3 mr-1" />
              Keyword
            </TabsTrigger>
            <TabsTrigger value="quality" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Qualidade
            </TabsTrigger>
          </TabsList>

          {/* SEO Tab */}
          <TabsContent value="seo" className="mt-4">
            {seoScore && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Progress value={seoScore.total} className="flex-1 mr-4" />
                  {getLevelBadge(seoScore.level)}
                </div>
                
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {seoScore.details.map((detail, index) => (
                      <div 
                        key={index} 
                        className="flex items-center justify-between p-2 rounded bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          {detail.status === 'pass' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : detail.status === 'warning' ? (
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="text-sm">{detail.name}</span>
                        </div>
                        <Badge variant="outline">
                          {detail.score}/{detail.maxScore}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {seoScore.suggestions.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-xs font-medium flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" />
                      Sugestões
                    </p>
                    {seoScore.suggestions.map((suggestion, index) => (
                      <p key={index} className="text-xs text-muted-foreground">
                        • {suggestion}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Readability Tab */}
          <TabsContent value="readability" className="mt-4">
            {readability && (
              <div className="space-y-4">
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <div className={`text-4xl font-bold ${
                    readability.isEasyToRead ? 'text-green-600' : 'text-yellow-600'
                  }`}>
                    {readability.fleschScore}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Flesch Reading Ease
                  </p>
                  <Badge className="mt-2">
                    {readability.level}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <StatCard 
                    label="Palavras" 
                    value={readability.wordCount.toLocaleString()} 
                    good={readability.wordCount >= 800}
                  />
                  <StatCard 
                    label="Sentenças" 
                    value={readability.sentenceCount.toString()} 
                  />
                  <StatCard 
                    label="Média palavras/sentença" 
                    value={readability.avgWordsPerSentence.toString()} 
                    good={readability.avgWordsPerSentence <= 20}
                  />
                  <StatCard 
                    label="Legibilidade" 
                    value={readability.isEasyToRead ? 'Boa' : 'Difícil'} 
                    good={readability.isEasyToRead}
                  />
                </div>

                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Escala Flesch:</p>
                  <p>• 70-100: Fácil (recomendado)</p>
                  <p>• 60-70: Médio</p>
                  <p>• 0-60: Difícil</p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Keyword Tab */}
          <TabsContent value="keyword" className="mt-4">
            {keywordAnalysis ? (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Palavra-chave</p>
                  <p className="font-medium">{keyword}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <StatCard 
                    label="Densidade" 
                    value={`${keywordAnalysis.density}%`} 
                    good={keywordAnalysis.isOptimal}
                  />
                  <StatCard 
                    label="Ocorrências" 
                    value={keywordAnalysis.count.toString()} 
                  />
                </div>

                {keywordAnalysis.positions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2">Posições encontradas:</p>
                    <div className="flex flex-wrap gap-1">
                      {keywordAnalysis.positions.map((pos, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {pos}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {keywordAnalysis.lsiKeywords.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2">Keywords LSI sugeridas:</p>
                    <div className="flex flex-wrap gap-1">
                      {keywordAnalysis.lsiKeywords.map((kw, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Densidade ideal: 0.5% - 2.5%
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Adicione uma palavra-chave para ver a análise
              </p>
            )}
          </TabsContent>

          {/* Quality Tab */}
          <TabsContent value="quality" className="mt-4">
            {contentQuality && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Progress value={contentQuality.score} className="flex-1 mr-4" />
                  {getLevelBadge(contentQuality.level)}
                </div>

                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {contentQuality.checks.map((check, index) => (
                      <div 
                        key={index} 
                        className="flex items-center justify-between p-2 rounded bg-muted/50"
                      >
                        <div className="flex items-center gap-2">
                          {check.passed ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="text-sm">{check.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {check.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function StatCard({ 
  label, 
  value, 
  good 
}: { 
  label: string; 
  value: string; 
  good?: boolean;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/50 text-center">
      <p className={`text-lg font-semibold ${
        good === true ? 'text-green-600' : 
        good === false ? 'text-yellow-600' : ''
      }`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
