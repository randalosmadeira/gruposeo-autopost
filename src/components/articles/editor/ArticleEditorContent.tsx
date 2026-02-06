import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Copy, Code } from 'lucide-react';
import { sanitizeHTML } from '@/lib/sanitize';
import { useToast } from '@/hooks/use-toast';

interface ArticleEditorContentProps {
  content: string | null;
  featuredImageUrl: string | null;
  title: string | null;
  activeTab: 'visual' | 'html';
  onContentChange: (content: string) => void;
}

export function ArticleEditorContent({
  content,
  featuredImageUrl,
  title,
  activeTab,
  onContentChange,
}: ArticleEditorContentProps) {
  const { toast } = useToast();

  const handleCopyHTML = async () => {
    try {
      await navigator.clipboard.writeText(content || '');
      toast({
        title: 'HTML copiado!',
        description: 'O código HTML foi copiado para a área de transferência.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível copiar o HTML.',
        variant: 'destructive',
      });
    }
  };

  if (activeTab === 'html') {
    return (
      <div className="flex-1 flex flex-col bg-card border rounded-lg overflow-hidden">
        {/* HTML Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Code className="w-4 h-4" />
            Código HTML
          </div>
          <Button variant="outline" size="sm" onClick={handleCopyHTML} className="gap-2">
            <Copy className="w-4 h-4" />
            Copiar HTML
          </Button>
        </div>
        
        {/* HTML Content */}
        <ScrollArea className="flex-1">
          <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words text-muted-foreground leading-relaxed">
            {content || '<p>Sem conteúdo</p>'}
          </pre>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-card border rounded-lg overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-4xl mx-auto">
          {/* Featured Image */}
          {featuredImageUrl && (
            <div className="mb-6">
              <img
                src={featuredImageUrl}
                alt={title || 'Imagem destacada'}
                className="w-full max-h-96 object-cover rounded-lg"
              />
            </div>
          )}

          {/* Title */}
          {title && (
            <h1 className="text-3xl font-bold mb-4 pb-4 border-b">
              {title}
            </h1>
          )}

          {/* Content with styled H2 badges */}
          <div 
            className="prose prose-sm max-w-none
              [&_h2]:flex [&_h2]:items-center [&_h2]:gap-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-4
              [&_h2]:before:content-['H2'] [&_h2]:before:px-2 [&_h2]:before:py-0.5 [&_h2]:before:text-xs 
              [&_h2]:before:font-medium [&_h2]:before:bg-primary [&_h2]:before:text-primary-foreground 
              [&_h2]:before:rounded
              [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-3
              [&_p]:leading-relaxed [&_p]:mb-4
              [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4
              [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4
              [&_li]:mb-1
              [&_strong]:font-semibold
              [&_a]:text-primary [&_a]:underline"
            dangerouslySetInnerHTML={{ 
              __html: sanitizeHTML(
                content || '<p class="text-muted-foreground">Sem conteúdo</p>'
              ) 
            }}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
