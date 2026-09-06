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

async function createChromaPreview(file: File): Promise<Blob> {
  const image = await imageFromFile(file);
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Seu navegador não disponibilizou o processador de imagem.');

  context.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);
  const x = Math.round((canvas.width - width) / 2);
  const y = Math.round((canvas.height - height) / 2);
  context.drawImage(image, x, y, width, height);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    const dominance = green - Math.max(red, blue);
    if (green > 70 && dominance > 22) {
      const alpha = Math.max(0, 255 - Math.round((dominance - 22) * 5.2));
      pixels.data[index + 3] = Math.min(pixels.data[index + 3], alpha);
      if (alpha > 0) pixels.data[index + 1] = Math.min(green, Math.max(red, blue) + 12);
    }
  }
  context.putImageData(pixels, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Falha ao exportar a prévia WebP.')), 'image/webp', 0.86);
  });
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
        <CardDescription>Cadastre até 6 fotos. O fundo verde é removido, a imagem vira WebP 1200 × 675 e só é liberada depois da sua aprovação.</CardDescription>
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
                <div className="aspect-video bg-[linear-gradient(135deg,#111827_25%,#1f2937_25%,#1f2937_50%,#111827_50%,#111827_75%,#1f2937_75%)] bg-[length:24px_24px]">
                  {asset?.previewUrl ? <img src={asset.previewUrl} alt={`Prévia da foto ${slot}`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Foto {slot}</div>}
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
