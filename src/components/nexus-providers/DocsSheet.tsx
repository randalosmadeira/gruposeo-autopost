import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { REFERENCE_NOTICE, categoryLabel, getCatalogEntry } from '@/lib/nexus-providers';
import type { ProviderId } from '@/types/nexus-providers';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-1.5 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="inline-flex items-center gap-1 break-all text-primary underline" href={href} target="_blank" rel="noopener noreferrer">
      {children}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="sr-only">(abre em nova aba)</span>
    </a>
  );
}

/** Gaveta lateral com a documentação de integração de um provedor. */
export function DocsSheet({ providerId, onClose }: { providerId: ProviderId | null; onClose: () => void }) {
  const entry = providerId ? getCatalogEntry(providerId) : undefined;
  return (
    <Sheet open={!!entry} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {entry && (
          <>
            <SheetHeader>
              <SheetTitle>{entry.name}</SheetTitle>
              <SheetDescription>{categoryLabel(entry.category)} · documentação de integração</SheetDescription>
            </SheetHeader>
            <div className="mt-4 space-y-5">
              <Block title="O que o Zica.ai faz com este provedor"><p>{entry.doc.zicaUsage}</p></Block>

              {(entry.costWarning || entry.doc.warnings?.length) && (
                <div className="space-y-2">
                  {(entry.doc.warnings ?? []).map((w) => (
                    <Alert key={w} className="border-amber-600/50 bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"><AlertDescription>{w}</AlertDescription></Alert>
                  ))}
                </div>
              )}

              <Block title="Passo a passo">
                <ol className="list-decimal space-y-1 pl-5">{entry.doc.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              </Block>

              <Block title="Onde achar a chave">
                <p>{entry.doc.keyLocation}</p>
                <p><ExtLink href={entry.keyUrl}>{entry.keyUrl}</ExtLink></p>
              </Block>

              <Block title="Formato da credencial"><p>{entry.doc.credentialFormat}</p></Block>

              {entry.doc.endpoints.length > 0 && (
                <Block title="Endereços usados">
                  <ul className="space-y-1.5">
                    {entry.doc.endpoints.map((e) => (
                      <li key={`${e.method}-${e.url}`}>
                        <span className="font-medium text-foreground">{e.label}</span>{' '}
                        <code className="break-all rounded bg-muted px-1 py-0.5 text-xs">{e.method} {e.url}</code>
                        {e.note && <span> — {e.note}</span>}
                      </li>
                    ))}
                  </ul>
                </Block>
              )}

              <Block title="País, idioma e parâmetros"><p>{entry.doc.params}</p></Block>

              <Block title="Custo e limites">
                <p>{entry.costLabel}</p>
                <p>{entry.doc.limits}</p>
                <p className="text-xs">{REFERENCE_NOTICE}</p>
              </Block>

              <Block title="Erros comuns">
                <ul className="space-y-1.5">
                  {entry.doc.commonErrors.map((e) => (
                    <li key={e.symptom}><span className="font-medium text-foreground">{e.symptom}:</span> {e.fix}</li>
                  ))}
                </ul>
              </Block>

              <Block title="Links">
                <ul className="space-y-1">
                  <li><ExtLink href={entry.contractUrl}>Contratar: {entry.contractUrl}</ExtLink></li>
                  <li><ExtLink href={entry.docsUrl}>Documentação oficial: {entry.docsUrl}</ExtLink></li>
                  {entry.extraLinks.map((l) => <li key={l.url}><ExtLink href={l.url}>{l.label}: {l.url}</ExtLink></li>)}
                </ul>
              </Block>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
