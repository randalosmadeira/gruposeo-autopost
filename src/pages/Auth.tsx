import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, ChevronLeft, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Mail, RefreshCw, ShieldCheck, Sparkles, UserRound, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useBackendHealth } from '@/hooks/useBackendHealth';
import { supabase } from '@/integrations/supabase/client';
import { CentralCortex } from '@/components/brand/CentralCortex';
import { ZicaLogo } from '@/components/brand/ZicaLogo';
import { InstitutionalInfo } from '@/components/shared/InstitutionalInfo';

type AuthView = 'login' | 'signup' | 'recovery';
type FieldProps = { id: string; label: string; type: string; placeholder: string; value: string; onChange: (value: string) => void; icon: React.ElementType; autoComplete?: string; minLength?: number; };

function Field({ id, label, type, placeholder, value, onChange, icon: Icon, autoComplete, minLength }: FieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-semibold text-slate-200">{label}</label>
      <div className="group relative">
        <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-[#00F0FF]" />
        <input id={id} type={isPassword && showPassword ? 'text' : type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} minLength={minLength} required className="h-14 w-full rounded-xl border border-[#2b3945] bg-[#101922]/90 pl-11 pr-11 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-[#00F0FF]/75 focus:shadow-[0_0_0_3px_rgba(0,240,255,.07),0_0_30px_rgba(0,240,255,.05)]" />
        {isPassword && <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-[#00F0FF]" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
      </div>
    </div>
  );
}

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const { toast } = useToast();
  const { status: backendStatus, latency, recheck } = useBackendHealth(20000);
  const [view, setView] = useState<AuthView>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#050a0f]"><div className="zica-auth-loading flex items-center gap-3 rounded-2xl border border-[#263541] bg-[#0b141d] px-5 py-4 text-sm text-slate-300"><Loader2 className="h-5 w-5 animate-spin text-[#D4FF00]" /> Sincronizando a Central Cortex...</div></div>;
  if (user) return <Navigate to="/" replace />;

  const notifyError = (title: string, error: unknown) => {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    const isNetwork = message.includes('Failed to fetch') || message.toLowerCase().includes('timeout') || message.toLowerCase().includes('network') || message.includes('signal is aborted');
    toast({ title: isNetwork ? 'Sem conexão com o Cérebro Zica.ai' : title, description: isNetwork ? 'Não foi possível alcançar o backend agora. Verifique sua conexão e tente novamente.' : message, variant: 'destructive' });
  };
  const handleLogin = async (event: React.FormEvent) => { event.preventDefault(); setIsSubmitting(true); try { await signIn(loginEmail, loginPassword); } catch (error) { notifyError('Não foi possível acessar sua conta', error); } finally { setIsSubmitting(false); } };
  const handleSignup = async (event: React.FormEvent) => { event.preventDefault(); setIsSubmitting(true); try { await signUp(signupEmail, signupPassword, signupName); } catch (error) { notifyError('Não foi possível criar sua conta', error); } finally { setIsSubmitting(false); } };
  const handleRecovery = async (event: React.FormEvent) => { event.preventDefault(); setIsSubmitting(true); try { const redirectTo = new URL(`${import.meta.env.BASE_URL}auth`, window.location.origin).toString(); const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail, { redirectTo }); if (error) throw error; toast({ title: 'Link de recuperação enviado', description: 'Confira seu e-mail para redefinir o acesso ao Zica.ai.' }); setView('login'); setLoginEmail(recoveryEmail); } catch (error) { notifyError('Não foi possível enviar o link de recuperação', error); } finally { setIsSubmitting(false); } };
  const healthLabel = backendStatus === 'online' ? `Central Cortex ativa${latency ? ` · ${latency}ms` : ''}` : backendStatus === 'degraded' ? `Central com latência${latency ? ` · ${latency}ms` : ''}` : backendStatus === 'offline' ? 'Central temporariamente indisponível' : 'Verificando Central Cortex';

  return (
    <div className="zica-auth-v2 relative min-h-screen overflow-hidden bg-[#050a0f] text-slate-100">
      <div className="zica-auth-grid pointer-events-none absolute inset-0" /><div className="zica-auth-energy zica-auth-energy--top pointer-events-none absolute inset-x-0 top-0" /><div className="zica-auth-energy zica-auth-energy--bottom pointer-events-none absolute inset-x-0 bottom-0" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1680px] flex-col px-4 py-5 sm:px-6 lg:px-8 xl:px-10">
        <header className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D4FF00]/30 bg-[#D4FF00]/[.045] px-4 py-2 text-[10px] font-black uppercase tracking-[.14em] text-[#D4FF00]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#3cff65] shadow-[0_0_10px_#3cff65]" /> Operação autônoma 24/7</div>
          <button type="button" onClick={recheck} className="inline-flex items-center gap-2 rounded-full border border-[#263541] bg-[#0b141d]/75 px-3 py-2 text-[10px] font-bold uppercase tracking-[.11em] text-slate-400 backdrop-blur hover:text-white">{backendStatus === 'online' ? <Wifi className="h-3.5 w-3.5 text-[#00F0FF]" /> : backendStatus === 'offline' ? <WifiOff className="h-3.5 w-3.5 text-rose-400" /> : <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#D4FF00]" />}<span className="hidden sm:inline">{healthLabel}</span></button>
        </header>
        <main className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1.62fr_.78fr] xl:gap-10">
          <section className="relative min-w-0">
            <div className="grid items-center gap-5 md:grid-cols-[.72fr_1.28fr] lg:grid-cols-[.62fr_1.38fr]">
              <div className="relative z-20">
                <ZicaLogo showSubtitle className="mb-7" /><p className="text-xl font-black uppercase leading-tight tracking-[-.025em] text-white sm:text-2xl xl:text-3xl">O CÉREBRO DE<br />TRÁFEGO VIRAL</p>
                <h1 className="mt-2 text-[clamp(3.8rem,7vw,7rem)] font-black leading-[.82] tracking-[-.075em] text-white">ZICA<span className="text-[#D4FF00]">.</span><span className="text-[#D4FF00]">AI</span></h1>
                <p className="mt-6 text-lg leading-7 text-slate-400">Seu tráfego tá na zica?</p><p className="mt-1 text-xl font-bold text-white">Deszica com <span className="text-[#D4FF00]">Zica.ai.</span></p>
                <div className="mt-7 hidden grid-cols-2 gap-3 md:grid"><div className="zica-auth-stat"><Sparkles className="text-[#D4FF00]" /><div><strong>24/7</strong><span>ondas autônomas</span></div></div><div className="zica-auth-stat"><ShieldCheck className="text-[#00F0FF]" /><div><strong>SEO + GEO</strong><span>semântica LLMs</span></div></div></div>
              </div>
              <div className="relative min-h-[320px] sm:min-h-[380px] lg:min-h-[520px]"><CentralCortex variant="auth" className="absolute inset-0" /></div>
            </div>
          </section>
          <section className="relative z-30 mx-auto w-full max-w-[500px]">
            <div className="zica-login-panel relative overflow-hidden rounded-[26px] border border-[#00F0FF]/35 bg-[#071018]/90 p-5 shadow-[0_30px_100px_rgba(0,0,0,.55),0_0_70px_rgba(0,240,255,.035)] backdrop-blur-xl sm:p-7 xl:p-8">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00F0FF] to-transparent opacity-70" />
              <div className="mb-7 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-[#D4FF00]/35 bg-[#D4FF00]/[.05] text-[#D4FF00]"><LockKeyhole className="h-5 w-5" /></span><div><p className="text-xs font-black uppercase tracking-[.15em] text-[#D4FF00]">{view === 'login' ? 'Acesso à Central' : view === 'signup' ? 'Ativar novo ecossistema' : 'Recuperar acesso'}</p><p className="mt-1 text-xs text-slate-500">Central Cortex · conexão criptografada</p></div></div>
              {view === 'login' && <form onSubmit={handleLogin} className="space-y-5"><Field id="login-email" label="Email de acesso" type="email" placeholder="seu@email.com" value={loginEmail} onChange={setLoginEmail} icon={Mail} autoComplete="email" /><Field id="login-password" label="Senha" type="password" placeholder="••••••••" value={loginPassword} onChange={setLoginPassword} icon={LockKeyhole} autoComplete="current-password" minLength={6} /><div className="flex items-center justify-between gap-3 text-sm"><label className="flex cursor-pointer items-center gap-2 text-slate-400"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 accent-[#D4FF00]" />Lembrar de mim</label><button type="button" onClick={() => { setRecoveryEmail(loginEmail); setView('recovery'); }} className="font-semibold text-[#00F0FF] underline-offset-4 hover:underline">Esqueci minha senha</button></div><button disabled={isSubmitting} className="zica-primary-cta flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#D4FF00] text-base font-black text-[#061017] disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Entrar <ArrowRight className="h-5 w-5" /></>}</button><button type="button" onClick={() => setView('signup')} className="h-14 w-full rounded-xl border border-[#00F0FF]/70 bg-transparent text-sm font-semibold text-[#00F0FF] transition hover:bg-[#00F0FF]/[.06]">Cadastrar nova conta</button></form>}
              {view === 'signup' && <form onSubmit={handleSignup} className="space-y-5"><Field id="signup-name" label="Nome" type="text" placeholder="Seu nome" value={signupName} onChange={setSignupName} icon={UserRound} autoComplete="name" /><Field id="signup-email" label="Email de acesso" type="email" placeholder="seu@email.com" value={signupEmail} onChange={setSignupEmail} icon={Mail} autoComplete="email" /><Field id="signup-password" label="Crie sua senha" type="password" placeholder="Mínimo de 6 caracteres" value={signupPassword} onChange={setSignupPassword} icon={LockKeyhole} autoComplete="new-password" minLength={6} /><button disabled={isSubmitting} className="zica-primary-cta flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#D4FF00] text-base font-black text-[#061017] disabled:opacity-60">{isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Ativar conta Zica.ai <ArrowRight className="h-5 w-5" /></>}</button><button type="button" onClick={() => setView('login')} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-[#00F0FF]"><ChevronLeft className="h-4 w-4" /> Voltar para entrar</button></form>}
              {view === 'recovery' && <form onSubmit={handleRecovery} className="space-y-5"><div className="rounded-2xl border border-[#D4FF00]/15 bg-[#D4FF00]/[.035] p-4 text-sm leading-6 text-slate-400">Informe seu e-mail. A Zica.ai enviará o link seguro de redefinição de senha.</div><Field id="recovery-email" label="Email de acesso" type="email" placeholder="seu@email.com" value={recoveryEmail} onChange={setRecoveryEmail} icon={KeyRound} autoComplete="email" /><button disabled={isSubmitting} className="zica-primary-cta flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#D4FF00] text-base font-black text-[#061017] disabled:opacity-60">{isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Enviar link seguro <ArrowRight className="h-5 w-5" /></>}</button><button type="button" onClick={() => setView('login')} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-[#00F0FF]"><ChevronLeft className="h-4 w-4" /> Voltar para entrar</button></form>}
              <div className="mt-7 flex items-start gap-3 border-t border-[#25333e] pt-5 text-xs text-slate-500"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#D4FF00]" /><div><strong className="block text-sm font-semibold text-slate-300">Conexão segura e criptografada</strong><span>Seus dados protegidos pela infraestrutura autenticada Zica.ai.</span></div></div>
              <InstitutionalInfo variant="login" />
            </div>
          </section>
        </main>
        <footer className="mx-auto flex w-full max-w-5xl items-center gap-4 rounded-full border border-[#1f303b] bg-[#071018]/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-slate-500 backdrop-blur sm:text-xs"><span className="h-2 w-2 animate-pulse rounded-full bg-[#3cff65] shadow-[0_0_12px_#3cff65]" /><strong className="text-[#D4FF00]">Central Cortex ativa</strong><span className="hidden sm:inline">Monitorando, aprendendo e impulsionando seu tráfego 24/7</span><span className="zica-footer-wave ml-auto hidden w-36 sm:block" /></footer>
      </div>
    </div>
  );
}
