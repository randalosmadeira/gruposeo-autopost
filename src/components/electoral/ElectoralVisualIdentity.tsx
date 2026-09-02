import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, ShieldCheck, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  asset_kind: 'reference' | 'generated' | string;
  storage_path: string;
  status: string;
  is_default: boolean;
  alt_text: string | null;
  overlay_config: Record<string, unknown> | null;
  width: number | null;
  height: number | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  signedUrl?: string;
};

type OutputFormat = 'square' | 'landscape' | 'portrait';

const OUTPUT_FORMATS = [
  { id: 'landscape', name: 'Artigo / Open Graph', size: '1536×1024', ratio: '3:2' },
  { id: 'square', name: 'Feed quadrado', size: '1024×1024', ratio: '1:1' },
  { id: 'portrait', name: 'Stories / Reels / vertical', size: '1024×1536', ratio: '2:3' },
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
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAlt, setDraftAlt] = useState('');
  const [primaryOverlay, setPrimaryOverlay] = useState('DR. MADEIRA 1470');
  const [secondaryOverlay, setSecondaryOverlay] = useState('DEPUTADO FEDERAL');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('square');
  const [aiPrompt, setAiPrompt] = useState('Criar peça eleitoral premium e fotorealista, preservando fielmente a identidade da pessoa nas fotos de referência. Fundo contemporâneo em verde profundo, preto e detalhes amarelo-lima, composição limpa, forte e adequada a mobile.');
  const db = supabase as any;

  const referenceAssets = useMemo(() => assets.filter((asset) => asset.asset_kind === 'reference' && asset.status !== 'archived'), [assets]);
  const generatedAssets = useMemo(() => assets.filter((asset) => asset.asset_kind === 'generated' && asset.status !== 'archived'), [assets]);
  const readiness = Math.min(100, (referenceAssets.length / 4) * 100);

  const loadAssets = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from('electoral_visual_assets')
        .select('id,asset_kind,storage_path,status,is_default,alt_text,overlay_config,width,height,metadata,created_at')
        .eq('user_id', user.id)
        .eq('campaign_preset_id', campaignPresetId)
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
          metadata: { source: 'operator-upload', exifPublishingPolicy: 'strip-on-output', syntheticMedia: false },
        });
        if (insertError) {
          await supabase.storage.from('electoral-assets').remove([path]);
          throw insertError;
        }
      }
      toast({ title: 'Referências adicionadas', description: 'Já podem ser usadas pelo gerador de IA.' });
      await loadAssets();
    } catch (error) {
      toast({ title: 'Falha no upload', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const approveAsset = async (asset: Asset) => {
    if (!user) return;
    try {
      if (asset.asset_kind === 'reference') {
        await db.from('electoral_visual_assets').update({ is_default: false }).eq('user_id', user.id).eq('campaign_preset_id', campaignPresetId).eq('asset_kind', 'reference');
      }
      const { error } = await db.from('electoral_visual_assets').update({ status: 'approved', is_default: asset.asset_kind === 'reference', approved_at: new Date().toISOString() }).eq('id', asset.id).eq('user_id', user.id);
      if (error) throw error;
      toast({ title: asset.asset_kind === 'generated' ? 'Imagem gerada aprovada' : 'Foto padrão atualizada' });
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

  const generateWithAI = async () => {
    if (!user) return;
    if (!referenceAssets.length) {
      toast({ title: 'Adicione ao menos uma foto de referência.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada.');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-electoral-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          campaignPresetId,
          projectId: projectId || null,
          referenceAssetIds: referenceAssets.map((asset) => asset.id),
          prompt: aiPrompt,
          primaryOverlay,
          secondaryOverlay,
          politicalParty,
          ballotName,
          ballotNumber,
          outputFormat,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        if (payload?.code === 'openai_credit_balance_exhausted') {
          throw new Error('A OpenAI está conectada, mas a conta está sem créditos para gerar imagens. Adicione saldo na API e tente novamente.');
        }
        throw new Error(payload?.error || `Falha HTTP ${response.status}`);
      }
      toast({ title: 'Imagem gerada com IA', description: payload.promptReviewedByClaude ? 'GPT-Image-2 gerou a peça após revisão de prompt pelo Claude.' : 'GPT-Image-2 gerou a peça.' });
      await loadAssets();
    } catch (error) {
      toast({ title: 'Falha na geração por IA', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const renderAssetCard = (asset: Asset, index: number) => (
    <Card key={asset.id} className={asset.is_default ? 'border-primary' : ''}>
      <CardContent className="space-y-3 p-3">
        <div className="relative aspect-square overflow-hidden rounded-md border bg-muted">
          {asset.signedUrl ? <img src={asset.signedUrl} alt={asset.alt_text || `Imagem ${index + 1}`} className="h-full w-full object-cover" /> : null}
          <div className="absolute left-2 top-2 flex gap-1"><Badge>#{index + 1}</Badge><Badge variant="outline">{asset.asset_kind === 'generated' ? 'IA' : 'REF'}</Badge>{asset.is_default && <Badge>PADRÃO</Badge>}</div>
        </div>
        <div className="text-xs text-muted-foreground">{asset.width && asset.height ? `${asset.width}×${asset.height}` : 'dimensões não lidas'} · {asset.status}</div>
        {editingId === asset.id && <div className="space-y-2"><Label>Alt-text</Label><Input value={draftAlt} onChange={(event) => setDraftAlt(event.target.value)} placeholder={asset.alt_text || 'Descrição semântica'} /></div>}
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="sm" onClick={() => void approveAsset(asset)}><CheckCircle2 className="mr-1 h-3 w-3" /> APROVAR</Button>
          <Button size="sm" variant="outline" onClick={() => { setEditingId(asset.id); setDraftAlt(asset.alt_text || ''); }}>EDITAR</Button>
          <Button size="sm" variant="outline" disabled={editingId !== asset.id} onClick={() => void saveEdits(asset)}>GRAVAR</Button>
          <Button size="sm" variant="destructive" onClick={() => void deleteAsset(asset)}><Trash2 className="mr-1 h-3 w-3" /> EXCLUIR</Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5" /> Identidade visual — referências privadas</CardTitle>
          <CardDescription>Use de 1 a 4 fotos. O gerador real usa as referências no GPT-Image-2; Claude pode revisar o prompt antes da renderização.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><div className="flex items-center justify-between text-xs"><span>Referências</span><strong>{referenceAssets.length}/4</strong></div><Progress value={readiness} /></div>
          <div className="grid gap-3 md:grid-cols-2"><div><Label>Overlay principal</Label><Input value={primaryOverlay} onChange={(event) => setPrimaryOverlay(event.target.value)} /></div><div><Label>Overlay secundário</Label><Input value={secondaryOverlay} onChange={(event) => setSecondaryOverlay(event.target.value)} /></div></div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm hover:bg-muted/40">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}{uploading ? 'Enviando...' : 'Adicionar fotos de referência'}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={uploading || referenceAssets.length >= 4} onChange={(event) => void uploadReferences(event.target.files)} />
          </label>
        </CardContent>
      </Card>

      {loading ? <div className="text-sm text-muted-foreground">Carregando ativos...</div> : referenceAssets.length > 0 && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{referenceAssets.map(renderAssetCard)}</div>}

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><WandSparkles className="h-5 w-5" /> Pedir para a IA gerar imagem</CardTitle>
          <CardDescription>NEXUS VISUAL STUDIO → Claude Sonnet 4.6 revisa o prompt → GPT-Image-2 usa suas fotos como referência.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div><Label>O que você quer criar?</Label><Textarea rows={5} value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Ex.: retrato editorial em pé, fundo verde e preto, identidade Madeira 1470..." /></div>
          <div className="grid gap-3 md:grid-cols-2"><div><Label>Formato</Label><Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as OutputFormat)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OUTPUT_FORMATS.map((format) => <SelectItem key={format.id} value={format.id}>{format.name} · {format.size}</SelectItem>)}</SelectContent></Select></div><div className="flex items-end"><Button className="h-10 w-full" disabled={generating || referenceAssets.length === 0 || !aiPrompt.trim()} onClick={() => void generateWithAI()}>{generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> GERANDO...</> : <><Sparkles className="mr-2 h-4 w-4" /> GERAR COM IA</>}</Button></div></div>
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">Não é mais necessário cadastrar exatamente quatro fotos nem configurar FaceID/LoRA. Uma referência já habilita a geração; 2–4 referências tendem a dar mais contexto visual. A peça gerada é registrada como mídia sintética e continua sujeita à aprovação humana.</div>
        </CardContent>
      </Card>

      {generatedAssets.length > 0 && <Card><CardHeader><CardTitle className="text-base">Imagens geradas pela IA</CardTitle><CardDescription>Revise e aprove antes de vincular a artigo ou publicar.</CardDescription></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{generatedAssets.map(renderAssetCard)}</div></CardContent></Card>}

      <Card><CardHeader><CardTitle className="text-base">Formatos de saída</CardTitle><CardDescription>O master gerado fica sem EXIF; safe-zone e overlay permanecem registrados nos metadados.</CardDescription></CardHeader><CardContent className="grid gap-2 md:grid-cols-3">{OUTPUT_FORMATS.map((format) => <div key={format.id} className="rounded-md border p-3 text-sm"><strong>{format.name}</strong><div className="text-xs text-muted-foreground">{format.size} · {format.ratio}</div></div>)}</CardContent></Card>
    </div>
  );
}
