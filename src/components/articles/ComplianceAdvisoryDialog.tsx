import { Scale } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { COMPLIANCE_RESPONSIBILITY_NOTE, type QualityIssue } from '@/lib/compliance-mode';
import { AdvisoryIssueItem } from './editor/ComplianceChecker';

interface ComplianceAdvisoryDialogProps {
  issues: QualityIssue[];
  onRevise: () => void;
  onPublishAnyway: () => void;
}

// Modo aviso: mostra o que a verificação encontrou antes de publicar. Nada aqui bloqueia; "Publicar mesmo
// assim (ciente)" segue com a publicação e o servidor registra quem deu o ciente.
export function ComplianceAdvisoryDialog({ issues, onRevise, onPublishAnyway }: ComplianceAdvisoryDialogProps) {
  return (
    <AlertDialog open={issues.length > 0} onOpenChange={(open) => { if (!open) onRevise(); }}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Pontos de publicidade para revisar</AlertDialogTitle>
          <AlertDialogDescription>
            A verificação do Provimento 205/2021 da OAB encontrou {issues.length === 1 ? '1 ponto' : `${issues.length} pontos`} neste artigo.
            Você pode revisar o texto agora ou publicar assim mesmo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ScrollArea className="max-h-[320px] pr-3">
          <div className="space-y-3">
            {issues.map((issue, index) => <AdvisoryIssueItem key={`${issue.code}-${issue.field}-${index}`} issue={issue} />)}
          </div>
        </ScrollArea>
        <p className="text-xs text-muted-foreground flex items-start gap-1">
          <Scale className="h-3 w-3 mt-0.5 shrink-0" />
          {COMPLIANCE_RESPONSIBILITY_NOTE} O aviso fica registrado no artigo.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar e revisar</AlertDialogCancel>
          <AlertDialogAction onClick={onPublishAnyway}>Publicar mesmo assim (ciente)</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
