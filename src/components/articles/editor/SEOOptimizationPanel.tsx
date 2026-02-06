import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, FileText, AlignLeft, Heading, Search, Check, X, AlertCircle } from 'lucide-react';
import { marked } from 'marked';

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

interface SEOCheck {
  label: string;
  passed: boolean;
  message: string;
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
    
    // Link and image counts
    const internalLinks = (htmlContent.match(/<a[^>]*href=["'][^"']*["'][^>]*>/gi) || []).length;
    const images = (htmlContent.match(/<img[^>]*>/gi) || []).length;
    
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
    
    // SEO Checks
    const seoChecks: SEOCheck[] = [
      {
        label: 'Palavra-chave no título',
        passed: title?.toLowerCase().includes(mainKeyword) || false,
        message: title?.toLowerCase().includes(mainKeyword) 
          ? 'A palavra-chave está presente no título' 
          : 'Adicione a palavra-chave ao título',
      },
      {
        label: 'Palavra-chave na meta descrição',
        passed: excerpt?.toLowerCase().includes(mainKeyword) || false,
        message: excerpt?.toLowerCase().includes(mainKeyword) 
          ? 'A palavra-chave está na meta descrição' 
          : 'Adicione a palavra-chave à meta descrição',
      },
      {
        label: 'Tamanho da meta descrição',
        passed: (excerpt?.length || 0) >= 120 && (excerpt?.length || 0) <= 160,
        message: (excerpt?.length || 0) < 120 
          ? 'Meta descrição muito curta (mín. 120 caracteres)'
          : (excerpt?.length || 0) > 160 
            ? 'Meta descrição muito longa (máx. 160 caracteres)'
            : 'Tamanho ideal da meta descrição',
      },
      {
        label: 'Densidade da palavra-chave',
        passed: keywordDensity >= 0.5 && keywordDensity <= 2.5,
        message: keywordDensity < 0.5 
          ? `Densidade baixa (${keywordDensity.toFixed(1)}%). Adicione mais ocorrências`
          : keywordDensity > 2.5 
            ? `Densidade alta (${keywordDensity.toFixed(1)}%). Reduza ocorrências`
            : `Densidade ideal: ${keywordDensity.toFixed(1)}%`,
      },
      {
        label: 'Subtítulos H2',
        passed: h2Count >= 3,
        message: h2Count >= 3 
          ? `${h2Count} subtítulos H2 encontrados` 
          : `Apenas ${h2Count} H2. Adicione mais subtítulos`,
      },
      {
        label: 'Conteúdo mínimo',
        passed: wordCount >= 1500,
        message: wordCount >= 1500 
          ? `${wordCount} palavras - conteúdo extenso` 
          : `${wordCount} palavras. Recomendado: 1500+`,
      },
      {
        label: 'Links internos',
        passed: internalLinks >= 2,
        message: internalLinks >= 2 
          ? `${internalLinks} links encontrados` 
          : `Apenas ${internalLinks} link(s). Adicione mais`,
      },
      {
        label: 'Imagens no conteúdo',
        passed: images >= 1,
        message: images >= 1 
          ? `${images} imagem(ns) encontrada(s)` 
          : 'Adicione imagens ao conteúdo',
      },
    ];
    
    // Calculate SEO score based on checks
    const passedChecks = seoChecks.filter(c => c.passed).length;
    let score = Math.round((passedChecks / seoChecks.length) * 100);
    
    // Generate keyword suggestions with targets
    const targetDensity = 1.5; // Ideal keyword density percentage
    const topKeywords: KeywordAnalysis[] = Object.entries(wordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word, count]) => {
        const idealCount = Math.round((wordCount * targetDensity) / 100);
        const target = Math.max(3, idealCount);
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
      score,
      wordCount,
      paragraphs,
      headings,
      keywords: topKeywords,
      seoChecks,
      analyzedTerms: topKeywords.length,
      keywordDensity,
    };
  }, [content, keyword, title, excerpt]);

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

  const filteredKeywords = analysis.keywords
    .filter(kw => {
      if (filterMode === 'improve' && kw.status === 'good') return false;
      if (searchQuery && !kw.word.includes(searchQuery.toLowerCase())) return false;
      return true;
    });

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
        <div className="relative w-28 h-28">
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
            <span className={`text-2xl font-bold ${getScoreColor(analysis.score)}`}>
              {analysis.score}%
            </span>
            <span className={`text-xs font-medium ${getScoreColor(analysis.score)}`}>
              {getScoreLabel(analysis.score)}
            </span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground mt-2">Nível de otimização</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="flex flex-col items-center p-2 bg-muted/30 rounded-lg">
          <FileText className="w-4 h-4 text-muted-foreground mb-1" />
          <span className="text-lg font-semibold">{analysis.wordCount}</span>
          <span className="text-xs text-muted-foreground">Palavras</span>
        </div>
        <div className="flex flex-col items-center p-2 bg-muted/30 rounded-lg">
          <AlignLeft className="w-4 h-4 text-muted-foreground mb-1" />
          <span className="text-lg font-semibold">{analysis.paragraphs}</span>
          <span className="text-xs text-muted-foreground">Parágrafos</span>
        </div>
        <div className="flex flex-col items-center p-2 bg-muted/30 rounded-lg">
          <Heading className="w-4 h-4 text-muted-foreground mb-1" />
          <span className="text-lg font-semibold">{analysis.headings}</span>
          <span className="text-xs text-muted-foreground">Subtítulos</span>
        </div>
      </div>

      {/* SEO Checklist */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Verificações SEO
        </h4>
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {analysis.seoChecks.map((check, index) => (
            <div 
              key={index} 
              className={`flex items-start gap-2 text-xs p-2 rounded ${
                check.passed ? 'bg-green-500/10' : 'bg-red-500/10'
              }`}
            >
              {check.passed ? (
                <Check className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
              ) : (
                <X className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
              )}
              <div>
                <span className={`font-medium ${check.passed ? 'text-green-700' : 'text-red-700'}`}>
                  {check.label}
                </span>
                <p className="text-muted-foreground">{check.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Keywords Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Palavras-chave</span>
          <div className="flex gap-1">
            <Badge 
              variant={filterMode === 'all' ? 'default' : 'outline'}
              className="text-xs cursor-pointer"
              onClick={() => setFilterMode('all')}
            >
              Todas
            </Badge>
            <Badge 
              variant={filterMode === 'improve' ? 'default' : 'outline'}
              className="text-xs cursor-pointer"
              onClick={() => setFilterMode('improve')}
            >
              Melhorar
            </Badge>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar palavra-chave..."
            className="pl-8 h-8 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <ScrollArea className="h-40">
          <div className="space-y-2.5 pr-2">
            {filteredKeywords.map((kw, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">{kw.word}</span>
                  <span className={`text-xs flex items-center gap-1 ${
                    kw.status === 'good' ? 'text-green-600' : 
                    kw.status === 'warning' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {kw.status === 'good' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                    {kw.count}/{kw.target}
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
