import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface RewriteRequest {
  sourceUrl: string;
  sourceContent: string;
  sourceName: string;
  analysisAngle: string;
  keyword?: string;
  niche?: string;
  articleLength?: 'short' | 'medium' | 'long';
  language?: string;
  projectId?: string;
  internalLinks?: Array<{ anchor: string; url: string }>;
  autoPublish?: boolean;
}

export interface ComplianceCheck {
  originalityScore: number;
  citationCompliance: boolean;
  seoOptimized: boolean;
  readabilityScore: number;
}

export interface RewriteResult {
  id: string;
  title: string;
  slug: string;
  word_count: number;
  featured_image_url: string | null;
  originality_score: number;
  quality_score: number;
  readability_score: number;
  seo_optimized: boolean;
  reading_time: string;
  credits: string;
  niche: string;
  tags: string[];
  keywords: string[];
}

export type AuditStatus = 'approved' | 'review' | 'rejected' | 'pending';

export interface AuditResult {
  status: AuditStatus;
  scores: {
    originality: number;
    quality: number;
    readability: number;
    overall: number;
  };
  passed: boolean;
  reasons: string[];
}

// Perform audit on compliance metrics
export function performAuditCheck(compliance: ComplianceCheck, qualityScore: number = 0): AuditResult {
  const scores = {
    originality: compliance.originalityScore,
    quality: qualityScore,
    readability: compliance.readabilityScore,
    overall: 0,
  };

  // Calculate weighted overall score
  scores.overall = Math.round(
    scores.originality * 0.4 +
    scores.quality * 0.35 +
    scores.readability * 0.25
  );

  const reasons: string[] = [];
  let status: AuditStatus = 'pending';

  // Determine audit status
  if (scores.originality >= 95 && scores.quality >= 85 && compliance.citationCompliance) {
    status = 'approved';
    reasons.push('Originalidade excelente (≥95%)');
    reasons.push('Qualidade alta (≥85%)');
  } else if (scores.originality >= 85 && scores.quality >= 70) {
    status = 'review';
    if (scores.originality < 95) reasons.push('Originalidade moderada (85-95%)');
    if (scores.quality < 85) reasons.push('Qualidade moderada (70-85%)');
  } else {
    status = 'rejected';
    if (scores.originality < 85) reasons.push('Originalidade baixa (<85%)');
    if (scores.quality < 70) reasons.push('Qualidade insuficiente (<70%)');
    if (!compliance.citationCompliance) reasons.push('Citações não conformes');
  }

  return {
    status,
    scores,
    passed: status === 'approved',
    reasons,
  };
}

export function useNewsRewriter() {
  const [isRewriting, setIsRewriting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RewriteResult | null>(null);
  const [lastCompliance, setLastCompliance] = useState<ComplianceCheck | null>(null);
  const [lastAudit, setLastAudit] = useState<AuditResult | null>(null);
  const { toast } = useToast();

  const autoPublishToWordPress = useCallback(async (
    articleId: string,
    projectId: string
  ): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return false;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-to-wordpress`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            articleId,
            projectId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to publish');
      }

      const data = await response.json();
      
      if (data.success) {
        // Update article config with publish info
        await supabase
          .from('articles')
          .update({
            config: {
              auto_published: true,
              wordpress_post_id: data.postId,
              wordpress_post_url: data.postUrl,
            },
          })
          .eq('id', articleId);

        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Auto-publish error:', error);
      return false;
    }
  }, []);

  const rewriteNews = useCallback(async (request: RewriteRequest): Promise<RewriteResult | null> => {
    setIsRewriting(true);
    setProgress('Preparando repostagem...');
    setLastResult(null);
    setLastCompliance(null);
    setLastAudit(null);

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: 'Erro de autenticação',
          description: 'Faça login para continuar',
          variant: 'destructive',
        });
        return null;
      }

      setProgress('Analisando conteúdo original...');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rewrite-news`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            ...request,
            niche: request.niche || 'geral',
            articleLength: request.articleLength || 'medium',
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 429) {
          toast({
            title: 'Limite de requisições',
            description: 'Aguarde alguns minutos e tente novamente',
            variant: 'destructive',
          });
          return null;
        }
        
        if (response.status === 402) {
          toast({
            title: 'Créditos insuficientes',
            description: 'Adicione créditos para continuar gerando conteúdo',
            variant: 'destructive',
          });
          return null;
        }

        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      setProgress('Gerando artigo com IA...');
      const data = await response.json();

      if (!data.success || !data.article) {
        throw new Error('Resposta inválida do servidor');
      }

      const result = data.article as RewriteResult;
      const compliance = data.compliance as ComplianceCheck;
      
      setLastResult(result);
      setLastCompliance(compliance);

      // Perform audit
      setProgress('Auditando qualidade...');
      const audit = performAuditCheck(compliance, result.quality_score);
      setLastAudit(audit);

      // Update article with audit status
      await supabase
        .from('articles')
        .update({
          config: supabase.rpc ? undefined : {
            audit_status: audit.status,
            audit_scores: audit.scores,
          } as any,
        })
        .eq('id', result.id);

      // Auto-publish if approved and enabled
      if (request.autoPublish && request.projectId && audit.passed) {
        setProgress('Publicando no WordPress...');
        const published = await autoPublishToWordPress(result.id, request.projectId);
        
        if (published) {
          toast({
            title: 'Artigo auto-publicado! 🎉',
            description: `"${result.title}" foi publicado automaticamente no WordPress.`,
          });
        } else {
          toast({
            title: 'Repostagem concluída!',
            description: `Artigo "${result.title}" aprovado mas a publicação automática falhou. Publique manualmente.`,
          });
        }
      } else if (audit.passed) {
        toast({
          title: 'Repostagem aprovada! ✅',
          description: `Artigo "${result.title}" passou na auditoria com ${result.originality_score}% de originalidade.`,
        });
      } else if (audit.status === 'review') {
        toast({
          title: 'Repostagem em revisão ⚠️',
          description: `Artigo "${result.title}" precisa de revisão manual antes da publicação.`,
        });
      } else {
        toast({
          title: 'Repostagem reprovada ❌',
          description: `Artigo "${result.title}" não atingiu os critérios mínimos de qualidade.`,
          variant: 'destructive',
        });
      }

      return result;
    } catch (error) {
      console.error('Rewrite error:', error);
      toast({
        title: 'Erro na repostagem',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsRewriting(false);
      setProgress(null);
    }
  }, [toast, autoPublishToWordPress]);

  return {
    rewriteNews,
    isRewriting,
    progress,
    lastResult,
    lastCompliance,
    lastAudit,
    performAuditCheck,
  };
}
