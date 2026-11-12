import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Loader2, UploadCloud } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { buildSchemaApplyConfirmText, formatSchemaPreview, nexusErrorMessage, schemaAppliedMessage } from '@/lib/nexus-observatory';
import { NexusBlockedError, type NexusHomepageSchemaResult } from '@/types/nexus-observatory';

export interface HomepageSchemaSectionProps {
  /** Chama `homepage_schema_sync`. Em geral `actions.homepageSchemaSync.mutateAsync`. */
  sync: (v: { dryRun: boolean }) => Promise<NexusHomepageSchemaResult>;
  /** Site do projeto, usado no texto de confirmação quando a pré-visualização não informa o site. */
  siteFallback?: string | null;
  /** Recebe erros de bloqueio (402/423) para o aviso global da página; os demais ficam na própria seção. */
  onBlocked?: (e: NexusBlockedError) => void;
}

type Busy = 'preview' | 'apply' | null;

export function HomepageSchemaSection({ sync, siteFallback, onBlocked }: HomepageSchemaSectionProps) {
  const [preview, setPreview] = useState<NexusHomepageSchemaResult | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const site = preview?.site || siteFallback || null;

  function fail(e: unknown) {
    if (e instanceof NexusBlockedError) { onBlocked?.(e); setError(null); return; }
    setError(nexusErrorMessage(e));
  }

  async function runPreview() {
    setBusy('preview'); setError(null); setApplied(null);
    try {
      setPreview(await sync({ dryRun: true }));
    } catch (e) {
      setPreview(null);
      fail(e);
    } finally { setBusy(null); }
  }

  async function runApply() {
    setBusy('apply'); setError(null); setApplied(null);
    try {
      const r = await sync({ dryRun: false });
      if (!r.applied) { setError('O servidor não confirmou a aplicação. Nada foi alterado no site.'); return; }
      setApplied(schemaAppliedMessage(r));
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  return (
    <section aria-labelledby="obs-schema" className="space-y-3">
      <div>
        <h2 id="obs-schema" className="text-xl font-semibold">Schema da homepage</h2>
        <p className="text-sm text-muted-foreground">
          Enriquece o schema que o site já publica (endereço, área atendida e perfis), usando o mesmo identificador (@id) da entidade existente.
          Não troca o schema do Rank Math nem do tema.
        </p>
      </div>
      <Card>
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={runPreview} disabled={busy !== null}>
              {busy === 'preview' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <Eye className="mr-1 h-4 w-4" aria-hidden="true" />}
              Pré-visualizar
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={!preview || busy !== null}>
              {busy === 'apply' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <UploadCloud className="mr-1 h-4 w-4" aria-hidden="true" />}
              Aplicar no site
            </Button>
          </div>
          {!preview && busy === null && !error && (
            <p className="text-xs text-muted-foreground">Pré-visualize primeiro: “Aplicar no site” só habilita depois disso.</p>
          )}
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {busy === 'preview' ? 'Gerando pré-visualização…' : busy === 'apply' ? 'Aplicando no site…' : ''}
          </p>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Não foi possível concluir</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {applied && (
            <Alert className="border-emerald-500/60 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>{applied}</AlertTitle>
              <AlertDescription>O plugin recebeu o schema. Confira a homepage publicada para ver o resultado.</AlertDescription>
            </Alert>
          )}

          {preview && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                Pré-visualização ({preview.schemas.length} schema(s)): nada foi enviado ao site ainda
              </p>
              <pre
                tabIndex={0}
                role="region"
                aria-label="Pré-visualização do JSON-LD da homepage"
                data-testid="schema-preview"
                className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs"
              >{formatSchemaPreview(preview.schemas)}</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar schema no site?</AlertDialogTitle>
            <AlertDialogDescription>{buildSchemaApplyConfirmText(site)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void runApply(); }}>Aplicar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
