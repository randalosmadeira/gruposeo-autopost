import { useMemo, useRef, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Copy, Code } from 'lucide-react';
import { sanitizeHTML } from '@/lib/sanitize';
import { useToast } from '@/hooks/use-toast';
import { marked } from 'marked';

interface ArticleEditorContentProps {
  content: string | null;
  featuredImageUrl: string | null;
  title: string | null;
  activeTab: 'visual' | 'html';
  onContentChange: (content: string) => void;
  editorRef?: React.RefObject<HTMLDivElement>;
}

export function ArticleEditorContent({
  content,
  featuredImageUrl,
  title,
  activeTab,
  onContentChange,
  editorRef: externalEditorRef,
}: ArticleEditorContentProps) {
  const { toast } = useToast();
  const internalEditorRef = useRef<HTMLDivElement>(null);
  const editorRef = externalEditorRef || internalEditorRef;

  // Convert markdown to HTML if needed
  const processedContent = useMemo(() => {
    if (!content) return '';
    
    // Check if content looks like HTML (starts with a tag)
    const isHTML = content.trim().startsWith('<');
    
    if (isHTML) {
      return content;
    }
    
    // Convert markdown to HTML
    return marked.parse(content, { async: false }) as string;
  }, [content]);

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

  // Format HTML for display with syntax highlighting-like appearance
  const formatHTMLForDisplay = (html: string) => {
    // Basic formatting - add newlines after closing tags for readability
    return html
      .replace(/></g, '>\n<')
      .replace(/(<\/?(h[1-6]|p|div|section|ul|ol|li|blockquote|table|tr|td|th|thead|tbody)[^>]*>)/gi, '\n$1')
      .split('\n')
      .filter(line => line.trim())
      .join('\n');
  };

  if (activeTab === 'html') {
    return (
      <div className="h-full flex flex-col bg-card border rounded-lg overflow-hidden">
        {/* HTML Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Code className="w-4 h-4" />
            Código HTML
          </div>
          <Button variant="outline" size="sm" onClick={handleCopyHTML} className="gap-2">
            <Copy className="w-4 h-4" />
            Copiar HTML
          </Button>
        </div>
        
        {/* HTML Content with syntax display */}
        <ScrollArea className="flex-1 h-full">
          <pre className="p-4 text-sm font-mono leading-relaxed">
            {processedContent ? (
              formatHTMLForDisplay(processedContent).split('\n').map((line, index) => {
                // Simple syntax coloring using semantic tokens
                const coloredLine = line
                  .replace(/(&lt;|<)(\/?)(\w+)/g, '<span class="text-primary">$1$2$3</span>')
                  .replace(/(data-[\w-]+|class|id|href|src|alt)=/g, '<span class="text-chart-4">$1</span>=')
                  .replace(/="([^"]*)"/g, '="<span class="text-chart-2">$1</span>"');
                
                return (
                  <div 
                    key={index} 
                    className="hover:bg-muted/30 px-2 -mx-2 rounded"
                    dangerouslySetInnerHTML={{ __html: coloredLine }}
                  />
                );
              })
            ) : (
              <span className="text-muted-foreground">&lt;p&gt;Sem conteúdo&lt;/p&gt;</span>
            )}
          </pre>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card border rounded-lg overflow-hidden">
      <ScrollArea className="flex-1 h-full">
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

          {/* Editable Content */}
          <article 
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              const newContent = (e.target as HTMLDivElement).innerHTML;
              onContentChange(newContent);
            }}
            className="prose prose-lg max-w-none outline-none min-h-[400px]
              focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 rounded-lg p-2 -m-2
              
              /* H2 - Subtítulos principais com badge */
              [&_h2]:relative [&_h2]:pl-14 [&_h2]:text-xl [&_h2]:font-bold 
              [&_h2]:mt-10 [&_h2]:mb-5 [&_h2]:pt-6 [&_h2]:border-t [&_h2]:border-border/50
              [&_h2]:before:content-['H2'] [&_h2]:before:absolute [&_h2]:before:left-0 
              [&_h2]:before:px-2.5 [&_h2]:before:py-1 [&_h2]:before:text-xs 
              [&_h2]:before:font-semibold [&_h2]:before:bg-primary [&_h2]:before:text-primary-foreground 
              [&_h2]:before:rounded-md [&_h2]:before:top-6
              
              /* H3 - Subtítulos secundários */
              [&_h3]:relative [&_h3]:pl-14 [&_h3]:text-lg [&_h3]:font-semibold 
              [&_h3]:mt-8 [&_h3]:mb-4
              [&_h3]:before:content-['H3'] [&_h3]:before:absolute [&_h3]:before:left-0 
              [&_h3]:before:px-2.5 [&_h3]:before:py-1 [&_h3]:before:text-xs 
              [&_h3]:before:font-semibold [&_h3]:before:bg-chart-4 [&_h3]:before:text-primary-foreground 
              [&_h3]:before:rounded-md [&_h3]:before:top-0
              
              /* H4 - Subtítulos terciários */
              [&_h4]:relative [&_h4]:pl-14 [&_h4]:text-base [&_h4]:font-semibold 
              [&_h4]:mt-6 [&_h4]:mb-3
              [&_h4]:before:content-['H4'] [&_h4]:before:absolute [&_h4]:before:left-0 
              [&_h4]:before:px-2 [&_h4]:before:py-0.5 [&_h4]:before:text-[10px] 
              [&_h4]:before:font-medium [&_h4]:before:bg-muted [&_h4]:before:text-muted-foreground 
              [&_h4]:before:rounded [&_h4]:before:top-0.5
              
              /* Parágrafos - Espaçamento generoso */
              [&_p]:leading-relaxed [&_p]:mb-6 [&_p]:text-foreground [&_p]:text-base
              [&_p+p]:mt-0
              
              /* Listas - Espaçamento entre itens */
              [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-6 [&_ul]:mt-4 [&_ul]:space-y-2
              [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-6 [&_ol]:mt-4 [&_ol]:space-y-2
              [&_li]:leading-relaxed [&_li]:text-foreground
              [&_li_p]:mb-2
              
              /* Estilos de texto */
              [&_strong]:font-bold [&_strong]:text-foreground
              [&_em]:italic
              [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:font-medium
              
              /* Blockquotes - Destaque visual */
              [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-6 
              [&_blockquote]:py-3 [&_blockquote]:my-6 [&_blockquote]:italic 
              [&_blockquote]:bg-muted/30 [&_blockquote]:rounded-r-lg
              
              /* Tabelas */
              [&_table]:w-full [&_table]:my-6 [&_table]:border-collapse
              [&_th]:bg-muted [&_th]:p-3 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-border
              [&_td]:p-3 [&_td]:border [&_td]:border-border
              
              /* Código inline */
              [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono"
            dangerouslySetInnerHTML={{ 
              __html: sanitizeHTML(
                processedContent || '<p>Clique aqui para começar a escrever...</p>'
              ) 
            }}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
