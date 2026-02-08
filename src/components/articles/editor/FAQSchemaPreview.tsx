import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Code, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  MessageCircleQuestion
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSchemaPreviewProps {
  content: string | null;
}

/**
 * Preview component for FAQ Schema JSON-LD
 * Shows detected FAQs and the generated schema
 */
export function FAQSchemaPreview({ content }: FAQSchemaPreviewProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  const { faqItems, schemaJson } = useMemo(() => {
    const items = extractFAQs(content || '');
    
    if (items.length === 0) {
      return { faqItems: [], schemaJson: null };
    }

    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": items.map((item) => ({
        "@type": "Question",
        "name": item.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": item.answer,
        },
      })),
    };

    return { 
      faqItems: items, 
      schemaJson: JSON.stringify(schema, null, 2) 
    };
  }, [content]);

  const handleCopySchema = async () => {
    if (!schemaJson) return;
    
    try {
      await navigator.clipboard.writeText(schemaJson);
      setCopied(true);
      toast({
        title: 'Schema copiado!',
        description: 'O JSON-LD foi copiado para a área de transferência.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Erro ao copiar',
        description: 'Não foi possível copiar o schema.',
        variant: 'destructive',
      });
    }
  };

  if (faqItems.length === 0) {
    return (
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Nenhum FAQ detectado</p>
              <p className="text-xs mt-1">
                Adicione uma seção "FAQ" ou "Perguntas Frequentes" com perguntas e respostas para gerar o Schema JSON-LD.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-success/30 bg-success/5">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-success" />
            <CardTitle className="text-sm font-medium">FAQ Schema Detectado</CardTitle>
          </div>
          <Badge variant="secondary" className="bg-success/10 text-success">
            {faqItems.length} {faqItems.length === 1 ? 'pergunta' : 'perguntas'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-2 space-y-4">
        {/* FAQ Items Preview */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between h-8">
              <span className="text-xs">Ver perguntas detectadas</span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <ScrollArea className="max-h-48">
              <div className="space-y-2">
                {faqItems.map((item, index) => (
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
          </CollapsibleContent>
        </Collapsible>

        {/* JSON-LD Preview Toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowRawJson(!showRawJson)}
              className="h-7 text-xs gap-1.5 px-2"
            >
              <Code className="w-3.5 h-3.5" />
              {showRawJson ? 'Ocultar JSON-LD' : 'Ver JSON-LD'}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCopySchema}
              className="h-7 text-xs gap-1.5"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-success" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              Copiar
            </Button>
          </div>
          
          {showRawJson && schemaJson && (
            <ScrollArea className="max-h-64">
              <pre className="p-3 bg-muted rounded-lg text-[10px] font-mono overflow-x-auto">
                {schemaJson}
              </pre>
            </ScrollArea>
          )}
        </div>

        {/* Schema Status */}
        <div className="flex items-center gap-2 p-2 rounded-lg bg-success/10 text-success">
          <MessageCircleQuestion className="w-4 h-4 shrink-0" />
          <p className="text-xs">
            Este schema será automaticamente injetado no &lt;head&gt; da página quando publicado.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Extract FAQ items from markdown or HTML content
 * (Same logic as FAQSchemaScript.tsx)
 */
function extractFAQs(content: string): FAQItem[] {
  const faqs: FAQItem[] = [];
  
  if (!content) return faqs;

  // Pattern 1: Detect FAQ section headers
  const faqSectionPatterns = [
    /##\s*(FAQ|Perguntas\s+Frequentes|Dúvidas\s+Comuns|Perguntas\s+e\s+Respostas)/i,
    /<h[23][^>]*>(FAQ|Perguntas\s+Frequentes|Dúvidas\s+Comuns|Perguntas\s+e\s+Respostas)<\/h[23]>/i,
  ];

  const hasFAQSection = faqSectionPatterns.some((pattern) => pattern.test(content));

  if (hasFAQSection) {
    // Extract Q&A pairs after FAQ header
    const qaPattern = /###\s*(.+\?)\s*\n+([\s\S]*?)(?=###|\n##|$)/g;
    let match;

    while ((match = qaPattern.exec(content)) !== null) {
      const question = cleanText(match[1]);
      const answer = cleanText(match[2]);
      
      if (question && answer && answer.length > 20) {
        faqs.push({ question, answer });
      }
    }

    // Pattern 2: HTML format with h3/h4 questions
    const htmlQAPattern = /<h[34][^>]*>(.+?\?)<\/h[34]>\s*<p>([^<]+(?:<[^>]+>[^<]*<\/[^>]+>)*[^<]*)<\/p>/gi;
    
    while ((match = htmlQAPattern.exec(content)) !== null) {
      const question = cleanText(match[1]);
      const answer = cleanText(match[2]);
      
      if (question && answer && answer.length > 20) {
        if (!faqs.some((f) => f.question === question)) {
          faqs.push({ question, answer });
        }
      }
    }

    // Pattern 3: Numbered/bulleted FAQ format
    const numberedPattern = /(?:\d+\.\s*|\*\s*)\*\*(.+?\?)\*\*\s*([^\n]+)/g;
    
    while ((match = numberedPattern.exec(content)) !== null) {
      const question = cleanText(match[1]);
      const answer = cleanText(match[2]);
      
      if (question && answer && answer.length > 20) {
        if (!faqs.some((f) => f.question === question)) {
          faqs.push({ question, answer });
        }
      }
    }

    // Pattern 4: P/R format (Pergunta/Resposta)
    const prPattern = /(?:^|\n)\s*[P|Q][:.]?\s*(.+?\?)\s*\n\s*[R|A][:.]?\s*([^\n]+(?:\n(?![P|Q|R|A][:.])[^\n]+)*)/gim;
    
    while ((match = prPattern.exec(content)) !== null) {
      const question = cleanText(match[1]);
      const answer = cleanText(match[2]);
      
      if (question && answer && answer.length > 20) {
        if (!faqs.some((f) => f.question === question)) {
          faqs.push({ question, answer });
        }
      }
    }
  }

  // Pattern 5: Generic question detection
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

function cleanText(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*|__|\*|_/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export default FAQSchemaPreview;
