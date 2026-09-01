import { useEffect, useMemo, useState } from 'react';
import { Save, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

type PromptRow = {
  id: string;
  slug: string;
  version: number;
  name: string;
  system_prompt: string;
  negative_prompt: string;
  fidelity_target: number;
  config: Record<string, unknown>;
  is_active: boolean;
  updated_at: string;
};

export default function SupporterAvatarPromptEditor() {
  const { toast } = useToast();
  const [isCeo, setIsCeo] = useState<boolean | null>(null);
  const [current, setCurrent] = useState<PromptRow | null>(null);
  const [name, setName] = useState('Apoiador 1470 — Humanização Máxima');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [fidelityTarget, setFidelityTarget] = useState('0.990');
  const [configText, setConfigText] = useState('{}');
  const [busy, setBusy] = useState(false);

  const nextVersion = useMemo(() => (current?.version || 0) + 1, [current]);

  const load = async () => {
    const { data: ceo } = await db.rpc('is_ceo');
    setIsCeo(Boolean(ceo));
    if (!ceo) return;
    const { data, error } = await db
      .from('supporter_avatar_prompt_templates')
      .select('*')
      .is('owner_user_id', null)
      .eq('slug', 'supporter-avatar-human-v1')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      setCurrent(data);
      setName(data.name);
      setSystemPrompt(data.system_prompt);
      setNegativePrompt(data.negative_prompt || '');
      setFidelityTarget(String(data.fidelity_target ?? 0.99));
      setConfigText(JSON.stringify(data.config || {}, null, 2));
    }
  };

  useEffect(() => { load().catch((error) => toast({ title: 'Falha ao carregar prompt', description: error.message, variant: 'destructive' })); }, []);

  const save = async () => {
    if (!isCeo) return;
    let config: Record<string, unknown>;
    try { config = JSON.parse(configText); }
    catch { return toast({ title: 'JSON de configuração inválido', variant: 'destructive' }); }
    const fidelity = Number(fidelityTarget);
    if (!Number.isFinite(fidelity) || fidelity < 0.8 || fidelity > 1) return toast({ title: 'Fidelidade deve ficar entre 0.800 e 1.000', variant: 'destructive' });
    if (systemPrompt.trim().length < 200) return toast({ title: 'O prompt principal está curto demais.', variant: 'destructive' });

    setBusy(true);
    try {
      const { error } = await db.from('supporter_avatar_prompt_templates').insert({
        owner_user_id: null,
        slug: 'supporter-avatar-human-v1',
        version: nextVersion,
        name: name.trim(),
        is_active: true,
        system_prompt: systemPrompt.trim(),
        negative_prompt: negativePrompt.trim(),
        fidelity_target: fidelity,
        config,
      });
      if (error) throw error;
      toast({ title: `Prompt v${nextVersion} publicado`, description: 'Novos jobs /1470 usarão esta versão.' });
      await load();
    } catch (error) {
      toast({ title: 'Falha ao publicar prompt', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (isCeo === false) return <div className="p-6"><Card><CardHeader><CardTitle>Acesso restrito</CardTitle><CardDescription>Somente o perfil CEO pode alterar o prompt global do módulo /1470.</CardDescription></CardHeader></Card></div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-black"><Sparkles className="h-6 w-6" /> Prompt Editor — Avatar 1470</h1><p className="mt-1 text-sm text-muted-foreground">Editor versionado do motor público de fotografia humanizada.</p></div>
        <div className="rounded-full border px-3 py-1 text-xs font-semibold">Atual: v{current?.version || 0} · Próxima: v{nextVersion}</div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Regras de produção</CardTitle><CardDescription>A meta de fidelidade é uma preferência de edição/QA, não uma garantia biométrica de 99% de identidade.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2"><div><Label>Nome da versão</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div><div><Label>Alvo operacional de fidelidade</Label><Input value={fidelityTarget} onChange={(e) => setFidelityTarget(e.target.value)} /></div></div>
          <div><Label>System Prompt principal</Label><Textarea rows={18} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} className="font-mono text-xs" /></div>
          <div><Label>Negative Prompt / restrições</Label><Textarea rows={9} value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} className="font-mono text-xs" /></div>
          <div><Label>Configuração JSON</Label><Textarea rows={12} value={configText} onChange={(e) => setConfigText(e.target.value)} className="font-mono text-xs" /></div>
          <Button onClick={save} disabled={busy || !isCeo}><Save className="mr-2 h-4 w-4" /> Publicar nova versão</Button>
        </CardContent>
      </Card>
    </div>
  );
}
