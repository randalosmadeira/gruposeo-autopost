import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  FolderKanban, 
  Plus, 
  Search, 
  Loader2, 
  TrendingUp, 
  ExternalLink,
  HelpCircle,
  Globe,
  CheckCircle2,
  FileText,
  Pencil,
  Trash2,
  Save,
  X,
  Check
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useWordPressStats } from '@/hooks/useWordPressStats';
import { cn } from '@/lib/utils';

export default function ProjectsList() {
  const { projects, isLoading, createProject, updateProject, deleteProject } = useProjects();
  const { allStats } = useWordPressStats();
  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newProject, setNewProject] = useState({ name: '', domain: '', description: '' });
  const [selectedSite, setSelectedSite] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);

  const filteredProjects = projects.filter((p) => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.domain.toLowerCase().includes(search.toLowerCase())
  );

  // Get unique WordPress URLs from projects for the site selector
  const wordpressSites = projects
    .filter(p => p.wordpress_url)
    .map(p => p.wordpress_url!)
    .filter((url, index, self) => self.indexOf(url) === index);

  // Get stats for a project
  const getProjectStats = (projectId: string) => {
    const stats = allStats?.find(s => s.project_id === projectId);
    return {
      total: stats?.total_articles || 0,
      published: stats?.published_articles || 0,
      draft: stats?.draft_articles || 0
    };
  };

  const handleCreate = async () => {
    if (!newProject.name) return;
    
    const domain = selectedSite || newProject.domain;
    if (!domain) return;

    await createProject.mutateAsync({ 
      name: newProject.name, 
      domain: domain.replace(/^https?:\/\//, ''),
      description: newProject.description || null,
      wordpress_url: selectedSite || null
    });
    setNewProject({ name: '', domain: '', description: '' });
    setSelectedSite('');
    
    // Show success animation
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleSelectProject = (id: string) => {
    if (editingProjectId === id) return;
    setSelectedProjectId(id === selectedProjectId ? null : id);
  };

  const handleStartEditing = (e: React.MouseEvent, project: { id: string; name: string }) => {
    e.stopPropagation();
    setEditingProjectId(project.id);
    setEditingName(project.name);
  };

  const handleSaveEdit = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!editingName.trim()) return;
    
    await updateProject.mutateAsync({
      id: projectId,
      name: editingName.trim()
    });
    setEditingProjectId(null);
    setEditingName('');
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProjectId(null);
    setEditingName('');
  };

  const handleDeleteProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Tem certeza que deseja excluir este projeto?')) {
      deleteProject.mutate(id);
      if (selectedProjectId === id) {
        setSelectedProjectId(null);
      }
    }
  };

  const getProjectInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getProjectColor = (name: string) => {
    const colors = [
      'bg-blue-500',
      'bg-orange-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-teal-500',
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const projectLimit = 200;
  const projectsUsed = projects.length;
  const progressPercent = (projectsUsed / projectLimit) * 100;

  // Get selected project for editing form
  const selectedProject = selectedProjectId 
    ? projects.find(p => p.id === selectedProjectId) 
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] bg-muted/30">
      {/* Sidebar - Projects List */}
      <aside className="w-80 border-r border-border bg-background p-4 flex flex-col gap-4">
        {/* Plan Card */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Profissional</span>
            </div>
            <Progress value={progressPercent} className="h-1.5 mb-2" />
            <p className="text-xs text-muted-foreground">
              {projectsUsed} de {projectLimit} projetos utilizados
            </p>
          </CardContent>
        </Card>

        {/* New Project Button */}
        <Button 
          variant="outline" 
          className="w-full justify-start gap-2 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
          onClick={() => setSelectedProjectId(null)}
        >
          <Plus className="w-4 h-4" />
          Novo projeto
        </Button>

        {/* Projects List */}
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Seus Projetos</h3>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {projects.length}
            </span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar projeto..." 
              className="pl-9 h-9 text-sm" 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
            />
          </div>

          {/* Project Items */}
          <div className="flex-1 overflow-y-auto space-y-1">
            {filteredProjects.map((project) => {
              const stats = getProjectStats(project.id);
              const isEditing = editingProjectId === project.id;
              
              return (
                <div
                  key={project.id}
                  onClick={() => handleSelectProject(project.id)}
                  className={cn(
                    'w-full flex items-start gap-3 p-2.5 rounded-lg transition-all cursor-pointer group',
                    'hover:bg-muted/80',
                    selectedProjectId === project.id && 'bg-muted ring-1 ring-primary/20'
                  )}
                >
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
                    getProjectColor(project.name)
                  )}>
                    {getProjectInitials(project.name)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="h-7 text-sm"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(e as any, project.id);
                            if (e.key === 'Escape') handleCancelEdit(e as any);
                          }}
                          autoFocus
                        />
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-7 w-7 text-green-600"
                          onClick={(e) => handleSaveEdit(e, project.id)}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-7 w-7 text-muted-foreground"
                          onClick={handleCancelEdit}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          <p className="text-sm font-medium truncate">{project.name}</p>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => handleStartEditing(e, project)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{project.domain}</p>
                      </>
                    )}
                    
                    {/* Stats badges */}
                    {stats.total > 0 && !isEditing && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-1">
                          <FileText className="w-2.5 h-2.5" />
                          {stats.total}
                        </Badge>
                        {stats.published > 0 && (
                          <Badge className="text-[10px] px-1.5 py-0 h-4 gap-1 bg-green-500/10 text-green-600 hover:bg-green-500/20">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            {stats.published}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Delete button */}
                  {!isEditing && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                      onClick={(e) => handleDeleteProject(e, project.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}

            {filteredProjects.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <FolderKanban className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhum projeto encontrado</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content - New Project Form or Edit Form */}
      <main className="flex-1 p-8">
        <Card className="max-w-2xl mx-auto border-border/50 shadow-sm relative overflow-hidden">
          {/* Success Animation Overlay */}
          {showSuccess && (
            <div className="absolute inset-0 bg-background/95 z-10 flex flex-col items-center justify-center animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4 animate-scale-in">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Projeto Criado!</h3>
              <p className="text-sm text-muted-foreground">Seu projeto foi criado com sucesso.</p>
            </div>
          )}

          <CardContent className="p-6">
            {/* Header */}
            <div className="flex items-start gap-3 mb-6">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                selectedProject ? getProjectColor(selectedProject.name) : "bg-primary/10"
              )}>
                {selectedProject ? (
                  <span className="text-white font-bold text-sm">
                    {getProjectInitials(selectedProject.name)}
                  </span>
                ) : (
                  <Plus className="w-5 h-5 text-primary" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  {selectedProject ? 'Editar Projeto' : 'Novo Projeto'}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {selectedProject 
                    ? 'Atualize as informações do seu projeto' 
                    : 'Organize seus artigos em projetos dedicados'}
                </p>
              </div>
            </div>

            {/* Form */}
            {selectedProject ? (
              <EditProjectForm 
                project={selectedProject} 
                onUpdate={updateProject.mutateAsync}
                isUpdating={updateProject.isPending}
                stats={getProjectStats(selectedProject.id)}
              />
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="projectName" className="text-sm font-medium">
                    Nome do Projeto
                  </Label>
                  <Input 
                    id="projectName"
                    placeholder="Ex: Meu Blog de Tecnologia"
                    value={newProject.name} 
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} 
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="siteSelect" className="text-sm font-medium">
                    Site Associado
                  </Label>
                  <Select value={selectedSite} onValueChange={setSelectedSite}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Selecione o site" />
                    </SelectTrigger>
                    <SelectContent>
                      {wordpressSites.map((url) => (
                        <SelectItem key={url} value={url} className="max-w-full">
                          <span className="flex items-center gap-2 min-w-0">
                            <Globe className="w-4 h-4 text-muted-foreground" />
                            <span className="truncate" title={url}>
                              {url}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                      {wordpressSites.length === 0 && (
                        <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                          Nenhum site WordPress conectado
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Manual domain input if no site selected */}
                {!selectedSite && (
                  <div className="space-y-2">
                    <Label htmlFor="domain" className="text-sm font-medium text-muted-foreground">
                      Ou digite o domínio manualmente
                    </Label>
                    <Input 
                      id="domain"
                      placeholder="meublog.com.br"
                      value={newProject.domain} 
                      onChange={(e) => setNewProject({ ...newProject, domain: e.target.value })} 
                      className="h-11"
                    />
                  </div>
                )}

                {/* Configure Integration Link */}
                <a 
                  href="/settings" 
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-4 h-4" />
                  Configurar integração
                </a>

                {/* Create Button */}
                <div className="flex justify-end pt-2">
                  <Button 
                    onClick={handleCreate} 
                    disabled={!newProject.name || (!selectedSite && !newProject.domain) || createProject.isPending}
                    className="bg-gradient-primary hover:opacity-90 px-6"
                  >
                    {createProject.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    <Plus className="w-4 h-4 mr-2" />
                    Criar Projeto
                  </Button>
                </div>
              </div>
            )}

            {/* Help Section */}
            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <HelpCircle className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Precisa de ajuda?</p>
                  <p className="text-sm text-muted-foreground">
                    Assista nosso tutorial de integração:{' '}
                    <a href="/wordpress-plugin" className="text-primary hover:underline">
                      Como integrar seu site WordPress
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

// Edit Project Form Component
function EditProjectForm({ 
  project, 
  onUpdate, 
  isUpdating,
  stats 
}: { 
  project: any;
  onUpdate: (data: any) => Promise<any>;
  isUpdating: boolean;
  stats: { total: number; published: number; draft: number };
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [socialInstagram, setSocialInstagram] = useState(project.social_instagram || '');
  const [socialYoutube, setSocialYoutube] = useState(project.social_youtube || '');
  const [socialLinkedin, setSocialLinkedin] = useState(project.social_linkedin || '');
  const [socialTwitter, setSocialTwitter] = useState(project.social_twitter || '');
  const [socialTiktok, setSocialTiktok] = useState(project.social_tiktok || '');
  const [socialGoogleMaps, setSocialGoogleMaps] = useState(project.social_google_maps || '');
  const [socialLinktree, setSocialLinktree] = useState(project.social_linktree || '');
  const [ctaComunidade, setCtaComunidade] = useState(project.cta_comunidade || '');
  const [ctaConclusao, setCtaConclusao] = useState(project.cta_conclusao || '');
  const [ctaLeads, setCtaLeads] = useState(project.cta_leads || '');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description || '');
    setSocialInstagram(project.social_instagram || '');
    setSocialYoutube(project.social_youtube || '');
    setSocialLinkedin(project.social_linkedin || '');
    setSocialTwitter(project.social_twitter || '');
    setSocialTiktok(project.social_tiktok || '');
    setSocialGoogleMaps(project.social_google_maps || '');
    setSocialLinktree(project.social_linktree || '');
    setCtaComunidade(project.cta_comunidade || '');
    setCtaConclusao(project.cta_conclusao || '');
    setCtaLeads(project.cta_leads || '');
    setHasChanges(false);
  }, [project]);

  const handleFieldChange = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setHasChanges(true);
  };

  const handleSave = async () => {
    await onUpdate({
      id: project.id,
      name,
      description: description || null,
      social_instagram: socialInstagram || null,
      social_youtube: socialYoutube || null,
      social_linkedin: socialLinkedin || null,
      social_twitter: socialTwitter || null,
      social_tiktok: socialTiktok || null,
      social_google_maps: socialGoogleMaps || null,
      social_linktree: socialLinktree || null,
      cta_comunidade: ctaComunidade || null,
      cta_conclusao: ctaConclusao || null,
      cta_leads: ctaLeads || null,
    });
    setHasChanges(false);
  };

  return (
    <div className="space-y-5">
      {/* Stats Card */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-muted/50 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total de Artigos</p>
        </div>
        <div className="p-3 rounded-lg bg-green-500/10 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.published}</p>
          <p className="text-xs text-muted-foreground">Publicados</p>
        </div>
        <div className="p-3 rounded-lg bg-orange-500/10 text-center">
          <p className="text-2xl font-bold text-orange-600">{stats.draft}</p>
          <p className="text-xs text-muted-foreground">Rascunhos</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="editName" className="text-sm font-medium">Nome do Projeto</Label>
        <Input id="editName" value={name} onChange={(e) => handleFieldChange(setName)(e.target.value)} className="h-10" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Domínio</Label>
        <Input value={project.domain} disabled className="h-10 bg-muted" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="editDescription" className="text-sm font-medium">Descrição</Label>
        <Input id="editDescription" placeholder="Descrição do projeto..." value={description} onChange={(e) => handleFieldChange(setDescription)(e.target.value)} className="h-10" />
      </div>

      {/* Redes Sociais */}
      <div className="pt-4 border-t border-border">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          Redes Sociais (Link Juice & SEO)
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Instagram</Label>
            <Input placeholder="https://instagram.com/..." value={socialInstagram} onChange={(e) => handleFieldChange(setSocialInstagram)(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">YouTube</Label>
            <Input placeholder="https://youtube.com/@..." value={socialYoutube} onChange={(e) => handleFieldChange(setSocialYoutube)(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">LinkedIn</Label>
            <Input placeholder="https://linkedin.com/in/..." value={socialLinkedin} onChange={(e) => handleFieldChange(setSocialLinkedin)(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">X (Twitter)</Label>
            <Input placeholder="https://x.com/..." value={socialTwitter} onChange={(e) => handleFieldChange(setSocialTwitter)(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">TikTok</Label>
            <Input placeholder="https://tiktok.com/@..." value={socialTiktok} onChange={(e) => handleFieldChange(setSocialTiktok)(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Google Maps</Label>
            <Input placeholder="https://maps.app.goo.gl/..." value={socialGoogleMaps} onChange={(e) => handleFieldChange(setSocialGoogleMaps)(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-muted-foreground">Linktree / Links</Label>
            <Input placeholder="https://linktr.ee/..." value={socialLinktree} onChange={(e) => handleFieldChange(setSocialLinktree)(e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
      </div>

      {/* CTAs Estratégicos */}
      <div className="pt-4 border-t border-border">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ExternalLink className="w-4 h-4 text-primary" />
          CTAs Estratégicos
        </h3>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">CTA Comunidade</Label>
            <Input placeholder="Ex: Participe do nosso grupo no WhatsApp..." value={ctaComunidade} onChange={(e) => handleFieldChange(setCtaComunidade)(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">CTA Conclusão / Fechamento</Label>
            <Input placeholder="Ex: Entre em contato com nossos especialistas..." value={ctaConclusao} onChange={(e) => handleFieldChange(setCtaConclusao)(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">CTA Leads</Label>
            <Input placeholder="Ex: Baixe nosso e-book gratuito..." value={ctaLeads} onChange={(e) => handleFieldChange(setCtaLeads)(e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
      </div>

      {/* WordPress Connection Status */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
        <div className={cn("w-2 h-2 rounded-full", project.is_connected ? "bg-green-500" : "bg-orange-500")} />
        <span className="text-sm">{project.is_connected ? 'WordPress conectado' : 'WordPress não conectado'}</span>
        {project.wordpress_url && (
          <a href={project.wordpress_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline ml-auto">{project.wordpress_url}</a>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={!hasChanges || isUpdating || !name.trim()} className="bg-gradient-primary hover:opacity-90 px-6">
          {isUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" />
          Salvar Alterações
        </Button>
      </div>
    </div>
  );
}
