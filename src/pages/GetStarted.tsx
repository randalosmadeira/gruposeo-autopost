import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LEAD_CONSENT_VERSION, LeadError, SEGMENT_OPTIONS, isHandoffToken, leadChallenge, leadErrorMessage, leadSubmit, storeHandoff } from '@/lib/lead-api';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const READY_AFTER_MS = 3500;

const inputClass = 'h-12 w-full rounded-xl border border-[#263541] bg-[#0b141d] px-4 text-base text-slate-100 placeholder:text-slate-500 focus:border-[#00F0FF] focus:outline-none focus:ring-2 focus:ring-[#00F0FF]/30 disabled:opacity-60';

/**
 * Página pública do atalho de captação. Coleta o mínimo (nome + um contato) com consentimento explícito e leva ao cadastro.
 * Não usa cookies nem rastreio; só lê as marcas de campanha que vieram no endereço.
 */
export default function GetStarted() {
  const navigate = useNavigate();
  const [query] = useSearchParams();
  const [challenge, setChallenge] = useState('');
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [segment, setSegment] = useState('');
  const [site, setSite] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const mounted = useRef(true);

  const campaign = useMemo(() => {
    const q = query;
    const utm: Record<string, string> = {};
    for (const k of UTM_KEYS) { const v = q.get(k); if (v) utm[k] = v.slice(0, 80); }
    return { utm, ref: (q.get('ref') || '').slice(0, 200) };
  }, [query]);

  async function loadChallenge() {
    setReady(false);
    try {
      const r = await leadChallenge();
      if (!mounted.current) return;
      setChallenge(r.challenge);
      window.setTimeout(() => { if (mounted.current) setReady(true); }, READY_AFTER_MS);
    } catch (e) {
      if (mounted.current) setNotice(leadErrorMessage(e));
    }
  }
  useEffect(() => { mounted.current = true; void loadChallenge(); return () => { mounted.current = false; }; }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    const local: Record<string, string> = {};
    if (name.trim().length < 2) local.name = 'Informe seu nome.';
    if (!email.trim() && !phone.trim()) local.contact = 'Informe um e-mail ou um WhatsApp para a gente falar com você.';
    if (!consent) local.consent = 'Para continuar, é preciso concordar com o uso dos seus dados.';
    setFields(local);
    if (Object.keys(local).length) { setNotice('Confira os campos destacados.'); return; }
    setBusy(true);
    setNotice('');
    try {
      const r = await leadSubmit({ name, email, phone, segment, site, message, consent, website, challenge, utm: campaign.utm, ref: campaign.ref });
      const token = decodeURIComponent((r.redirect.split('lead=')[1] || '').split('&')[0]);
      if (isHandoffToken(token)) storeHandoff(token);
      setDone(true);
      window.setTimeout(() => { if (mounted.current) navigate(r.redirect); }, 1200);
    } catch (err) {
      if (err instanceof LeadError) {
        if (err.code === 'invalid') setFields(err.fields);
        if (['challenge_invalid', 'expired', 'too_fast'].includes(err.code)) void loadChallenge();
      }
      setNotice(leadErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const err = (k: string) => fields[k] ? <p id={`gs-${k}-err`} role="alert" className="mt-1 text-sm text-red-300">{fields[k]}</p> : null;
  const invalid = (k: string) => (fields[k] ? true : undefined);

  return (
    <div className="min-h-screen bg-[#050a0f] px-4 py-8 text-slate-100 sm:px-6">
      <main className="mx-auto w-full max-w-xl">
        <p className="text-xs font-black uppercase tracking-[.18em] text-[#D4FF00]">Zica.ai</p>
        <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">Comece por aqui</h1>
        <p className="mt-3 text-base leading-7 text-slate-300">Deixe seu contato. Em seguida você cria a sua conta e continua dentro do sistema, sem repetir nada.</p>

        {done ? (
          <div role="status" className="mt-8 rounded-2xl border border-[#3cff65]/40 bg-[#3cff65]/5 p-5">
            <p className="text-lg font-bold text-white">Recebemos seus dados.</p>
            <p className="mt-1 text-slate-300">Agora é só criar a sua conta. Estamos levando você para lá…</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-8 space-y-5" aria-describedby={notice ? 'gs-notice' : undefined}>
            <div>
              <label htmlFor="gs-name" className="mb-1 block text-sm font-semibold text-slate-200">Seu nome *</label>
              <input id="gs-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} aria-invalid={invalid('name')} aria-describedby={fields.name ? 'gs-name-err' : undefined} disabled={busy} />
              {err('name')}
            </div>
            <fieldset className="space-y-3 rounded-xl border border-[#263541] p-4">
              <legend className="px-1 text-sm font-semibold text-slate-200">Como falamos com você? (um dos dois basta)</legend>
              <div>
                <label htmlFor="gs-phone" className="mb-1 block text-sm text-slate-300">WhatsApp, com DDD</label>
                <input id="gs-phone" type="tel" inputMode="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={25} placeholder="(11) 98888-7777" aria-invalid={invalid('phone')} aria-describedby={fields.phone ? 'gs-phone-err' : undefined} disabled={busy} />
                {err('phone')}
              </div>
              <div>
                <label htmlFor="gs-email" className="mb-1 block text-sm text-slate-300">E-mail</label>
                <input id="gs-email" type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={180} placeholder="voce@empresa.com.br" aria-invalid={invalid('email')} aria-describedby={fields.email ? 'gs-email-err' : undefined} disabled={busy} />
                {err('email')}
              </div>
              {err('contact')}
            </fieldset>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="gs-segment" className="mb-1 block text-sm font-semibold text-slate-200">Seu ramo (opcional)</label>
                <select id="gs-segment" className={inputClass} value={segment} onChange={(e) => setSegment(e.target.value)} disabled={busy}>
                  <option value="">Prefiro não dizer</option>
                  {SEGMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="gs-site" className="mb-1 block text-sm font-semibold text-slate-200">Seu site (opcional)</label>
                <input id="gs-site" className={inputClass} value={site} onChange={(e) => setSite(e.target.value)} autoComplete="url" maxLength={200} placeholder="www.suaempresa.com.br" aria-invalid={invalid('site')} aria-describedby={fields.site ? 'gs-site-err' : undefined} disabled={busy} />
                {err('site')}
              </div>
            </div>
            <div>
              <label htmlFor="gs-message" className="mb-1 block text-sm font-semibold text-slate-200">O que você quer resolver? (opcional)</label>
              <textarea id="gs-message" className={`${inputClass} h-28 py-3`} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} disabled={busy} aria-describedby="gs-message-count" />
              <p id="gs-message-count" className="mt-1 text-xs text-slate-500">{message.length}/500</p>
              {err('message')}
            </div>

            {/* campo-isca: pessoas não veem nem preenchem; robôs costumam preencher tudo */}
            <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="gs-website">Não preencha este campo</label>
              <input id="gs-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>

            <div>
              <label className="flex items-start gap-3 text-sm leading-6 text-slate-200">
                <input type="checkbox" className="mt-1.5 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} aria-invalid={invalid('consent')} aria-describedby={fields.consent ? 'gs-consent-err' : undefined} />
                <span>Concordo que o GRUPO SEO MKT use meu nome e meu contato para falar comigo sobre o Zica.ai e preparar o meu cadastro. *</span>
              </label>
              {err('consent')}
              <details className="mt-2 text-sm text-slate-400">
                <summary className="cursor-pointer">Como usamos seus dados (aviso {LEAD_CONSENT_VERSION})</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li><strong>O que coletamos:</strong> nome, e-mail ou WhatsApp e, se você quiser, ramo, site e uma mensagem. Não usamos cookies nem rastreio nesta página.</li>
                  <li><strong>Para quê:</strong> falar com você sobre o Zica.ai e preparar o seu cadastro. Base legal: o seu consentimento.</li>
                  <li><strong>Com quem:</strong> só com a equipe do GRUPO SEO MKT. Não vendemos nem repassamos seus dados.</li>
                  <li><strong>Por quanto tempo:</strong> até 12 meses sem retorno; depois, apagamos.</li>
                  <li><strong>Seus direitos:</strong> pedir acesso, correção ou exclusão a qualquer momento, por apps.desenvolve@zicajuris.com.br.</li>
                </ul>
              </details>
            </div>

            {notice && <p id="gs-notice" role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-200">{notice}</p>}
            <button type="submit" disabled={busy || !ready} className="h-14 w-full rounded-xl bg-[#D4FF00] text-base font-black text-[#0D1117] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? 'Enviando…' : ready ? 'Continuar para o cadastro' : 'Preparando…'}
            </button>
            <p className="text-center text-xs text-slate-500">Já tem conta? <Link className="underline" to="/auth">Entrar</Link></p>
          </form>
        )}
      </main>
    </div>
  );
}
