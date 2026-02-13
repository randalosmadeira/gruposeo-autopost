import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useBackendHealth } from '@/hooks/useBackendHealth';

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const { toast } = useToast();
  const { status: backendStatus, latency, recheck } = useBackendHealth(20000);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await signIn(loginEmail, loginPassword);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      const isNetwork =
        message.includes('Failed to fetch') ||
        message.toLowerCase().includes('timeout') ||
        message.toLowerCase().includes('network') ||
        message.includes('signal is aborted');

      toast({
        title: isNetwork ? 'Sem conexão com o backend' : 'Erro ao entrar',
        description: isNetwork
          ? 'Não conseguimos conectar agora. Verifique sua internet/rede (VPN, firewall, adblock) e tente novamente.'
          : message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await signUp(signupEmail, signupPassword, signupName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      const isNetwork =
        message.includes('Failed to fetch') ||
        message.toLowerCase().includes('timeout') ||
        message.toLowerCase().includes('network') ||
        message.includes('signal is aborted');

      toast({
        title: isNetwork ? 'Sem conexão com o backend' : 'Erro ao criar conta',
        description: isNetwork
          ? 'Não conseguimos conectar agora. Verifique sua internet/rede (VPN, firewall, adblock) e tente novamente.'
          : message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-primary shadow-glow-primary">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">ContentFactory RDM</CardTitle>
          <CardDescription>
            Plataforma interna de geração de conteúdo SEO
          </CardDescription>

          {/* Health Check Indicator */}
          <button
            onClick={recheck}
            className={`inline-flex items-center gap-1.5 mx-auto mt-2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              backendStatus === 'online'
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : backendStatus === 'degraded'
                ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 cursor-pointer hover:bg-yellow-500/20'
                : backendStatus === 'offline'
                ? 'bg-destructive/10 text-destructive cursor-pointer hover:bg-destructive/20'
                : 'bg-muted text-muted-foreground'
            }`}
            title="Clique para verificar novamente"
          >
            {backendStatus === 'checking' && <RefreshCw className="w-3 h-3 animate-spin" />}
            {backendStatus === 'online' && <Wifi className="w-3 h-3" />}
            {backendStatus === 'degraded' && <Wifi className="w-3 h-3" />}
            {backendStatus === 'offline' && <WifiOff className="w-3 h-3" />}
            {backendStatus === 'checking' && 'Verificando backend…'}
            {backendStatus === 'online' && `Backend online${latency ? ` (${latency}ms)` : ''}`}
            {backendStatus === 'degraded' && `Backend lento${latency ? ` (${latency}ms)` : ''} — clique para retry`}
            {backendStatus === 'offline' && 'Backend offline — clique para retry'}
          </button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar Conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-primary hover:opacity-90"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Entrar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nome Completo</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Seu nome"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-accent hover:opacity-90"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Criar Conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
