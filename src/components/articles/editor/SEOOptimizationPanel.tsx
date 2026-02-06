import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, FileText, AlignLeft, Heading, Search, X, Shield, TrendingUp } from 'lucide-react';
import { marked } from 'marked';
import { ComplianceChecker } from './ComplianceChecker';
import { SEOScorePanel } from './SEOScorePanel';

interface SEOOptimizationPanelProps {
  content: string | null;
  keyword: string;
  title: string | null;
  excerpt: string | null;
}

interface KeywordAnalysis {
  word: string;
  count: number;
  target: number;
  percentage: number;
  status: 'good' | 'warning' | 'bad';
}

export function SEOOptimizationPanel({ content, keyword, title, excerpt }: SEOOptimizationPanelProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'improve'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const analysis = useMemo(() => {
    // Convert markdown to HTML if needed
    let htmlContent = content || '';
    const isHTML = htmlContent.trim().startsWith('<');
    if (!isHTML && htmlContent) {
      htmlContent = marked.parse(htmlContent, { async: false }) as string;
    }
    
    const text = htmlContent.replace(/<[^>]*>/g, ' ').toLowerCase();
    const words = text.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    
    // Count paragraphs and headings from HTML
    const paragraphs = (htmlContent.match(/<p[^>]*>/gi) || []).length;
    const h2Count = (htmlContent.match(/<h2[^>]*>/gi) || []).length;
    const h3Count = (htmlContent.match(/<h3[^>]*>/gi) || []).length;
    const headings = h2Count + h3Count + (htmlContent.match(/<h[4-6][^>]*>/gi) || []).length;
    
    // Extract keywords and count occurrences
    const wordFrequency: Record<string, number> = {};
    words.forEach(word => {
      const cleanWord = word.replace(/[^\wáéíóúâêîôûãõç]/gi, '');
      if (cleanWord.length > 3) {
        wordFrequency[cleanWord] = (wordFrequency[cleanWord] || 0) + 1;
      }
    });
    
    // Main keyword analysis
    const mainKeyword = keyword.toLowerCase();
    const keywordCount = (text.match(new RegExp(mainKeyword.replace(/\s+/g, '\\s+'), 'gi')) || []).length;
    const keywordDensity = wordCount > 0 ? (keywordCount / wordCount) * 100 : 0;
    
    // Calculate SEO score
    let score = 0;
    if (title?.toLowerCase().includes(mainKeyword)) score += 15;
    if (excerpt?.toLowerCase().includes(mainKeyword)) score += 10;
    if ((excerpt?.length || 0) >= 120 && (excerpt?.length || 0) <= 160) score += 10;
    if (keywordDensity >= 0.5 && keywordDensity <= 2.5) score += 15;
    if (h2Count >= 3) score += 15;
    if (wordCount >= 1500) score += 20;
    if (wordCount >= 500) score += 15;
    
    // Generate keyword suggestions with targets
    const targetDensity = 1.5;
    const topKeywords: KeywordAnalysis[] = Object.entries(wordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([word, count]) => {
        const idealCount = Math.round((wordCount * targetDensity) / 100);
        const target = Math.max(2, idealCount);
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
  }, [content, keyword, title, excerpt]);

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-500';
    if (score >= 40) return 'text-amber-500';
    return 'text-red-500';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 70) return 'BOM';
    if (score >= 40) return 'MÉDIO';
    return 'RUIM';
  };

  const getScoreStrokeColor = (score: number) => {
    if (score >= 70) return '#22c55e';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  };

  const filteredKeywords = analysis.keywords
    .filter(kw => {
      if (filterMode === 'improve' && kw.status === 'good') return false;
      if (searchQuery && !kw.word.includes(searchQuery.toLowerCase())) return false;
      return true;
    });

  return (
    <div className="space-y-6">
      {/* MAA Analysis Tabs */}
      <Tabs defaultValue="seo" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="seo" className="text-xs gap-1">
            <TrendingUp className="h-3 w-3" />
            SEO
          </TabsTrigger>
          <TabsTrigger value="compliance" className="text-xs gap-1">
            <Shield className="h-3 w-3" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="keywords" className="text-xs gap-1">
            <Sparkles className="h-3 w-3" />
            Keywords
          </TabsTrigger>
        </TabsList>

        {/* SEO Tab - New comprehensive panel */}
        <TabsContent value="seo" className="mt-4">
          <SEOScorePanel
            title={title || undefined}
            metaDescription={excerpt || undefined}
            content={content || undefined}
            keyword={keyword}
          />
        </TabsContent>

        {/* Compliance Tab - OAB validation */}
        <TabsContent value="compliance" className="mt-4">
          <ComplianceChecker content={content || ''} />
        </TabsContent>

        {/* Keywords Tab - Original functionality */}
        <TabsContent value="keywords" className="mt-4 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Análise de Keywords</h3>
            </div>
            <Badge variant="secondary" className="text-xs font-normal">
              {analysis.analyzedTerms} termo(s)
            </Badge>
          </div>

          {/* Score Circle */}
          <div className="flex flex-col items-center py-4">
            <div className="relative w-28 h-28">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="6"
                  opacity="0.3"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={getScoreStrokeColor(analysis.score)}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${analysis.score * 2.64} 264`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold ${getScoreColor(analysis.score)}`}>
                  {analysis.score}%
                </span>
                <span className={`text-xs font-semibold ${getScoreColor(analysis.score)}`}>
                  {getScoreLabel(analysis.score)}
                </span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex justify-between gap-2">
            <div className="flex-1 flex flex-col items-center py-2 px-2 bg-muted/40 rounded-lg border">
              <div className="flex items-center gap-1 text-muted-foreground mb-1">
                <FileText className="w-3 h-3" />
                <span className="text-xs">Palavras</span>
              </div>
              <span className="text-lg font-bold">{analysis.wordCount.toLocaleString()}</span>
            </div>
            <div className="flex-1 flex flex-col items-center py-2 px-2 bg-muted/40 rounded-lg border">
              <div className="flex items-center gap-1 text-muted-foreground mb-1">
                <AlignLeft className="w-3 h-3" />
                <span className="text-xs">Parágrafos</span>
              </div>
              <span className="text-lg font-bold">{analysis.paragraphs}</span>
            </div>
            <div className="flex-1 flex flex-col items-center py-2 px-2 bg-muted/40 rounded-lg border">
              <div className="flex items-center gap-1 text-muted-foreground mb-1">
                <Heading className="w-3 h-3" />
                <span className="text-xs">Subtítulos</span>
              </div>
              <span className="text-lg font-bold">{analysis.headings}</span>
            </div>
          </div>

          {/* Keywords Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Palavras-chave</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    filterMode === 'all' 
                      ? 'bg-muted text-foreground font-medium' 
                      : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  Todas
                </button>
                <button
                  onClick={() => setFilterMode('improve')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    filterMode === 'improve' 
                      ? 'bg-primary text-primary-foreground font-medium' 
                      : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  Melhorar
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar palavra-chave..."
                className="pl-9 h-9 text-sm bg-muted/30"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Keywords List */}
            <ScrollArea className="h-[250px]">
              <div className="space-y-2 pr-3">
                {filteredKeywords.map((kw, index) => (
                  <div 
                    key={index} 
                    className="flex items-center gap-3 py-2.5 px-3 bg-card border rounded-lg"
                  >
                    <span className="flex-1 text-sm truncate font-medium">{kw.word}</span>
                    
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          kw.status === 'good' ? 'bg-green-500' : 
                          kw.status === 'warning' ? 'bg-amber-500' : 'bg-red-400'
                        }`}
                        style={{ width: `${Math.min(100, kw.percentage)}%` }}
                      />
                    </div>
                    
                    <span className={`text-xs flex items-center gap-1 min-w-[40px] justify-end ${
                      kw.status === 'good' ? 'text-green-600' : 
                      kw.status === 'warning' ? 'text-amber-600' : 'text-red-500'
                    }`}>
                      <X className="w-3 h-3" />
                      {kw.count}/{kw.target}
                    </span>
                  </div>
                ))}
                
                {filteredKeywords.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Nenhuma palavra-chave encontrada
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
