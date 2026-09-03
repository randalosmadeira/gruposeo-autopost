import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ViralPackage } from '@/components/news-rewriter/MadeiraNelesPainel';

export interface RepostBatchContext {
  scheduleId?: string | null;
  agentId?: string | null;
  sourceType?: 'manual' | 'rss' | 'agent' | 'portal' | string;
  queuePosition?: number | null;
  queueSize?: number | null;
  feedName?: string | null;
}

export interface EditorialDecision {
  niche: string;
  analysisAngleId: string;
  analysisAngle: string;
  articleLength: 'short' | 'medium' | 'long' | 'very-long';
  emotionalTrigger: string;
  emotionalIntensity: 'low' | 'medium' | 'high';
  keyword: string;
  tone: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresHumanReview: boolean;
  confidence: number;
  reasoningSummary: string;
  diversityNotes: string[];
  promptAddendum: string;
  selectionSource: 'ai' | 'manual' | 'fallback';
}

export interface RewriteRequest {
  sourceUrl: string;
  sourceContent: string;
  sourceName: string;
  analysisAngle?: string;
  keyword?: string;
  niche?: string;
  articleLength?: 'short' | 'medium' | 'long' | 'very-long' | 'extra-long' | 'auto';
  language?: string;
  projectId?: string;
  internalLinks?: Array<{ anchor: string; url: string }>;
  autoPublish?: boolean;
  emotionalTriggerOverride?: string;
  rewriteMode?: 'standard' | 'madeira_neles';
  editorialAutonomy?: boolean;
  repostBatchContext?: RepostBatchContext;
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
  status: string;
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
  config?: Record<string, unknown> | null;
}

export type AuditStatus = 'approved' | 'review' | 'rejected' | 'pending';

export interface AuditResult {
  status: AuditStatus;
  scores: { originality: number; quality: number; readability: number; overall: number };
  passed: boolean;
  reasons: string[];
}

interface PublicationPayload {
  success?: boolean;
  operation_id?: string;
  status?: string;
  payload?: {
    postId?: string | number;
    postUrl?: string;
    rss?: { status?: string; feed_url?: string | null; error?: string | null };
  };
  error?: string;
}

function numberOrFallback(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCompliance(value: Partial<ComplianceCheck> | null | undefined, article: Record<string, unknown>): ComplianceCheck {
  const config = article.config && typeof article.config === 'object' ? article.config as Record<string, unknown> : {};
  return {
    originalityScore: numberOrFallback(value?.originalityScore, numberOrFallback(article.originality_score)),
    citationCompliance: value?.citationCompliance ?? config.needs_primary_source !== true,
    seoOptimized: value?.seoOptimized ?? numberOrFallback(article.seo_score) >= 80,
    readabilityScore: numberOrFallback(value?.readabilityScore, numberOrFallback(config.readability_score, 70)),
  };
}

export function performAuditCheck(compliance: ComplianceCheck, qualityScore = 0): AuditResult {
  const scores = {
    originality: compliance.originalityScore,
    quality: qualityScore,
    readability: compliance.readabilityScore,
    overall: 0,
  };
  scores.overall = Math.round(scores.originality * 0.4 + scores.quality * 0.35 + scores.readability * 0.25);
  const reasons: string[] = [];
  let status: AuditStatus = 'pending';
  if (scores.originality >= 95 && scores.quality >= 85 && compliance.citationCompliance) {
    status = 'approved';
    reasons.push('Originalidade excelente (≥95%)', 'Qualidade alta (≥85%)');
  } else if (scores.originality >= 85 && scores.quality >= 70) {
    status = 'review';
    if (scores.originality < 95) reasons.push('Originalidade moderada (85-95%)');
    if (scores.quality < 85) reasons.push('Qualidade moderada (70-85%)');
  } else {
    status = 'rejected';
    if (scores.originality < 85) reasons.push('Originalidade baixa (<85%)');
    if (scores.quality < 70) reasons.push('Qualidade insuficiente (<70%)');
    if (!compliance.citationCompliance) reasons.push('Citações ou fonte primária pendentes');
  }
  return { status, scores, passed: status === 'approved', reasons };
}

export function useNewsRewriter() {
  const [isRewriting, setIsRewriting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RewriteResult | null>(null);
  const [lastCompliance, setLastCompliance] = useState<ComplianceCheck | null>(null);
  const [lastAudit, setLastAudit] = useState<AuditResult | null>(null);
  const [lastViralPackage, setLastViralPackage] = useState<ViralPackage | null>(null);
  const [lastEditorialDecision, setLastEditorialDecision] = useState<EditorialDecision | null>(null);
  const { toast } = useToast();

  const autoPublishThroughQueue = useCallback(async (articleId: string, projectId: string): Promise<PublicationPayload | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return null;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wordpress-operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'publish', articleId, projectId, publishStatus: 'publish' }),
      });
      const data = await response.json().catch(() => ({})) as PublicationPayload;
      if (!response.ok || !data.success) throw new Error(data.error || 'Falha na fila de publicação');
      return data;
    } catch (error) {
      console.error('Auto-publish queue error:', error);
      return null;
    }
  }, []);

  const rewriteNews = useCallback(async (request: RewriteRequest): Promise<RewriteResult | null> => {
    setIsRewriting(true);
    setProgress('Preparando o rol de repostagem...');
    setLastResult(null);
    setLastCompliance(null);
    setLastAudit(null);
    setLastViralPackage(null);
    setLastEditorialDecision(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: 'Erro de autenticação', description: 'Faça login para continuar', variant: 'destructive' });
        return null;
      }

      setProgress(request.editorialAutonomy === false
        ? 'Aplicando overrides editoriais...'
        : 'Agentes de IA definindo nicho, ângulo, profundidade, palavra-chave, tom e gatilho...');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rewrite-news`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          ...request,
          niche: request.niche || 'auto',
          articleLength: request.articleLength || 'auto',
          analysisAngle: request.analysisAngle || 'auto',
          emotionalTriggerOverride: request.emotionalTriggerOverride || undefined,
          rewriteMode: request.rewriteMode || 'standard',
          editorialAutonomy: request.editorialAutonomy ?? true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        if (response.status === 429) {
          toast({ title: 'Limite de requisições', description: 'Aguarde alguns minutos e tente novamente', variant: 'destructive' });
          return null;
        }
        if (response.status === 402) {
          toast({ title: 'Créditos insuficientes', description: 'Adicione créditos para continuar gerando conteúdo', variant: 'destructive' });
          return null;
        }
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      setProgress('Gerando, verificando fontes e revisando o artigo...');
      const data = await response.json() as {
        success?: boolean;
        article?: Record<string, unknown>;
        compliance?: Partial<ComplianceCheck>;
        editorialDecision?: EditorialDecision;
        viralPackage?: ViralPackage;
      };
      if (!data.success || !data.article) throw new Error('Resposta inválida do servidor');

      const rawArticle = data.article;
      const rawConfig = rawArticle.config && typeof rawArticle.config === 'object' ? rawArticle.config as Record<string, unknown> : {};
      const decision = data.editorialDecision || rawConfig.editorial_decision as EditorialDecision | undefined || null;
      const compliance = normalizeCompliance(data.compliance, rawArticle);
      const result = {
        ...rawArticle,
        id: String(rawArticle.id || ''),
        title: String(rawArticle.title || ''),
        slug: String(rawArticle.slug || ''),
        status: String(rawArticle.status || 'draft'),
        word_count: numberOrFallback(rawArticle.word_count),
        featured_image_url: rawArticle.featured_image_url ? String(rawArticle.featured_image_url) : null,
        originality_score: numberOrFallback(rawArticle.originality_score),
        quality_score: numberOrFallback(rawArticle.quality_score, numberOrFallback(rawConfig.quality_score)),
        readability_score: numberOrFallback(rawArticle.readability_score, compliance.readabilityScore),
        seo_optimized: Boolean(rawArticle.seo_optimized ?? compliance.seoOptimized),
        reading_time: String(rawArticle.reading_time || `${Math.max(1, Math.ceil(numberOrFallback(rawArticle.word_count) / 220))} min`),
        credits: String(rawArticle.credits || 'Fonte original identificada'),
        niche: String(rawArticle.niche || decision?.niche || rawArticle.nicho_detectado || 'geral'),
        tags: Array.isArray(rawArticle.tags) ? rawArticle.tags.map(String) : [],
        keywords: Array.isArray(rawArticle.keywords) ? rawArticle.keywords.map(String) : [String(rawArticle.keyword || '')].filter(Boolean),
        config: rawConfig,
      } satisfies RewriteResult;

      setLastResult(result);
      setLastCompliance(compliance);
      setLastEditorialDecision(decision);
      if (data.viralPackage) setLastViralPackage(data.viralPackage);

      setProgress('Auditando qualidade e risco...');
      const audit = performAuditCheck(compliance, result.quality_score);
      setLastAudit(audit);
      const nextConfig = {
        ...rawConfig,
        audit_status: audit.status,
        audit_scores: audit.scores,
        audit_reasons: audit.reasons,
        audit_checked_at: new Date().toISOString(),
      };
      await supabase.from('articles').update({ config: nextConfig }).eq('id', result.id);

      const requiresReview = Boolean(decision?.requiresHumanReview || rawConfig.requires_human_review || result.status !== 'ready');
      const canAutoPublish = audit.passed && !requiresReview;

      if (request.autoPublish && request.projectId && canAutoPublish) {
        setProgress('Enfileirando publicação, interlinks e redes sociais...');
        const operation = await autoPublishThroughQueue(result.id, request.projectId);
        if (operation) {
          const post = operation.payload || {};
          const rssStatus = post.rss?.status || 'pending';
          toast({
            title: 'Repostagem distribuída pela fila WordPress',
            description: post.postUrl
              ? `"${result.title}" foi enviado ao WordPress. RSS: ${rssStatus}.`
              : `"${result.title}" concluiu a operação ${operation.operation_id || ''}.`,
          });
        } else {
          toast({ title: 'Falha na distribuição', description: `O artigo "${result.title}" foi aprovado, mas a fila WordPress falhou.`, variant: 'destructive' });
        }
      } else if (requiresReview) {
        toast({ title: 'Agente encaminhou para revisão', description: decision?.reasoningSummary || `O artigo "${result.title}" exige validação antes da publicação.` });
      } else if (audit.passed) {
        toast({ title: 'Repostagem aprovada', description: `A IA definiu ${decision?.niche || result.niche}, ${decision?.articleLength || 'profundidade adequada'} e ${decision?.emotionalTrigger || 'tom editorial seguro'}.` });
      } else if (audit.status === 'review') {
        toast({ title: 'Repostagem em revisão', description: `O artigo "${result.title}" precisa de revisão antes da publicação.` });
      } else {
        toast({ title: 'Repostagem reprovada', description: `O artigo "${result.title}" não atingiu os critérios mínimos de qualidade.`, variant: 'destructive' });
      }
      return result;
    } catch (error) {
      console.error('Rewrite error:', error);
      toast({ title: 'Erro na repostagem', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
      return null;
    } finally {
      setIsRewriting(false);
      setProgress(null);
    }
  }, [toast, autoPublishThroughQueue]);

  return {
    rewriteNews,
    isRewriting,
    progress,
    lastResult,
    lastCompliance,
    lastAudit,
    lastViralPackage,
    lastEditorialDecision,
    performAuditCheck,
  };
}
