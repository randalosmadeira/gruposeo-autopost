import { useEffect, useMemo, useState } from 'react';
import { Camera, Download, Loader2, RefreshCcw, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const EDGE_ROOT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const API_URL = `${EDGE_ROOT}/supporter-avatar-public-v2`;
const APPROVE_URL = `${EDGE_ROOT}/approve-supporter-avatar-final`;
const PRESETS_URL = `${EDGE_ROOT}/supporter-avatar-candidate-assets`;
const STORAGE_KEY = 'zica1470-supporter-avatar-v4';
const AGENT_NAME = 'NEXUS PHOTO 1470';
const AI_DISCLOSURE = 'CONTEÚDO VISUAL EDITADO COM IA · OPENAI';

const slogans = ['Madeiraaa Nelesss! 🪵 1470', 'DR. MADEIRA 1470', 'EU APOIO DR. MADEIRA 1470', 'APOIO AO DR. MADEIRA 1470', 'FEDERAL 1470'];
const styles = ['premium', 'clean', 'institucional', 'brasil', 'dark'];
const formats = [
  ['instagram-profile', 'Instagram · foto de perfil', '320 × 320'],
  ['whatsapp-profile', 'WhatsApp · foto de perfil', '192 × 192'],
  ['feed-square', 'Feed · quadrado', '1080 × 1080'],
  ['feed-portrait', 'Feed Instagram · retrato 4:5', '1080 × 1350'],
  ['feed-landscape', 'Feed · horizontal', '1080 × 566'],
  ['stories-reels-status', 'Stories · Reels · Status', '1080 × 1920'],
] as const;

type Preset = { slug: string; label: string; wardrobe: string; prop: string; previewUrl: string };
type Session = { requestId: string; token: string };
type Status = {
  request?: { status: string; supporter_name?: string | null; email?: string | null; whatsapp?: string | null; city?: string | null; state?: string | null; candidate_preset_slug?: string; output_format?: string };
  candidatePreset?: { label: string } | null;
  outputSpec?: { label?: string };
  job?: { error_message?: string } | null;
  outputs?: Array<{ platform: string; url: string; qa_score?: number | null }>;
};

const errorLabels: Record<string, string> = {
  supporter_full_name_required: 'Informe nome e sobrenome.',
  supporter_email_invalid: 'Informe um e-mail válido.',
  supporter_whatsapp_invalid: 'Informe um WhatsApp válido com DDD.',
  required_consents_missing: 'Confirme os consentimentos obrigatórios.',
  upload_at_least_one_photo: 'Envie pelo menos uma fotografia.',
  generation_limit_reached: 'O limite de versões desta solicitação foi atingido.',
  daily_limit_reached: 'O limite diário deste dispositivo foi atingido.',
  request_not_found_or_expired: 'Esta sessão expirou. Inicie uma nova solicitação.',
};

async function post(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
  const [style, setStyle] = useState('premium');
  const [slogan, setSlogan] = useState(slogans[0]);
  const [format, setFormat] = useState('feed-square');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [preset, setPreset] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [consentImage, setConsentImage] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentGallery, setConsentGallery] = useState(false);
  const [approved, setApproved] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingPresets, setLoadingPresets] = useState(true);

  const output = useMemo(() => status?.outputs?.find((item) => item.platform === 'master') || null, [status]);
  const current = status?.request?.status || (session ? 'uploading' : 'draft');
  const processing = ['queued', 'processing'].includes(current);
  const canDownload = current === 'completed' && Boolean(output?.url);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);

  useEffect(() => {
    fetch(PRESETS_URL).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) })).then(({ ok, data }) => {
      if (!ok || !Array.isArray(data.presets)) throw new Error();
      setPresets(data.presets); setPreset(data.presets[0]?.slug || '');
    }).catch(() => toast({ title: 'Fotos oficiais indisponíveis', variant: 'destructive' })).finally(() => setLoadingPresets(false));
    try { const stored = localStorage.getItem(STORAGE_KEY); if (stored) setSession(JSON.parse(stored)); } catch { /* ignore */ }
  }, [toast]);

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const data = await api({ action: 'status', requestId: session.requestId, token: session.token });
        if (stopped) return;
        setStatus(data);
        if (data.request?.supporter_name) setName(data.request.supporter_name);
        if (data.request?.email) setEmail(data.request.email);
        if (data.request?.whatsapp) setWhatsapp(formatPhone(data.request.whatsapp));
        if (data.request?.city) setCity(data.request.city);
        if (data.request?.state) setUf(data.request.state);
        if (data.request?.candidate_preset_slug) setPreset(data.request.candidate_preset_slug);
        if (data.request?.output_format) setFormat(data.request.output_format);
      } catch { /* session may have expired */ }
    };
    void refresh();
    if (!processing) return () => { stopped = true; };
    const timer = window.setInterval(refresh, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [session, processing]);

  const validate = () => {
    if (!fullNameOk(name)) { toast({ title: 'Informe nome e sobrenome.', variant: 'destructive' }); return false; }
    if (!emailOk(email)) { toast({ title: 'Informe um e-mail válido.', variant: 'destructive' }); return false; }
    if (!phoneOk(whatsapp)) { toast({ title: 'Informe um WhatsApp válido com DDD.', variant: 'destructive' }); return false; }
    return true;
  };

  const syncContact = async (active: Session) => api({ action: 'update-contact', requestId: active.requestId, token: active.token, supporterName: name, email, whatsapp, city, state: uf });

  const generate = async () => {
    if (!validate()) return;
    if (!preset) return toast({ title: 'Escolha uma foto oficial.', variant: 'destructive' });
    if (!session && files.length === 0) return toast({ title: 'Envie pelo menos uma foto sua.', variant: 'destructive' });
    if (!consentImage || !consentTerms) return toast({ title: 'Confirme os consentimentos obrigatórios.', variant: 'destructive' });
    setBusy(true);
    try {
      let active = session;
      if (!active) {
        const created = await api({ action: 'create', supporterName: name, email, whatsapp, city, state: uf, style, supportText: slogan, candidatePresetSlug: preset, outputFormat: format, consentImageUse: true, consentTerms: true, consentPublicGallery: consentGallery });
        active = { requestId: created.requestId, token: created.token };
        setSession(active); localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      } else await syncContact(active);

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
      setStatus(await api({ action: 'status', requestId: active.requestId, token: active.token })); setApproved(false);
    } catch (error) { toast({ title: 'Falha ao gerar', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const regenerate = async () => {
    if (!session || !validate()) return;
    setBusy(true);
    try { await syncContact(session); await api({ action: 'regenerate', requestId: session.requestId, token: session.token }); setStatus(await api({ action: 'status', requestId: session.requestId, token: session.token })); setApproved(false); }
    catch (error) { toast({ title: 'Falha ao gerar outra versão', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const download = async () => {
    if (!session || !output?.url || !approved) return;
    setBusy(true);
    try { const data = await post(APPROVE_URL, { requestId: session.requestId, token: session.token }); window.open(data.url || output.url, '_blank', 'noopener,noreferrer'); }
    catch (error) { toast({ title: 'Falha ao liberar arquivo', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!session) return;
    setBusy(true);
    try { await api({ action: 'delete', requestId: session.requestId, token: session.token }); localStorage.removeItem(STORAGE_KEY); setSession(null); setStatus(null); setFiles([]); setApproved(false); }
    finally { setBusy(false); }
  };

  const selectFiles = (list: FileList | null) => setFiles(Array.from(list || []).filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024).slice(0, 4));

  return <div className="min-h-screen bg-[#070a0d] text-white"><main className="mx-auto max-w-6xl px-4 py-8 md:py-14">
    <header className="mb-8 text-center"><div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-[#D4FF00]/30 bg-[#D4FF00]/10 px-4 py-2 text-xs font-black uppercase tracking-[.16em] text-[#D4FF00]"><Camera className="h-4 w-4" />{AGENT_NAME}</div><h1 className="text-3xl font-black sm:text-5xl">Madeiraaa Nelesss! <span className="text-[#D4FF00]">🪵 1470</span></h1><p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-400">Nome e sobrenome, e-mail e WhatsApp são obrigatórios. A prévia das fotos anexadas aparece antes da geração.</p></header>

    <Card className="mb-6 border-white/10 bg-[#11161d]/95 text-white"><CardHeader><CardTitle>1. Foto oficial</CardTitle><CardDescription className="text-slate-400">Escolha uma referência oficial do Dr. Madeira.</CardDescription></CardHeader><CardContent>{loadingPresets ? <div className="py-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{presets.map((item) => <button type="button" key={item.slug} disabled={Boolean(session)} onClick={() => setPreset(item.slug)} className={`overflow-hidden rounded-2xl border text-left ${item.slug === preset ? 'border-[#D4FF00]' : 'border-white/10'} ${session ? 'opacity-75' : ''}`}><div className="aspect-[4/5] bg-black/30"><img src={item.previewUrl} alt={item.label} className="h-full w-full object-cover" /></div><div className="p-3 text-sm font-bold">{item.label}</div></button>)}</div>}</CardContent></Card>

    <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
      <Card className="border-white/10 bg-[#11161d]/95 text-white"><CardHeader><CardTitle>2. Cadastro e fotos</CardTitle></CardHeader><CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Nome e sobrenome *</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="border-white/10 bg-black/20" /></div><div><Label>E-mail *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="border-white/10 bg-black/20" /></div><div><Label>WhatsApp *</Label><Input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(formatPhone(e.target.value))} autoComplete="tel" placeholder="(11) 99999-9999" className="border-white/10 bg-black/20" /></div><div><Label>Cidade</Label><Input value={city} onChange={(e) => setCity(e.target.value)} className="border-white/10 bg-black/20" /></div><div><Label>UF</Label><Input value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} className="border-white/10 bg-black/20" /></div><div><Label>Estilo</Label><Select value={style} onValueChange={setStyle} disabled={Boolean(session)}><SelectTrigger className="border-white/10 bg-black/20"><SelectValue /></SelectTrigger><SelectContent>{styles.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div><Label>Slogan</Label><Select value={slogan} onValueChange={setSlogan} disabled={Boolean(session)}><SelectTrigger className="border-white/10 bg-black/20"><SelectValue /></SelectTrigger><SelectContent>{slogans.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="sm:col-span-2"><Label>Formato</Label><Select value={format} onValueChange={setFormat} disabled={Boolean(session)}><SelectTrigger className="border-white/10 bg-black/20"><SelectValue /></SelectTrigger><SelectContent>{formats.map(([value, label, dimensions]) => <SelectItem key={value} value={value}>{label} · {dimensions}px</SelectItem>)}</SelectContent></Select></div></div>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/20 p-6 text-center"><Upload className="h-6 w-6 text-[#D4FF00]" /><strong>Escolher minhas fotografias</strong><span className="text-xs text-slate-400">{files.length ? `${files.length} arquivo(s) selecionado(s)` : 'JPG, PNG ou WebP · máximo 10 MB cada'}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => selectFiles(e.target.files)} /></label>
        {previews.length > 0 && <div><div className="mb-2 text-xs font-bold uppercase tracking-[.14em] text-slate-500">Prévia dos anexos</div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{previews.map((url, index) => <div key={url} className="aspect-square overflow-hidden rounded-xl border border-white/10"><img src={url} alt={`Foto anexada ${index + 1}`} className="h-full w-full object-cover" /></div>)}</div></div>}
        <div className="space-y-3 rounded-xl border border-white/10 bg-black/15 p-4 text-sm"><label className="flex gap-3"><input type="checkbox" checked={consentImage} onChange={(e) => setConsentImage(e.target.checked)} /><span>Autorizo o uso das fotografias enviadas exclusivamente para gerar esta arte.</span></label><label className="flex gap-3"><input type="checkbox" checked={consentTerms} onChange={(e) => setConsentTerms(e.target.checked)} /><span>Declaro possuir autorização para usar as fotografias e aceito os termos.</span></label><label className="flex gap-3"><input type="checkbox" checked={consentGallery} onChange={(e) => setConsentGallery(e.target.checked)} /><span>Opcional: autorizo exibição em galeria pública da campanha.</span></label></div>
        <Button className="h-12 w-full bg-[#D4FF00] font-black text-black" onClick={() => void generate()} disabled={busy || processing || loadingPresets}>{busy || processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Gerar composição</Button>
      </CardContent></Card>

      <Card className="border-white/10 bg-[#11161d]/95 text-white"><CardHeader><CardTitle>3. Prévia e download</CardTitle></CardHeader><CardContent className="space-y-4"><div className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30">{output?.url ? <><img src={output.url} alt="Prévia da composição" className="h-full w-full object-contain" /><div className="absolute inset-x-0 bottom-0 bg-black/85 px-3 py-2 text-center text-[10px] font-bold">{AI_DISCLOSURE}</div></> : <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-500">{processing ? `${AGENT_NAME} está renderizando...` : ['failed', 'provider_not_configured'].includes(current) ? 'A geração não foi concluída. Confira o erro e tente novamente.' : 'A composição final aparecerá aqui.'}</div>}</div><div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm"><div className="flex justify-between"><span>Status</span><strong className="uppercase text-[#D4FF00]">{current}</strong></div><div className="mt-2 text-xs text-slate-400">Modelo: {status?.candidatePreset?.label || 'aguardando'}</div><div className="mt-1 text-xs text-slate-400">Saída: {status?.outputSpec?.label || 'aguardando'}</div>{status?.job?.error_message ? <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-300">{status.job.error_message}</div> : null}</div>{canDownload && <label className="flex gap-3 rounded-xl border border-[#D4FF00]/30 bg-[#D4FF00]/5 p-4 text-sm"><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /><span>Conferi e aprovo esta composição.</span></label>}<Button className="h-12 w-full" disabled={!canDownload || !approved || busy} onClick={() => void download()}><Download className="mr-2 h-4 w-4" />Aprovar e baixar</Button><Button variant="outline" className="w-full border-white/15 bg-transparent" disabled={!session || busy || processing} onClick={() => void regenerate()}><RefreshCcw className="mr-2 h-4 w-4" />Gerar outra versão</Button><Button variant="ghost" className="w-full text-slate-400" disabled={!session || busy} onClick={() => void remove()}><Trash2 className="mr-2 h-4 w-4" />Remover solicitação</Button><div className="rounded-xl border border-white/10 p-4 text-xs leading-5 text-slate-400"><ShieldCheck className="mb-2 h-5 w-5 text-[#D4FF00]" />Dados de contato ficam na base privada de apoiadores. Fotos e resultados ficam em armazenamento privado.</div></CardContent></Card>
    </div>
  </main></div>;
}
