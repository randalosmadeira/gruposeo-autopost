import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Sparkles, AlertTriangle, CheckCircle2, XCircle, ArrowRight, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AISEOAnalysisPanelProps {
  articleId: string;
  title?: string;
  keyword?: string;
  content?: string;
  excerpt?: string;
  onApplyTitle?: (title: string) => void;
  onApplyMeta?: (meta: string) => void;
  onApplyContent?: (content: string) => void;
  className?: string;
}

interface AnalysisResult {
  score: number;
  analysis: {
    flesch: { score: number; level: string; passed: boolean; avgWordsPerSentence: number };
    structure: {
      wordCount: number; h1Count: number; h2Count: number; h3Count: number;
      imgCount: number; imgsWithAlt: number; hasFAQ: boolean; hasConclusion: boolean;
      hasCTA: boolean; internalLinks: number; externalLinks: number;
      longParagraphs: number; totalParagraphs: number;
    };
    keyword: { density: number; count: number; isOptimal: boolean; titleHasKeyword: boolean; excerptHasKeyword: boolean };
    meta: { titleLength: number; titleOk: boolean; excerptLength: number; excerptOk: boolean };
  };
  ai: {
    overall_grade?: string;
    critical_issues?: string[];
    improvements?: Array<{ area: string; priority: string; suggestion: string; impact: string }>;
    flesch_tips?: string[];
    seo_tips?: string[];
    content_tips?: string[];
    optimized_title?: string;
    optimized_meta?: string;
    changes_made?: string[];
    new_flesch_estimate?: number;
    error?: string;
  } | null;
  optimized?: boolean;
}

export function AISEOAnalysisPanel({ articleId, title, keyword, content, excerpt, onApplyTitle, onApplyMeta, onApplyContent, className }: AISEOAnalysisPanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-seo-advanced', {
        body: { article_ids: [articleId] },
      });
      if (error) throw error;
      if (data?.results?.[0]) {
        setResult(data.results[0]);
        toast({ title: 'Análise concluída', description: `Score: ${data.results[0].score}/100` });
      }
    } catch {
      toast({ title: 'Erro na análise', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runOptimization = async () => {
    setIsOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-seo-advanced', {
        body: { article_ids: [articleId], mode: 'optimize' },
      });
      if (error) throw error;
      
      const r = data?.results?.[0];
      if (r) {
        // Check for AI errors (402 payment, 429 rate limit)
        if (r.error) {
          const isPayment = String(r.error).includes('402');
          const isRateLimit = String(r.error).includes('429');
          toast({
            title: isPayment ? '❌ Créditos insuficientes' : isRateLimit ? '⏳ Limite de requisições' : '❌ Erro na IA',
            description: isPayment 
              ? 'Os créditos de IA estão esgotados. Vá em Settings → Workspace → Usage para recarregar.' 
              : isRateLimit 
                ? 'Muitas requisições. Aguarde alguns segundos e tente novamente.'
                : `Erro: ${r.error}`,
            variant: 'destructive',
          });
          setResult(r);
          return;
        }

        setResult(r);
        
        // Auto-apply optimized content to editor — always fetch fresh from DB
        if (r.optimized || r.generated) {
          // Small delay to ensure DB write is committed
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const { data: updated, error: fetchErr } = await supabase
            .from('articles')
            .select('title, content, excerpt')
            .eq('id', articleId)
            .single();
          
          if (fetchErr) {
            console.error('[AISEOPanel] Failed to fetch updated article:', fetchErr);
          }
          
          if (updated) {
            if (updated.content && onApplyContent) {
              console.log('[AISEOPanel] Applying optimized content:', updated.content.length, 'chars');
              onApplyContent(updated.content);
            }
            if (updated.title && onApplyTitle) {
              console.log('[AISEOPanel] Applying optimized title:', updated.title);
              onApplyTitle(updated.title);
            }
            if (updated.excerpt && onApplyMeta) {
              console.log('[AISEOPanel] Applying optimized meta:', updated.excerpt);
              onApplyMeta(updated.excerpt);
            }
          }
          
          toast({
            title: r.generated ? 'Artigo gerado e salvo ✅' : 'Artigo otimizado e salvo ✅',
            description: `Score: ${r.score}/100. Conteúdo corrigido e aplicado no editor.`,
          });
        } else {
          toast({
            title: '⚠️ Otimização não aplicada',
            description: 'A IA não conseguiu gerar melhorias. Verifique os créditos ou tente novamente.',
            variant: 'destructive',
          });
        }
      }
    } catch (e) {
      console.error('Optimization error:', e);
      toast({ title: 'Erro na otimização', description: 'Verifique sua conexão e tente novamente.', variant: 'destructive' });
    } finally {
      setIsOptimizing(false);
    }
  };

  const gradeColor = (grade?: string) => {
    if (!grade) return 'text-muted-foreground';
    if (grade === 'A') return 'text-green-600';
    if (grade === 'B') return 'text-blue-600';
    if (grade === 'C') return 'text-yellow-600';
    return 'text-red-600';
  };

  const priorityColor = (p: string) => {
    if (p === 'alta') return 'destructive';
    if (p === 'média') return 'secondary';
    return 'outline';
  };

  if (!result) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Análise SEO IA Avançada
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground mb-3">
            Análise completa com IA: Flesch, estrutura, keywords, meta tags, parágrafos e sugestões.
          </p>
          <Button onClick={runAnalysis} disabled={isAnalyzing || isOptimizing} className="w-full" size="sm" variant="outline">
            {isAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {isAnalyzing ? 'Analisando...' : 'Analisar Artigo'}
          </Button>
          <Button onClick={runOptimization} disabled={isAnalyzing || isOptimizing} className="w-full" size="sm">
            {isOptimizing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
            {isOptimizing ? 'Otimizando...' : 'Otimizar e Corrigir Automaticamente'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { analysis, ai } = result;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Análise SEO IA
          </div>
          <div className="flex items-center gap-2">
            {ai?.overall_grade && (
              <span className={`text-2xl font-bold ${gradeColor(ai.overall_grade)}`}>
                {ai.overall_grade}
              </span>
            )}
            <span className={`text-lg font-bold ${result.score >= 80 ? 'text-green-600' : result.score >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
              {result.score}
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Optimized indicator */}
        {result.optimized && (
          <div className="p-2 rounded bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Artigo otimizado e salvo automaticamente</span>
          </div>
        )}

        {/* Changes made by optimization */}
        {ai?.changes_made && ai.changes_made.length > 0 && (
          <div className="p-2 rounded bg-primary/5 border border-primary/20 text-xs space-y-1">
            <p className="font-semibold text-primary">Correções aplicadas:</p>
            {ai.changes_made.map((change, i) => (
              <p key={i} className="text-muted-foreground pl-2">✓ {change}</p>
            ))}
          </div>
        )}

        {/* Flesch */}
        <div className={`p-2 rounded text-xs ${analysis.flesch.passed ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'} border`}>
          <div className="flex justify-between items-center">
            <span className="font-medium">Flesch: {analysis.flesch.score}</span>
            <Badge variant={analysis.flesch.passed ? 'default' : 'destructive'} className="text-[10px]">
              {analysis.flesch.level}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">Média: {analysis.flesch.avgWordsPerSentence} palavras/frase</p>
        </div>

        {/* Structure Quick Checks */}
        <div className="grid grid-cols-2 gap-1 text-xs">
          <Check ok={analysis.structure.h1Count === 1} label={`H1: ${analysis.structure.h1Count}`} />
          <Check ok={analysis.structure.h2Count >= 3} label={`H2: ${analysis.structure.h2Count}`} />
          <Check ok={analysis.structure.hasFAQ} label="FAQ" />
          <Check ok={analysis.structure.hasCTA} label="CTA" />
          <Check ok={analysis.structure.hasConclusion} label="Conclusão" />
          <Check ok={analysis.structure.longParagraphs === 0} label={`Parágrafos longos: ${analysis.structure.longParagraphs}`} />
          <Check ok={analysis.structure.internalLinks >= 2} label={`Links int: ${analysis.structure.internalLinks}`} />
          <Check ok={analysis.structure.externalLinks >= 1} label={`Links ext: ${analysis.structure.externalLinks}`} />
          <Check ok={analysis.keyword.isOptimal} label={`Densidade: ${analysis.keyword.density}%`} />
          <Check ok={analysis.meta.titleOk} label={`Título: ${analysis.meta.titleLength}ch`} />
          <Check ok={analysis.meta.excerptOk} label={`Meta: ${analysis.meta.excerptLength}ch`} />
          <Check ok={analysis.keyword.titleHasKeyword} label="Keyword no título" />
        </div>

        {/* AI Suggestions */}
        {ai && !ai.error && ai.improvements && (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {ai.critical_issues && ai.critical_issues.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Problemas Críticos
                  </p>
                  {ai.critical_issues.map((issue, i) => (
                    <p key={i} className="text-xs text-red-600 pl-4">• {issue}</p>
                  ))}
                </div>
              )}
              {ai.improvements.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold">Melhorias Sugeridas</p>
                  {ai.improvements.map((imp, i) => (
                    <div key={i} className="p-1.5 bg-muted/50 rounded text-xs">
                      <div className="flex items-center gap-1 mb-0.5">
                        <Badge variant={priorityColor(imp.priority) as any} className="text-[9px] px-1 py-0">
                          {imp.priority}
                        </Badge>
                        <span className="font-medium">{imp.area}</span>
                      </div>
                      <p className="text-muted-foreground">{imp.suggestion}</p>
                    </div>
                  ))}
                </div>
              )}
              {ai.flesch_tips && ai.flesch_tips.length > 0 && <TipSection title="Dicas Flesch" tips={ai.flesch_tips} />}
              {ai.seo_tips && ai.seo_tips.length > 0 && <TipSection title="Dicas SEO" tips={ai.seo_tips} />}
              {ai.content_tips && ai.content_tips.length > 0 && <TipSection title="Dicas de Conteúdo" tips={ai.content_tips} />}
            </div>
          </ScrollArea>
        )}

        {/* Optimized suggestions */}
        {ai?.optimized_title && onApplyTitle && (
          <div className="p-2 bg-primary/5 rounded border border-primary/20 text-xs space-y-1">
            <p className="font-medium">Título Sugerido:</p>
            <p className="text-muted-foreground">{ai.optimized_title}</p>
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => onApplyTitle(ai.optimized_title!)}>
              <ArrowRight className="w-3 h-3 mr-1" /> Aplicar
            </Button>
          </div>
        )}
        {ai?.optimized_meta && onApplyMeta && (
          <div className="p-2 bg-primary/5 rounded border border-primary/20 text-xs space-y-1">
            <p className="font-medium">Meta Description Sugerida:</p>
            <p className="text-muted-foreground">{ai.optimized_meta}</p>
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => onApplyMeta(ai.optimized_meta!)}>
              <ArrowRight className="w-3 h-3 mr-1" /> Aplicar
            </Button>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          <Button onClick={runOptimization} disabled={isOptimizing || isAnalyzing} className="w-full" size="sm">
            {isOptimizing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
            {isOptimizing ? 'Otimizando...' : 'Otimizar e Corrigir'}
          </Button>
          <Button onClick={runAnalysis} disabled={isAnalyzing || isOptimizing} variant="outline" size="sm" className="w-full">
            {isAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Reanalisar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded bg-muted/30">
      {ok ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" /> : <XCircle className="w-3 h-3 text-red-500 shrink-0" />}
      <span className="truncate">{label}</span>
    </div>
  );
}

function TipSection({ title, tips }: { title: string; tips: string[] }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold">{title}</p>
      {tips.map((tip, i) => (
        <p key={i} className="text-xs text-muted-foreground pl-2">• {tip}</p>
      ))}
    </div>
  );
}
