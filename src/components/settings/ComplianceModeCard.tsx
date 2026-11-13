import { useEffect, useState } from 'react';
import { Loader2, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useComplianceMode } from '@/hooks/useComplianceMode';
import {
  COMPLIANCE_MODES,
  COMPLIANCE_MODE_LABELS,
  COMPLIANCE_RESPONSIBILITY_NOTE,
  normalizeComplianceMode,
  type ComplianceMode,
} from '@/lib/compliance-mode';

// Visível só para dono e administrador da organização. A permissão real é da política de UPDATE de
// `organizations` no banco; esconder o cartão aqui é só conveniência.
export function ComplianceModeCard() {
  const { mode, isLoading, canChange, setMode } = useComplianceMode();
  const [selected, setSelected] = useState<ComplianceMode>(mode);

  useEffect(() => { setSelected(mode); }, [mode]);

  if (isLoading || !canChange) return null;

  const save = async () => {
    try {
      await setMode.mutateAsync(selected);
      toast.success('Modo de verificação salvo.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível salvar o modo de verificação.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" />Verificação de publicidade (OAB)</CardTitle>
        <CardDescription>
          Escolha como o sistema trata trechos que podem não estar de acordo com o Provimento 205/2021 da OAB (promessa de resultado,
          superlativos, comparações, urgência comercial e captação direta).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup value={selected} onValueChange={(value) => setSelected(normalizeComplianceMode(value))} className="space-y-3">
          {COMPLIANCE_MODES.map((option) => (
            <div key={option} className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value={option} id={`compliance-mode-${option}`} className="mt-1" />
              <Label htmlFor={`compliance-mode-${option}`} className="flex-1 cursor-pointer space-y-1">
                <span className="block text-sm font-semibold">{COMPLIANCE_MODE_LABELS[option].label}</span>
                <span className="block text-sm font-normal text-muted-foreground">{COMPLIANCE_MODE_LABELS[option].summary}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">{COMPLIANCE_RESPONSIBILITY_NOTE}</p>
        <Button onClick={save} disabled={setMode.isPending || selected === mode}>
          {setMode.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}
