import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  Shield,
  Zap,
  BookOpen,
  Scale,
  ThumbsUp,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type ComplianceCheck } from '@/hooks/useNewsRewriter';

interface AuditResult {
  passed: boolean;
  status: 'approved' | 'review' | 'rejected';
  score: number;
  checks: {
    originality: { passed: boolean; score: number; threshold: number };
    readability: { passed: boolean; score: number; threshold: number };
    seoOptimized: { passed: boolean };
    citationCompliance: { passed: boolean };
  };
  recommendation: string;
}

interface AutoAuditPanelProps {
  compliance: ComplianceCheck | null;
  qualityScore?: number;
  className?: string;
}

// Audit thresholds
const THRESHOLDS = {
  originality: { approved: 95, review: 85 },
  readability: { approved: 80, review: 60 },
  qualityScore: { approved: 85, review: 70 },
};

export function performAudit(compliance: ComplianceCheck, qualityScore: number = 90): AuditResult {
  const checks = {
    originality: {
      passed: compliance.originalityScore >= THRESHOLDS.originality.approved,
      score: compliance.originalityScore,
      threshold: THRESHOLDS.originality.approved,
    },
    readability: {
      passed: compliance.readabilityScore >= THRESHOLDS.readability.approved,
      score: compliance.readabilityScore,
      threshold: THRESHOLDS.readability.approved,
    },
    seoOptimized: { passed: compliance.seoOptimized },
    citationCompliance: { passed: compliance.citationCompliance },
  };

  // Calculate overall score
  const weights = { originality: 0.4, readability: 0.2, quality: 0.3, seo: 0.05, citation: 0.05 };
  const overallScore = Math.round(
    (compliance.originalityScore * weights.originality) +
    (compliance.readabilityScore * weights.readability) +
    (qualityScore * weights.quality) +
    (compliance.seoOptimized ? 100 : 0) * weights.seo +
    (compliance.citationCompliance ? 100 : 0) * weights.citation
  );

  // Determine status
  let status: 'approved' | 'review' | 'rejected';
  let recommendation: string;

  const allPassed = Object.values(checks).every(c => c.passed);
  const anyFailed = !compliance.citationCompliance || compliance.originalityScore < THRESHOLDS.originality.review;

  if (allPassed && overallScore >= THRESHOLDS.qualityScore.approved) {
    status = 'approved';
    recommendation = 'Artigo aprovado para publicação automática. Todos os critérios de qualidade foram atendidos.';
  } else if (anyFailed) {
    status = 'rejected';
    recommendation = compliance.originalityScore < THRESHOLDS.originality.review 
      ? 'Originalidade muito baixa. Reescreva o artigo com maior diferenciação do original.'
      : 'Compliance de citações não atendido. Verifique os créditos e citações.';
  } else {
    status = 'review';
    recommendation = 'Artigo enviado para revisão manual. Alguns critérios precisam de atenção.';
  }

  return {
    passed: status === 'approved',
    status,
    score: overallScore,
    checks,
    recommendation,
  };
}

export function AutoAuditPanel({ compliance, qualityScore = 90, className }: AutoAuditPanelProps) {
  if (!compliance) return null;

  const audit = performAudit(compliance, qualityScore);

  const getStatusConfig = () => {
    switch (audit.status) {
      case 'approved':
        return {
          icon: CheckCircle2,
          label: 'Aprovado',
          color: 'text-success',
          bgColor: 'bg-success/10',
          borderColor: 'border-success/50',
        };
      case 'review':
        return {
          icon: Eye,
          label: 'Revisão Manual',
          color: 'text-warning',
          bgColor: 'bg-warning/10',
          borderColor: 'border-warning/50',
        };
      case 'rejected':
        return {
          icon: XCircle,
          label: 'Reprovado',
          color: 'text-destructive',
          bgColor: 'bg-destructive/10',
          borderColor: 'border-destructive/50',
        };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  return (
    <Card className={cn(statusConfig.borderColor, statusConfig.bgColor, className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className={cn("w-5 h-5", statusConfig.color)} />
            <CardTitle className="text-base">Auditoria Automática</CardTitle>
          </div>
          <Badge 
            variant="secondary" 
            className={cn("gap-1", statusConfig.bgColor, statusConfig.color)}
          >
            <StatusIcon className="w-3 h-3" />
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Score Geral</span>
            <span className={cn(
              "font-bold text-lg",
              audit.score >= 85 ? "text-success" :
              audit.score >= 70 ? "text-warning" : "text-destructive"
            )}>
              {audit.score}%
            </span>
          </div>
          <Progress value={audit.score} className="h-2" />
        </div>

        {/* Individual Checks */}
        <div className="grid grid-cols-2 gap-3">
          {/* Originality */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              {audit.checks.originality.passed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              )}
              <span className="text-xs font-medium">Originalidade</span>
            </div>
            <div className="flex items-center gap-2">
              <Progress 
                value={audit.checks.originality.score} 
                className="h-1.5 flex-1" 
              />
              <span className={cn(
                "text-xs font-medium",
                audit.checks.originality.passed ? "text-success" : "text-warning"
              )}>
                {audit.checks.originality.score}%
              </span>
            </div>
          </div>

          {/* Readability */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              {audit.checks.readability.passed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              )}
              <span className="text-xs font-medium">Legibilidade</span>
            </div>
            <div className="flex items-center gap-2">
              <Progress 
                value={audit.checks.readability.score} 
                className="h-1.5 flex-1" 
              />
              <span className={cn(
                "text-xs font-medium",
                audit.checks.readability.passed ? "text-success" : "text-warning"
              )}>
                {audit.checks.readability.score}%
              </span>
            </div>
          </div>

          {/* SEO */}
          <div className="flex items-center gap-1.5">
            {audit.checks.seoOptimized.passed ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-destructive" />
            )}
            <span className="text-xs">SEO Otimizado</span>
            {audit.checks.seoOptimized.passed && (
              <Zap className="w-3 h-3 text-primary" />
            )}
          </div>

          {/* Citation Compliance */}
          <div className="flex items-center gap-1.5">
            {audit.checks.citationCompliance.passed ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-destructive" />
            )}
            <span className="text-xs">Lei 9.610/98</span>
            {audit.checks.citationCompliance.passed && (
              <Scale className="w-3 h-3 text-primary" />
            )}
          </div>
        </div>

        {/* Recommendation */}
        <div className={cn(
          "p-3 rounded-lg border",
          audit.status === 'approved' ? "bg-success/5 border-success/30" :
          audit.status === 'review' ? "bg-warning/5 border-warning/30" :
          "bg-destructive/5 border-destructive/30"
        )}>
          <div className="flex items-start gap-2">
            {audit.status === 'approved' ? (
              <ThumbsUp className="w-4 h-4 text-success shrink-0 mt-0.5" />
            ) : audit.status === 'review' ? (
              <BookOpen className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            )}
            <p className="text-xs text-muted-foreground">
              {audit.recommendation}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
