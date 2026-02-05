import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { FolderKanban, Plus, Search, Loader2 } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useArticles } from '@/hooks/useArticles';
import { ProjectCard } from '@/components/projects/ProjectCard';

export default function ProjectsList() {
  const { projects, isLoading, createProject, updateProject, deleteProject } = useProjects();
  const { articles } = useArticles();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', domain: '', description: '' });

  const filteredProjects = projects.filter((p) => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.domain.toLowerCase().includes(search.toLowerCase())
  );

  const getStats = (id: string) => { 
    const a = articles.filter((x) => x.project_id === id); 
    return { total: a.length, published: a.filter((x) => x.status === 'published').length }; 
  };

  const handleCreate = async () => {
    if (!newProject.name || !newProject.domain) return;
    await createProject.mutateAsync({ 
      name: newProject.name, 
      domain: newProject.domain, 
      description: newProject.description || null 
    });
    setNewProject({ name: '', domain: '', description: '' });
    setIsDialogOpen(false);
  };

  const handleUpdate = async (data: Parameters<typeof updateProject.mutateAsync>[0]) => {
    await updateProject.mutateAsync(data);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este projeto?')) {
      deleteProject.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-primary" />
            Projetos
          </h1>
          <p className="text-muted-foreground">
            Gerencie seus sites WordPress e credenciais de publicação
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Novo Projeto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Projeto</DialogTitle>
              <DialogDescription>
                Adicione um novo site WordPress
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome do Projeto</Label>
                <Input 
                  placeholder="Meu Blog"
                  value={newProject.name} 
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} 
                />
              </div>
              <div className="space-y-2">
                <Label>Domínio</Label>
                <Input 
                  placeholder="meublog.com"
                  value={newProject.domain} 
                  onChange={(e) => setNewProject({ ...newProject, domain: e.target.value })} 
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Input 
                  placeholder="Blog sobre tecnologia..."
                  value={newProject.description} 
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} 
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleCreate} 
                disabled={!newProject.name || !newProject.domain || createProject.isPending}
              >
                {createProject.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar Projeto
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar projetos..." 
          className="pl-10" 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
        />
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            stats={getStats(project.id)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            isUpdating={updateProject.isPending}
          />
        ))}
        
        {/* Add New Card */}
        <Card 
          className="border-dashed cursor-pointer hover:border-primary/50 transition-colors" 
          onClick={() => setIsDialogOpen(true)}
        >
          <CardContent className="flex flex-col items-center justify-center h-full min-h-[200px]">
            <Plus className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-muted-foreground font-medium">Adicionar Projeto</p>
            <p className="text-xs text-muted-foreground mt-1">
              Configure um novo site WordPress
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Empty State */}
      {filteredProjects.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <FolderKanban className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">Nenhum projeto encontrado</h3>
          <p className="text-muted-foreground mb-4">
            {search ? 'Tente uma busca diferente' : 'Crie seu primeiro projeto WordPress'}
          </p>
          {!search && (
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Projeto
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
