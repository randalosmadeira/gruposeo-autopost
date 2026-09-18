import { ChangeEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ImagePlus, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationConsole } from '@/hooks/useOrganizationConsole';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BRAND_BACKDROP_GRADIENT, HERO_16_9, HERO_MAX_BYTES, HERO_SAFE_ZONE_RATIO, WEBP_CANVAS_QUALITY_STEPS } from '@/lib/image-policy';

const BUCKET = 'organization-brand-assets';
const SLOT_COUNT = 6;

type BrandAsset = {
  id: string;
  slot: number;
  original_storage_path: string;
  master_storage_path: string | null;
  status: string;
  width: number | null;
  height: number | null;
};

async function imageFromFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Chroma key tuning: color-distance band (weighted RGB Euclidean) between the
// sampled background reference and "definitely subject". Pixels closer than
// CHROMA_INNER_DISTANCE to the reference are fully removed, pixels farther
// than CHROMA_OUTER_DISTANCE are kept fully opaque, and everything between
// fades linearly — a soft mask instead of a hard on/off cutoff.
const CHROMA_INNER_DISTANCE = 38;
const CHROMA_OUTER_DISTANCE = 92;
const CHROMA_WEIGHTS = { r: 0.3, g: 0.59, b: 0.11 };
const CHROMA_FEATHER_RADIUS_PX = 2;
const BORDER_SAMPLE_WIDTH_PX = 6;

type RgbColor = { r: number; g: number; b: number };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * A real chroma-key shot is reliably background along a thin strip at the
 * image edges (the subject is centered), so the median color of that strip
 * is a much safer "what is the background color" guess than a single
 * hardcoded green threshold — it adapts to the actual green/blue screen and
 * its lighting in each upload.
 */
function sampleBorderReferenceColor(pixels: ImageData, borderWidth = BORDER_SAMPLE_WIDTH_PX): RgbColor {
  const { width, height, data } = pixels;
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  const sample = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    reds.push(data[index]);
    greens.push(data[index + 1]);
    blues.push(data[index + 2]);
  };
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < borderWidth; y++) sample(x, y);
    for (let y = Math.max(0, height - borderWidth); y < height; y++) sample(x, y);
  }
  for (let y = borderWidth; y < height - borderWidth; y++) {
    for (let x = 0; x < borderWidth; x++) sample(x, y);
    for (let x = Math.max(0, width - borderWidth); x < width; x++) sample(x, y);
  }
  return { r: median(reds), g: median(greens), b: median(blues) };
}

function colorDistance(r: number, g: number, b: number, reference: RgbColor): number {
  const dr = r - reference.r;
  const dg = g - reference.g;
  const db = b - reference.b;
  return Math.sqrt(CHROMA_WEIGHTS.r * dr * dr + CHROMA_WEIGHTS.g * dg * dg + CHROMA_WEIGHTS.b * db * db);
}

/** One pixel per source pixel: 0 = background (drop it), 255 = subject (keep it), with a soft ramp between. */
function buildAlphaMask(pixels: ImageData, reference: RgbColor): Uint8ClampedArray {
  const { data } = pixels;
  const mask = new Uint8ClampedArray(data.length / 4);
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel++) {
    const distance = colorDistance(data[index], data[index + 1], data[index + 2], reference);
    if (distance <= CHROMA_INNER_DISTANCE) mask[pixel] = 0;
    else if (distance >= CHROMA_OUTER_DISTANCE) mask[pixel] = 255;
    else mask[pixel] = Math.round(((distance - CHROMA_INNER_DISTANCE) / (CHROMA_OUTER_DISTANCE - CHROMA_INNER_DISTANCE)) * 255);
  }
  return mask;
}

function boxBlur1D(source: Uint8ClampedArray, width: number, height: number, radius: number, horizontal: boolean): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length);
  const windowSize = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        if (horizontal) {
          const sampleX = Math.min(width - 1, Math.max(0, x + k));
          sum += source[y * width + sampleX];
        } else {
          const sampleY = Math.min(height - 1, Math.max(0, y + k));
          sum += source[sampleY * width + x];
        }
      }
      output[y * width + x] = Math.round(sum / windowSize);
    }
  }
  return output;
}

/** Small feather so the cutout edge is soft instead of jagged/hard-edged. */
function featherMask(mask: Uint8ClampedArray, width: number, height: number, radius = CHROMA_FEATHER_RADIUS_PX): Uint8ClampedArray {
  if (radius <= 0) return mask;
  const blurredHorizontally = boxBlur1D(mask, width, height, radius, true);
  return boxBlur1D(blurredHorizontally, width, height, radius, false);
}

function fillBrandBackdrop(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  for (const stop of BRAND_BACKDROP_GRADIENT.stops) gradient.addColorStop(stop.offset, stop.color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

async function createChromaPreview(file: File): Promise<Blob> {
  const image = await imageFromFile(file);
  const { width: targetWidth, height: targetHeight } = HERO_16_9;

  // Cover-fit (fill the full frame, center-crop the overflow) instead of
  // contain-fit, so the export never has letterbox bars.
  const cutoutCanvas = document.createElement('canvas');
  cutoutCanvas.width = targetWidth;
  cutoutCanvas.height = targetHeight;
  const cutoutContext = cutoutCanvas.getContext('2d', { willReadFrequently: true });
  if (!cutoutContext) throw new Error('Seu navegador não disponibilizou o processador de imagem.');

  const scale = Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
  const drawWidth = Math.round(image.naturalWidth * scale);
  const drawHeight = Math.round(image.naturalHeight * scale);
  const drawX = Math.round((targetWidth - drawWidth) / 2);
  const drawY = Math.round((targetHeight - drawHeight) / 2);
  cutoutContext.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  const pixels = cutoutContext.getImageData(0, 0, targetWidth, targetHeight);
  const reference = sampleBorderReferenceColor(pixels);
  const alphaMask = featherMask(buildAlphaMask(pixels, reference), targetWidth, targetHeight);
  for (let index = 0, pixel = 0; index < pixels.data.length; index += 4, pixel++) {
    pixels.data[index + 3] = Math.min(pixels.data[index + 3], alphaMask[pixel]);
  }
  cutoutContext.putImageData(pixels, 0, 0);

  // Composite the keyed-out subject onto the standardized brand backdrop
  // (never transparency, never a letterbox bar) so every slot in the bank
  // looks like one consistent, reusable set instead of six random photos.
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = targetWidth;
  exportCanvas.height = targetHeight;
  const exportContext = exportCanvas.getContext('2d');
  if (!exportContext) throw new Error('Seu navegador não disponibilizou o processador de imagem.');
  fillBrandBackdrop(exportContext, targetWidth, targetHeight);
  exportContext.drawImage(cutoutCanvas, 0, 0);

  return exportWebpWithinBudget(exportCanvas);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Falha ao exportar a prévia WebP.')), 'image/webp', quality);
  });
}

// Image policy 2026-09: hero WebP must stay under 150 KB (HERO_MAX_BYTES).
// Lower the quality in steps (WEBP_CANVAS_QUALITY_STEPS) until the export
// fits; the last step is kept even if it is still larger.
async function exportWebpWithinBudget(canvas: HTMLCanvasElement): Promise<Blob> {
  let last: Blob | null = null;
  for (const quality of WEBP_CANVAS_QUALITY_STEPS) {
    last = await canvasToBlob(canvas, quality);
    if (last.size <= HERO_MAX_BYTES) return last;
  }
  return last as Blob;
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function BrandAssetsCard() {
  const { user } = useAuth();
  const { data: consoleData } = useOrganizationConsole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const organizationId = consoleData?.membership.organization_id;
  const [busySlot, setBusySlot] = useState<number | null>(null);

  const assetsQuery = useQuery({
    queryKey: ['organization-brand-assets', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.from('organization_brand_assets')
        .select('id,slot,original_storage_path,master_storage_path,status,width,height')
        .eq('organization_id', organizationId!)
        .neq('status', 'archived')
        .order('slot');
      if (error) throw error;
      const rows = (data || []) as BrandAsset[];
      const previews = await Promise.all(rows.map(async (asset) => {
        const path = asset.master_storage_path || asset.original_storage_path;
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 900);
        return { ...asset, previewUrl: signed?.signedUrl || '' };
      }));
      return previews;
    },
  });

  const assetsBySlot = useMemo(() => new Map((assetsQuery.data || []).map((asset) => [asset.slot, asset])), [assetsQuery.data]);

  const uploadMutation = useMutation({
    mutationFn: async ({ slot, file }: { slot: number; file: File }) => {
      if (!organizationId || !user) throw new Error('Organização do cliente não localizada.');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Envie JPG, PNG ou WebP.');
      if (file.size > 15 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 15 MB.');
      setBusySlot(slot);
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const originalPath = `${organizationId}/${slot}/original.${extension}`;
      const masterPath = `${organizationId}/${slot}/master.webp`;
      const hash = await sha256(file);

      const { error: originalError } = await supabase.storage.from(BUCKET).upload(originalPath, file, { upsert: true, contentType: file.type });
      if (originalError) throw originalError;
      const { error: rowError } = await supabase.from('organization_brand_assets').upsert({
        organization_id: organizationId,
        slot,
        original_storage_path: originalPath,
        master_storage_path: null,
        status: 'processing',
        mime_type: file.type,
        sha256: hash,
        created_by: user.id,
        metadata: { processing: 'local_chroma_v1', approved: false },
      }, { onConflict: 'organization_id,slot' });
      if (rowError) throw rowError;

      const preview = await createChromaPreview(file);
      const { error: masterError } = await supabase.storage.from(BUCKET).upload(masterPath, preview, { upsert: true, contentType: 'image/webp' });
      if (masterError) throw masterError;
      const { error: readyError } = await supabase.from('organization_brand_assets').update({
        master_storage_path: masterPath,
        status: 'preview_ready',
        width: 1200,
        height: 675,
        metadata: { processing: 'local_chroma_v1', format: 'webp', quality: 86, approved: false },
      }).eq('organization_id', organizationId).eq('slot', slot);
      if (readyError) throw readyError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-brand-assets', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['organization-console', 'me'] });
      toast({ title: 'Prévia pronta', description: 'Confira o recorte e aprove para liberar a reutilização.' });
    },
    onError: (error) => toast({ title: 'Falha no tratamento', description: error instanceof Error ? error.message : 'Não foi possível processar a imagem.', variant: 'destructive' }),
    onSettled: () => setBusySlot(null),
  });

  const approveMutation = useMutation({
    mutationFn: async (asset: BrandAsset) => {
      if (!organizationId) throw new Error('Organização não localizada.');
      const { error } = await supabase.from('organization_brand_assets').update({
        status: 'ready',
        metadata: { processing: 'local_chroma_v1', format: 'webp', quality: 86, approved: true, approved_at: new Date().toISOString() },
      }).eq('id', asset.id).eq('organization_id', organizationId).eq('status', 'preview_ready');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-brand-assets', organizationId] });
      toast({ title: 'Imagem aprovada', description: 'O ativo está liberado para capas e peças do projeto.' });
    },
  });

  const onFile = (slot: number) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) uploadMutation.mutate({ slot, file });
    event.target.value = '';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ImagePlus className="h-5 w-5 text-primary" />Banco visual reutilizável</CardTitle>
        <CardDescription>Cadastre até 6 fotos. O fundo verde é removido, a foto é recomposta sobre um fundo padrão da marca em WebP 1200 × 675 e só é liberada depois da sua aprovação.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
          Processamento único, privado e sem OpenAI ou Claude. Os artigos reutilizam os ativos aprovados sem novo custo visual.
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: SLOT_COUNT }, (_, index) => index + 1).map((slot) => {
            const asset = assetsBySlot.get(slot);
            const busy = busySlot === slot;
            return (
              <div key={slot} className="overflow-hidden rounded-xl border bg-background">
                <div className="relative aspect-video bg-[linear-gradient(135deg,#111827_25%,#1f2937_25%,#1f2937_50%,#111827_50%,#111827_75%,#1f2937_75%)] bg-[length:24px_24px]">
                  {asset?.previewUrl ? <img src={asset.previewUrl} alt={`Prévia da foto ${slot}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Foto {slot}</div>}
                  {asset?.status === 'preview_ready' ? (
                    <div
                      className="pointer-events-none absolute rounded-sm border border-dashed border-white/70 shadow-[0_0_0_1000px_rgba(0,0,0,0.25)]"
                      style={{ top: `${HERO_SAFE_ZONE_RATIO * 100}%`, left: `${HERO_SAFE_ZONE_RATIO * 100}%`, right: `${HERO_SAFE_ZONE_RATIO * 100}%`, bottom: `${HERO_SAFE_ZONE_RATIO * 100}%` }}
                      title="Zona de segurança: mantenha o rosto/objeto principal dentro desta área, pois cortes 1:1 e menores recortam as bordas."
                    />
                  ) : null}
                </div>
                <div className="space-y-3 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Slot {slot}</span>
                    {asset?.status === 'ready' ? <Badge className="bg-emerald-500/15 text-emerald-600"><CheckCircle2 className="mr-1 h-3 w-3" />Aprovada</Badge> : asset ? <Badge variant="secondary">Aguardando validação</Badge> : <Badge variant="outline">Vazio</Badge>}
                  </div>
                  <Input id={`brand-photo-${slot}`} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFile(slot)} disabled={busy} />
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <label htmlFor={`brand-photo-${slot}`} className="cursor-pointer">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}{asset ? 'Refazer' : 'Enviar'}</label>
                    </Button>
                    {asset?.status === 'preview_ready' ? <Button size="sm" onClick={() => approveMutation.mutate(asset)} disabled={approveMutation.isPending}>Aprovar</Button> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
