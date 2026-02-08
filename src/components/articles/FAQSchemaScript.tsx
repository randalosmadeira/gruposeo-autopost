import { useMemo } from 'react';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSchemaScriptProps {
  content: string;
}

/**
 * Automatically detects FAQ sections in article content and generates
 * JSON-LD structured data for Google Rich Results.
 * 
 * Detects FAQ patterns:
 * - H2/H3 with "FAQ", "Perguntas Frequentes", "Dúvidas"
 * - Question/Answer patterns with P/R markers
 * - Standard Q&A format with question marks
 */
export function FAQSchemaScript({ content }: FAQSchemaScriptProps) {
  const faqItems = useMemo(() => {
    return extractFAQs(content);
  }, [content]);

  if (faqItems.length === 0) {
    return null;
  }

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqItems.map((item) => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData, null, 2) }}
    />
  );
}

/**
 * Extract FAQ items from markdown or HTML content
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
    // Pattern: ### Question? followed by answer paragraph
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
        // Avoid duplicates
        if (!faqs.some((f) => f.question === question)) {
          faqs.push({ question, answer });
        }
      }
    }

    // Pattern 3: Numbered/bulleted FAQ format
    // 1. **Question?** Answer text
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

  // Pattern 5: Generic question detection (questions ending with ?)
  // Only if we haven't found FAQs yet
  if (faqs.length === 0) {
    // Look for bold questions followed by answers
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

  // Limit to 10 FAQs (Google recommendation)
  return faqs.slice(0, 10);
}

/**
 * Clean and normalize text for schema
 */
function cleanText(text: string): string {
  if (!text) return '';
  
  return text
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Remove markdown bold/italic
    .replace(/\*\*|__|\\*|_/g, '')
    // Remove markdown links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim();
}

export default FAQSchemaScript;
