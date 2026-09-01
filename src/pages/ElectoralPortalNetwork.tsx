import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Globe2, Link2, Plus, Save, ShieldCheck, Sparkles, ToggleLeft, ToggleRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const PRESET = 'madeira-1470-sp-2026';
const PRIMARY_PORTALS = [
  'https://quemvotar.drmadeira1470.com.br/blog/',
  'https://votardeputadofederal.drmadeira1470.com.br/blog/',
] as const;

type Resource = {
  id: string;
  label: string;
  url: string;
  category: string;
  tags: string[];
  editorial_hook: string;
  priority: number;
  active: boolean;
};

type Settings = {
  campaign_preset_id: string;
  primary_portals: string[];
  min_links_per_post: number;
  max_links_per_post: number;
  contextual_linking_enabled: boolean;
  aggregate_analytics_enabled: boolean;
  analytics_disable_after: string | null;
  geo_reporting_level: 'state' | 'city';
  allow_individual_voter_profiles: boolean;
  allow_political_preference_inference: boolean;
  ga4_measurement_id: string | null;
  gtm_web_container_id: string | null;
  gtm_server_container_url: string | null;
  optin_popup_enabled: boolean;
  optin_scroll_trigger_percent: number;
  optin_exit_intent_enabled: boolean;
  optin_dismiss_hours: number;
  optin_success_suppress_days: number;
  optin_privacy_url: string | null;
};

const emptySettings: Settings = {
  campaign_preset_id: PRESET,
  primary_portals: [...PRIMARY_PORTALS],
  min_links_per_post: 2,
  max_links_per_post: 5,
  contextual_linking_enabled: true,
  aggregate_analytics_enabled: true,
  analytics_disable_after: '2026-10-05T03:00:00.000Z',
  geo_reporting_level: 'city',
  allow_individual_voter_profiles: false,
  allow_political_preference_inference: false,
  ga4_measurement_id: null,
  gtm_web_container_id: null,
  gtm_server_container_url: null,
  optin_popup_enabled: true,
  optin_scroll_trigger_percent: 10,
  optin_exit_intent_enabled: true,
  optin_dismiss_hours: 24,
  optin_success_suppress_days: 90,
  optin_privacy_url: null,
};

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export default function ElectoralPortalNetwork() {
  const { toast } = useToast();
  const db = supabase as any;
  const [resources, setResources] = useState<Resource[]>([]);
  const [settings, setSettings] = useState<Settings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState('reference');
  const [newTags, setNewTags] = useState('');

  const activeResources = useMemo(() => resources.filter((item) => item.active), [resources]);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: resourceRows, error: resourceError }, { data: settingsRow, error: settingsError }] = await Promise.all([
        db.from('electoral_portal_resources').select('id,label,url,category,tags,editorial_hook,priority,active').eq('campaign_preset_id', PRESET).order('priority', { ascending: false }).order('label'),
        db.from('electoral_portal_settings').select('*').eq('campaign_preset_id', PRESET).maybeSingle(),
      ]);
      if (resourceError) throw resourceError;
      if (settingsError) throw settingsError;
      setResources(resourceRows || []);
      if (settingsRow) setSettings(settingsRow as Settings);
    } catch (error) {
      toast({ title: 'Falha ao carregar a rede eleitoral', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const addResource = async () => {
    const label = newLabel.trim();
    const url = newUrl.trim();
    if (label.length < 2 || !validHttpUrl(url)) {
      toast({ title: 'Informe nome e URL válida.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const tags = newTags.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 20);
      const { error } = await db.from('electoral_portal_resources').insert({
        campaign_preset_id: PRESET,
        label,
        url,
        category: newCategory,
        tags,
        editorial_hook: 'Aproveite também e conheça',
        priority: 50,
        active: true,
      });
      if (error) throw error;
      setNewLabel('');
      setNewUrl('');
      setNewTags('');
      await load();
      toast({ title: 'URL adicionada à biblioteca editorial.' });
    } catch (error) {
      toast({ title: 'Falha ao adicionar URL', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleResource = async (resource: Resource) => {
    const { error } = await db.from('electoral_portal_resources').update({ active: !resource.active, updated_at: new Date().toISOString() }).eq('id', resource.id);
    if (error) return toast({ title: 'Falha ao alterar URL', description: error.message, variant: 'destructive' });
    await load();
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const min = Math.max(0, Math.min(12, Number(settings.min_links_per_post) || 0));
      const max = Math.max(min, Math.min(12, Number(settings.max_links_per_post) || min));
      const optinScroll = Math.max(1, Math.min(90, Number(settings.optin_scroll_trigger_percent) || 10));
      const dismissHours = Math.max(1, Math.min(720, Number(settings.optin_dismiss_hours) || 24));
      const successDays = Math.max(1, Math.min(365, Number(settings.optin_success_suppress_days) || 90));
      const { error } = await db.from('electoral_portal_settings').upsert({
        ...settings,
        campaign_preset_id: PRESET,
        primary_portals: [...PRIMARY_PORTALS],
        min_links_per_post: min,
        max_links_per_post: max,
        optin_scroll_trigger_percent: optinScroll,
        optin_dismiss_hours: dismissHours,
        optin_success_suppress_days: successDays,
        allow_individual_voter_profiles: false,
        allow_political_preference_inference: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'campaign_preset_id' });
      if (error) throw error;
      await load();
      toast({ title: 'Configurações do portal gravadas.' });
    } catch (error) {
      toast({ title: 'Falha ao salvar', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black"><Globe2 className="h-6 w-6" /> Rede de Portais Eleitorais</h1>
          <p className="mt-1 text-sm text-muted-foreground">Interlinking editorial, biblioteca administrável de referências, cadastro voluntário e telemetria agregada do conteúdo.</p>
        </div>
        <Button asChild variant="outline"><a href="/1470" target="_blank" rel="noreferrer"><Sparkles className="mr-2 h-4 w-4" /> Abrir construtor /1470</a></Button>
      </div>

      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex gap-3 p-4 text-sm">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div><strong>Separação de dados:</strong> a navegação permanece agregada. O cadastro voluntário guarda somente os dados informados no formulário, consentimentos e o portal de origem; não vincula histórico individual de páginas ou rolagem ao contato cadastrado.</div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {PRIMARY_PORTALS.map((url) => (
          <Card key={url}>
            <CardHeader><CardTitle className="text-base">Portal principal</CardTitle><CardDescription>{url.includes('quemvotar') ? 'Quem Votar' : 'Votar Deputado Federal'}</CardDescription></CardHeader>
            <CardContent><Button asChild variant="outline"><a href={url} target="_blank" rel="noreferrer">Abrir portal <ExternalLink className="ml-2 h-4 w-4" /></a></Button></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-5 w-5" /> Seleção contextual de links</CardTitle>
          <CardDescription>Cada rascunho eleitoral pode receber um bloco curto de referências. A seleção usa relevância temática, prioridade e rotação, sem adaptar mensagem a características pessoais de visitantes.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div><Label>Mínimo por post</Label><Input type="number" min={0} max={12} value={settings.min_links_per_post} onChange={(e) => setSettings((s) => ({ ...s, min_links_per_post: Number(e.target.value) }))} /></div>
          <div><Label>Máximo por post</Label><Input type="number" min={0} max={12} value={settings.max_links_per_post} onChange={(e) => setSettings((s) => ({ ...s, max_links_per_post: Number(e.target.value) }))} /></div>
          <div><Label>GEO de relatório</Label><Select value={settings.geo_reporting_level} onValueChange={(value) => setSettings((s) => ({ ...s, geo_reporting_level: value as 'state' | 'city' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="state">Estado</SelectItem><SelectItem value="city">Cidade aproximada</SelectItem></SelectContent></Select></div>
          <div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => setSettings((s) => ({ ...s, contextual_linking_enabled: !s.contextual_linking_enabled }))}>{settings.contextual_linking_enabled ? <ToggleRight className="mr-2 h-4 w-4" /> : <ToggleLeft className="mr-2 h-4 w-4" />} Links contextuais {settings.contextual_linking_enabled ? 'ATIVOS' : 'INATIVOS'}</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pop-up de cadastro voluntário</CardTitle><CardDescription>Dispara no início da rolagem e, em desktop, também por intenção de saída. No máximo dois disparos por sessão quando o visitante fecha o primeiro; após cadastro concluído, o navegador fica suprimido pelo período configurado.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => setSettings((s) => ({ ...s, optin_popup_enabled: !s.optin_popup_enabled }))}>{settings.optin_popup_enabled ? <ToggleRight className="mr-2 h-4 w-4" /> : <ToggleLeft className="mr-2 h-4 w-4" />} Pop-up {settings.optin_popup_enabled ? 'ATIVO' : 'INATIVO'}</Button></div>
          <div><Label>Disparar após rolagem</Label><Input type="number" min={1} max={90} value={settings.optin_scroll_trigger_percent} onChange={(e) => setSettings((s) => ({ ...s, optin_scroll_trigger_percent: Number(e.target.value) }))} /><div className="mt-1 text-xs text-muted-foreground">Percentual da página, padrão 10%.</div></div>
          <div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => setSettings((s) => ({ ...s, optin_exit_intent_enabled: !s.optin_exit_intent_enabled }))}>{settings.optin_exit_intent_enabled ? <ToggleRight className="mr-2 h-4 w-4" /> : <ToggleLeft className="mr-2 h-4 w-4" />} Saída desktop {settings.optin_exit_intent_enabled ? 'ATIVA' : 'INATIVA'}</Button></div>
          <div><Label>Ocultar após fechar, horas</Label><Input type="number" min={1} max={720} value={settings.optin_dismiss_hours} onChange={(e) => setSettings((s) => ({ ...s, optin_dismiss_hours: Number(e.target.value) }))} /></div>
          <div><Label>Ocultar após cadastro, dias</Label><Input type="number" min={1} max={365} value={settings.optin_success_suppress_days} onChange={(e) => setSettings((s) => ({ ...s, optin_success_suppress_days: Number(e.target.value) }))} /></div>
          <div className="md:col-span-2 xl:col-span-3"><Label>Política de privacidade</Label><Input placeholder="https://.../politica-de-privacidade" value={settings.optin_privacy_url || ''} onChange={(e) => setSettings((s) => ({ ...s, optin_privacy_url: e.target.value.trim() || null }))} /></div>
          <div className="md:col-span-2 xl:col-span-4 rounded-md border bg-muted/30 p-3 text-sm"><strong>Botão final:</strong> 🪵 MADEIRAAA NELESS<br /><span className="text-xs text-muted-foreground">Campos: nome, email, WhatsApp, cidade, UF, novidades por email, novidades por WhatsApp, voluntariado e consentimento do cadastro.</span></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">GA4 e GTM Server</CardTitle><CardDescription>Os identificadores ficam configuráveis. O código de portal deverá emitir somente eventos editoriais e agregados.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div><Label>GA4 Measurement ID</Label><Input placeholder="G-XXXXXXXXXX" value={settings.ga4_measurement_id || ''} onChange={(e) => setSettings((s) => ({ ...s, ga4_measurement_id: e.target.value.trim() || null }))} /></div>
          <div><Label>GTM Web Container</Label><Input placeholder="GTM-XXXXXXX" value={settings.gtm_web_container_id || ''} onChange={(e) => setSettings((s) => ({ ...s, gtm_web_container_id: e.target.value.trim() || null }))} /></div>
          <div className="md:col-span-2"><Label>URL do GTM Server first-party</Label><Input placeholder="https://metrics.drmadeira1470.com.br" value={settings.gtm_server_container_url || ''} onChange={(e) => setSettings((s) => ({ ...s, gtm_server_container_url: e.target.value.trim() || null }))} /></div>
          <div><Label>Desativar analytics e pop-up após</Label><Input type="datetime-local" value={settings.analytics_disable_after ? new Date(settings.analytics_disable_after).toISOString().slice(0, 16) : ''} onChange={(e) => setSettings((s) => ({ ...s, analytics_disable_after: e.target.value ? new Date(e.target.value).toISOString() : null }))} /></div>
          <div className="flex items-end"><Button variant="outline" className="w-full" onClick={() => setSettings((s) => ({ ...s, aggregate_analytics_enabled: !s.aggregate_analytics_enabled }))}>{settings.aggregate_analytics_enabled ? <ToggleRight className="mr-2 h-4 w-4" /> : <ToggleLeft className="mr-2 h-4 w-4" />} Analytics agregado {settings.aggregate_analytics_enabled ? 'ATIVO' : 'INATIVO'}</Button></div>
          <div className="md:col-span-2"><Button onClick={() => void saveSettings()} disabled={saving}><Save className="mr-2 h-4 w-4" /> Salvar configurações</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Adicionar nova URL</CardTitle><CardDescription>Use esta biblioteca como fonte de referências editoriais. O gerador decide quais links são semanticamente pertinentes ao assunto do artigo.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div><Label>Nome</Label><Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Nome do canal ou página" /></div>
          <div><Label>URL</Label><Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." /></div>
          <div><Label>Categoria</Label><Select value={newCategory} onValueChange={setNewCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reference">Referência</SelectItem><SelectItem value="media">Mídia</SelectItem><SelectItem value="local-media">Mídia local</SelectItem><SelectItem value="social">Rede social</SelectItem><SelectItem value="podcast">Podcast</SelectItem><SelectItem value="video">Vídeo</SelectItem><SelectItem value="community">Comunidade</SelectItem><SelectItem value="education">Educação</SelectItem><SelectItem value="institutional">Institucional</SelectItem><SelectItem value="legal-reference">Conteúdo jurídico</SelectItem></SelectContent></Select></div>
          <div><Label>Tags, separadas por vírgula</Label><Input value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="trabalho, zona-sul, podcast" /></div>
          <div className="md:col-span-2 xl:col-span-4"><Button onClick={() => void addResource()} disabled={saving}><Plus className="mr-2 h-4 w-4" /> Adicionar URL</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Biblioteca editorial, {activeResources.length} ativas</CardTitle><CardDescription>Desative uma URL sem apagá-la. Isso interrompe a seleção para novas postagens.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {loading ? <div className="text-sm text-muted-foreground">Carregando...</div> : resources.map((resource) => (
            <div key={resource.id} className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{resource.label}</strong><Badge variant="outline">{resource.category}</Badge><Badge variant={resource.active ? 'default' : 'secondary'}>{resource.active ? 'ATIVA' : 'INATIVA'}</Badge></div>
                <a className="mt-1 block truncate text-xs text-primary hover:underline" href={resource.url} target="_blank" rel="noreferrer">{resource.url}</a>
                {resource.tags?.length ? <div className="mt-1 text-[11px] text-muted-foreground">{resource.tags.join(' · ')}</div> : null}
              </div>
              <Button size="sm" variant="outline" onClick={() => void toggleResource(resource)}>{resource.active ? <ToggleRight className="mr-2 h-4 w-4" /> : <ToggleLeft className="mr-2 h-4 w-4" />}{resource.active ? 'Desativar' : 'Ativar'}</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
