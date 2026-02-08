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

          {/* Editable Content - Padrão de Qualidade SEO */}
          <article 
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              const newContent = (e.target as HTMLDivElement).innerHTML;
              onContentChange(newContent);
            }}
            className="prose prose-lg max-w-none outline-none min-h-[400px]
              focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 rounded-lg p-4 -m-2
              
              /* === H1 - Título Principal - NEGRITO MÁXIMO === */
              [&_h1]:text-3xl [&_h1]:md:text-4xl [&_h1]:font-extrabold 
              [&_h1]:text-foreground [&_h1]:leading-tight
              [&_h1]:mb-6 [&_h1]:mt-0
              
              /* === H2 - Subtítulos principais com badge e DESTAQUE === */
              [&_h2]:relative [&_h2]:pl-14 [&_h2]:text-2xl [&_h2]:md:text-3xl [&_h2]:font-bold 
              [&_h2]:mt-12 [&_h2]:mb-6 [&_h2]:pt-8 [&_h2]:border-t-2 [&_h2]:border-border
              [&_h2]:leading-snug
              [&_h2]:before:content-['H2'] [&_h2]:before:absolute [&_h2]:before:left-0 
              [&_h2]:before:px-2.5 [&_h2]:before:py-1 [&_h2]:before:text-xs 
              [&_h2]:before:font-bold [&_h2]:before:bg-primary [&_h2]:before:text-primary-foreground 
              [&_h2]:before:rounded-md [&_h2]:before:top-8
              
              /* === H3 - Subtítulos secundários === */
              [&_h3]:relative [&_h3]:pl-14 [&_h3]:text-xl [&_h3]:md:text-2xl [&_h3]:font-bold 
              [&_h3]:mt-10 [&_h3]:mb-5 [&_h3]:leading-snug
              [&_h3]:before:content-['H3'] [&_h3]:before:absolute [&_h3]:before:left-0 
              [&_h3]:before:px-2.5 [&_h3]:before:py-1 [&_h3]:before:text-xs 
              [&_h3]:before:font-bold [&_h3]:before:bg-chart-4 [&_h3]:before:text-primary-foreground 
              [&_h3]:before:rounded-md [&_h3]:before:top-0
              
              /* === H4 - Subtítulos terciários === */
              [&_h4]:relative [&_h4]:pl-14 [&_h4]:text-lg [&_h4]:md:text-xl [&_h4]:font-semibold 
              [&_h4]:mt-8 [&_h4]:mb-4 [&_h4]:leading-snug
              [&_h4]:before:content-['H4'] [&_h4]:before:absolute [&_h4]:before:left-0 
              [&_h4]:before:px-2 [&_h4]:before:py-0.5 [&_h4]:before:text-[10px] 
              [&_h4]:before:font-semibold [&_h4]:before:bg-muted [&_h4]:before:text-muted-foreground 
              [&_h4]:before:rounded [&_h4]:before:top-1
              
              /* === PARÁGRAFOS - Separação Clara por Blocos === */
              [&_p]:leading-[1.85] [&_p]:mb-6 [&_p]:text-foreground [&_p]:text-[1.0625rem]
              [&_p]:tracking-[-0.01em]
              [&_p+p]:mt-0
              
              /* === LISTAS - Espaçamento Generoso === */
              [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-6 [&_ul]:mt-4 [&_ul]:space-y-3
              [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-6 [&_ol]:mt-4 [&_ol]:space-y-3
              [&_li]:leading-relaxed [&_li]:text-foreground [&_li]:pl-2
              [&_li_p]:mb-2
              [&_li]:marker:text-primary [&_li]:marker:font-bold
              
              /* === TEXTO EM DESTAQUE === */
              [&_strong]:font-bold [&_strong]:text-foreground
              [&_em]:italic
              
              /* === LINKS - COR DESTACADA para chamar atenção === */
              [&_a]:text-primary [&_a]:font-medium [&_a]:no-underline
              [&_a]:border-b-2 [&_a]:border-primary/40
              [&_a]:transition-all [&_a]:duration-200
              [&_a:hover]:text-accent [&_a:hover]:border-accent
              
              /* === CITAÇÕES - Bloco Visual Destacado === */
              [&_blockquote]:relative [&_blockquote]:border-l-4 [&_blockquote]:border-primary 
              [&_blockquote]:pl-8 [&_blockquote]:py-6 [&_blockquote]:my-8 
              [&_blockquote]:italic [&_blockquote]:text-lg
              [&_blockquote]:bg-primary/5 [&_blockquote]:rounded-r-xl
              
              /* === TABELAS - Layout Profissional === */
              [&_table]:w-full [&_table]:my-8 [&_table]:border-collapse [&_table]:rounded-lg [&_table]:overflow-hidden [&_table]:shadow-sm
              [&_thead]:bg-primary [&_thead]:text-primary-foreground
              [&_th]:px-5 [&_th]:py-4 [&_th]:text-left [&_th]:font-bold
              [&_td]:px-5 [&_td]:py-4 [&_td]:border-b [&_td]:border-border
              [&_tbody_tr:hover]:bg-muted/50
              [&_tr:nth-child(even)]:bg-muted/30
              
              /* === CÓDIGO === */
              [&_code]:bg-muted [&_code]:px-2 [&_code]:py-1 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono"
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
