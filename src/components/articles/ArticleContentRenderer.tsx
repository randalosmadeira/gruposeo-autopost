import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  markdownToHTML, 
  parseArticleSections, 
  generateTOC,
  type ArticleSection,
  type TOCItem 
} from '@/lib/markdown-to-html';
import { 
  MessageCircleQuestion, 
  CheckCircle2,
  BookOpen,
  ChevronRight,
  List
} from 'lucide-react';
import { FAQSchemaScript } from './FAQSchemaScript';

interface ArticleContentRendererProps {
  content: string;
  rawMarkdown?: string; // Original markdown for FAQ detection
  title?: string;
  excerpt?: string;
  featuredImageUrl?: string;
  showTOC?: boolean;
  enableFAQSchema?: boolean;
}

export function ArticleContentRenderer({
  content,
  rawMarkdown,
  title,
  excerpt,
  featuredImageUrl,
  showTOC = true,
  enableFAQSchema = true,
}: ArticleContentRendererProps) {
  const { html, sections, toc } = useMemo(() => {
    const processedHtml = markdownToHTML(content);
    const parsedSections = parseArticleSections(processedHtml);
    const tableOfContents = generateTOC(processedHtml);
    
    return {
      html: processedHtml,
      sections: parsedSections,
      toc: tableOfContents,
    };
  }, [content]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Content source for FAQ schema (prefer raw markdown, fallback to content)
  const faqSource = rawMarkdown || content;

  return (
    <>
      {/* FAQ Schema JSON-LD (automatic detection) */}
      {enableFAQSchema && <FAQSchemaScript content={faqSource} />}
      
      <div className="article-content-wrapper">
      {/* Hero Section with Featured Image */}
      {featuredImageUrl && (
        <section className="article-hero relative mb-8">
          <div className="aspect-[21/9] rounded-xl overflow-hidden bg-muted shadow-lg">
            <img
              src={featuredImageUrl}
              alt={title || 'Imagem do artigo'}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent rounded-xl" />
          {title && (
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white drop-shadow-lg">
                {title}
              </h1>
            </div>
          )}
        </section>
      )}

      {/* Title if no featured image */}
      {!featuredImageUrl && title && (
        <header className="article-header mb-8">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground leading-tight">
            {title}
          </h1>
        </header>
      )}

      {/* Excerpt / Lead */}
      {excerpt && (
        <div className="article-excerpt mb-8">
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed italic border-l-4 border-primary pl-4 py-2 bg-primary/5 rounded-r-lg">
            {excerpt}
          </p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Table of Contents Sidebar */}
        {showTOC && toc.length > 3 && (
          <aside className="lg:w-64 shrink-0 order-2 lg:order-1">
            <Card className="sticky top-24 bg-muted/30 border-muted">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <List className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">Índice</h4>
                </div>
                <ScrollArea className="max-h-[60vh]">
                  <nav className="space-y-1">
                    {toc.map((item, index) => (
                      <button
                        key={index}
                        onClick={() => scrollToSection(item.id)}
                        className={`
                          w-full text-left text-xs py-1.5 px-2 rounded
                          hover:bg-primary/10 hover:text-primary
                          transition-colors duration-200
                          ${item.level === 2 ? 'font-medium' : 'pl-4 text-muted-foreground'}
                        `}
                      >
                        <span className="line-clamp-2">{item.title}</span>
                      </button>
                    ))}
                  </nav>
                </ScrollArea>
              </CardContent>
            </Card>
          </aside>
        )}

        {/* Main Article Content */}
        <article className="flex-1 order-1 lg:order-2 space-y-6">
          {sections.map((section, index) => (
            <ArticleSectionRenderer 
              key={index} 
              section={section} 
              isFirst={index === 0}
            />
          ))}
          
          {/* Fallback if no sections parsed */}
          {sections.length === 0 && (
            <Card className="bg-card border shadow-sm">
              <CardContent className="p-6 md:p-8">
                <div 
                  className="article-prose"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </CardContent>
            </Card>
          )}
        </article>
      </div>
    </div>
    </>
  );
}

interface ArticleSectionRendererProps {
  section: ArticleSection;
  isFirst?: boolean;
}

function ArticleSectionRenderer({ section, isFirst }: ArticleSectionRendererProps) {
  const getSectionIcon = () => {
    switch (section.type) {
      case 'faq':
        return <MessageCircleQuestion className="w-5 h-5 text-primary" />;
      case 'conclusion':
        return <CheckCircle2 className="w-5 h-5 text-success" />;
      case 'intro':
        return <BookOpen className="w-5 h-5 text-info" />;
      default:
        return null;
    }
  };

  const getSectionStyles = () => {
    switch (section.type) {
      case 'faq':
        return 'bg-primary/5 border-l-4 border-l-primary border-y-0 border-r-0';
      case 'conclusion':
        return 'bg-success-light border-l-4 border-l-success border-y-0 border-r-0';
      case 'intro':
        return 'bg-info-light/50 border-l-4 border-l-info border-y-0 border-r-0';
      case 'h1':
        return 'bg-gradient-to-r from-primary/10 to-transparent border-l-4 border-l-primary';
      case 'h2':
        return 'bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow';
      default:
        return 'bg-card border border-border/30';
    }
  };

  const getSectionBadge = () => {
    switch (section.type) {
      case 'faq':
        return <Badge variant="secondary" className="bg-primary/10 text-primary">FAQ</Badge>;
      case 'conclusion':
        return <Badge variant="secondary" className="bg-success-light text-success">Conclusão</Badge>;
      default:
        return null;
    }
  };

  // For intro sections without title
  if (section.type === 'intro' && !section.title) {
    return (
      <Card className={`shadow-sm ${getSectionStyles()}`}>
        <CardContent className="p-6 md:p-8">
          <div 
            className="article-prose"
            dangerouslySetInnerHTML={{ __html: section.content }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className={`shadow-sm ${getSectionStyles()}`}
      id={section.id}
    >
      <CardContent className="p-6 md:p-8">
        {/* Section Header - Títulos em NEGRITO com tamanho MAIOR */}
        {section.title && (
          <div className="flex items-start gap-4 mb-6">
            {getSectionIcon()}
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                {section.type === 'h1' ? (
                  <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-foreground leading-tight tracking-tight">
                    {section.title}
                  </h1>
                ) : section.type === 'h2' || section.type === 'faq' || section.type === 'conclusion' ? (
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-snug">
                    {section.title}
                  </h2>
                ) : section.type === 'h3' ? (
                  <h3 className="text-xl md:text-2xl font-bold text-foreground leading-snug">
                    {section.title}
                  </h3>
                ) : (
                  <h4 className="text-lg md:text-xl font-semibold text-foreground leading-snug">
                    {section.title}
                  </h4>
                )}
                {getSectionBadge()}
              </div>
            </div>
          </div>
        )}

        {/* Section Content */}
        {section.content && (
          <div 
            className="article-prose"
            dangerouslySetInnerHTML={{ __html: section.content }}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default ArticleContentRenderer;
