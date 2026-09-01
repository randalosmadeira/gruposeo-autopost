import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Loader2, RefreshCcw, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const EDGE_ROOT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const API_URL = `${EDGE_ROOT}/supporter-avatar-public`;
const APPROVE_URL = `${EDGE_ROOT}/approve-supporter-avatar-final`;
const STORAGE_KEY = 'zica1470-supporter-avatar-v2';
const AI_DISCLOSURE = 'CONTEÚDO VISUAL EDITADO COM IA · OPENAI';

const supportTexts = ['DR. MADEIRA 1470', 'EU APOIO DR. MADEIRA 1470', 'APOIO AO DR. MADEIRA 1470', 'FEDERAL 1470', 'MADEIRA NELES 1470'];
const styleOptions = [
  { value: 'premium', label: 'Premium' },
  { value: 'clean', label: 'Clean' },
  { value: 'institucional', label: 'Institucional' },
  { value: 'brasil', label: 'Brasil' },
  { value: 'dark', label: 'Dark' },
];

type PublicSession = { requestId: string; token: string };
type StatusPayload = {
  request?: { status: string; source_count: number; generation_count: number; max_generations: number };
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

async function downloadLabeledPng(url: string, filename: string) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Falha ao carregar o arquivo final.');

  const sourceBlob = await response.blob();
  const bitmap = await createImageBitmap(sourceBlob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('O navegador não conseguiu preparar o arquivo final.');
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const barHeight = Math.max(48, Math.round(canvas.height * 0.06));
  const fontSize = Math.max(16, Math.round(canvas.height * 0.022));
  context.fillStyle = 'rgba(0, 0, 0, 0.82)';
  context.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);
  context.fillStyle = '#ffffff';
  context.font = `700 ${fontSize}px Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(AI_DISCLOSURE, canvas.width / 2, canvas.height - barHeight / 2, canvas.width * 0.94);

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
  const [supportText, setSupportText] = useState(supportTexts[1]);
  const [style, setStyle] = useState('premium');
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
  const currentStatus = status?.request?.status || (session ? 'uploading' : 'draft');
  const isProcessing = ['queued', 'processing'].includes(currentStatus);
  const canApprove = currentStatus === 'completed' && Boolean(finalOutput?.url);

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
      try {
        const payload = await api({ action: 'status', requestId: session.requestId, token: session.token });
        if (!cancelled) setStatus(payload);
      } catch {
        // A sessão pública pode ter expirado; a UI permanece sem expor detalhes internos.
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, isProcessing ? 3000 : 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session, isProcessing]);

  const onFiles = (incoming: FileList | null) => {
    const next = Array.from(incoming || []).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024);
    setFiles(next.slice(0, 4));
  };

  const createAndUpload = async () => {
    if (!supporterName.trim()) return toast({ title: 'Informe seu nome.', variant: 'destructive' });
    if (!files.length) return toast({ title: 'Envie pelo menos uma foto.', variant: 'destructive' });
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
          consentImageUse: true,
          consentTerms: true,
          consentPublicGallery: consentGallery,
        });
        active = { requestId: created.requestId, token: created.token };
        setSession(active);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      }

      for (const file of files) {
        const signed = await api({
          action: 'upload-url',
          requestId: active.requestId,
          token: active.token,
          mimeType: file.type,
          fileSize: file.size,
        });
        const { error } = await supabase.storage.from('supporter-avatar-uploads').uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
        if (error) throw error;
        await api({
          action: 'register-upload',
          requestId: active.requestId,
          token: active.token,
          path: signed.path,
          mimeType: file.type,
          fileSize: file.size,
        });
      }

      await api({ action: 'submit', requestId: active.requestId, token: active.token });
      setStatus(await api({ action: 'status', requestId: active.requestId, token: active.token }));
      setApprovePreview(false);
      setApprovedAt(null);
      toast({ title: 'Foto recebida.', description: 'A arte final entrou na fila de geração.' });
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
      await downloadLabeledPng(approved.url || finalOutput.url, `${safeFileName(supporterName)}-dr-madeira-1470-final.png`);
      toast({ title: 'Arquivo final aprovado.', description: 'O PNG final contém a identificação de edição por IA. O Zica.ai não publica em nenhuma rede social.' });
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
    <div className="min-h-screen bg-[#070a0d] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(212,255,0,0.10),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(0,240,255,0.08),transparent_25%),linear-gradient(180deg,#070a0d,#0d1117)]" />
      <main className="relative mx-auto max-w-5xl px-4 py-8 md:py-14">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-[#D4FF00]/30 bg-[#D4FF00]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#D4FF00]"><Sparkles className="h-4 w-4" /> Avatar de apoio</div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Sua foto. Seu apoio. <span className="text-[#D4FF00]">1470.</span></h1>
          <p className="mx-auto mt-4 max-w-3xl text-sm leading-6 text-slate-400 md:text-base">Envie sua própria fotografia, gere a arte, confira a prévia e baixe somente o arquivo final aprovado. O Zica.ai não acessa nem publica em suas redes sociais.</p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <Card className="border-white/10 bg-[#11161d]/95 text-white">
            <CardHeader>
              <CardTitle>1. Dados e fotografia</CardTitle>
              <CardDescription className="text-slate-400">Até 4 referências. JPG, PNG ou WebP, máximo de 10 MB por arquivo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Nome *</Label><Input value={supporterName} onChange={(event) => setSupporterName(event.target.value)} placeholder="Seu nome" className="border-white/10 bg-black/20" /></div>
                <div><Label>E-mail, opcional</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" className="border-white/10 bg-black/20" /></div>
                <div><Label>Cidade</Label><Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Sua cidade" className="border-white/10 bg-black/20" /></div>
                <div><Label>UF</Label><Input value={state} maxLength={2} onChange={(event) => setState(event.target.value.toUpperCase())} className="border-white/10 bg-black/20" /></div>
                <div><Label>Estilo</Label><Select value={style} onValueChange={setStyle}><SelectTrigger className="border-white/10 bg-black/20"><SelectValue /></SelectTrigger><SelectContent>{styleOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Texto de apoio</Label><Select value={supportText} onValueChange={setSupportText}><SelectTrigger className="border-white/10 bg-black/20"><SelectValue /></SelectTrigger><SelectContent>{supportTexts.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
              </div>

              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/20 p-7 text-center hover:border-[#D4FF00]/50">
                <Upload className="h-6 w-6 text-[#D4FF00]" />
                <strong>Escolher fotografias</strong>
                <span className="text-xs text-slate-400">{files.length ? `${files.length} arquivo(s) selecionado(s)` : '1 a 4 imagens'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => onFiles(event.target.files)} />
              </label>

              <div className="space-y-3 rounded-xl border border-white/10 bg-black/15 p-4 text-sm">
                <label className="flex items-start gap-3"><input type="checkbox" checked={consentImage} onChange={(event) => setConsentImage(event.target.checked)} className="mt-1" /><span>Autorizo o uso das fotografias enviadas exclusivamente para gerar esta arte de apoio.</span></label>
                <label className="flex items-start gap-3"><input type="checkbox" checked={consentTerms} onChange={(event) => setConsentTerms(event.target.checked)} className="mt-1" /><span>Declaro que as fotografias são minhas ou que possuo autorização para utilizá-las e aceito os termos da geração.</span></label>
                <label className="flex items-start gap-3"><input type="checkbox" checked={consentGallery} onChange={(event) => setConsentGallery(event.target.checked)} className="mt-1" /><span>Opcional: autorizo exibição posterior em galeria pública da campanha.</span></label>
                <p className="border-t border-white/10 pt-3 text-xs leading-5 text-slate-400">A arte é editada com inteligência artificial da OpenAI. A prévia e o PNG final exibem a identificação “{AI_DISCLOSURE}”.</p>
              </div>

              <Button className="h-12 w-full bg-[#D4FF00] font-black text-black hover:bg-[#c6ef00]" onClick={() => void createAndUpload()} disabled={busy || isProcessing}>
                {busy || isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Gerar arte final
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#11161d]/95 text-white">
            <CardHeader>
              <CardTitle>2. Prévia e arquivo final</CardTitle>
              <CardDescription className="text-slate-400">Apenas uma arte final é liberada para download. Não há publicação automática.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30">
                {finalOutput?.url ? (
                  <>
                    <img src={finalOutput.url} alt="Prévia da arte final 1470 editada com IA" className="h-full w-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/85 px-3 py-2 text-center text-[10px] font-bold tracking-wide text-white sm:text-xs">{AI_DISCLOSURE}</div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-500">{isProcessing ? 'A OpenAI está preparando a arte final...' : currentStatus === 'qa' ? 'A arte foi retida para revisão de qualidade.' : 'A prévia aparecerá aqui após a geração.'}</div>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                <div className="flex items-center justify-between"><span>Status</span><strong className="uppercase text-[#D4FF00]">{currentStatus}</strong></div>
                {status?.job?.error_message ? <div className="mt-2 text-xs text-red-300">{status.job.error_message}</div> : null}
                {finalOutput?.qa_score != null ? <div className="mt-2 text-xs text-slate-400">QA visual registrado: {finalOutput.qa_score}</div> : null}
              </div>

              {canApprove && (
                <label className="flex items-start gap-3 rounded-xl border border-[#D4FF00]/30 bg-[#D4FF00]/5 p-4 text-sm">
                  <input type="checkbox" checked={approvePreview} onChange={(event) => setApprovePreview(event.target.checked)} className="mt-1" />
                  <span>Conferi a prévia, inclusive a identificação de edição por IA, e aprovo esta arte como arquivo final para uso manual nas minhas redes sociais.</span>
                </label>
              )}

              <Button className="h-12 w-full" onClick={() => void approveAndDownload()} disabled={!canApprove || !approvePreview || downloading}>
                {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : approvedAt ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
                Aprovar e baixar arquivo final
              </Button>
              <Button variant="outline" className="w-full border-white/15 bg-transparent" onClick={() => void regenerate()} disabled={!session || busy || isProcessing}><RefreshCcw className="mr-2 h-4 w-4" /> Gerar outra versão</Button>
              <Button variant="ghost" className="w-full text-slate-400" onClick={() => void deleteRequest()} disabled={!session || busy}><Trash2 className="mr-2 h-4 w-4" /> Remover minha solicitação</Button>

              <div className="rounded-xl border border-white/10 p-4 text-xs leading-5 text-slate-400">
                <ShieldCheck className="mb-2 h-5 w-5 text-[#D4FF00]" />
                O arquivo entregue é PNG fotográfico em alta qualidade e recebe uma faixa de identificação de edição por IA antes do download. Uma fotografia não é convertida em SVG puro porque isso reduz a fidelidade facial e SVG não é formato de upload aceito de forma geral pelas redes sociais. O branding pode ter elementos vetoriais durante a composição, mas o arquivo final permanece rasterizado.
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
