import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileText, Plus, Search, MoreHorizontal, Eye, Pencil, Trash2, Globe, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useArticles } from '@/hooks/useArticles';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig = { draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' }, generating: { label: 'Gerando', className: 'bg-warning/10 text-warning' }, ready: { label: 'Pronto', className: 'bg-info/10 text-info' }, published: { label: 'Publicado', className: 'bg-success/10 text-success' }, error: { label: 'Erro', className: 'bg-destructive/10 text-destructive' } };
const typeConfig = { blog: { label: 'Blog', className: 'bg-primary/10 text-primary' }, sales: { label: 'Vendas', className: 'bg-accent/10 text-accent' }, review: { label: 'Review', className: 'bg-premium/10 text-premium' }, comparison: { label: 'Comparação', className: 'bg-info/10 text-info' } };

export default function ArticlesList() {
  const { articles, isLoading, deleteArticle } = useArticles();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredArticles = articles.filter((a) => {
    const matchesSearch = a.title?.toLowerCase().includes(search.toLowerCase()) || a.keyword.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FileText className="w-6 h-6 text-primary" />Artigos</h1><p className="text-muted-foreground">Gerencie todos os seus artigos</p></div>
        <Button asChild className="bg-gradient-primary hover:opacity-90"><Link to="/articles/new"><Plus className="w-4 h-4 mr-2" />Novo Artigo</Link></Button>
      </div>
      <div className="bg-card rounded-xl p-4 shadow-card flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Buscar..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="draft">Rascunho</SelectItem><SelectItem value="ready">Pronto</SelectItem><SelectItem value="published">Publicado</SelectItem></SelectContent></Select>
      </div>
      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        {filteredArticles.length === 0 ? <div className="p-12 text-center"><FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" /><p className="text-muted-foreground">{articles.length === 0 ? 'Nenhum artigo criado' : 'Nenhum resultado'}</p></div> : (
          <Table><TableHeader><TableRow><TableHead>Artigo</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead>Data</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>{filteredArticles.map((article) => (
              <TableRow key={article.id} className="group">
                <TableCell><p className="font-medium">{article.title || article.keyword}</p><p className="text-xs text-muted-foreground">{article.keyword}</p></TableCell>
                <TableCell><Badge className={cn('font-normal', typeConfig[article.type].className)}>{typeConfig[article.type].label}</Badge></TableCell>
                <TableCell><Badge className={cn('font-normal', statusConfig[article.status].className)}>{statusConfig[article.status].label}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{format(new Date(article.created_at), 'dd/MM/yy', { locale: ptBR })}</TableCell>
                <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem><Eye className="w-4 h-4 mr-2" />Ver</DropdownMenuItem><DropdownMenuItem className="text-destructive" onClick={() => deleteArticle.mutate(article.id)}><Trash2 className="w-4 h-4 mr-2" />Excluir</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
