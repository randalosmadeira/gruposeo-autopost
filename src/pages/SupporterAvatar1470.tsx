import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import {
  CheckCircle2,
  Download,
  ImageIcon,
  Instagram,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/supporter-avatar-public`;
const STORAGE_KEY = 'zica1470-supporter-avatar-v1';

const supportTexts = [
  'DR. MADEIRA 1470',
  'EU APOIO DR. MADEIRA 1470',
  'APOIO AO DR. MADEIRA 1470',
  'FEDERAL 1470',
  'MADEIRA NELES 1470',
];

const styleOptions = [
  { value: 'premium', label: 'Premium' },
  { value: 'clean', label: 'Clean' },
  { value: 'institucional', label: 'Institucional' },
  { value: 'brasil', label: 'Brasil' },
  { value: 'dark', label: 'Dark' },
];

const exportProfiles = {
  whatsapp: { label: 'WhatsApp', width: 640, height: 640 },
  instagram: { label: 'Instagram', width: 320, height: 320 },
  facebook: { label: 'Facebook', width: 320, height: 320 },
  tiktok: { label: 'TikTok', width: 400, height: 400 },
  master: { label: 'Master HD', width: 1080, height: 1080 },
} as const;

type Platform = keyof typeof exportProfiles;

type PublicSession = { requestId: string; token: string };

type StatusPayload = {
  request?: {
    status: string;
    source_count: number;
    generation_count: number;
    max_generations: number;
  };
  job?: { status?: string; stage?: string; error_message?: string } | null;
  outputs?: Array<{ platform: string; url: string; qa_score?: number | null }>;
};

async function api(body: Record<string, unknown>) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function sanitizeFileName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'apoiador';
}

async function resizeBlob(sourceUrl: string, width: number, height: number) {
  const response = await fetch(sourceUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('Falha ao carregar a arte final.');
  const sourceBlob = await response.blob();
  const objectUrl = URL.createObjectURL(sourceBlob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Falha ao decodificar a imagem.'));
      element.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas indisponível.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Falha ao exportar imagem.')), 'image/png', 1);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SupporterAvatar1470() {
  const { toast } = useToast();
  const [supporterName, setSupporterName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('SP');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [youtube, setYoutube] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [supportText, setSupportText] = useState(supportTexts[1]);
  const [style, setStyle] = useState('premium');
  const [files, setFiles] = useState<File[]>([]);
  const [consentImage, setConsentImage] = useState(false);
  const [consentSocial, setConsentSocial] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentGallery, setConsentGallery] = useState(false);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<Platform | 'all' | null>(null);

  const master = useMemo(() => status?.outputs?.find((output) => output.platform === 'master') || null, [status]);
  const currentStatus = status?.request?.status || (session ? 'uploading' : 'draft');
  const isProcessing = ['queued', 'processing'].includes(currentStatus);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSession(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const payload = await api({ action: 'status', requestId: session.requestId, token: session.token });
        if (!cancelled) setStatus(payload);
      } catch { /* request may have expired */ }
    };
    refresh();
    const timer = window.setInterval(refresh, isProcessing ? 3500 : 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [session, isProcessing]);

  const onFiles = (incoming: FileList | null) => {
    const next = Array.from(incoming || []).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024);
    setFiles(next.slice(0, 4));
  };

  const createAndUpload = async () => {
    if (!supporterName.trim()) return toast({ title: 'Informe seu nome.', variant: 'destructive' });
    if (!files.length) return toast({ title: 'Envie pelo menos uma foto.', variant: 'destructive' });
    if (!consentImage || !consentSocial || !consentTerms) return toast({ title: 'Confirme os consentimentos obrigatórios.', variant: 'destructive' });

    setBusy(true);
    try {
      let activeSession = session;
      if (!activeSession) {
        const created = await api({
          action: 'create', supporterName, city, state, email, whatsapp, supportText, style,
          socialHandles: { instagram, facebook, tiktok, youtube, x: xHandle },
          consentImageUse: consentImage,
          consentSocialLinking: consentSocial,
          consentTerms,
          consentPublicGallery: consentGallery,
        });
        activeSession = { requestId: created.requestId, token: created.token };
        setSession(activeSession);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(activeSession));
      }

      for (const file of files) {
        const signed = await api({ action: 'upload-url', requestId: activeSession.requestId, token: activeSession.token, mimeType: file.type, fileSize: file.size });
        const { error: uploadError } = await supabase.storage.from('supporter-avatar-uploads').uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        await api({ action: 'register-upload', requestId: activeSession.requestId, token: activeSession.token, path: signed.path, mimeType: file.type, fileSize: file.size });
      }

      await api({ action: 'submit', requestId: activeSession.requestId, token: activeSession.token });
      const next = await api({ action: 'status', requestId: activeSession.requestId, token: activeSession.token });
      setStatus(next);
      toast({ title: 'Fotos recebidas.', description: 'A montagem entrou na fila de geração.' });
    } catch (error) {
      toast({ title: 'Não foi possível iniciar a montagem', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
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
    } catch (error) {
      toast({ title: 'Não foi possível regerar', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const downloadPlatform = async (platform: Platform) => {
    if (!master?.url) return;
    setDownloading(platform);
    try {
      const spec = exportProfiles[platform];
      const blob = await resizeBlob(master.url, spec.width, spec.height);
      triggerDownload(blob, `${sanitizeFileName(supporterName)}-dr-madeira-1470-${platform}-${spec.width}x${spec.height}.png`);
    } catch (error) {
      toast({ title: 'Falha no download', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setDownloading(null); }
  };

  const downloadAll = async () => {
    if (!master?.url) return;
    setDownloading('all');
    try {
      const zip = new JSZip();
      for (const [platform, spec] of Object.entries(exportProfiles) as Array<[Platform, typeof exportProfiles[Platform]]>) {
        const blob = await resizeBlob(master.url, spec.width, spec.height);
        zip.file(`${sanitizeFileName(supporterName)}-1470-${platform}-${spec.width}x${spec.height}.png`, blob);
      }
      zip.file('LEIA-ME.txt', 'Artes geradas a partir de foto fornecida pelo próprio apoiador. As plataformas podem aplicar compressão e recorte circular. Mantenha o arquivo master como cópia de maior resolução.');
      triggerDownload(await zip.generateAsync({ type: 'blob' }), `${sanitizeFileName(supporterName)}-kit-avatar-1470.zip`);
    } catch (error) {
      toast({ title: 'Falha ao montar o ZIP', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setDownloading(null); }
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
      toast({ title: 'Solicitação e arquivos removidos.' });
    } catch (error) {
      toast({ title: 'Falha ao remover', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#070a0d] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(212,255,0,0.10),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(0,240,255,0.08),transparent_25%),linear-gradient(180deg,#070a0d,#0d1117)]" />
      <main className="relative mx-auto max-w-6xl px-4 py-8 md:py-14">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-[#D4FF00]/30 bg-[#D4FF00]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#D4FF00]">
            <Sparkles className="h-4 w-4" /> Avatar de apoio
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">Sua foto. Seu apoio. <span className="text-[#D4FF00]">1470.</span></h1>
          <p className="mx-auto mt-4 max-w-3xl text-sm leading-6 text-slate-400 md:text-base">
            Envie sua própria foto, escolha o estilo e gere um avatar quadrado preparado para WhatsApp, Instagram, Facebook e TikTok. A edição prioriza preservação dos traços humanos e exige sua validação visual.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <Card className="border-white/10 bg-[#11161d]/95 text-white shadow-2xl">
            <CardHeader>
              <CardTitle>1. Monte seu perfil</CardTitle>
              <CardDescription className="text-slate-400">Os @ ficam vinculados à sua solicitação; nenhuma senha de rede social é solicitada.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Nome *</Label><Input value={supporterName} onChange={(e) => setSupporterName(e.target.value)} placeholder="Seu nome" className="border-white/10 bg-black/20" /></div>
                <div><Label>WhatsApp</Label><Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 99999-9999" className="border-white/10 bg-black/20" /></div>
                <div><Label>Cidade</Label><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Sua cidade" className="border-white/10 bg-black/20" /></div>
                <div><Label>UF</Label><Input value={state} maxLength={2} onChange={(e) => setState(e.target.value.toUpperCase())} className="border-white/10 bg-black/20" /></div>
                <div className="sm:col-span-2"><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" className="border-white/10 bg-black/20" /></div>
              </div>

              <div>
                <Label className="mb-2 block">Vincule seus perfis públicos</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@instagram" className="border-white/10 bg-black/20" />
                  <Input value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder="Facebook @ ou URL" className="border-white/10 bg-black/20" />
                  <Input value={tiktok} onChange={(e) => setTiktok(e.target.value)} placeholder="@tiktok" className="border-white/10 bg-black/20" />
                  <Input value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="@youtube" className="border-white/10 bg-black/20" />
                  <Input value={xHandle} onChange={(e) => setXHandle(e.target.value)} placeholder="@X" className="border-white/10 bg-black/20 sm:col-span-2" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Mensagem de apoio</Label><Select value={supportText} onValueChange={setSupportText}><SelectTrigger className="border-white/10 bg-black/20"><SelectValue /></SelectTrigger><SelectContent>{supportTexts.map((text) => <SelectItem value={text} key={text}>{text}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Estilo</Label><Select value={style} onValueChange={setStyle}><SelectTrigger className="border-white/10 bg-black/20"><SelectValue /></SelectTrigger><SelectContent>{styleOptions.map((item) => <SelectItem value={item.value} key={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
              </div>

              <div>
                <Label>Fotos de referência *</Label>
                <label className="mt-2 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#D4FF00]/35 bg-[#D4FF00]/5 p-5 text-center hover:bg-[#D4FF00]/10">
                  <Upload className="mb-2 h-7 w-7 text-[#D4FF00]" />
                  <span className="font-bold">Escolher até 4 fotos</span>
                  <span className="mt-1 text-xs text-slate-500">JPG, PNG ou WebP · até 10 MB cada</span>
                  <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onFiles(e.target.files)} />
                </label>
                {files.length > 0 && <div className="mt-2 text-xs text-slate-400">{files.length} foto(s): {files.map((file) => file.name).join(', ')}</div>}
              </div>

              <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                {[
                  [consentImage, setConsentImage, 'Autorizo usar as fotos enviadas apenas para gerar minhas artes personalizadas.'],
                  [consentSocial, setConsentSocial, 'Autorizo vincular os @ informados à minha solicitação.'],
                  [consentTerms, setConsentTerms, 'Confirmo que sou titular das fotos ou tenho autorização para utilizá-las.'],
                  [consentGallery, setConsentGallery, 'Opcional: autorizo exibir a arte final em um mural público de apoiadores.'],
                ].map(([checked, setter, label], index) => (
                  <label key={index} className="flex cursor-pointer items-start gap-3">
                    <input type="checkbox" checked={checked as boolean} onChange={(e) => (setter as (value: boolean) => void)(e.target.checked)} className="mt-1 h-4 w-4 accent-[#D4FF00]" />
                    <span className="text-slate-300">{label as string}</span>
                  </label>
                ))}
              </div>

              <Button onClick={createAndUpload} disabled={busy || isProcessing} className="h-12 w-full bg-[#D4FF00] font-black text-black hover:bg-[#c6ef00]">
                {busy || isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
                {isProcessing ? 'Gerando sua arte...' : 'Gerar meu avatar 1470'}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="overflow-hidden border-white/10 bg-[#11161d]/95 text-white shadow-2xl">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3"><span>2. Prévia</span><span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold uppercase text-slate-400">{currentStatus}</span></CardTitle>
                <CardDescription className="text-slate-400">O rosto e o branding ficam dentro da zona segura para recorte circular.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="aspect-square overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                  {master?.url ? (
                    <img src={master.url} alt="Prévia do avatar de apoio" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center px-8 text-center text-slate-500">
                      {isProcessing ? <Loader2 className="mb-4 h-10 w-10 animate-spin text-[#D4FF00]" /> : <ImageIcon className="mb-4 h-10 w-10" />}
                      <p className="font-bold text-slate-300">{isProcessing ? 'Processando sua fotografia' : 'Sua prévia aparecerá aqui'}</p>
                      <p className="mt-2 text-xs">A geração preserva o original em bucket privado e cria um master separado.</p>
                    </div>
                  )}
                </div>
                {master?.qa_score != null && <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-400">QA visual automatizado: <strong className="text-white">{master.qa_score}/100</strong>. Essa nota não é uma medição biométrica de identidade; valide visualmente sua própria foto.</div>}

                {master?.url && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {(Object.keys(exportProfiles) as Platform[]).filter((key) => key !== 'master').map((platform) => (
                      <Button variant="outline" key={platform} onClick={() => downloadPlatform(platform)} disabled={Boolean(downloading)} className="border-white/10 bg-transparent">
                        {downloading === platform ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        {exportProfiles[platform].label}
                      </Button>
                    ))}
                    <Button onClick={downloadAll} disabled={Boolean(downloading)} className="col-span-2 bg-white font-bold text-black hover:bg-slate-200">{downloading === 'all' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Baixar kit completo ZIP</Button>
                    <Button variant="outline" onClick={regenerate} disabled={busy || (status?.request?.generation_count || 0) >= (status?.request?.max_generations || 3)} className="border-white/10 bg-transparent"><RefreshCcw className="mr-2 h-4 w-4" /> Ajustar / regerar</Button>
                    <Button variant="outline" onClick={deleteRequest} disabled={busy} className="border-red-500/20 bg-transparent text-red-300 hover:bg-red-500/10"><Trash2 className="mr-2 h-4 w-4" /> Excluir meus dados</Button>
                  </div>
                )}

                {currentStatus === 'provider_not_configured' && <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">Motor de imagem ainda sem chave OpenAI configurada no backend. Seus arquivos permanecem privados e a solicitação pode ser retomada depois.</div>}
                {currentStatus === 'qa' && <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">A arte foi gerada, mas o QA automático recomendou revisão. Confira seus traços e use “Ajustar / regerar” se necessário.</div>}
                {status?.job?.error_message && <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">{status.job.error_message}</div>}
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><ShieldCheck className="mb-2 h-5 w-5 text-[#D4FF00]" /><div className="text-sm font-bold">Originais privados</div><div className="mt-1 text-xs text-slate-500">Bucket privado e links temporários.</div></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><CheckCircle2 className="mb-2 h-5 w-5 text-[#D4FF00]" /><div className="text-sm font-bold">Traços preservados</div><div className="mt-1 text-xs text-slate-500">Sem promessa biométrica; você valida o resultado.</div></div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><Smartphone className="mb-2 h-5 w-5 text-[#D4FF00]" /><div className="text-sm font-bold">Kit multirrede</div><div className="mt-1 text-xs text-slate-500">Exportações quadradas e zona circular segura.</div></div>
            </div>
          </div>
        </div>

        <footer className="mt-10 border-t border-white/10 pt-6 text-center text-xs leading-5 text-slate-600">
          Ferramenta voluntária de criação de avatar. O sistema não solicita senha das redes sociais e não publica em nome do usuário. Fotos e @ são tratados conforme os consentimentos informados. <Instagram className="ml-1 inline h-3 w-3" />
        </footer>
      </main>
    </div>
  );
}
