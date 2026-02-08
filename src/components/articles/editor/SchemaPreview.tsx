import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Code, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  MessageCircleQuestion,
  FileText,
  ListChecks,
  Newspaper
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FAQItem {
  question: string;
  answer: string;
}

interface HowToStep {
  name: string;
  text: string;
  position: number;
}

interface SchemaPreviewProps {
  content: string | null;
  title?: string | null;
  excerpt?: string | null;
  keyword?: string;
  featuredImageUrl?: string | null;
}

/**
 * Complete Schema Preview Component
 * Supports FAQ, Article, and HowTo schemas
 */
export function SchemaPreview({ 
  content, 
  title, 
  excerpt, 
  keyword,
  featuredImageUrl 
}: SchemaPreviewProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState<string | null>(null);

  // Extract all schemas
  const { faqSchema, articleSchema, howToSchema } = useMemo(() => {
    const faqs = extractFAQs(content || '');
    const steps = extractHowToSteps(content || '');
    
    // FAQ Schema
    const faqSchemaObj = faqs.length > 0 ? {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqs.map((item) => ({
        "@type": "Question",
        "name": item.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": item.answer,
        },
      })),
    } : null;

    // Article Schema
    const articleSchemaObj = title ? {
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": title,
      "description": excerpt || undefined,
      "keywords": keyword || undefined,
      "image": featuredImageUrl || undefined,
      "author": {
        "@type": "Organization",
        "name": "Content Factory"
      },
      "publisher": {
        "@type": "Organization",
        "name": "Content Factory",
        "logo": {
          "@type": "ImageObject",
          "url": "https://example.com/logo.png"
        }
      },
      "datePublished": new Date().toISOString(),
      "dateModified": new Date().toISOString(),
    } : null;

    // HowTo Schema
    const howToSchemaObj = steps.length > 0 ? {
      "@context": "https://schema.org",
      "@type": "HowTo",
      "name": title || `Como ${keyword}`,
      "description": excerpt || `Guia passo a passo sobre ${keyword}`,
      "step": steps.map((step) => ({
        "@type": "HowToStep",
        "position": step.position,
        "name": step.name,
        "text": step.text,
      })),
    } : null;

    return {
      faqSchema: faqSchemaObj ? { items: faqs, json: JSON.stringify(faqSchemaObj, null, 2) } : null,
      articleSchema: articleSchemaObj ? { json: JSON.stringify(articleSchemaObj, null, 2) } : null,
      howToSchema: howToSchemaObj ? { steps, json: JSON.stringify(howToSchemaObj, null, 2) } : null,
    };
  }, [content, title, excerpt, keyword, featuredImageUrl]);

  const handleCopySchema = async (schemaType: string, json: string) => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(schemaType);
      toast({
        title: 'Schema copiado!',
        description: 'O JSON-LD foi copiado para a área de transferência.',
      });
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível copiar o schema.',
        variant: 'destructive',
      });
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  const schemasCount = [faqSchema, articleSchema, howToSchema].filter(Boolean).length;

  if (schemasCount === 0) {
    return (
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Nenhum Schema detectado</p>
              <p className="text-xs mt-1">
                Adicione título, meta-descrição, seções FAQ ou passos de tutorial para gerar Schemas.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="bg-success/10 text-success gap-1.5">
          <CheckCircle2 className="w-3 h-3" />
          {schemasCount} Schema{schemasCount > 1 ? 's' : ''} Detectado{schemasCount > 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Article Schema */}
      {articleSchema && (
        <SchemaCard
          title="Article Schema"
          icon={<Newspaper className="w-4 h-4" />}
          description="Dados estruturados do artigo para Google"
          isExpanded={expandedSection === 'article'}
          onToggle={() => toggleSection('article')}
          showRawJson={showRawJson === 'article'}
          onToggleJson={() => setShowRawJson(prev => prev === 'article' ? null : 'article')}
          onCopy={() => handleCopySchema('article', articleSchema.json)}
          isCopied={copied === 'article'}
          json={articleSchema.json}
          statusColor="primary"
        >
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Título:</span>
              <span className="font-medium line-clamp-1">{title}</span>
            </div>
            {excerpt && (
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground shrink-0">Descrição:</span>
                <span className="line-clamp-2">{excerpt}</span>
              </div>
            )}
            {keyword && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Keyword:</span>
                <Badge variant="outline" className="text-xs">{keyword}</Badge>
              </div>
            )}
          </div>
        </SchemaCard>
      )}

      {/* FAQ Schema */}
      {faqSchema && (
        <SchemaCard
          title="FAQ Schema"
          icon={<MessageCircleQuestion className="w-4 h-4" />}
          description={`${faqSchema.items.length} pergunta${faqSchema.items.length > 1 ? 's' : ''} detectada${faqSchema.items.length > 1 ? 's' : ''}`}
          isExpanded={expandedSection === 'faq'}
          onToggle={() => toggleSection('faq')}
          showRawJson={showRawJson === 'faq'}
          onToggleJson={() => setShowRawJson(prev => prev === 'faq' ? null : 'faq')}
          onCopy={() => handleCopySchema('faq', faqSchema.json)}
          isCopied={copied === 'faq'}
          json={faqSchema.json}
          statusColor="success"
        >
          <ScrollArea className="max-h-48">
            <div className="space-y-2">
              {faqSchema.items.map((item, index) => (
                <div 
                  key={index} 
                  className="p-2 rounded-lg bg-background border text-xs"
                >
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold">
                      P
                    </div>
                    <p className="font-medium text-foreground line-clamp-2">
                      {item.question}
                    </p>
                  </div>
                  <div className="flex items-start gap-2 mt-1.5">
                    <div className="w-5 h-5 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 text-[10px] font-bold">
                      R
                    </div>
                    <p className="text-muted-foreground line-clamp-2">
                      {item.answer}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SchemaCard>
      )}

      {/* HowTo Schema */}
      {howToSchema && (
        <SchemaCard
          title="HowTo Schema"
          icon={<ListChecks className="w-4 h-4" />}
          description={`${howToSchema.steps.length} passo${howToSchema.steps.length > 1 ? 's' : ''} detectado${howToSchema.steps.length > 1 ? 's' : ''}`}
          isExpanded={expandedSection === 'howto'}
          onToggle={() => toggleSection('howto')}
          showRawJson={showRawJson === 'howto'}
          onToggleJson={() => setShowRawJson(prev => prev === 'howto' ? null : 'howto')}
          onCopy={() => handleCopySchema('howto', howToSchema.json)}
          isCopied={copied === 'howto'}
          json={howToSchema.json}
          statusColor="info"
        >
          <ScrollArea className="max-h-48">
            <div className="space-y-2">
              {howToSchema.steps.map((step, index) => (
                <div 
                  key={index} 
                  className="p-2 rounded-lg bg-background border text-xs"
                >
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold">
                      {step.position}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{step.name}</p>
                      <p className="text-muted-foreground line-clamp-2 mt-0.5">{step.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SchemaCard>
      )}

      {/* Info */}
      <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 text-primary">
        <FileText className="w-4 h-4 shrink-0" />
        <p className="text-xs">
          Estes schemas serão automaticamente injetados no &lt;head&gt; da página quando publicados.
        </p>
      </div>
    </div>
  );
}

// Reusable Schema Card Component
interface SchemaCardProps {
  title: string;
  icon: React.ReactNode;
  description: string;
  isExpanded: boolean;
  onToggle: () => void;
  showRawJson: boolean;
  onToggleJson: () => void;
  onCopy: () => void;
  isCopied: boolean;
  json: string;
  statusColor: 'primary' | 'success' | 'info';
  children: React.ReactNode;
}

function SchemaCard({
  title,
  icon,
  description,
  isExpanded,
  onToggle,
  showRawJson,
  onToggleJson,
  onCopy,
  isCopied,
  json,
  statusColor,
  children,
}: SchemaCardProps) {
  const colorClasses = {
    primary: 'border-primary/30 bg-primary/5',
    success: 'border-green-500/30 bg-green-500/5',
    info: 'border-primary/30 bg-primary/5',
  };

  const badgeClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-green-500/10 text-green-600',
    info: 'bg-primary/10 text-primary',
  };

  return (
    <Card className={colorClasses[statusColor]}>
      <CardHeader className="p-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded ${badgeClasses[statusColor]}`}>
              {icon}
            </div>
            <div>
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onToggleJson}
              className="h-7 text-xs gap-1 px-2"
            >
              <Code className="w-3 h-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onCopy}
              className="h-7 text-xs gap-1 px-2"
            >
              {isCopied ? (
                <Check className="w-3 h-3 text-green-500" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-3 pt-0 space-y-3">
        {/* Expandable Content */}
        <Collapsible open={isExpanded} onOpenChange={onToggle}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-7 text-xs">
              <span>{isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}</span>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            {children}
          </CollapsibleContent>
        </Collapsible>

        {/* JSON Preview */}
        {showRawJson && (
          <ScrollArea className="max-h-48">
            <pre className="p-2 bg-muted rounded-lg text-[10px] font-mono overflow-x-auto">
              {json}
            </pre>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Extract FAQ items from content
 */
function extractFAQs(content: string): FAQItem[] {
  const faqs: FAQItem[] = [];
  if (!content) return faqs;

  // Pattern 1: FAQ section headers
  const faqSectionPatterns = [
    /##\s*(FAQ|Perguntas\s+Frequentes|Dúvidas\s+Comuns|Perguntas\s+e\s+Respostas)/i,
    /<h[23][^>]*>(FAQ|Perguntas\s+Frequentes|Dúvidas\s+Comuns|Perguntas\s+e\s+Respostas)<\/h[23]>/i,
  ];

  const hasFAQSection = faqSectionPatterns.some((pattern) => pattern.test(content));

  if (hasFAQSection) {
    // Q&A pairs after FAQ header
    const qaPattern = /###\s*(.+\?)\s*\n+([\s\S]*?)(?=###|\n##|$)/g;
    let match;

    while ((match = qaPattern.exec(content)) !== null) {
      const question = cleanText(match[1]);
      const answer = cleanText(match[2]);
      if (question && answer && answer.length > 20) {
        faqs.push({ question, answer });
      }
    }

    // HTML format
    const htmlQAPattern = /<h[34][^>]*>(.+?\?)<\/h[34]>\s*<p>([^<]+(?:<[^>]+>[^<]*<\/[^>]+>)*[^<]*)<\/p>/gi;
    while ((match = htmlQAPattern.exec(content)) !== null) {
      const question = cleanText(match[1]);
      const answer = cleanText(match[2]);
      if (question && answer && answer.length > 20 && !faqs.some(f => f.question === question)) {
        faqs.push({ question, answer });
      }
    }

    // P/R format
    const prPattern = /(?:^|\n)\s*[P|Q][:.]?\s*(.+?\?)\s*\n\s*[R|A][:.]?\s*([^\n]+(?:\n(?![P|Q|R|A][:.])[^\n]+)*)/gim;
    while ((match = prPattern.exec(content)) !== null) {
      const question = cleanText(match[1]);
      const answer = cleanText(match[2]);
      if (question && answer && answer.length > 20 && !faqs.some(f => f.question === question)) {
        faqs.push({ question, answer });
      }
    }
  }

  // Generic question detection
  if (faqs.length === 0) {
    const boldQPattern = /\*\*([^*]+\?)\*\*\s*\n+([^\n*#]+)/g;
    let match;
    while ((match = boldQPattern.exec(content)) !== null) {
      const question = cleanText(match[1]);
      const answer = cleanText(match[2]);
      if (question && answer && answer.length > 30) {
        faqs.push({ question, answer });
      }
    }
  }

  return faqs.slice(0, 10);
}

/**
 * Extract HowTo steps from content
 */
function extractHowToSteps(content: string): HowToStep[] {
  const steps: HowToStep[] = [];
  if (!content) return steps;

  // Pattern 1: "Passo X:" or "Step X:" headers
  const stepHeaderPattern = /(?:###?\s*)?(?:Passo|Step|Etapa)\s*(\d+)[:\.\-]?\s*(.+?)(?:\n|$)([\s\S]*?)(?=(?:###?\s*)?(?:Passo|Step|Etapa)\s*\d+|##|$)/gi;
  let match;

  while ((match = stepHeaderPattern.exec(content)) !== null) {
    const position = parseInt(match[1]);
    const name = cleanText(match[2]);
    const text = cleanText(match[3]);
    
    if (name && text && text.length > 10) {
      steps.push({ position, name, text });
    }
  }

  // Pattern 2: Numbered list with "1." format
  if (steps.length === 0) {
    const numberedPattern = /(?:^|\n)\s*(\d+)\.\s*\*\*([^*]+)\*\*[:\s]*([^\n]+(?:\n(?!\d+\.)[^\n]+)*)/gm;
    
    while ((match = numberedPattern.exec(content)) !== null) {
      const position = parseInt(match[1]);
      const name = cleanText(match[2]);
      const text = cleanText(match[3]);
      
      if (name && text && text.length > 10) {
        steps.push({ position, name, text });
      }
    }
  }

  // Pattern 3: "Como" sections
  if (steps.length === 0) {
    const comoPattern = /##\s*(?:Como|How to)\s+(.+?)\n([\s\S]*?)(?=##|$)/gi;
    let stepCount = 0;
    
    while ((match = comoPattern.exec(content)) !== null) {
      stepCount++;
      const name = cleanText(match[1]);
      const text = cleanText(match[2].substring(0, 300));
      
      if (name && text) {
        steps.push({ position: stepCount, name, text });
      }
    }
  }

  return steps.slice(0, 15);
}

function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*|__|\*|_/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export default SchemaPreview;
