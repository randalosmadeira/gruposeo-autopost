import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Link2,
  Plus,
  Trash2,
  Search,
  FileText,
  ExternalLink,
  Sparkles,
  AlertCircle,
  Upload,
  Eye,
  Copy,
  Filter,
  X,
  FileUp,
  ClipboardPaste,
  Pencil,
  Check,
  AlertTriangle,
  GripVertical,
  Youtube,
  Instagram,
  Linkedin,
  Twitter,
  Facebook,
  Globe,
  Newspaper,
  ShoppingBag,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Link types for categorization
export type LinkType = 'article' | 'video' | 'social' | 'ecommerce' | 'resource' | 'external';

export interface InternalLink {
  id: string;
  anchor: string;
  url: string;
  source: 'manual' | 'suggested' | 'imported';
  type?: LinkType;
}

// Detect link type from URL
function detectLinkType(url: string): LinkType {
  const lowerUrl = url.toLowerCase();
  
  // Video platforms
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') || 
      lowerUrl.includes('vimeo.com') || lowerUrl.includes('dailymotion.com') ||
      lowerUrl.includes('tiktok.com')) {
    return 'video';
  }
  
  // Social media
  if (lowerUrl.includes('instagram.com') || lowerUrl.includes('facebook.com') ||
      lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com') ||
      lowerUrl.includes('linkedin.com') || lowerUrl.includes('pinterest.com') ||
      lowerUrl.includes('threads.net')) {
    return 'social';
  }
  
  // E-commerce
  if (lowerUrl.includes('amazon.com') || lowerUrl.includes('mercadolivre') ||
      lowerUrl.includes('shopee') || lowerUrl.includes('aliexpress') ||
      lowerUrl.includes('/produto') || lowerUrl.includes('/product') ||
      lowerUrl.includes('shop.') || lowerUrl.includes('/loja')) {
    return 'ecommerce';
  }
  
  // Internal articles (relative URLs or common patterns)
  if (lowerUrl.startsWith('/') || lowerUrl.includes('/artigo') ||
      lowerUrl.includes('/blog') || lowerUrl.includes('/post') ||
      lowerUrl.includes('/news') || lowerUrl.includes('/noticia')) {
    return 'article';
  }
  
  // Resources (PDFs, docs, tools)
  if (lowerUrl.includes('.pdf') || lowerUrl.includes('/download') ||
      lowerUrl.includes('/ferramenta') || lowerUrl.includes('/tool') ||
      lowerUrl.includes('/template') || lowerUrl.includes('/recurso')) {
    return 'resource';
  }
  
  return 'external';
}

// Get icon and color for link type
function getLinkTypeConfig(type: LinkType): { icon: React.ReactNode; label: string; color: string } {
  switch (type) {
    case 'video':
      return { icon: <Youtube className="w-3 h-3" />, label: 'Vídeo', color: 'border-red-300 text-red-700 bg-red-50' };
    case 'social':
      return { icon: <Instagram className="w-3 h-3" />, label: 'Social', color: 'border-pink-300 text-pink-700 bg-pink-50' };
    case 'article':
      return { icon: <Newspaper className="w-3 h-3" />, label: 'Artigo', color: 'border-blue-300 text-blue-700 bg-blue-50' };
    case 'ecommerce':
      return { icon: <ShoppingBag className="w-3 h-3" />, label: 'Loja', color: 'border-green-300 text-green-700 bg-green-50' };
    case 'resource':
      return { icon: <BookOpen className="w-3 h-3" />, label: 'Recurso', color: 'border-orange-300 text-orange-700 bg-orange-50' };
    default:
      return { icon: <Globe className="w-3 h-3" />, label: 'Externo', color: 'border-gray-300 text-gray-700 bg-gray-50' };
  }
}

// Sortable Link Item Component
interface SortableLinkItemProps {
  link: InternalLink;
  index: number;
  editingLinkId: string | null;
  editingAnchor: string;
  setEditingAnchor: (value: string) => void;
  startEditing: (link: InternalLink) => void;
  saveEditing: () => void;
  cancelEditing: () => void;
  removeLink: (id: string) => void;
}

function SortableLinkItem({
  link,
  index,
  editingLinkId,
  editingAnchor,
  setEditingAnchor,
  startEditing,
  saveEditing,
  cancelEditing,
  removeLink,
}: SortableLinkItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const linkType = link.type || detectLinkType(link.url);
  const typeConfig = getLinkTypeConfig(linkType);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-3 rounded-lg border bg-background hover:border-primary/30 transition-colors group",
        isDragging && "opacity-50 shadow-lg ring-2 ring-primary/20"
      )}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted transition-colors touch-none"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Index */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
        {index + 1}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {editingLinkId === link.id ? (
          <div className="flex items-center gap-2">
            <Input
              value={editingAnchor}
              onChange={(e) => setEditingAnchor(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEditing();
                if (e.key === 'Escape') cancelEditing();
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={saveEditing}
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={cancelEditing}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <p
            className="text-sm font-medium truncate cursor-pointer hover:text-primary transition-colors"
            onClick={() => startEditing(link)}
            title="Clique para editar"
          >
            {link.anchor}
          </p>
        )}
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          {link.url}
        </p>
      </div>

      {/* Type Badge */}
      <Badge
        variant="outline"
        className={cn('text-xs gap-1', typeConfig.color)}
      >
        {typeConfig.icon}
        {typeConfig.label}
      </Badge>

      {/* Source Badge */}
      <Badge
        variant="outline"
        className={cn(
          'text-xs',
          link.source === 'suggested'
            ? 'border-amber-300 text-amber-700'
            : link.source === 'imported'
            ? 'border-purple-300 text-purple-700'
            : 'border-gray-300 text-gray-700'
        )}
      >
        {link.source === 'suggested' ? 'Auto' : link.source === 'imported' ? 'CSV' : 'Manual'}
      </Badge>

      {/* Edit Button */}
      {editingLinkId !== link.id && (
        <Button
          variant="ghost"
          size="icon"
          className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={() => startEditing(link)}
          title="Editar texto âncora"
        >
          <Pencil className="w-4 h-4" />
        </Button>
      )}

      {/* Delete Button */}
      <Button
        variant="ghost"
        size="icon"
        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => removeLink(link.id)}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}

interface Article {
  id: string;
  title: string | null;
  keyword: string;
  slug: string | null;
  status: string;
  project_id: string | null;
}

interface WordPressArticle {
  id: string;
  wp_post_id: number;
  wp_post_url: string;
  wp_post_title: string;
  primary_keyword: string | null;
  secondary_keywords: string[];
  topic_cluster: string | null;
  linkability_score: number | null;
  semantic_summary: string | null;
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
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [articles, setArticles] = useState<Article[]>([]);
  const [wpArticles, setWpArticles] = useState<WordPressArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingWpArticles, setLoadingWpArticles] = useState(false);
  const [newAnchor, setNewAnchor] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState('');
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [keywordFilter, setKeywordFilter] = useState('');
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editingAnchor, setEditingAnchor] = useState('');
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([]);
  const [isSearchingAI, setIsSearchingAI] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = links.findIndex(l => l.id === active.id);
      const newIndex = links.findIndex(l => l.id === over.id);
      
      const reorderedLinks = arrayMove(links, oldIndex, newIndex);
      onLinksChange(reorderedLinks);
      
      toast({ title: 'Links reordenados!' });
    }
  };

  // Fetch existing local articles for suggestions
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

  // Fetch WordPress indexed articles
  useEffect(() => {
    async function fetchWpArticles() {
      if (!user || !projectId) return;
      
      setLoadingWpArticles(true);
      try {
        const { data, error } = await supabase
          .from('wordpress_article_index')
          .select('id, wp_post_id, wp_post_url, wp_post_title, primary_keyword, secondary_keywords, topic_cluster, linkability_score, semantic_summary')
          .eq('project_id', projectId)
          .eq('user_id', user.id)
          .eq('sync_status', 'synced')
          .order('linkability_score', { ascending: false })
          .limit(200);
        
        if (error) throw error;
        setWpArticles(data || []);
      } catch (error) {
        console.error('Error fetching WordPress articles:', error);
      } finally {
        setLoadingWpArticles(false);
      }
    }
    
    fetchWpArticles();
  }, [user, projectId]);

  // Filter WordPress articles based on search and exclude already added
  const filteredWpArticles = useMemo(() => {
    const addedUrls = new Set(links.map(l => l.url.toLowerCase()));
    
    return wpArticles.filter(article => {
      // Exclude already added articles
      if (addedUrls.has(article.wp_post_url.toLowerCase())) return false;
      
      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          article.wp_post_title.toLowerCase().includes(query) ||
          article.primary_keyword?.toLowerCase().includes(query) ||
          article.topic_cluster?.toLowerCase().includes(query) ||
          article.secondary_keywords?.some(kw => kw.toLowerCase().includes(query))
        );
      }
      
      return true;
    });
  }, [wpArticles, links, searchQuery]);

  // Filter local articles based on search and exclude already added
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

  // Suggested WordPress articles based on keyword similarity
  const suggestedWpArticles = useMemo(() => {
    if (!keyword && !keywordFilter) return [];
    
    const searchTerms = (keywordFilter || keyword || '').toLowerCase();
    const words = searchTerms.split(/\s+/).filter(w => w.length > 2);
    
    if (words.length === 0) return [];
    
    const addedUrls = new Set(links.map(l => l.url.toLowerCase()));
    
    return wpArticles
      .filter(article => {
        if (addedUrls.has(article.wp_post_url.toLowerCase())) return false;
        
        const title = article.wp_post_title.toLowerCase();
        const kw = article.primary_keyword?.toLowerCase() || '';
        const cluster = article.topic_cluster?.toLowerCase() || '';
        const secondaryKws = article.secondary_keywords?.join(' ').toLowerCase() || '';
        
        return words.some(word => 
          title.includes(word) || 
          kw.includes(word) || 
          cluster.includes(word) ||
          secondaryKws.includes(word)
        );
      })
      .sort((a, b) => (b.linkability_score || 0) - (a.linkability_score || 0))
      .slice(0, 10);
  }, [wpArticles, keyword, keywordFilter, links]);

  // Suggested local articles based on keyword similarity (fallback)
  const suggestedArticles = useMemo(() => {
    if (suggestedWpArticles.length > 0) return []; // Prefer WP articles
    if (!keyword && !keywordFilter) return [];
    
    const searchTerms = (keywordFilter || keyword || '').toLowerCase();
    const words = searchTerms.split(/\s+/).filter(w => w.length > 2);
    
    if (words.length === 0) return [];
    
    return articles
      .filter(article => {
        const addedUrls = new Set(links.map(l => l.url.toLowerCase()));
        const articleUrl = article.slug ? `/${article.slug}` : '';
        if (addedUrls.has(articleUrl.toLowerCase())) return false;
        
        const title = article.title?.toLowerCase() || '';
        const kw = article.keyword.toLowerCase();
        
        return words.some(word => title.includes(word) || kw.includes(word));
      })
      .slice(0, 8);
  }, [articles, keyword, keywordFilter, links, suggestedWpArticles.length]);

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

  const startEditing = (link: InternalLink) => {
    setEditingLinkId(link.id);
    setEditingAnchor(link.anchor);
  };

  const saveEditing = () => {
    if (!editingLinkId || !editingAnchor.trim()) return;
    
    const updatedLinks = links.map(link => 
      link.id === editingLinkId 
        ? { ...link, anchor: editingAnchor.trim() }
        : link
    );
    
    onLinksChange(updatedLinks);
    setEditingLinkId(null);
    setEditingAnchor('');
    
    toast({ title: 'Texto âncora atualizado!' });
  };

  const cancelEditing = () => {
    setEditingLinkId(null);
    setEditingAnchor('');
  };

  // Check for duplicate URLs
  const isDuplicateUrl = (url: string): boolean => {
    const normalizedUrl = url.toLowerCase().trim();
    return links.some(link => link.url.toLowerCase().trim() === normalizedUrl);
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

  const handleAddFromWpArticle = (article: WordPressArticle) => {
    const anchor = article.wp_post_title;
    const url = article.wp_post_url;
    
    addLink({
      anchor,
      url,
      source: 'suggested',
      type: 'article',
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

  const handleAddSuggestedWp = (article: WordPressArticle) => {
    const anchor = article.wp_post_title;
    const url = article.wp_post_url;
    
    addLink({
      anchor,
      url,
      source: 'suggested',
      type: 'article',
    });
  };

  // Search for links using AI via edge function
  const handleAISearch = async () => {
    if (!projectId || !keyword) {
      toast({
        title: 'Configuração necessária',
        description: 'Selecione um projeto e forneça uma palavra-chave para usar a busca com IA.',
        variant: 'destructive',
      });
      return;
    }

    setIsSearchingAI(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Usuário não autenticado');
      }

      const response = await supabase.functions.invoke('analyze-wp-articles', {
        body: {
          action: 'get_link_suggestions',
          project_id: projectId,
          keyword: keyword,
          max_links: maxLinks - links.length,
        },
      });

      if (response.error) throw response.error;

      const suggestions = response.data?.suggestions || [];
      
      if (suggestions.length === 0) {
        toast({
          title: 'Nenhuma sugestão encontrada',
          description: 'A IA não encontrou artigos relevantes. Tente sincronizar os artigos do WordPress primeiro.',
        });
        return;
      }

      // Add suggested links
      const newLinks: InternalLink[] = suggestions.map((s: any) => ({
        id: crypto.randomUUID(),
        anchor: s.anchor_text,
        url: s.url,
        source: 'suggested' as const,
        type: 'article' as LinkType,
      }));

      onLinksChange([...links, ...newLinks.slice(0, maxLinks - links.length)]);
      
      toast({
        title: 'Links sugeridos pela IA',
        description: `${Math.min(newLinks.length, maxLinks - links.length)} links adicionados com base na análise semântica.`,
      });
    } catch (error) {
      console.error('AI search error:', error);
      toast({
        title: 'Erro na busca com IA',
        description: error instanceof Error ? error.message : 'Falha ao buscar sugestões',
        variant: 'destructive',
      });
    } finally {
      setIsSearchingAI(false);
    }
  };

  // Parse imported text (URLs or CSV)
  const parseImportedLinks = (text: string): Array<{ anchor: string; url: string }> => {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const parsedLinks: Array<{ anchor: string; url: string }> = [];
    
    for (const line of lines) {
      // Check if it's CSV format (anchor,url or anchor;url)
      if (line.includes(',') || line.includes(';')) {
        const separator = line.includes(';') ? ';' : ',';
        const parts = line.split(separator).map(p => p.trim());
        if (parts.length >= 2) {
          parsedLinks.push({ anchor: parts[0], url: parts[1] });
        } else if (parts.length === 1 && parts[0].startsWith('http')) {
          // Just URL
          const url = parts[0];
          const anchor = extractAnchorFromUrl(url);
          parsedLinks.push({ anchor, url });
        }
      } else if (line.startsWith('http') || line.startsWith('/')) {
        // Just a URL
        const anchor = extractAnchorFromUrl(line);
        parsedLinks.push({ anchor, url: line });
      }
    }
    
    return parsedLinks;
  };

  const extractAnchorFromUrl = (url: string): string => {
    try {
      // Extract last path segment and convert to readable text
      const path = new URL(url, 'https://example.com').pathname;
      const lastSegment = path.split('/').filter(Boolean).pop() || '';
      return lastSegment
        .replace(/[-_]/g, ' ')
        .replace(/\.(html|php|aspx?)$/i, '')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ') || url;
    } catch {
      return url;
    }
  };

  const handleImport = () => {
    const parsedLinks = parseImportedLinks(importText);
    
    if (parsedLinks.length === 0) {
      toast({
        title: 'Nenhum link encontrado',
        description: 'Verifique o formato dos dados importados.',
        variant: 'destructive',
      });
      return;
    }
    
    // Filter out duplicates
    const existingUrls = new Set(links.map(l => l.url.toLowerCase().trim()));
    const uniqueLinks: Array<{ anchor: string; url: string }> = [];
    const duplicates: string[] = [];
    
    for (const link of parsedLinks) {
      const normalizedUrl = link.url.toLowerCase().trim();
      if (existingUrls.has(normalizedUrl)) {
        duplicates.push(link.url);
      } else {
        existingUrls.add(normalizedUrl);
        uniqueLinks.push(link);
      }
    }
    
    const linksToAdd = uniqueLinks.slice(0, maxLinks - links.length);
    const newLinks: InternalLink[] = linksToAdd.map(link => ({
      id: crypto.randomUUID(),
      anchor: link.anchor,
      url: link.url,
      source: 'imported' as const,
    }));
    
    onLinksChange([...links, ...newLinks]);
    setImportText('');
    setDuplicateWarnings(duplicates);
    
    if (duplicates.length > 0) {
      toast({
        title: `${newLinks.length} link(s) importado(s)`,
        description: `${duplicates.length} URL(s) duplicada(s) foram ignoradas.`,
        variant: 'default',
      });
    } else {
      toast({
        title: 'Links importados!',
        description: `${newLinks.length} link(s) adicionado(s) com sucesso.`,
      });
    }
    
    if (duplicates.length === 0) {
      setShowImportDialog(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setImportText(content);
    };
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Generate preview HTML
  const generatePreviewHtml = () => {
    if (links.length === 0) return '<p>Nenhum link adicionado ainda.</p>';
    
    return links.map((link, index) => 
      `<p>...texto do artigo mencionando <a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.anchor}</a> de forma natural...</p>`
    ).join('\n\n');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
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
        
        <div className="flex gap-2 flex-wrap">
          {/* Preview Dialog */}
          <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={links.length === 0}
                className="gap-1"
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Preview dos Links no Artigo
                </DialogTitle>
                <DialogDescription>
                  Visualização de como os links serão inseridos no conteúdo final
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* Preview Content */}
                <div className="p-4 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Os links serão inseridos naturalmente no contexto do artigo
                  </p>
                  
                  <div className="prose prose-sm max-w-none">
                    {links.length === 0 ? (
                      <p className="text-muted-foreground italic">Nenhum link adicionado ainda.</p>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-foreground">
                          <span className="bg-muted px-1 rounded">[Introdução do artigo...]</span>
                        </p>
                        
                        {links.slice(0, 3).map((link, index) => (
                          <div key={link.id} className="p-3 bg-background rounded border-l-2 border-primary">
                            <p className="text-foreground">
                              ...conforme mencionado anteriormente, é importante entender{' '}
                              <a 
                                href={link.url} 
                                className="text-primary underline hover:no-underline font-medium"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {link.anchor}
                              </a>
                              {' '}para obter melhores resultados...
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Link {index + 1} • {link.source === 'manual' ? 'Manual' : link.source === 'imported' ? 'Importado' : 'Sugerido'}
                            </p>
                          </div>
                        ))}
                        
                        {links.length > 3 && (
                          <p className="text-muted-foreground text-sm italic">
                            + {links.length - 3} link(s) adicional(is) serão distribuídos ao longo do artigo
                          </p>
                        )}
                        
                        <p className="text-foreground">
                          <span className="bg-muted px-1 rounded">[Conclusão do artigo...]</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* HTML Code Preview */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-medium">Código HTML Gerado</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1"
                      onClick={() => {
                        navigator.clipboard.writeText(generatePreviewHtml());
                        toast({ title: 'Código copiado!' });
                      }}
                    >
                      <Copy className="w-3 h-3" />
                      Copiar
                    </Button>
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-950 text-slate-50 text-xs overflow-x-auto max-h-32">
                    <code>{generatePreviewHtml()}</code>
                  </pre>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Import Dialog */}
          <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={links.length >= maxLinks}
                className="gap-1"
              >
                <Upload className="w-3.5 h-3.5" />
                Importar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Importar Links
                </DialogTitle>
                <DialogDescription>
                  Importe múltiplos links de uma vez via CSV ou cole URLs diretamente
                </DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="paste" className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="paste" className="gap-1">
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    Colar URLs
                  </TabsTrigger>
                  <TabsTrigger value="file" className="gap-1">
                    <FileUp className="w-3.5 h-3.5" />
                    Arquivo CSV
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="paste" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Cole as URLs (uma por linha)</Label>
                    <Textarea
                      placeholder={`https://seusite.com/artigo-1\nhttps://seusite.com/artigo-2\n\nOu no formato CSV:\nTexto Âncora, https://url.com\nOutro Texto, https://outra-url.com`}
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      className="h-40 font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Formatos aceitos: URL por linha ou CSV (âncora, url)
                    </p>
                  </div>
                </TabsContent>
                
                <TabsContent value="file" className="space-y-4 mt-4">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <FileUp className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">
                      Arraste um arquivo CSV ou clique para selecionar
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="csv-upload"
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Selecionar Arquivo
                    </Button>
                  </div>
                  
                  {importText && (
                    <div className="p-3 rounded-lg bg-muted">
                      <p className="text-xs font-medium mb-1">Conteúdo carregado:</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {importText.slice(0, 100)}...
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
              
              {/* Duplicate Warnings */}
              {duplicateWarnings.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <p className="text-sm font-medium text-amber-800">
                      URLs duplicadas ignoradas ({duplicateWarnings.length})
                    </p>
                  </div>
                  <div className="max-h-20 overflow-y-auto">
                    {duplicateWarnings.slice(0, 5).map((url, i) => (
                      <p key={i} className="text-xs text-amber-700 truncate">{url}</p>
                    ))}
                    {duplicateWarnings.length > 5 && (
                      <p className="text-xs text-amber-600 mt-1">
                        +{duplicateWarnings.length - 5} mais...
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => { 
                  setShowImportDialog(false); 
                  setDuplicateWarnings([]);
                }}>
                  {duplicateWarnings.length > 0 ? 'Fechar' : 'Cancelar'}
                </Button>
                {duplicateWarnings.length === 0 && (
                  <Button onClick={handleImport} disabled={!importText.trim()}>
                    <Plus className="w-4 h-4 mr-1" />
                    Importar Links
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
          
          {/* Search existing articles (WordPress + Local) */}
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
            <PopoverContent className="w-96 p-0" align="end">
              <Command>
                <CommandInput
                  placeholder="Buscar artigos do WordPress..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList className="max-h-80">
                  <CommandEmpty>
                    {loadingWpArticles || loading ? 'Carregando...' : 'Nenhum artigo encontrado'}
                  </CommandEmpty>
                  
                  {/* WordPress Articles (Priority) */}
                  {filteredWpArticles.length > 0 && (
                    <CommandGroup heading="📰 Artigos do WordPress">
                      {filteredWpArticles.slice(0, 10).map((article) => (
                        <CommandItem
                          key={article.id}
                          onSelect={() => handleAddFromWpArticle(article)}
                          className="cursor-pointer"
                        >
                          <Globe className="w-4 h-4 mr-2 text-blue-600" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate font-medium">
                              {article.wp_post_title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {article.primary_keyword || article.topic_cluster || 'Sem keyword'}
                            </p>
                          </div>
                          {article.linkability_score && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-xs border-green-300 text-green-700"
                            >
                              {article.linkability_score}%
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  
                  {/* Local Articles (Fallback) */}
                  {filteredArticles.length > 0 && (
                    <CommandGroup heading="📝 Artigos Locais">
                      {filteredArticles.slice(0, 5).map((article) => (
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
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* AI Search Button */}
          <Button
            variant="default"
            size="sm"
            disabled={links.length >= maxLinks || isSearchingAI || !projectId}
            className="gap-1"
            style={{ backgroundColor: accentColor }}
            onClick={handleAISearch}
          >
            {isSearchingAI ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                IA Buscar
              </>
            )}
          </Button>
          
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

      {/* Keyword Filter for Suggestions */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filtrar sugestões por palavra-chave..."
          value={keywordFilter}
          onChange={(e) => setKeywordFilter(e.target.value)}
          className="h-8 text-sm flex-1"
        />
        {keywordFilter && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setKeywordFilter('')}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Suggested WordPress Articles */}
      {suggestedWpArticles.length > 0 && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-medium text-blue-800">Sugestões do WordPress</p>
            <Badge variant="outline" className="ml-auto text-xs border-blue-300 text-blue-700">
              {suggestedWpArticles.length} artigos
            </Badge>
          </div>
          <p className="text-xs text-blue-700 mb-3">
            Artigos indexados relacionados a "{keywordFilter || keyword}"
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestedWpArticles.map((article) => (
              <Badge
                key={article.id}
                variant="outline"
                className="cursor-pointer hover:bg-blue-100 border-blue-300 text-blue-800 gap-1 max-w-[220px]"
                onClick={() => handleAddSuggestedWp(article)}
              >
                <Plus className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">
                  {article.wp_post_title.slice(0, 40)}
                  {article.wp_post_title.length > 40 && '...'}
                </span>
                {article.linkability_score && article.linkability_score >= 70 && (
                  <span className="text-green-600 text-xs ml-1">★</span>
                )}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Local Articles (Fallback) */}
      {suggestedArticles.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-medium text-amber-800">Sugestões Locais</p>
            <Badge variant="outline" className="ml-auto text-xs border-amber-300 text-amber-700">
              {suggestedArticles.length} encontrados
            </Badge>
          </div>
          <p className="text-xs text-amber-700 mb-3">
            Artigos locais relacionados a "{keywordFilter || keyword}"
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestedArticles.map((article) => (
              <Badge
                key={article.id}
                variant="outline"
                className="cursor-pointer hover:bg-amber-100 border-amber-300 text-amber-800 gap-1 max-w-[200px]"
                onClick={() => handleAddSuggested(article)}
              >
                <Plus className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">
                  {(article.title || article.keyword).slice(0, 35)}
                  {(article.title || article.keyword).length > 35 && '...'}
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* No Articles Available Message */}
      {wpArticles.length === 0 && projectId && !loadingWpArticles && (
        <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-orange-600" />
            <p className="text-sm text-orange-800">
              Nenhum artigo do WordPress indexado. Sincronize os artigos primeiro pelo painel de Linkagem Interna.
            </p>
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

      {/* Links List with Drag and Drop */}
      {links.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={links.map(l => l.id)} strategy={verticalListSortingStrategy}>
            <ScrollArea className="h-[240px]">
              <div className="space-y-2 pr-4">
                {links.map((link, index) => (
                  <SortableLinkItem
                    key={link.id}
                    link={link}
                    index={index}
                    editingLinkId={editingLinkId}
                    editingAnchor={editingAnchor}
                    setEditingAnchor={setEditingAnchor}
                    startEditing={startEditing}
                    saveEditing={saveEditing}
                    cancelEditing={cancelEditing}
                    removeLink={removeLink}
                  />
                ))}
              </div>
            </ScrollArea>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Link2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum link interno adicionado</p>
          <p className="text-xs">Use os botões acima para adicionar links</p>
        </div>
      )}

      {/* Link Type Legend */}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 rounded-lg bg-muted/30">
          <span className="text-xs text-muted-foreground mr-1">Tipos:</span>
          {(['article', 'video', 'social', 'ecommerce', 'resource', 'external'] as LinkType[]).map(type => {
            const config = getLinkTypeConfig(type);
            const count = links.filter(l => (l.type || detectLinkType(l.url)) === type).length;
            if (count === 0) return null;
            return (
              <Badge key={type} variant="outline" className={cn('text-xs gap-1', config.color)}>
                {config.icon}
                {config.label}: {count}
              </Badge>
            );
          })}
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
