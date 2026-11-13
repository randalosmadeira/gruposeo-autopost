import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validateGa4PropertyId } from '@/lib/nexus-analytics';
import { providerErrorMessage } from '@/lib/nexus-providers';
import type { ProjectIntegrations, ProjectIntegrationsInput } from '@/types/nexus-providers';

export interface ProjectIntegrationsCardProps {
  projectName: string;
  integrations: ProjectIntegrations | undefined;
  loading: boolean;
  /** Grava (ação técnica do gestor). Rejeita com o código do servidor (ex.: `ga4_property_already_used`). */
  onSave: (input: ProjectIntegrationsInput) => Promise<void>;
}

/** Visão gestor: ID da propriedade GA4 e propriedade do Search Console por projeto. Nunca compartilhar uma propriedade entre sites. */
export function ProjectIntegrationsCard({ projectName, integrations, loading, onSave }: ProjectIntegrationsCardProps) {
  const currentGa4 = integrations?.ga4_property_id ?? '';
  const currentGsc = integrations?.gsc_property ?? '';
  const [ga4, setGa4] = useState(currentGa4);
  const [gsc, setGsc] = useState(currentGsc);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Mantém o formulário em sincronia com o servidor (troca de projeto ou outra sessão alterou).
  useEffect(() => { setGa4(currentGa4); setGsc(currentGsc); setError(null); setNotice(null); }, [currentGa4, currentGsc]);

  const ga4Hint = validateGa4PropertyId(ga4);
  const gscTrim = gsc.trim();
  const changed = ga4.trim() !== currentGa4 || gscTrim !== currentGsc;

  async function save() {
    if (ga4Hint || !changed) return;
    const input: ProjectIntegrationsInput = {};
    if (ga4.trim() !== currentGa4) input.ga4PropertyId = ga4.trim();
    if (gscTrim !== currentGsc) input.gscProperty = gscTrim;
    setBusy(true); setError(null); setNotice(null);
    try {
      await onSave(input);
      setNotice('Identificação do projeto salva.');
    } catch (e) { setError(providerErrorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <Card id="ids-do-projeto" aria-labelledby="integrations-title">
      <CardHeader className="space-y-1">
        <CardTitle id="integrations-title" className="text-base">Identificação do projeto: {projectName}</CardTitle>
        <CardDescription>
          Cada site usa a sua própria propriedade do Google Analytics: nunca repita o mesmo ID em dois projetos.
          A credencial (JSON da conta de serviço) é guardada à parte, no cartão do Google Analytics.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="ga4-property">ID da propriedade GA4</Label>
            <Input id="ga4-property" inputMode="numeric" autoComplete="off" value={ga4} onChange={(e) => setGa4(e.target.value)}
              disabled={loading || busy} placeholder="Ex.: 123456789" aria-invalid={!!ga4Hint} aria-describedby="ga4-property-hint" />
            <p id="ga4-property-hint" className={`text-xs ${ga4Hint ? 'text-destructive' : 'text-muted-foreground'}`}>
              {ga4Hint ?? 'Só números. Fica em Google Analytics → Administrador → Detalhes da propriedade. Em branco remove.'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gsc-property">Propriedade do Search Console</Label>
            <Input id="gsc-property" autoComplete="off" value={gsc} onChange={(e) => setGsc(e.target.value)}
              disabled={loading || busy} placeholder="Ex.: sc-domain:seusite.com.br" aria-describedby="gsc-property-hint" />
            <p id="gsc-property-hint" className="text-xs text-muted-foreground">Em branco usa o padrão sc-domain:&lt;domínio do projeto&gt;.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={loading || busy || !changed || !!ga4Hint}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1 h-4 w-4" aria-hidden="true" />}
              Salvar identificação
            </Button>
            <div aria-live="polite" className="text-sm">
              {notice && <p role="status" className="text-emerald-800 dark:text-emerald-200">{notice}</p>}
              {error && <p role="alert" className="text-destructive">{error}</p>}
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
