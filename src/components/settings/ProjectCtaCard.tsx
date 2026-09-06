import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Megaphone } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FormState = {
  empresa_nome: string; empresa_telefone: string; empresa_whatsapp: string; email: string;
  site: string; social_instagram: string; social_linkedin: string; social_youtube: string;
  social_tiktok: string; social_twitter: string; social_google_maps: string;
  cta_leads: string; cta_conclusao: string;
};

const EMPTY: FormState = {
  empresa_nome: '', empresa_telefone: '', empresa_whatsapp: '', email: '', site: '', social_instagram: '',
  social_linkedin: '', social_youtube: '', social_tiktok: '', social_twitter: '', social_google_maps: '', cta_leads: '', cta_conclusao: '',
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function ProjectCtaCard() {
  const { projects, updateProject } = useProjects();
  const [projectId, setProjectId] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY);
  const project = projects.find((item) => item.id === projectId);

  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projectId, projects]);

  useEffect(() => {
    if (!project) return;
    const commercial = asObject(project.commercial_info);
    setForm({
      empresa_nome: project.empresa_nome || '', empresa_telefone: project.empresa_telefone || '', empresa_whatsapp: project.empresa_whatsapp || '',
      email: String(commercial.email || ''), site: project.wordpress_url || `https://${project.domain}`,
      social_instagram: project.social_instagram || '', social_linkedin: project.social_linkedin || '', social_youtube: project.social_youtube || '',
      social_tiktok: project.social_tiktok || '', social_twitter: project.social_twitter || '', social_google_maps: project.social_google_maps || '',
      cta_leads: project.cta_leads || '', cta_conclusao: project.cta_conclusao || '',
    });
  }, [project]);

  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const save = async () => {
    if (!project) return;
    const currentCommercial = asObject(project.commercial_info);
    await updateProject.mutateAsync({
      id: project.id,
      empresa_nome: form.empresa_nome || null,
      empresa_telefone: form.empresa_telefone || null,
      empresa_whatsapp: form.empresa_whatsapp || null,
      social_instagram: form.social_instagram || null,
      social_linkedin: form.social_linkedin || null,
      social_youtube: form.social_youtube || null,
      social_tiktok: form.social_tiktok || null,
      social_twitter: form.social_twitter || null,
      social_google_maps: form.social_google_maps || null,
      cta_leads: form.cta_leads || null,
      cta_conclusao: form.cta_conclusao || null,
      commercial_info: {
        ...currentCommercial,
        phone: form.empresa_telefone,
        whatsapp: form.empresa_whatsapp,
        email: form.email,
        default_cta_text: form.cta_conclusao,
        default_cta_url: form.cta_leads,
        google_maps_url: form.social_google_maps,
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" />Identidade, contatos e CTA automático</CardTitle>
        <CardDescription>Estes dados são herdados pelo gerador em massa para inserir chamadas e links corretos em cada conteúdo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {projects.length === 0 ? <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Conecte seu primeiro blog acima para liberar os dados de contato e CTA.</div> : <>
          <div className="space-y-2"><Label>Projeto</Label><Select value={projectId} onValueChange={setProjectId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{projects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome da marca ou escritório" value={form.empresa_nome} onChange={set('empresa_nome')} />
            <Field label="Site oficial" value={form.site} onChange={set('site')} disabled />
            <Field label="Telefone" value={form.empresa_telefone} onChange={set('empresa_telefone')} />
            <Field label="WhatsApp" value={form.empresa_whatsapp} onChange={set('empresa_whatsapp')} />
            <Field label="E-mail de contato" value={form.email} onChange={set('email')} type="email" />
            <Field label="Google Meu Negócio / Maps" value={form.social_google_maps} onChange={set('social_google_maps')} placeholder="https://maps.google.com/..." />
            <Field label="Instagram" value={form.social_instagram} onChange={set('social_instagram')} />
            <Field label="LinkedIn" value={form.social_linkedin} onChange={set('social_linkedin')} />
            <Field label="YouTube" value={form.social_youtube} onChange={set('social_youtube')} />
            <Field label="TikTok" value={form.social_tiktok} onChange={set('social_tiktok')} />
            <Field label="Twitter / X" value={form.social_twitter} onChange={set('social_twitter')} />
            <Field label="Link principal do CTA" value={form.cta_leads} onChange={set('cta_leads')} placeholder="WhatsApp, formulário ou página de contato" />
            <div className="md:col-span-2"><Field label="Texto padrão do CTA" value={form.cta_conclusao} onChange={set('cta_conclusao')} placeholder="Fale com nossa equipe" /></div>
          </div>
          <div className="flex justify-end"><Button onClick={save} disabled={!project || updateProject.isPending}>{updateProject.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}Salvar identidade e CTA</Button></div>
        </>}
      </CardContent>
    </Card>
  );
}

function Field(props: React.ComponentProps<typeof Input> & { label: string }) {
  const { label, ...inputProps } = props;
  return <div className="space-y-2"><Label>{label}</Label><Input {...inputProps} /></div>;
}
