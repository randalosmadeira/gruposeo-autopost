import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  campaignPresetId: string;
  projectId?: string | null;
  ballotName: string;
  ballotNumber: string;
  politicalParty: string;
}

type Asset = {
  id: string;
  storage_path: string;
  status: string;
  is_default: boolean;
  alt_text: string | null;
  overlay_config: Record<string, unknown> | null;
  width: number | null;
  height: number | null;
  created_at: string;
  signedUrl?: string;
};

const OUTPUT_FORMATS = [
  { name: 'Discover / Open Graph', size: '1200×630', ratio: '1.91:1' },
  { name: 'Artigo 16:9', size: '1200×675', ratio: '16:9' },
  { name: 'Reels / Shorts / Stories', size: '1080×1920', ratio: '9:16' },
  { name: 'Feed quadrado', size: '1080×1080', ratio: '1:1' },
] as const;

function safeFileName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-');
}

async function imageDimensions(file: File) {
  try {
    const bitmap = await createImageBitmap(file);
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  } catch {
    return { width: null, height: null };
  }
}

export function ElectoralVisualIdentity({ campaignPresetId, projectId, ballotName, ballotNumber, politicalParty }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAlt, setDraftAlt] = useState('');
  const [primaryOverlay, setPrimaryOverlay] = useState('DR. MADEIRA 1470');
  const [secondaryOverlay, setSecondaryOverlay] = useState('FEDERAL 1470');
  const db = supabase as any;

  const referenceAssets = useMemo(() => assets.filter((asset) => asset.status !== 'archived'), [assets]);
  const readiness = Math.min(100, (referenceAssets.length / 4) * 100);

  const loadAssets = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from('electoral_visual_assets')
        .select('id,storage_path,status,is_default,alt_text,overlay_config,width,height,created_at')
        .eq('user_id', user.id)
        .eq('campaign_preset_id', campaignPresetId)
        .eq('asset_kind', 'reference')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows: Asset[] = data || [];
      const withUrls = await Promise.all(rows.map(async (asset) => {
        const { data: signed } = await supabase.storage.from('electoral-assets').createSignedUrl(asset.storage_path, 3600);
        return { ...asset, signedUrl: signed?.signedUrl };
      }));
      setAssets(withUrls);
    } catch (error) {
      toast({ title: 'Falha ao carregar identidade visual', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAssets(); }, [user?.id, campaignPresetId]);

  const uploadReferences = async (files: FileList | null) => {
    if (!user || !files?.length) return;
    const remaining = Math.max(0, 4 - referenceAssets.length);
    const selected = Array.from(files).slice(0, remaining);
    if (!selected.length) {
      toast({ title: 'As 4 referências já foram cadastradas.' });
      return;
    }
    setUploading(true);
    try {
      for (const file of selected) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`Formato não permitido: ${file.name}`);
        if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} excede 15 MB.`);
        const path = `${user.id}/${campaignPresetId}/references/${crypto.randomUUID()}-${safeFileName(file.name)}`;
        const { error: storageError } = await supabase.storage.from('electoral-assets').upload(path, file, { upsert: false, contentType: file.type });
        if (storageError) throw storageError;
        const dimensions = await imageDimensions(file);
        const { error: insertError } = await db.from('electoral_visual_assets').insert({
          user_id: user.id,
          project_id: projectId || null,
          campaign_preset_id: campaignPresetId,
          asset_kind: 'reference',
          status: 'ready',
          storage_path: path,
          width: dimensions.width,
          height: dimensions.height,
          mime_type: file.type,
          file_size_bytes: file.size,
          alt_text: `Foto de referência da identidade visual de ${ballotName} ${ballotNumber}`,
          overlay_config: { primary: primaryOverlay, secondary: secondaryOverlay, safeZone: true },
          metadata: { source: 'operator-upload', exifPublishingPolicy: 'strip-on-output', faceTrainingConsentRequired: true },
        });
        if (insertError) {
          await supabase.storage.from('electoral-assets').remove([path]);
          throw insertError;
        }
      }
      toast({ title: 'Referências adicionadas', description: 'Arquivos privados; nenhuma imagem foi publicada.' });
      await loadAssets();
    } catch (error) {
      toast({ title: 'Falha no upload', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const approveAsDefault = async (asset: Asset) => {
    if (!user) return;
    try {
      await db.from('electoral_visual_assets').update({ is_default: false }).eq('user_id', user.id).eq('campaign_preset_id', campaignPresetId);
      const { error } = await db.from('electoral_visual_assets').update({ status: 'approved', is_default: true, approved_at: new Date().toISOString() }).eq('id', asset.id).eq('user_id', user.id);
      if (error) throw error;
      toast({ title: 'Ativo visual padrão atualizado' });
      await loadAssets();
    } catch (error) {
      toast({ title: 'Falha ao aprovar', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    }
  };

  const saveEdits = async (asset: Asset) => {
    if (!user) return;
    const { error } = await db.from('electoral_visual_assets').update({
      alt_text: draftAlt.trim() || asset.alt_text,
      overlay_config: { primary: primaryOverlay, secondary: secondaryOverlay, safeZone: true },
      updated_at: new Date().toISOString(),
    }).eq('id', asset.id).eq('user_id', user.id);
    if (error) {
      toast({ title: 'Falha ao gravar', description: error.message, variant: 'destructive' });
      return;
    }
    setEditingId(null);
    toast({ title: 'Metadados gravados' });
    await loadAssets();
  };

  const archiveAsset = async (asset: Asset) => {
    if (!user) return;
    await db.from('electoral_visual_assets').update({ status: 'archived', is_default: false }).eq('id', asset.id).eq('user_id', user.id);
    await loadAssets();
  };

  const deleteAsset = async (asset: Asset) => {
    if (!user) return;
    const { error: dbError } = await db.from('electoral_visual_assets').delete().eq('id', asset.id).eq('user_id', user.id);
    if (dbError) {
      toast({ title: 'Falha ao excluir', description: dbError.message, variant: 'destructive' });
      return;
    }
    await supabase.storage.from('electoral-assets').remove([asset.storage_path]);
    await loadAssets();
  };

  const queueGeneration = async () => {
    if (!user) return;
    if (referenceAssets.length !== 4) {
      toast({ title: 'Cadastre exatamente 4 referências antes de preparar o job.', variant: 'destructive' });
      return;
    }
    const { error } = await db.from('electoral_image_jobs').insert({
      user_id: user.id,
      project_id: projectId || null,
      campaign_preset_id: campaignPresetId,
      status: 'provider_not_configured',
      provider: 'unconfigured',
      generation_mode: 'face-reference',
      fidelity_preference: 0.96,
      reference_asset_ids: referenceAssets.map((asset) => asset.id),
      overlay_config: { primary: primaryOverlay, secondary: secondaryOverlay, safeZone: true, party: politicalParty },
      prompt_context: 'Gerar variações fotorealistas preservando identidade; sem alterar fatos visuais ou criar contexto enganoso. Remover metadados EXIF dos arquivos finais.',
    });
    if (error) {
      toast({ title: 'Falha ao preparar job', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Job visual preparado',
      description: 'As 4 referências e formatos foram registrados. Falta configurar um provedor GPU/FaceID/LoRA para executar a geração.',
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5" /> Identidade visual — referências privadas</CardTitle>
          <CardDescription>Até 4 fotos base. O valor 0,96 é preferência do job, não garantia matemática de semelhança. A aprovação visual continua humana.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs"><span>Referências</span><strong>{referenceAssets.length}/4</strong></div>
            <Progress value={readiness} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Overlay principal</Label><Input value={primaryOverlay} onChange={(event) => setPrimaryOverlay(event.target.value)} /></div>
            <div><Label>Overlay secundário</Label><Input value={secondaryOverlay} onChange={(event) => setSecondaryOverlay(event.target.value)} /></div>
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm hover:bg-muted/40">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {uploading ? 'Enviando...' : 'Adicionar fotos de referência'}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={uploading || referenceAssets.length >= 4} onChange={(event) => void uploadReferences(event.target.files)} />
          </label>
        </CardContent>
      </Card>

      {loading ? <div className="text-sm text-muted-foreground">Carregando ativos...</div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {referenceAssets.map((asset, index) => (
            <Card key={asset.id} className={asset.is_default ? 'border-primary' : ''}>
              <CardContent className="space-y-3 p-3">
                <div className="relative aspect-square overflow-hidden rounded-md border bg-muted">
                  {asset.signedUrl ? <img src={asset.signedUrl} alt={asset.alt_text || `Referência ${index + 1}`} className="h-full w-full object-cover" /> : null}
                  <div className="absolute left-2 top-2 flex gap-1"><Badge>#{index + 1}</Badge>{asset.is_default && <Badge variant="default">PADRÃO</Badge>}</div>
                </div>
                <div className="text-xs text-muted-foreground">{asset.width && asset.height ? `${asset.width}×${asset.height}` : 'dimensões não lidas'} · {asset.status}</div>
                {editingId === asset.id && (
                  <div className="space-y-2">
                    <Label>Alt-text</Label>
                    <Input value={draftAlt} onChange={(event) => setDraftAlt(event.target.value)} placeholder={asset.alt_text || 'Descrição semântica'} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  <Button size="sm" onClick={() => void approveAsDefault(asset)}>APROVAR</Button>
                  <Button size="sm" variant="secondary" onClick={() => void approveAsDefault(asset)}>ACEITAR</Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditingId(asset.id); setDraftAlt(asset.alt_text || ''); }}>EDITAR</Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditingId(asset.id); setDraftAlt(asset.alt_text || ''); }}>MODIFICAR</Button>
                  <Button size="sm" variant="outline" onClick={() => { setDraftAlt(''); setPrimaryOverlay('DR. MADEIRA 1470'); setSecondaryOverlay('FEDERAL 1470'); }}>LIMPAR</Button>
                  <Button size="sm" variant="outline" disabled={editingId !== asset.id} onClick={() => void saveEdits(asset)}>GRAVAR</Button>
                  <Button size="sm" variant="ghost" onClick={() => void archiveAsset(asset)}>REMOVER</Button>
                  <Button size="sm" variant="destructive" onClick={() => void deleteAsset(asset)}><Trash2 className="mr-1 h-3 w-3" /> EXCLUIR</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Formatos de saída</CardTitle><CardDescription>Os arquivos finais deverão ser reprocessados sem EXIF e com safe-zone de overlay.</CardDescription></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {OUTPUT_FORMATS.map((format) => <div key={format.name} className="rounded-md border p-3 text-sm"><strong>{format.name}</strong><div className="text-xs text-muted-foreground">{format.size} · {format.ratio}</div></div>)}
        </CardContent>
      </Card>

      <Card className="border-amber-500/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm">
            <strong>FaceID/LoRA:</strong> referências e job estão prontos para integração. Um provedor GPU ainda precisa ser configurado para treinamento/geração real.
          </div>
          <Button onClick={() => void queueGeneration} disabled={referenceAssets.length !== 4}>
            <Sparkles className="mr-2 h-4 w-4" /> PREPARAR JOB 0,96
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
