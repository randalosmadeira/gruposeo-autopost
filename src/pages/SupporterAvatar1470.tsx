import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, Download, Loader2, RefreshCcw, ShieldCheck, Sparkles, Trash2, Upload, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const EDGE_ROOT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const API_URL = `${EDGE_ROOT}/supporter-avatar-public`;
const APPROVE_URL = `${EDGE_ROOT}/approve-supporter-avatar-final`;
const PRESETS_URL = `${EDGE_ROOT}/supporter-avatar-candidate-assets`;
const STORAGE_KEY = 'zica1470-supporter-avatar-v3';
const AI_DISCLOSURE = 'CONTEÚDO VISUAL EDITADO COM IA · OPENAI';
const AGENT_NAME = 'NEXUS PHOTO 1470';

const supportTexts = [
  'Madeiraaa Nelesss! 🪵 1470',
  'DR. MADEIRA 1470',
  'EU APOIO DR. MADEIRA 1470',
  'APOIO AO DR. MADEIRA 1470',
  'FEDERAL 1470',
];

const styleOptions = [
  { value: 'premium', label: 'Premium' },
  { value: 'clean', label: 'Clean' },
  { value: 'institucional', label: 'Institucional' },
  { value: 'brasil', label: 'Brasil' },
  { value: 'dark', label: 'Dark' },
];

const outputFormats = [
  { value: 'instagram-profile', label: 'Instagram · foto de perfil', dimensions: '320 × 320', width: 320, height: 320, circular: true },
  { value: 'whatsapp-profile', label: 'WhatsApp · foto de perfil', dimensions: '192 × 192', width: 192, height: 192, circular: true },
  { value: 'feed-square', label: 'Feed · quadrado', dimensions: '1080 × 1080', width: 1080, height: 1080 },
  { value: 'feed-portrait', label: 'Feed Instagram · retrato 4:5', dimensions: '1080 × 1350', width: 1080, height: 1350 },
  { value: 'feed-landscape', label: 'Feed · horizontal', dimensions: '1080 × 566', width: 1080, height: 566 },
  { value: 'stories-reels-status', label: 'Stories · Reels · Status', dimensions: '1080 × 1920', width: 1080, height: 1920 },
] as const;

type CandidatePreset = {
  slug: string;
  label: string;
  wardrobe: string;
  prop: string;
  sort_order?: number;
  previewUrl: string;
};

type PublicSession = { requestId: string; token: string };
type StatusPayload = {
  request?: {
    status: string;
    source_count: number;
    generation_count: number;
    max_generations: number;
    candidate_preset_slug?: string;
    output_format?: string;
  };
  candidatePreset?: { slug: string; label: string; wardrobe: string; prop: string } | null;
  outputSpec?: { exactWidth?: number; exactHeight?: number; label?: string };
  job?: { status?: string; stage?: string; error_message?: string } | null;
  outputs?: Array<{ platform: string; url: string; width?: number; height?: number; qa_score?: number | null }>;
};

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

const api = (body: Record<string, unknown>) => postJson(API_URL, body);
const approveFinal = (body: Record<string, unknown>) => postJson(APPROVE_URL, body);

function safeFileName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'apoiador';
}

function drawCover(context: CanvasRenderingContext2D, bitmap: ImageBitmap, width: number, height: number) {
  const sourceRatio = bitmap.width / bitmap.height;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (sourceRatio > targetRatio) {
    sw = bitmap.height * targetRatio;
    sx = (bitmap.width - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = bitmap.width / targetRatio;
    sy = (bitmap.height - sh) / 2;
  }
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
}

async function downloadFinalPng(url: string, filename: string, width: number, height: number) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Falha ao carregar o arquivo final.');
  const sourceBlob = await response.blob();
  const bitmap = await createImageBitmap(sourceBlob);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('O navegador não conseguiu preparar o arquivo final.');
  }

  drawCover(context, bitmap, width, height);
  bitmap.close();

  const barHeight = Math.max(14, Math.round(height * 0.045));
  const fontSize = Math.max(7, Math.round(Math.min(width, height) * 0.015));
  context.fillStyle = 'rgba(0, 0, 0, 0.82)';
  context.fillRect(0, height - barHeight, width, barHeight);
  context.fillStyle = '#ffffff';
  context.font = `700 ${fontSize}px Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(AI_DISCLOSURE, width / 2, height - barHeight / 2, width * 0.94);

  const outputBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Falha ao finalizar o PNG.')), 'image/png', 1);
  });
  const objectUrl = URL.createObjectURL(outputBlob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function SupporterAvatar1470() {
  const { toast } = useToast();
  const [supporterName, setSupporterName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('SP');
  const [email, setEmail] = useState('');
  const [supportText, setSupportText] = useState(supportTexts[0]);
  const [style, setStyle] = useState('premium');
  const [outputFormat, setOutputFormat] = useState('feed-square');
  const [presets, setPresets] = useState<CandidatePreset[]>([]);
  const [candidatePresetSlug, setCandidatePresetSlug] = useState('');
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [consentImage, setConsentImage] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentGallery, setConsentGallery] = useState(false);
  const [approvePreview, setApprovePreview] = useState(false);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const finalOutput = useMemo(() => status?.outputs?.find((output) => output.platform === 'master') || null, [status]);
  const selectedPreset = useMemo(() => presets.find((item) => item.slug === candidatePresetSlug) || null, [presets, candidatePresetSlug]);
  const selectedFormat = useMemo(() => outputFormats.find((item) => item.value === outputFormat) || outputFormats[2], [outputFormat]);
  const currentStatus = status?.request?.status || (session ? 'uploading' : 'draft');
  const isProcessing = ['queued', 'processing'].includes(currentStatus);
  const canApprove = currentStatus === 'completed' && Boolean(finalOutput?.url);
  const lockedSelection = Boolean(session);

  useEffect(() => {
    let cancelled = false;
    const loadPresets = async () => {
      try {
        const response = await fetch(PRESETS_URL);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.presets)) throw new Error(payload.error || 'preset_list_unavailable');
        if (!cancelled) {
          setPresets(payload.presets);
          setCandidatePresetSlug((current) => current || payload.presets[0]?.slug || '');
        }
      } catch {
        if (!cancelled) toast({ title: 'Fotos oficiais indisponíveis', description: 'Tente novamente em instantes.', variant: 'destructive' });
      } finally {
        if (!cancelled) setPresetsLoading(false);
      }
    };
    void loadPresets();
    return () => { cancelled = true; };
  }, [toast]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSession(JSON.parse(stored));
    } catch {
      // localStorage pode estar indisponível em modo privado/restrito.
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const payload = await api({ action: 'status', requestId: session.requestId, token: session.token });
        if (!cancelled) {
          setStatus(payload);
          if (payload.request?.candidate_preset_slug) setCandidatePresetSlug(payload.request.candidate_preset_slug);
          if (payload.request?.output_format) setOutputFormat(payload.request.output_format);
        }
      } catch {
        // Sessão expirada permanece silenciosa para não expor detalhes internos.
      }
    };
    void refresh();
    if (!isProcessing) return () => { cancelled = true; };
    const timer = window.setInterval(refresh, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session, isProcessing]);

  const onFiles = (incoming: FileList | null) => {
    const next = Array.from(incoming || []).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024);
    setFiles(next.slice(0, 4));
    if (next.length) void import('@/integrations/supabase/client');
  };

  const createAndUpload = async () => {
    if (!supporterName.trim()) return toast({ title: 'Informe seu nome.', variant: 'destructive' });
    if (!candidatePresetSlug) return toast({ title: 'Escolha uma foto oficial do Dr. Madeira.', variant: 'destructive' });
    if (!files.length) return toast({ title: 'Envie pelo menos uma foto sua.', variant: 'destructive' });
    if (!consentImage || !consentTerms) return toast({ title: 'Confirme os consentimentos obrigatórios.', variant: 'destructive' });

    setBusy(true);
    try {
      let active = session;
      if (!active) {
        const created = await api({
          action: 'create',
          supporterName,
          city,
          state,
          email,
          supportText,
          style,
          candidatePresetSlug,
          outputFormat,
          consentImageUse: true,
          consentTerms: true,
          consentPublicGallery: consentGallery,
        });
        active = { requestId: created.requestId, token: created.token };
        setSession(active);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      }

      const { supabase } = await import('@/integrations/supabase/client');
      for (const file of files) {
        const signed = await api({ action: 'upload-url', requestId: active.requestId, token: active.token, mimeType: file.type, fileSize: file.size });
        const { error } = await supabase.storage.from('supporter-avatar-uploads').uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
        if (error) throw error;
        await api({ action: 'register-upload', requestId: active.requestId, token: active.token, path: signed.path, mimeType: file.type, fileSize: file.size });
      }

      await api({ action: 'submit', requestId: active.requestId, token: active.token });
      setStatus(await api({ action: 'status', requestId: active.requestId, token: active.token }));
      setApprovePreview(false);
      setApprovedAt(null);
      toast({ title: `${AGENT_NAME} iniciou a composição`, description: 'Sua foto e a referência oficial escolhida foram enviadas para edição.' });
    } catch (error) {
      toast({ title: 'Não foi possível iniciar a geração', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await api({ action: 'regenerate', requestId: session.requestId, token: session.token });
      setStatus(await api({ action: 'status', requestId: session.requestId, token: session.token }));
      setApprovePreview(false);
      setApprovedAt(null);
    } catch (error) {
      toast({ title: 'Não foi possível gerar outra versão', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const approveAndDownload = async () => {
    if (!session || !finalOutput?.url || !approvePreview) return;
    setDownloading(true);
    try {
      const approved = await approveFinal({ requestId: session.requestId, token: session.token });
      setApprovedAt(approved.approvedAt || new Date().toISOString());
      const exactWidth = Number(status?.outputSpec?.exactWidth || selectedFormat.width);
      const exactHeight = Number(status?.outputSpec?.exactHeight || selectedFormat.height);
      await downloadFinalPng(
        approved.url || finalOutput.url,
        `${safeFileName(supporterName)}-madeiraaa-nelesss-1470-${outputFormat}.png`,
        exactWidth,
        exactHeight,
      );
      toast({ title: 'Arquivo final aprovado.', description: `${exactWidth} × ${exactHeight}px. O Zica.ai não publica em nenhuma rede social.` });
    } catch (error) {
      toast({ title: 'Falha ao liberar o arquivo final', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  const deleteRequest = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await api({ action: 'delete', requestId: session.requestId, token: session.token });
      localStorage.removeItem(STORAGE_KEY);
      setSession(null);
      setStatus(null);
      setFiles([]);
      setApprovePreview(false);
      setApprovedAt(null);
      toast({ title: 'Solicitação e arquivos removidos.' });
    } catch (error) {
      toast({ title: 'Falha ao remover', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#070a0d] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_15%_10%,rgba(212,255,0,0.10),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(0,240,255,0.07),transparent_28%)]" />
      <main className="relative mx-auto max-w-6xl px-4 py-6 md:py-14">
        <header className="mb-6 text-center md:mb-8">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-[#D4FF00]/30 bg-[#D4FF00]/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#D4FF00] sm:px-4 sm:text-xs"><Camera className="h-4 w-4" /> {AGENT_NAME}</div>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">Madeiraaa Nelesss! <span className="text-[#D4FF00]">🪵 1470</span></h1>
          <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-400 md:mt-4 md:text-base">Escolha uma foto oficial do Dr. Madeira, envie sua própria fotografia, selecione o formato e gere uma composição conjunta. Você confere a prévia e baixa somente o arquivo aprovado.</p>
        </header>

        <Card className="mb-5 border-white/10 bg-[#11161d]/95 text-white md:mb-6">
          <CardHeader className="pb-4">
            <CardTitle>1. Escolha a foto oficial</CardTitle>
            <CardDescription className="text-slate-400">As referências oficiais ficam fixas no sistema. Depois que a solicitação começa, a escolha é bloqueada para manter rastreabilidade.</CardDescription>
          </CardHeader>
          <CardContent>
            {presetsLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando fotos oficiais...</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {presets.map((preset, index) => {
                  const selected = candidatePresetSlug === preset.slug;
                  return (
                    <button
                      type="button"
                      key={preset.slug}
                      disabled={lockedSelection}
                      onClick={() => setCandidatePresetSlug(preset.slug)}
                      className={`group overflow-hidden rounded-2xl border text-left ${selected ? 'border-[#D4FF00] ring-2 ring-[#D4FF00]/20' : 'border-white/10 hover:border-white/30'} ${lockedSelection ? 'cursor-not-allowed opacity-80' : ''}`}
                    >
                      <div className="aspect-[4/5] overflow-hidden bg-black/30">
                        <img
                          src={preset.previewUrl}
                          alt={preset.label}
                          loading={index === 0 ? 'eager' : 'lazy'}
                          decoding="async"
                          fetchPriority={index === 0 ? 'high' : 'low'}
                          sizes="(max-width: 639px) 92vw, (max-width: 1023px) 46vw, 272px"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2"><strong className="text-sm">{preset.label}</strong>{selected ? <CheckCircle2 className="h-4 w-4 text-[#D4FF00]" /> : null}</div>
                        <div className="mt-1 text-[11px] text-slate-500">{preset.wardrobe.replace('-', ' ')} · {preset.prop.replace('-', ' ')}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr] lg:gap-6">
          <Card className="border-white/10 bg-[#11161d]/95 text-white" style={{ contentVisibility: 'auto', containIntrinsicSize: '900px' }}>
            <CardHeader>
              <CardTitle>2. Sua foto e formato</CardTitle>
              <CardDescription className="text-slate-400">Envie de 1 a 4 fotos suas. O agente escolhe a melhor referência técnica do seu rosto.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Nome *</Label><Input value={supporterName} onChange={(event) => setSupporterName(event.target.value)} placeholder="Seu nome" className="border-white/10 bg-black/20" /></div>
                <div><Label>E-mail, opcional</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" className="border-white/10 bg-black/20" /></div>
                <div><Label>Cidade</Label><Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Sua cidade" className="border-white/10 bg-black/20" /></div>
                <div><Label>UF</Label><Input value={state} maxLength={2} onChange={(event) => setState(event.target.value.toUpperCase())} className="border-white/10 bg-black/20" /></div>
                <div><Label>Estilo</Label><Select value={style} onValueChange={setStyle} disabled={lockedSelection}><SelectTrigger className="border-white/10 bg-black/20"><SelectValue /></SelectTrigger><SelectContent>{styleOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Slogan</Label><Select value={supportText} onValueChange={setSupportText} disabled={lockedSelection}><SelectTrigger className="border-white/10 bg-black/20"><SelectValue /></SelectTrigger><SelectContent>{supportTexts.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
              </div>

              <div>
                <Label>Formato do arquivo final</Label>
                <Select value={outputFormat} onValueChange={setOutputFormat} disabled={lockedSelection}>
                  <SelectTrigger className="mt-1 border-white/10 bg-black/20"><SelectValue /></SelectTrigger>
                  <SelectContent>{outputFormats.map((item) => <SelectItem key={item.value} value={item.value}>{item.label} · {item.dimensions}px</SelectItem>)}</SelectContent>
                </Select>
                <div className="mt-2 rounded-lg border border-[#00F0FF]/15 bg-[#00F0FF]/5 p-3 text-xs leading-5 text-slate-400">
                  <strong className="text-[#00F0FF]">Zona segura:</strong> rosto, slogan e 1470 ficam concentrados no centro. Em Stories/Reels/Status, o agente reserva margens superiores e inferiores para a interface dos aplicativos. Em fotos de perfil, a composição considera o recorte circular.
                </div>
              </div>

              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/20 p-6 text-center hover:border-[#D4FF00]/50 sm:p-7">
                <Upload className="h-6 w-6 text-[#D4FF00]" />
                <strong>Escolher minhas fotografias</strong>
                <span className="text-xs text-slate-400">{files.length ? `${files.length} arquivo(s) selecionado(s)` : 'JPG, PNG ou WebP · máximo 10 MB cada'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => onFiles(event.target.files)} />
              </label>

              {selectedPreset ? <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/15 p-3"><UserRound className="h-5 w-5 text-[#D4FF00]" /><div><div className="text-sm font-bold">Modelo escolhido: {selectedPreset.label}</div><div className="text-xs text-slate-500">Arquivo final: {selectedFormat.dimensions}px</div></div></div> : null}

              <div className="space-y-3 rounded-xl border border-white/10 bg-black/15 p-4 text-sm">
                <label className="flex items-start gap-3"><input type="checkbox" checked={consentImage} onChange={(event) => setConsentImage(event.target.checked)} className="mt-1" /><span>Autorizo o uso das fotografias enviadas exclusivamente para gerar esta arte.</span></label>
                <label className="flex items-start gap-3"><input type="checkbox" checked={consentTerms} onChange={(event) => setConsentTerms(event.target.checked)} className="mt-1" /><span>Declaro que as fotografias são minhas ou que possuo autorização para utilizá-las e aceito os termos da geração.</span></label>
                <label className="flex items-start gap-3"><input type="checkbox" checked={consentGallery} onChange={(event) => setConsentGallery(event.target.checked)} className="mt-1" /><span>Opcional: autorizo exibição posterior em galeria pública da campanha.</span></label>
                <p className="border-t border-white/10 pt-3 text-xs leading-5 text-slate-400">A arte é editada com IA da OpenAI. O download recebe a identificação “{AI_DISCLOSURE}”.</p>
              </div>

              <Button className="h-12 w-full bg-[#D4FF00] font-black text-black hover:bg-[#c6ef00]" onClick={() => void createAndUpload()} disabled={busy || isProcessing || presetsLoading}>
                {busy || isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Gerar com {AGENT_NAME}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#11161d]/95 text-white" style={{ contentVisibility: 'auto', containIntrinsicSize: '720px' }}>
            <CardHeader>
              <CardTitle>3. Prévia e download</CardTitle>
              <CardDescription className="text-slate-400">Apenas o formato escolhido é entregue. Não há publicação automática.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30">
                {finalOutput?.url ? (
                  <>
                    <img src={finalOutput.url} alt="Prévia da composição Madeiraaa Nelesss 1470" loading="lazy" decoding="async" className="h-full w-full object-contain" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/85 px-3 py-2 text-center text-[10px] font-bold tracking-wide text-white sm:text-xs">{AI_DISCLOSURE}</div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-500">{isProcessing ? `${AGENT_NAME} está renderizando sua composição...` : currentStatus === 'qa' ? 'A arte foi retida para revisão de qualidade.' : 'A prévia aparecerá aqui após a geração.'}</div>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                <div className="flex items-center justify-between"><span>Status</span><strong className="uppercase text-[#D4FF00]">{currentStatus}</strong></div>
                <div className="mt-2 text-xs text-slate-400">Preset: {status?.candidatePreset?.label || selectedPreset?.label || 'aguardando'}</div>
                <div className="mt-1 text-xs text-slate-400">Saída: {status?.outputSpec?.label || selectedFormat.label} · {status?.outputSpec?.exactWidth || selectedFormat.width} × {status?.outputSpec?.exactHeight || selectedFormat.height}px</div>
                {status?.job?.error_message ? <div className="mt-2 text-xs text-red-300">{status.job.error_message}</div> : null}
                {finalOutput?.qa_score != null ? <div className="mt-2 text-xs text-slate-400">QA visual do apoiador: {finalOutput.qa_score}</div> : null}
              </div>

              {canApprove && (
                <label className="flex items-start gap-3 rounded-xl border border-[#D4FF00]/30 bg-[#D4FF00]/5 p-4 text-sm">
                  <input type="checkbox" checked={approvePreview} onChange={(event) => setApprovePreview(event.target.checked)} className="mt-1" />
                  <span>Conferi a prévia e aprovo esta composição como arquivo final para baixar e publicar manualmente nas minhas redes sociais.</span>
                </label>
              )}

              <Button className="h-12 w-full" onClick={() => void approveAndDownload()} disabled={!canApprove || !approvePreview || downloading}>
                {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : approvedAt ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                Aprovar e baixar {selectedFormat.dimensions}px
              </Button>
              <Button variant="outline" className="w-full border-white/15 bg-transparent" onClick={() => void regenerate()} disabled={!session || busy || isProcessing}><RefreshCcw className="mr-2 h-4 w-4" /> Gerar outra versão</Button>
              <Button variant="ghost" className="w-full text-slate-400" onClick={() => void deleteRequest()} disabled={!session || busy}><Trash2 className="mr-2 h-4 w-4" /> Remover minha solicitação</Button>

              <div className="rounded-xl border border-white/10 p-4 text-xs leading-5 text-slate-400">
                <ShieldCheck className="mb-2 h-5 w-5 text-[#D4FF00]" />
                O arquivo entregue é PNG fotográfico. A foto do apoiador e a foto oficial do candidato são tratadas como pessoas independentes: o agente recebe instrução explícita para não misturar rostos ou corpos. O arquivo final é rasterizado porque esse é o formato compatível com publicação nas redes sociais.
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
