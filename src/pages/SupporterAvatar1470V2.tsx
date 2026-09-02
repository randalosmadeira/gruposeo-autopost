import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, Download, Loader2, RefreshCcw, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const EDGE_ROOT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const API_URL = `${EDGE_ROOT}/supporter-avatar-public-v2`;
const APPROVE_URL = `${EDGE_ROOT}/approve-supporter-avatar-final`;
const STORAGE_KEY = 'zica1470-supporter-avatar-v5';
const AGENT_NAME = 'NEXUS PHOTO 1470';
const AI_DISCLOSURE = 'Imagem gerada por IA - Campanha Oficial';

const processingStates = new Set(['analyzing', 'candidate_selected', 'generating', 'qa', 'retry', 'regenerate']);
const statusLabels: Record<string, string> = {
  needs_input: 'Aguardando sua foto',
  uploaded: 'Foto recebida',
  analyzing: 'Analisando sua foto',
  candidate_selected: 'Composição definida pela IA',
  generating: 'Gerando as imagens',
  qa: 'Verificando fidelidade e qualidade',
  retry: 'Tentando novamente automaticamente',
  regenerate: 'Refazendo uma versão que não passou no QA',
  needs_review: 'Em revisão técnica',
  completed: 'Pronto para baixar',
  failed: 'Falha técnica terminal',
};

const outputLabels: Record<string, string> = {
  square: '1080 × 1080 · Instagram / WhatsApp / Facebook',
  portrait: '1080 × 1350 · Feed vertical',
  landscape: '1200 × 630 · Facebook / LinkedIn',
};

type Session = { requestId: string; token: string };
type Output = { platform: string; url: string; width: number; height: number; qa_score?: number | null };
type StatusPayload = {
  request?: {
    status: string;
    supporter_name?: string | null;
    city?: string | null;
    state?: string | null;
    source_count?: number;
    generation_count?: number;
    max_generations?: number;
  };
  job?: { stage?: string; status?: string } | null;
  outputs?: Output[];
};

type ApprovedOutput = { platform: string; url: string; width: number; height: number; qaScore?: number | null };

const errorLabels: Record<string, string> = {
  supporter_full_name_required: 'Informe nome e sobrenome.',
  supporter_email_invalid: 'Informe um e-mail válido.',
  supporter_whatsapp_invalid: 'Informe um WhatsApp válido com DDD.',
  required_consents_missing: 'Confirme os consentimentos obrigatórios.',
  upload_at_least_one_photo: 'Envie pelo menos uma fotografia sua.',
  generation_limit_reached: 'O limite de versões desta solicitação foi atingido.',
  daily_limit_reached: 'O limite diário deste dispositivo foi atingido.',
  request_not_found_or_expired: 'Esta sessão expirou. Inicie uma nova solicitação.',
  supporter_photo_not_usable: 'A foto não permite preservar sua aparência com segurança. Envie uma imagem mais nítida, bem iluminada e com o rosto visível.',
};

async function post(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(payload.error || `HTTP ${response.status}`);
    throw new Error(errorLabels[code] || String(payload.detail || code));
  }
  return payload;
}

const api = (body: Record<string, unknown>) => post(API_URL, body);
const fullNameOk = (value: string) => value.trim().split(/\s+/).filter((part) => part.length >= 2).length >= 2;
const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());
function localPhone(value: string) { let d = value.replace(/\D/g, ''); if (d.startsWith('55') && d.length > 11) d = d.slice(2); return d.slice(0, 11); }
const phoneOk = (value: string) => [10, 11].includes(localPhone(value).length);
function formatPhone(value: string) { const d = localPhone(value); if (d.length <= 2) return d; if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`; if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; }

export default function SupporterAvatar1470V2() {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [city, setCity] = useState('');
  const [uf, setUf] = useState('SP');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [consentImage, setConsentImage] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentGallery, setConsentGallery] = useState(false);
  const [approved, setApproved] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [approvedOutputs, setApprovedOutputs] = useState<ApprovedOutput[]>([]);
  const [busy, setBusy] = useState(false);

  const current = status?.request?.status || (session ? 'needs_input' : 'draft');
  const processing = processingStates.has(current);
  const outputs = useMemo(() => status?.outputs || [], [status]);
  const completePack = current === 'completed' && ['square', 'portrait', 'landscape'].every((platform) => outputs.some((item) => item.platform === platform));

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSession(JSON.parse(stored));
    } catch { /* ignore invalid local session */ }
  }, []);

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const data = await api({ action: 'status', requestId: session.requestId, token: session.token });
        if (!stopped) setStatus(data);
      } catch { /* expired sessions are handled when user submits */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, processing ? 3000 : 12000);
    return () => { stopped = true; clearInterval(timer); };
  }, [session, processing]);

  const validate = () => {
    if (!fullNameOk(name)) { toast({ title: 'Informe nome e sobrenome.', variant: 'destructive' }); return false; }
    if (!emailOk(email)) { toast({ title: 'Informe um e-mail válido.', variant: 'destructive' }); return false; }
    if (!phoneOk(whatsapp)) { toast({ title: 'Informe um WhatsApp válido com DDD.', variant: 'destructive' }); return false; }
    if (!session && files.length === 0) { toast({ title: 'Envie pelo menos uma foto sua.', variant: 'destructive' }); return false; }
    if (!consentImage || !consentTerms) { toast({ title: 'Confirme os consentimentos obrigatórios.', variant: 'destructive' }); return false; }
    return true;
  };

  const syncContact = async (active: Session) => api({ action: 'update-contact', requestId: active.requestId, token: active.token, supporterName: name, email, whatsapp, city, state: uf });

  const generate = async () => {
    if (!validate()) return;
    setBusy(true);
    setApprovedOutputs([]);
    try {
      let active = session;
      if (!active) {
        const created = await api({
          action: 'create',
          supporterName: name,
          email,
          whatsapp,
          city,
          state: uf,
          style: 'premium',
          supportText: 'EU APOIO DR. MADEIRA 1470',
          consentImageUse: true,
          consentTerms: true,
          consentPublicGallery: consentGallery,
        });
        active = { requestId: created.requestId, token: created.token };
        setSession(active);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      } else {
        await syncContact(active);
      }

      if (files.length) {
        const { supabase } = await import('@/integrations/supabase/client');
        for (const file of files) {
          const signed = await api({ action: 'upload-url', requestId: active.requestId, token: active.token, mimeType: file.type, fileSize: file.size });
          const { error } = await supabase.storage.from('supporter-avatar-uploads').uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
          if (error) throw error;
          await api({ action: 'register-upload', requestId: active.requestId, token: active.token, path: signed.path, mimeType: file.type, fileSize: file.size });
        }
      }

      await api({ action: 'submit', requestId: active.requestId, token: active.token });
      setStatus(await api({ action: 'status', requestId: active.requestId, token: active.token }));
      setApproved(false);
      toast({ title: 'Fotos recebidas', description: 'A IA está analisando sua foto e escolherá, de forma privada, a referência do candidato mais compatível.' });
    } catch (error) {
      toast({ title: 'Não foi possível iniciar a geração', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    if (!session || !fullNameOk(name) || !emailOk(email) || !phoneOk(whatsapp)) return;
    setBusy(true);
    setApprovedOutputs([]);
    try {
      await syncContact(session);
      await api({ action: 'regenerate', requestId: session.requestId, token: session.token });
      setStatus(await api({ action: 'status', requestId: session.requestId, token: session.token }));
      setApproved(false);
    } catch (error) {
      toast({ title: 'Não foi possível refazer agora', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const releaseDownloads = async () => {
    if (!session || !approved || !completePack) return;
    setBusy(true);
    try {
      const data = await post(APPROVE_URL, { requestId: session.requestId, token: session.token });
      setApprovedOutputs(Array.isArray(data.outputs) ? data.outputs : []);
    } catch (error) {
      toast({ title: 'Falha ao liberar os arquivos', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await api({ action: 'delete', requestId: session.requestId, token: session.token });
      localStorage.removeItem(STORAGE_KEY);
      setSession(null);
      setStatus(null);
      setFiles([]);
      setApproved(false);
      setApprovedOutputs([]);
    } finally {
      setBusy(false);
    }
  };

  const selectFiles = (list: FileList | null) => setFiles(Array.from(list || []).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024).slice(0, 3));

  return (
    <div className="min-h-screen bg-[#070a0d] text-white">
      <main className="mx-auto max-w-5xl px-4 py-8 md:py-14">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-[#D4FF00]/30 bg-[#D4FF00]/10 px-4 py-2 text-xs font-black uppercase tracking-[.16em] text-[#D4FF00]"><Camera className="h-4 w-4" />{AGENT_NAME}</div>
          <h1 className="text-3xl font-black sm:text-5xl">Sua foto com <span className="text-[#D4FF00]">Dr. Madeira 1470</span></h1>
          <p className="mx-auto mt-4 max-w-3xl text-sm leading-6 text-slate-400">Você envia somente sua própria foto. As fotos oficiais do candidato ficam privadas. A IA analisa enquadramento, luz e pose e escolhe automaticamente a referência mais compatível para a montagem.</p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <Card className="border-white/10 bg-[#11161d]/95 text-white">
            <CardHeader>
              <CardTitle>1. Envie sua foto</CardTitle>
              <CardDescription className="text-slate-400">Prefira rosto visível, boa luz e imagem nítida. Você pode enviar até 3 fotos e a IA escolherá tecnicamente a melhor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#D4FF00]/35 bg-[#D4FF00]/5 p-6 text-center hover:bg-[#D4FF00]/10">
                <Upload className="mb-3 h-8 w-8 text-[#D4FF00]" />
                <span className="font-bold">Envie sua foto aqui</span>
                <span className="mt-1 text-xs text-slate-400">JPG, PNG ou WebP, até 10 MB por foto</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(event) => selectFiles(event.target.files)} />
              </label>

              {previews.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {previews.map((url, index) => <img key={url} src={url} alt={`Sua foto ${index + 1}`} className="aspect-square w-full rounded-xl object-cover" />)}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label>Nome e sobrenome *</Label><Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="border-white/10 bg-black/20" /></div>
                <div><Label>E-mail *</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="border-white/10 bg-black/20" /></div>
                <div><Label>WhatsApp *</Label><Input type="tel" value={whatsapp} onChange={(event) => setWhatsapp(formatPhone(event.target.value))} autoComplete="tel" className="border-white/10 bg-black/20" /></div>
                <div><Label>Cidade</Label><Input value={city} onChange={(event) => setCity(event.target.value)} className="border-white/10 bg-black/20" /></div>
                <div><Label>UF</Label><Input value={uf} onChange={(event) => setUf(event.target.value.toUpperCase().slice(0, 2))} maxLength={2} className="border-white/10 bg-black/20" /></div>
              </div>

              <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                <label className="flex items-start gap-3"><input type="checkbox" checked={consentImage} onChange={(event) => setConsentImage(event.target.checked)} className="mt-1" /><span>Autorizo o uso das fotos que enviei para gerar esta composição de campanha.</span></label>
                <label className="flex items-start gap-3"><input type="checkbox" checked={consentTerms} onChange={(event) => setConsentTerms(event.target.checked)} className="mt-1" /><span>Li e concordo com os termos de uso e tratamento da imagem.</span></label>
                <label className="flex items-start gap-3"><input type="checkbox" checked={consentGallery} onChange={(event) => setConsentGallery(event.target.checked)} className="mt-1" /><span>Opcional: autorizo que a composição final aprovada seja exibida em galeria da campanha.</span></label>
              </div>

              <Button onClick={generate} disabled={busy || processing} className="h-12 w-full bg-[#D4FF00] font-black text-black hover:bg-[#c6ef00]">
                {busy || processing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
                {processing ? statusLabels[current] : 'Gerar Minha Foto com o Candidato'}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-[#11161d]/95 text-white">
            <CardHeader>
              <CardTitle>2. Geração automática</CardTitle>
              <CardDescription className="text-slate-400">A IA escolhe a foto do candidato internamente. Nenhuma galeria, URL, ID ou arquivo privado é enviado ao navegador.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-3"><div className={`h-3 w-3 rounded-full ${current === 'completed' ? 'bg-green-400' : current === 'needs_review' ? 'bg-amber-400' : current === 'failed' ? 'bg-red-400' : 'bg-[#D4FF00]'}`} /><div><div className="font-bold">{statusLabels[current] || 'Aguardando início'}</div><div className="mt-1 text-xs text-slate-500">Photo Intake → Candidate Selector → Identity Guardian → Composition → Lighting → Scene → Social Crop → QA</div></div></div>
              </div>

              {current === 'needs_review' && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">A imagem não foi liberada automaticamente porque algum critério técnico não atingiu o padrão. O registro foi preservado para revisão e não foi convertido em falha definitiva.</div>
              )}

              {outputs.length > 0 && (
                <div className="space-y-3">
                  {outputs.sort((a, b) => ['square', 'portrait', 'landscape'].indexOf(a.platform) - ['square', 'portrait', 'landscape'].indexOf(b.platform)).map((output) => (
                    <div key={output.platform} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                      <img src={output.url} alt={outputLabels[output.platform] || output.platform} className="w-full object-contain" />
                      <div className="flex items-center justify-between gap-3 p-3"><div><div className="text-sm font-bold">{outputLabels[output.platform] || output.platform}</div>{typeof output.qa_score === 'number' && <div className="text-xs text-slate-500">QA de fidelidade: {output.qa_score}</div>}</div><CheckCircle2 className="h-5 w-5 text-green-400" /></div>
                    </div>
                  ))}
                </div>
              )}

              {completePack && (
                <>
                  <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-300"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} className="mt-1" /><span>Aprovo esta composição e quero liberar os arquivos finais para minhas redes sociais.</span></label>
                  <Button onClick={releaseDownloads} disabled={!approved || busy} className="w-full"><Download className="mr-2 h-4 w-4" />Liberar downloads</Button>
                </>
              )}

              {approvedOutputs.length > 0 && (
                <div className="space-y-2 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                  {approvedOutputs.map((output) => <a key={output.platform} href={output.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-3 text-sm font-semibold hover:bg-white/10"><span>{outputLabels[output.platform] || `${output.width} × ${output.height}`}</span><Download className="h-4 w-4" /></a>)}
                </div>
              )}

              {session && !processing && current !== 'completed' && (
                <Button variant="outline" onClick={regenerate} disabled={busy} className="w-full"><RefreshCcw className="mr-2 h-4 w-4" />Gerar outra tentativa</Button>
              )}

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-xs leading-5 text-cyan-100"><ShieldCheck className="mb-2 h-5 w-5" />Suas fotos são privadas. A referência escolhida do candidato também permanece privada. O resultado contém o aviso: {AI_DISCLOSURE}.</div>

              {session && <Button variant="ghost" onClick={remove} disabled={busy} className="w-full text-red-300 hover:text-red-200"><Trash2 className="mr-2 h-4 w-4" />Excluir minha solicitação e arquivos</Button>}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
