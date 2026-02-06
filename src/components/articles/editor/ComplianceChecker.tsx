import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Scale
} from 'lucide-react';
import { validateComplianceOAB, type ComplianceResult, type ComplianceProblem } from '@/lib/maa-utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ComplianceCheckerProps {
  content: string;
  className?: string;
}

export function ComplianceChecker({ content, className }: ComplianceCheckerProps) {
  const [result, setResult] = useState<ComplianceResult | null>(null);

  useEffect(() => {
    if (content && content.length > 50) {
      // Debounce the check
      const timer = setTimeout(() => {
        const complianceResult = validateComplianceOAB(content);
        setResult(complianceResult);
      }, 500);
      
      return () => clearTimeout(timer);
    } else {
      setResult(null);
    }
  }, [content]);

  if (!result) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Compliance OAB
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Adicione conteúdo para verificar compliance com a OAB
          </p>
        </CardContent>
      </Card>
    );
  }

  const errorCount = result.problems.filter(p => p.type === 'error').length;
  const warningCount = result.problems.filter(p => p.type === 'warning').length;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            {result.isCompliant ? (
              <ShieldCheck className="h-4 w-4 text-green-500" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-destructive" />
            )}
            Compliance OAB
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge 
                  variant={result.isCompliant ? 'default' : 'destructive'}
                  className="ml-2"
                >
                  {result.score}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Score de Compliance OAB</p>
                <p className="text-xs text-muted-foreground">
                  Resolução 02/2015
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <Progress 
            value={result.score} 
            className={result.isCompliant ? '' : '[&>div]:bg-destructive'}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{errorCount} erros • {warningCount} avisos</span>
            <span>{result.isCompliant ? 'Aprovado' : 'Requer revisão'}</span>
          </div>
        </div>

        {/* Status */}
        {result.isCompliant ? (
          <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              Conteúdo em conformidade com o Código de Ética da OAB
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              {errorCount} problema(s) que violam a Resolução 02/2015 da OAB
            </AlertDescription>
          </Alert>
        )}

        {/* Problems list */}
        {result.problems.length > 0 && (
          <ScrollArea className="h-[200px]">
            <div className="space-y-3">
              {result.problems.map((problem, index) => (
                <ProblemItem key={index} problem={problem} />
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Warnings */}
        {result.warnings.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Recomendações
            </p>
            {result.warnings.map((warning, index) => (
              <p key={index} className="text-xs text-muted-foreground pl-4">
                • {warning}
              </p>
            ))}
          </div>
        )}

        {/* Reference */}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Scale className="h-3 w-3" />
            Baseado na Resolução OAB 02/2015 - Código de Ética
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProblemItem({ problem }: { problem: ComplianceProblem }) {
  const isError = problem.type === 'error';
  
  return (
    <div className={`p-3 rounded-lg border ${
      isError 
        ? 'border-destructive/50 bg-destructive/5' 
        : 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20'
    }`}>
      <div className="flex items-start gap-2">
        {isError ? (
          <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
        )}
        <div className="space-y-1 flex-1 min-w-0">
          <p className="text-sm font-medium">{problem.message}</p>
          {problem.term && (
            <Badge variant="outline" className="text-xs">
              "{problem.term}"
            </Badge>
          )}
          {problem.suggestion && (
            <p className="text-xs text-muted-foreground">
              💡 {problem.suggestion}
            </p>
          )}
          {problem.article && (
            <p className="text-xs text-muted-foreground">
              📜 {problem.article}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
