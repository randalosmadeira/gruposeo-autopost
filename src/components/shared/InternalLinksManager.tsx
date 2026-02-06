import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Link2,
  Plus,
  Trash2,
  Search,
  FileText,
  ExternalLink,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface InternalLink {
  id: string;
  anchor: string;
  url: string;
  source: 'manual' | 'suggested';
}

interface Article {
  id: string;
  title: string | null;
  keyword: string;
  slug: string | null;
  status: string;
  project_id: string | null;
}

interface InternalLinksManagerProps {
  links: InternalLink[];
  onLinksChange: (links: InternalLink[]) => void;
  projectId?: string;
  keyword?: string;
  accentColor?: string;
  maxLinks?: number;
}

export function InternalLinksManager({
  links,
  onLinksChange,
  projectId,
  keyword,
  accentColor = '#4169E1',
  maxLinks = 15,
}: InternalLinksManagerProps) {
  const { user } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [newAnchor, setNewAnchor] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch existing articles for suggestions
  useEffect(() => {
    async function fetchArticles() {
      if (!user) return;
      
      setLoading(true);
      try {
        let query = supabase
          .from('articles')
          .select('id, title, keyword, slug, status, project_id')
          .eq('user_id', user.id)
          .in('status', ['published', 'ready'])
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (projectId) {
          query = query.eq('project_id', projectId);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        setArticles(data || []);
      } catch (error) {
        console.error('Error fetching articles:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchArticles();
  }, [user, projectId]);

  // Filter articles based on search and exclude already added
  const filteredArticles = useMemo(() => {
    const addedUrls = new Set(links.map(l => l.url.toLowerCase()));
    
    return articles.filter(article => {
      // Exclude already added articles
      const articleUrl = article.slug ? `/${article.slug}` : '';
      if (addedUrls.has(articleUrl.toLowerCase())) return false;
      
      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          article.title?.toLowerCase().includes(query) ||
          article.keyword.toLowerCase().includes(query) ||
          article.slug?.toLowerCase().includes(query)
        );
      }
      
      return true;
    });
  }, [articles, links, searchQuery]);

  // Suggested articles based on keyword similarity
  const suggestedArticles = useMemo(() => {
    if (!keyword) return [];
    
    const keywordLower = keyword.toLowerCase();
    const words = keywordLower.split(/\s+/).filter(w => w.length > 3);
    
    return articles
      .filter(article => {
        const addedUrls = new Set(links.map(l => l.url.toLowerCase()));
        const articleUrl = article.slug ? `/${article.slug}` : '';
        if (addedUrls.has(articleUrl.toLowerCase())) return false;
        
        const title = article.title?.toLowerCase() || '';
        const kw = article.keyword.toLowerCase();
        
        return words.some(word => title.includes(word) || kw.includes(word));
      })
      .slice(0, 5);
  }, [articles, keyword, links]);

  const addLink = (link: Omit<InternalLink, 'id'>) => {
    if (links.length >= maxLinks) return;
    
    const newLink: InternalLink = {
      ...link,
      id: crypto.randomUUID(),
    };
    
    onLinksChange([...links, newLink]);
  };

  const removeLink = (id: string) => {
    onLinksChange(links.filter(l => l.id !== id));
  };

  const handleAddManual = () => {
    if (!newAnchor.trim() || !newUrl.trim()) return;
    
    addLink({
      anchor: newAnchor.trim(),
      url: newUrl.trim(),
      source: 'manual',
    });
    
    setNewAnchor('');
    setNewUrl('');
    setShowAddForm(false);
  };

  const handleAddFromArticle = (article: Article) => {
    const anchor = article.title || article.keyword;
    const url = article.slug ? `/${article.slug}` : `/artigos/${article.id}`;
    
    addLink({
      anchor,
      url,
      source: 'suggested',
    });
    
    setSearchOpen(false);
    setSearchQuery('');
  };

  const handleAddSuggested = (article: Article) => {
    const anchor = article.title || article.keyword;
    const url = article.slug ? `/${article.slug}` : `/artigos/${article.id}`;
    
    addLink({
      anchor,
      url,
      source: 'suggested',
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${accentColor}15` }}
          >
            <Link2 className="w-4 h-4" style={{ color: accentColor }} />
          </div>
          <div>
            <p className="text-sm font-medium">Links Internos</p>
            <p className="text-xs text-muted-foreground">
              {links.length}/{maxLinks} links adicionados
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {/* Search existing articles */}
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={links.length >= maxLinks}
                className="gap-1"
              >
                <Search className="w-3.5 h-3.5" />
                Buscar
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <Command>
                <CommandInput
                  placeholder="Buscar artigos..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  <CommandEmpty>
                    {loading ? 'Carregando...' : 'Nenhum artigo encontrado'}
                  </CommandEmpty>
                  <CommandGroup heading="Artigos Disponíveis">
                    {filteredArticles.slice(0, 10).map((article) => (
                      <CommandItem
                        key={article.id}
                        onSelect={() => handleAddFromArticle(article)}
                        className="cursor-pointer"
                      >
                        <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">
                            {article.title || article.keyword}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {article.slug || 'Sem slug'}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'ml-2 text-xs',
                            article.status === 'published'
                              ? 'border-green-300 text-green-700'
                              : 'border-blue-300 text-blue-700'
                          )}
                        >
                          {article.status === 'published' ? 'Publicado' : 'Pronto'}
                        </Badge>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          
          {/* Add manual link */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            disabled={links.length >= maxLinks}
            className="gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Manual
          </Button>
        </div>
      </div>

      {/* Suggested Articles */}
      {suggestedArticles.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-medium text-amber-800">Sugestões Automáticas</p>
          </div>
          <p className="text-xs text-amber-700 mb-3">
            Artigos relacionados à sua palavra-chave "{keyword}"
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestedArticles.map((article) => (
              <Badge
                key={article.id}
                variant="outline"
                className="cursor-pointer hover:bg-amber-100 border-amber-300 text-amber-800 gap-1"
                onClick={() => handleAddSuggested(article)}
              >
                <Plus className="w-3 h-3" />
                {(article.title || article.keyword).slice(0, 30)}
                {(article.title || article.keyword).length > 30 && '...'}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Manual Add Form */}
      {showAddForm && (
        <div className="p-4 rounded-lg border bg-background space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Texto âncora</Label>
            <Input
              placeholder="ex: guia de marketing digital"
              value={newAnchor}
              onChange={(e) => setNewAnchor(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">URL do link</Label>
            <Input
              placeholder="ex: /artigos/guia-marketing-digital"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddManual} disabled={!newAnchor || !newUrl}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              Adicionar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Links List */}
      {links.length > 0 ? (
        <ScrollArea className="h-[200px]">
          <div className="space-y-2 pr-4">
            {links.map((link, index) => (
              <div
                key={link.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:border-primary/30 transition-colors group"
              >
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{link.anchor}</p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" />
                    {link.url}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs',
                    link.source === 'suggested'
                      ? 'border-amber-300 text-amber-700'
                      : 'border-gray-300 text-gray-700'
                  )}
                >
                  {link.source === 'suggested' ? 'Auto' : 'Manual'}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeLink(link.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum link interno adicionado</p>
          <p className="text-xs">Use os botões acima para adicionar links</p>
        </div>
      )}

      {/* Info */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
        <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
        <div className="text-xs text-blue-700">
          <p className="font-medium mb-1">Dicas para links internos eficazes:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Use textos âncora descritivos e variados</li>
            <li>Distribua os links ao longo do conteúdo</li>
            <li>Priorize artigos do mesmo cluster temático</li>
            <li>Ideal: 1 link a cada 150-200 palavras</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
