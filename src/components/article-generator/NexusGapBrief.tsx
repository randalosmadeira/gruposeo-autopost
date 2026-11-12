import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useObservatorySummary } from '@/hooks/useNexusObservatory';
import { deriveGaps, engineLabel, gapKey, gapToPauta, countryLabel, rangeForDays } from '@/lib/nexus-observatory';
import { NexusBlockedError, type NexusGapSelection } from '@/types/nexus-observatory';

export interface NexusGapPauta { keyword: string; title: string; nexusGap: NexusGapSelection }

interface Props {
  projectId?: string;
  /** Palavras-chave já presentes na lista (comparação sem diferenciar maiúsculas). */
  existingKeywords?: string[];
  /** Recebe as pautas; o gerador as insere pelo mesmo caminho da importação de palavras-chave. */
  onAdd: (pautas: NexusGapPauta[]) => void;
}

const MAX_GAPS = 10;

export function NexusGapBrief({ projectId, existingKeywords = [], onAdd }: Props) {
  const [searchParams] = useSearchParams();
  const range = useMemo(() => rangeForDays(30), []);
  const { data, isLoading, error } = useObservatorySummary(projectId, range.from, range.to);
  const gaps = useMemo(() => deriveGaps(data, MAX_GAPS), [data]);

  const fromUrl = useMemo(
    () => new Set((searchParams.get('nexusGaps') ?? '').split(',').map((s) => s.trim()).filter(Boolean)),
    [searchParams],
  );
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [added, setAdded] = useState<Record<string, boolean>>({});

  if (!projectId) return null;

  const existing = new Set(existingKeywords.map((k) => k.trim().toLowerCase()));
  const isSelected = (key: string) => selection[key] ?? fromUrl.has(key);
  const isAdded = (key: string, keyword: string | undefined) => !!added[key] || (!!keyword && existing.has(keyword.toLowerCase()));

  function add(keys: string[]) {
    const pautas: NexusGapPauta[] = [];
    const done: Record<string, boolean> = {};
    for (const gap of gaps) {
      const key = gapKey(gap);
      if (!keys.includes(key)) continue;
      const pauta = gapToPauta(gap);
      if (!pauta || isAdded(key, pauta.keyword)) continue;
      pautas.push(pauta);
      done[key] = true;
    }
    if (!pautas.length) return;
    onAdd(pautas);
    setAdded((prev) => ({ ...prev, ...done }));
  }

  const selectedKeys = gaps.map(gapKey).filter(isSelected);

  return (
    <Card data-testid="nexus-gap-brief" className="border-primary/25">
      <CardContent className="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Radar className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold">Lacunas do NEXUS Observatório</h2>
          <Badge variant="outline">observado nos últimos 30 dias</Badge>
        </div>

        {isLoading && <Skeleton className="h-16 w-full" aria-label="Carregando lacunas" />}

        {!isLoading && error instanceof NexusBlockedError && (
          <p role="status" className="text-sm text-muted-foreground">Leitura do Observatório indisponível no momento (serviços pagos bloqueados).</p>
        )}
        {!isLoading && error && !(error instanceof NexusBlockedError) && (
          <p role="alert" className="text-sm text-destructive">Não foi possível carregar as lacunas. O gerador continua funcionando normalmente.</p>
        )}

        {!isLoading && !error && gaps.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma lacuna observada no período. Registre observações no NEXUS Observatório para receber sugestões de pautas.</p>
        )}

        {gaps.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              Consultas em que o seu site não foi encontrado na amostra observada. Não é promessa de resultado: use como ponto de partida editorial.
            </p>
            <ul className="space-y-2">
              {gaps.map((gap) => {
                const key = gapKey(gap);
                const pauta = gapToPauta(gap);
                const done = isAdded(key, pauta?.keyword);
                return (
                  <li key={key} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <Checkbox
                        id={`gap-${key}`}
                        checked={isSelected(key)}
                        disabled={done || !pauta}
                        onCheckedChange={(v) => setSelection((prev) => ({ ...prev, [key]: v === true }))}
                        aria-label={`Selecionar lacuna ${gap.topic}`}
                      />
                      <div className="min-w-0 space-y-1">
                        <p className="break-words text-sm font-medium">{gap.query || gap.topic}</p>
                        <p className="text-xs text-muted-foreground">
                          Tópico: {gap.topic}{gap.country ? ` · ${countryLabel(gap.country)}` : ''}
                          {gap.engines_missing.length > 0 && ` · sem citação em: ${gap.engines_missing.map(engineLabel).join(', ')}`}
                        </p>
                        {gap.competitors.length > 0 && (
                          <p className="text-xs text-muted-foreground">Concorrentes observados: {gap.competitors.join(', ')}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button" size="sm" variant="outline" disabled={done || !pauta}
                      onClick={() => add([key])}
                    >
                      {done ? 'Pauta adicionada' : 'Adicionar como pauta'}
                    </Button>
                  </li>
                );
              })}
            </ul>
            {selectedKeys.length > 0 && (
              <Button type="button" size="sm" onClick={() => add(selectedKeys)}>
                Adicionar {selectedKeys.length} selecionada{selectedKeys.length > 1 ? 's' : ''}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
