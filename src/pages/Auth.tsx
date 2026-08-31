import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  ArrowRight,
  BrainCircuit,
  ChevronLeft,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useBackendHealth } from '@/hooks/useBackendHealth';
import { supabase } from '@/integrations/supabase/client';
import { NeuralEnergy } from '@/components/brand/NeuralEnergy';

type AuthView = 'login' | 'signup' | 'recovery';

const Field = ({
  id,
  label,
  type,
  placeholder,
  value,
  onChange,
  icon: Icon,
  autoComplete,
  minLength,
}: {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  icon: React.ElementType;
  autoComplete?: string;
  minLength?: number;
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </label>
      <div className="group relative">
        <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-[#D4FF00]" />
        <input
          id={id}
          type={isPassword && showPassword ? 'text' : type}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          className="h-12 w-full rounded-xl border border-[#30363D] bg-[#0D1117]/90 pl-11 pr-11 text-sm text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:border-[#D4FF00]/80 focus:ring-2 focus:ring-[#D4FF00]/10"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-[#00F0FF]"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
};

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const { toast } = useToast();
  const { status: backendStatus, latency, recheck } = useBackendHealth(20000);
  const [view, setView] = useState<AuthView>('login');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D1117]">
        <div className="flex items-center gap-3 rounded-2xl border border-[#30363D] bg-[#161B22] px-5 py-4 text-sm text-slate-300 shadow-2xl">
          <Loader2 className="h-5 w-5 animate-spin text-[#D4FF00]" />
          Sincronizando o Cérebro de Tráfego...
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const notifyError = (title: string, error: unknown) => {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    const isNetwork =
      message.includes('Failed to fetch') ||
      message.toLowerCase().includes('timeout') ||
      message.toLowerCase().includes('network') ||
      message.includes('signal is aborted');

    toast({
      title: isNetwork ? 'Sem conexão com o Cérebro Zica.ai' : title,
      description: isNetwork
        ? 'Não foi possível alcançar o backend agora. Verifique sua conexão e tente novamente.'
        : message,
      variant: 'destructive',
    });
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await signIn(loginEmail, loginPassword);
    } catch (error) {
      notifyError('Não foi possível acessar sua conta', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await signUp(signupEmail, signupPassword, signupName);
    } catch (error) {
      notifyError('Não foi possível criar sua conta', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const redirectTo = new URL(`${import.meta.env.BASE_URL}auth`, window.location.origin).toString();
      const { error } = await supabase.auth.resetPasswordForEmail(recoveryEmail, { redirectTo });
      if (error) throw error;

      toast({
        title: 'Link de recuperação enviado',
        description: 'Confira seu e-mail para redefinir o acesso ao Zica.ai.',
      });
      setView('login');
      setLoginEmail(recoveryEmail);
    } catch (error) {
      notifyError('Não foi possível enviar o link de recuperação', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const healthLabel =
    backendStatus === 'online'
      ? `Núcleo online${latency ? ` · ${latency}ms` : ''}`
      : backendStatus === 'degraded'
        ? `Núcleo com latência${latency ? ` · ${latency}ms` : ''}`
        : backendStatus === 'offline'
          ? 'Núcleo indisponível'
          : 'Verificando núcleo';

  return (
    <div className="neural-auth-shell relative min-h-screen overflow-hidden bg-[#0D1117] text-slate-100">
      <NeuralEnergy variant="hero" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(212,255,0,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.035)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="pointer-events-none absolute -left-40 top-[-180px] h-[520px] w-[520px] rounded-full bg-[#D4FF00]/8 blur-3xl" />
      <div className="pointer-events-none absolute -right-48 bottom-[-220px] h-[620px] w-[620px] rounded-full bg-[#00F0FF]/8 blur-3xl" />

      <main className="relative mx-auto grid min-h-screen max-w-[1480px] grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative hidden min-h-screen flex-col justify-between border-r border-[#30363D]/70 px-12 py-10 lg:flex xl:px-16">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D4FF00]/40 bg-[#D4FF00]/10 shadow-[0_0_30px_rgba(212,255,0,0.12)]">
                <span className="text-xl font-black text-[#D4FF00]">Z</span>
              </div>
              <div>
                <div className="text-xl font-black tracking-tight">Zica<span className="text-[#D4FF00]">.ai</span></div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Cérebro de Tráfego Orgânico</div>
              </div>
            </div>
            <div className="rounded-full border border-[#30363D] bg-[#161B22]/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#00F0FF]">
              Autonomous Engine · 24/7
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_280px] items-center gap-10 xl:grid-cols-[minmax(0,1fr)_330px]">
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#D4FF00]/20 bg-[#D4FF00]/5 px-3 py-1.5 text-xs font-semibold text-[#D4FF00]">
                <Sparkles className="h-3.5 w-3.5" />
                SEO + GEO + Semântica para LLMs
              </div>
              <h1 className="text-4xl font-black leading-[1.06] tracking-[-0.045em] text-white xl:text-5xl 2xl:text-6xl">
                Cérebro Central de
                <span className="block bg-gradient-to-r from-[#D4FF00] via-[#D4FF00] to-[#00F0FF] bg-clip-text text-transparent">
                  Tráfego Orgânico
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 xl:text-lg">
                Ondas virais de conteúdo, autoridade GEO e otimização semântica contínua para Google, ChatGPT, Perplexity e Claude.
              </p>
              <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
                {[
                  ['24/7', 'Operação autônoma'],
                  ['GEO', 'Descoberta por IAs'],
                  ['LLMs', 'Semântica aplicada'],
                ].map(([value, label]) => (
                  <div key={value} className="rounded-2xl border border-[#30363D] bg-[#161B22]/75 p-4 backdrop-blur">
                    <div className="text-lg font-black text-[#D4FF00]">{value}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative aspect-square">
              <div className="absolute inset-[7%] rounded-full border border-[#30363D]" />
              <div className="absolute inset-[20%] rounded-full border border-[#D4FF00]/30" />
              <div className="absolute inset-[34%] rounded-full border border-[#00F0FF]/30" />
              <div className="absolute inset-[42%] flex items-center justify-center rounded-full border border-[#D4FF00]/50 bg-[#161B22] shadow-[0_0_55px_rgba(212,255,0,0.14)]">
                <BrainCircuit className="h-10 w-10 text-[#D4FF00]" />
              </div>
              <div className="absolute left-[8%] top-[44%] flex h-10 w-10 items-center justify-center rounded-xl border border-[#30363D] bg-[#161B22] text-[#00F0FF] shadow-xl">
                <Globe2 className="h-5 w-5" />
              </div>
              <div className="absolute right-[10%] top-[20%] flex h-10 w-10 items-center justify-center rounded-xl border border-[#30363D] bg-[#161B22] text-[#D4FF00] shadow-xl">
                <Radar className="h-5 w-5" />
              </div>
              <div className="absolute bottom-[12%] right-[28%] flex h-10 w-10 items-center justify-center rounded-xl border border-[#30363D] bg-[#161B22] text-[#00F0FF] shadow-xl">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="absolute inset-[13%] animate-[spin_18s_linear_infinite] rounded-full border border-dashed border-[#D4FF00]/15" />
              <div className="absolute inset-[27%] animate-[spin_12s_linear_infinite_reverse] rounded-full border border-dashed border-[#00F0FF]/15" />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Seu tráfego tá na zica? <strong className="font-semibold text-slate-400">Deszica com Zica.ai.</strong></span>
            <span>Motor Autônomo de Tráfego Orgânico</span>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-10 xl:px-16">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#D4FF00]/40 bg-[#D4FF00]/10">
                  <span className="text-xl font-black text-[#D4FF00]">Z</span>
                </div>
                <div>
                  <div className="text-xl font-black">Zica<span className="text-[#D4FF00]">.ai</span></div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Cérebro de Tráfego Orgânico</div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#30363D] bg-[#161B22]/92 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
              <div className="mb-7 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#00F0FF]">
                    {view === 'login' ? 'Acesso ao núcleo' : view === 'signup' ? 'Novo ecossistema' : 'Recuperar acesso'}
                  </div>
                  <h2 className="text-2xl font-black tracking-tight text-white">
                    {view === 'login' ? 'Entre no Cérebro de Tráfego' : view === 'signup' ? 'Ative sua conta Zica.ai' : 'Redefina seu acesso'}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {view === 'login'
                      ? 'Gerencie ondas, agentes, GEO e autoridade orgânica em um único núcleo.'
                      : view === 'signup'
                        ? 'Crie seu acesso e conecte o primeiro ecossistema de tráfego.'
                        : 'Informe seu e-mail para receber o link seguro de recuperação.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={recheck}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition ${
                    backendStatus === 'online'
                      ? 'border-[#D4FF00]/20 bg-[#D4FF00]/5 text-[#D4FF00]'
                      : backendStatus === 'offline'
                        ? 'border-red-500/20 bg-red-500/5 text-red-400'
                        : 'border-[#30363D] bg-[#0D1117] text-slate-500'
                  }`}
                  title={`${healthLabel}. Clique para verificar novamente.`}
                >
                  {backendStatus === 'checking' ? <RefreshCw className="h-4 w-4 animate-spin" /> : backendStatus === 'offline' ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
                </button>
              </div>

              {view !== 'recovery' && (
                <div className="mb-6 grid grid-cols-2 rounded-xl border border-[#30363D] bg-[#0D1117]/70 p-1">
                  <button
                    type="button"
                    onClick={() => setView('login')}
                    className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${view === 'login' ? 'bg-[#161B22] text-[#D4FF00] shadow' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Entrar
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('signup')}
                    className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${view === 'signup' ? 'bg-[#161B22] text-[#D4FF00] shadow' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Criar conta
                  </button>
                </div>
              )}

              {view === 'login' && (
                <form onSubmit={handleLogin} className="space-y-5">
                  <Field id="login-email" label="E-mail" type="email" placeholder="voce@empresa.com" value={loginEmail} onChange={setLoginEmail} icon={Mail} autoComplete="email" />
                  <Field id="login-password" label="Senha" type="password" placeholder="Sua senha de acesso" value={loginPassword} onChange={setLoginPassword} icon={LockKeyhole} autoComplete="current-password" />

                  <div className="flex items-center justify-end">
                    <button type="button" onClick={() => { setRecoveryEmail(loginEmail); setView('recovery'); }} className="text-xs font-semibold text-[#00F0FF] transition hover:text-[#D4FF00]">
                      Esqueci minha senha
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#D4FF00] px-5 text-sm font-black text-[#0D1117] shadow-[0_0_30px_rgba(212,255,0,0.13)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                    Acessar Cérebro de Tráfego
                    {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>
              )}

              {view === 'signup' && (
                <form onSubmit={handleSignup} className="space-y-5">
                  <Field id="signup-name" label="Nome completo" type="text" placeholder="Seu nome" value={signupName} onChange={setSignupName} icon={UserRound} autoComplete="name" />
                  <Field id="signup-email" label="E-mail" type="email" placeholder="voce@empresa.com" value={signupEmail} onChange={setSignupEmail} icon={Mail} autoComplete="email" />
                  <Field id="signup-password" label="Senha" type="password" placeholder="Mínimo 6 caracteres" value={signupPassword} onChange={setSignupPassword} icon={KeyRound} autoComplete="new-password" minLength={6} />

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#D4FF00] px-5 text-sm font-black text-[#0D1117] shadow-[0_0_30px_rgba(212,255,0,0.13)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Ativar Ecossistema Zica.ai
                    {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>
              )}

              {view === 'recovery' && (
                <form onSubmit={handleRecovery} className="space-y-5">
                  <button type="button" onClick={() => setView('login')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-[#00F0FF]">
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Voltar ao login
                  </button>
                  <Field id="recovery-email" label="E-mail da conta" type="email" placeholder="voce@empresa.com" value={recoveryEmail} onChange={setRecoveryEmail} icon={Mail} autoComplete="email" />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#D4FF00] px-5 text-sm font-black text-[#0D1117] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    Enviar link de recuperação
                  </button>
                </form>
              )}

              <div className="mt-7 flex items-center justify-between gap-4 border-t border-[#30363D]/70 pt-5 text-[11px] text-slate-600">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[#00F0FF]" /> Acesso protegido pelo Supabase Auth</span>
                <span>{healthLabel}</span>
              </div>
            </div>

            <p className="mt-5 text-center text-xs leading-5 text-slate-600 lg:hidden">
              Seu tráfego tá na zica? <span className="font-semibold text-slate-400">Deszica com Zica.ai.</span>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
