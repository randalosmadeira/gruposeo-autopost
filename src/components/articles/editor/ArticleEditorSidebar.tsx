import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Sparkles,
  RefreshCw,
  Loader2,
  Image as ImageIcon,
  Settings,
  Wand2,
  Eye,
  Code,
  FolderOpen,
  Save,
  Braces
} from 'lucide-react';
import { SEOOptimizationPanel } from './SEOOptimizationPanel';
import { SchemaPreview } from './SchemaPreview';
import { WordPressCategorySelector } from '../WordPressCategorySelector';

interface Article {
  id: string;
  title: string | null;
  keyword: string;
  content: string | null;
  excerpt: string | null;
  featured_image_url: string | null;
  project_id?: string | null;
  wordpress_categories?: number[];
}

interface ArticleEditorSidebarProps {
  article: Article;
  activeTab: 'visual' | 'html';
  onActiveTabChange: (tab: 'visual' | 'html') => void;
  onFieldUpdate: <K extends keyof Article>(field: K, value: Article[K]) => void;
  onRegenerate: (type: 'title' | 'excerpt' | 'image' | 'content') => void;
  isRegenerating: 'title' | 'excerpt' | 'image' | 'content' | null;
  onSave?: () => void;
  isSaving?: boolean;
  hasChanges?: boolean;
}

export function ArticleEditorSidebar({
  article,
  activeTab,
  onActiveTabChange,
  onFieldUpdate,
  onRegenerate,
  isRegenerating,
  onSave,
  isSaving,
  hasChanges,
}: ArticleEditorSidebarProps) {
  const [configTab, setConfigTab] = useState<'config' | 'seo' | 'schema'>('config');
  const excerptLength = article.excerpt?.length || 0;

  return (
    <div className="w-80 flex flex-col border-l bg-card h-full">
      {/* Config/SEO Tabs */}
      <Tabs value={configTab} onValueChange={(v) => setConfigTab(v as 'config' | 'seo' | 'schema')} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full rounded-none border-b h-12 bg-transparent p-0 shrink-0">
          <TabsTrigger 
            value="config" 
            className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden xl:inline">Config</span>
          </TabsTrigger>
          <TabsTrigger 
            value="seo" 
            className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
          >
            <Wand2 className="w-4 h-4" />
            <span className="hidden xl:inline">SEO</span>
          </TabsTrigger>
          <TabsTrigger 
            value="schema" 
            className="flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent gap-1.5"
          >
            <Braces className="w-4 h-4" />
            <span className="hidden xl:inline">Schema</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="flex-1 m-0 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-6">
              {/* Configurations Header */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
                  <Settings className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold">Configurações</h3>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Título</Label>
                  <Button
                    size="sm"
                    onClick={() => onRegenerate('title')}
                    disabled={isRegenerating === 'title'}
                    className="h-7 text-xs gap-1"
                  >
                    {isRegenerating === 'title' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Recriar com IA
                  </Button>
                </div>
                <Input
                  value={article.title || ''}
                  onChange={(e) => onFieldUpdate('title', e.target.value)}
                  placeholder="Título do artigo"
                  className="text-sm"
                />
              </div>

              {/* Featured Image */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Imagem Destacada</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRegenerate('image')}
                    disabled={isRegenerating === 'image'}
                    className="h-7 text-xs gap-1"
                  >
                    {isRegenerating === 'image' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Refazer
                  </Button>
                </div>
                {article.featured_image_url ? (
                  <img
                    src={article.featured_image_url}
                    alt="Featured"
                    className="w-full h-44 object-cover rounded-lg border"
                  />
                ) : (
                  <div className="w-full h-44 bg-muted rounded-lg border flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Meta Description */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Meta-Descrição</Label>
                  <Button
                    size="sm"
                    onClick={() => onRegenerate('excerpt')}
                    disabled={isRegenerating === 'excerpt'}
                    className="h-7 text-xs gap-1"
                  >
                    {isRegenerating === 'excerpt' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    Recriar com IA
                  </Button>
                </div>
                <Textarea
                  value={article.excerpt || ''}
                  onChange={(e) => onFieldUpdate('excerpt', e.target.value)}
                  placeholder="Descrição curta para SEO"
                  rows={4}
                  className="text-sm resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {excerptLength}/160 caracteres
                </p>
              </div>

              {/* WordPress Categories */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-medium">Publicação WordPress</Label>
                </div>
                <WordPressCategorySelector
                  projectId={article.project_id || null}
                  selectedCategories={article.wordpress_categories || []}
                  onCategoriesChange={(categories) => onFieldUpdate('wordpress_categories', categories)}
                />
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="seo" className="flex-1 m-0 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4">
              <SEOOptimizationPanel 
                content={article.content} 
                keyword={article.keyword}
                title={article.title}
                excerpt={article.excerpt}
              />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="schema" className="flex-1 m-0 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {/* Schema Header */}
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
                  <Braces className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold">Schema Markup</h3>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Dados estruturados detectados automaticamente para Google Rich Results.
                Suporta Article, FAQ e HowTo schemas.
              </p>

              {/* Complete Schema Preview */}
              <SchemaPreview 
                content={article.content}
                title={article.title}
                excerpt={article.excerpt}
                keyword={article.keyword}
                featuredImageUrl={article.featured_image_url}
              />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Editor/HTML Toggle + Save Button */}
      <div className="border-t p-3 space-y-3 shrink-0 bg-card">
        <Tabs value={activeTab} onValueChange={(v) => onActiveTabChange(v as 'visual' | 'html')}>
          <TabsList className="w-full">
            <TabsTrigger value="visual" className="flex-1 gap-2">
              <Eye className="w-4 h-4" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="html" className="flex-1 gap-2">
              <Code className="w-4 h-4" />
              HTML
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        {/* Save Button */}
        <Button 
          onClick={onSave} 
          disabled={!hasChanges || isSaving}
          className="w-full gap-2"
          size="lg"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Salvar Alterações
        </Button>
      </div>
    </div>
  );
}
