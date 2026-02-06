import { useState } from 'react';
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
import { 
  FolderKanban, 
  Plus, 
  Search, 
  Loader2, 
  TrendingUp, 
  ExternalLink,
  HelpCircle,
  Globe
} from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { cn } from '@/lib/utils';

export default function ProjectsList() {
  const { projects, isLoading, createProject, deleteProject } = useProjects();
  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProject, setNewProject] = useState({ name: '', domain: '', description: '' });
  const [selectedSite, setSelectedSite] = useState<string>('');

  const filteredProjects = projects.filter((p) => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.domain.toLowerCase().includes(search.toLowerCase())
  );

  // Get unique WordPress URLs from projects for the site selector
  const wordpressSites = projects
    .filter(p => p.wordpress_url)
    .map(p => p.wordpress_url!)
    .filter((url, index, self) => self.indexOf(url) === index);

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
  };

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id === selectedProjectId ? null : id);
  };

  const handleDeleteProject = (id: string) => {
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
            {filteredProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => handleSelectProject(project.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors text-left',
                  'hover:bg-muted/80',
                  selectedProjectId === project.id && 'bg-muted'
                )}
              >
                <div className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold',
                  getProjectColor(project.name)
                )}>
                  {getProjectInitials(project.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{project.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{project.domain}</p>
                </div>
              </button>
            ))}

            {filteredProjects.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <FolderKanban className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhum projeto encontrado</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content - New Project Form */}
      <main className="flex-1 p-8">
        <Card className="max-w-2xl mx-auto border-border/50 shadow-sm">
          <CardContent className="p-6">
            {/* Header */}
            <div className="flex items-start gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Novo Projeto</h1>
                <p className="text-sm text-muted-foreground">
                  Organize seus artigos em projetos dedicados
                </p>
              </div>
            </div>

            {/* Form */}
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
                      <SelectItem key={url} value={url}>
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-muted-foreground" />
                          {url}
                        </div>
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
