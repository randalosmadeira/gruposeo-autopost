import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FolderKanban, Plus, Search, Globe, FileText, CheckCircle2, MoreHorizontal, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProjects } from '@/hooks/useProjects';
import { useArticles } from '@/hooks/useArticles';

export default function ProjectsList() {
  const { projects, isLoading, createProject, deleteProject } = useProjects();
  const { articles } = useArticles();
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', domain: '', description: '' });

  const filteredProjects = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const getStats = (id: string) => { const a = articles.filter((x) => x.project_id === id); return { total: a.length, published: a.filter((x) => x.status === 'published').length }; };

  const handleCreate = async () => {
    if (!newProject.name || !newProject.domain) return;
    await createProject.mutateAsync({ name: newProject.name, domain: newProject.domain, description: newProject.description || null });
    setNewProject({ name: '', domain: '', description: '' });
    setIsDialogOpen(false);
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FolderKanban className="w-6 h-6 text-primary" />Projetos</h1><p className="text-muted-foreground">Gerencie seus sites</p></div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild><Button className="bg-gradient-primary hover:opacity-90"><Plus className="w-4 h-4 mr-2" />Novo Projeto</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Projeto</DialogTitle><DialogDescription>Adicione um novo site</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Nome</Label><Input value={newProject.name} onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Domínio</Label><Input value={newProject.domain} onChange={(e) => setNewProject({ ...newProject, domain: e.target.value })} /></div>
              <div className="space-y-2"><Label>Descrição</Label><Input value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button><Button onClick={handleCreate} disabled={!newProject.name || !newProject.domain || createProject.isPending}>{createProject.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.map((p) => { const s = getStats(p.id); return (
          <Card key={p.id} className="group hover:shadow-card-hover hover:-translate-y-1 transition-all">
            <CardHeader className="pb-3"><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center text-primary-foreground"><Globe className="w-6 h-6" /></div><div><CardTitle className="text-lg">{p.name}</CardTitle><CardDescription className="text-xs">{p.domain}</CardDescription></div></div>
              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem className="text-destructive" onClick={() => deleteProject.mutate(p.id)}><Trash2 className="w-4 h-4 mr-2" />Excluir</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            </div></CardHeader>
            <CardContent className="space-y-4">{p.description && <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>}<div className="flex gap-4"><span className="flex items-center gap-1 text-sm"><FileText className="w-4 h-4" /><strong>{s.total}</strong></span><span className="flex items-center gap-1 text-sm"><CheckCircle2 className="w-4 h-4 text-success" /><strong>{s.published}</strong></span></div><Badge className={cn(p.is_connected ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>{p.is_connected ? 'Conectado' : 'Não Conectado'}</Badge></CardContent>
          </Card>
        ); })}
        <Card className="border-dashed cursor-pointer hover:border-primary/50" onClick={() => setIsDialogOpen(true)}><CardContent className="flex flex-col items-center justify-center h-full min-h-[200px]"><Plus className="w-8 h-8 text-muted-foreground mb-2" /><p className="text-muted-foreground">Adicionar Projeto</p></CardContent></Card>
      </div>
    </div>
  );
}
