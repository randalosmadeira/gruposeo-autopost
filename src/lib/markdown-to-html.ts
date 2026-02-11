import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Configure marked for SEO-optimized HTML output
 */
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
});

/**
 * Convert Markdown content to sanitized HTML
 * Handles both raw Markdown and pre-rendered HTML
 */
export function markdownToHTML(content: string): string {
  if (!content) return '';
  
  // Strip META_DESCRIPTION and TITLE_SEO comments before processing
  let cleaned = content
    .replace(/<!--\s*META_DESCRIPTION:\s*.*?-->/gi, '')
    .replace(/<!--\s*TITLE_SEO:\s*.*?-->/gi, '')
    .trim();
  
  // Check if content is already HTML (starts with HTML tags)
  const isHTML = /<[a-z][\s\S]*>/i.test(cleaned);
  
  // If content has markdown indicators, convert it
  const hasMarkdown = /^#{1,6}\s|^\*\*|^\*\s|^-\s|^\d+\.\s|^>\s|```/m.test(cleaned);
  
  let html = cleaned;
  
  if (hasMarkdown && !isHTML) {
    html = marked.parse(cleaned) as string;
  } else if (hasMarkdown && isHTML) {
    html = marked.parse(cleaned) as string;
  }
  
  // Sanitize the output
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'b', 'i',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'img',
      'blockquote', 'code', 'pre',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div',
      'figure', 'figcaption',
      'hr', 'sub', 'sup',
      'section', 'article', 'header', 'footer',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'id',
      'width', 'height', 'target', 'rel',
    ],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Extract structured sections from article content
 */
export interface ArticleSection {
  type: 'hero' | 'h1' | 'h2' | 'h3' | 'h4' | 'content' | 'faq' | 'conclusion' | 'intro';
  title?: string;
  content: string;
  id?: string;
}

export function parseArticleSections(html: string): ArticleSection[] {
  const sections: ArticleSection[] = [];
  
  // Create a temporary DOM to parse
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstElementChild;
  
  if (!container) return [{ type: 'content', content: html }];
  
  let currentSection: ArticleSection | null = null;
  let introContent = '';
  let isIntro = true;
  
  const children = Array.from(container.children);
  
  for (const child of children) {
    const tagName = child.tagName.toLowerCase();
    const textContent = child.textContent?.trim() || '';
    
    // Detect section type by heading
    if (tagName === 'h1') {
      // H1 is the main title
      if (currentSection) sections.push(currentSection);
      if (introContent && isIntro) {
        sections.push({ type: 'intro', content: introContent });
        isIntro = false;
      }
      currentSection = {
        type: 'h1',
        title: textContent,
        content: '',
        id: generateSlug(textContent),
      };
    } else if (tagName === 'h2') {
      if (currentSection) sections.push(currentSection);
      if (introContent && isIntro) {
        sections.push({ type: 'intro', content: introContent });
        isIntro = false;
      }
      
      // Check for FAQ or Conclusion
      const isFAQ = /faq|perguntas\s*frequentes|dúvidas/i.test(textContent);
      const isConclusion = /conclus[aã]o|considera[çc][õo]es\s*finais|resumo|fechamento/i.test(textContent);
      
      currentSection = {
        type: isFAQ ? 'faq' : isConclusion ? 'conclusion' : 'h2',
        title: textContent,
        content: '',
        id: generateSlug(textContent),
      };
    } else if (tagName === 'h3') {
      if (currentSection) {
        currentSection.content += child.outerHTML;
      } else {
        if (introContent && isIntro) {
          sections.push({ type: 'intro', content: introContent });
          isIntro = false;
        }
        currentSection = {
          type: 'h3',
          title: textContent,
          content: '',
          id: generateSlug(textContent),
        };
      }
    } else if (tagName === 'h4' || tagName === 'h5' || tagName === 'h6') {
      if (currentSection) {
        currentSection.content += child.outerHTML;
      }
    } else {
      // Regular content
      if (currentSection) {
        currentSection.content += child.outerHTML;
      } else if (isIntro) {
        introContent += child.outerHTML;
      }
    }
  }
  
  // Push the last section
  if (currentSection) sections.push(currentSection);
  if (introContent && isIntro && sections.length === 0) {
    sections.push({ type: 'intro', content: introContent });
  }
  
  return sections;
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
}

/**
 * Generate table of contents from article HTML
 */
export interface TOCItem {
  level: number;
  title: string;
  id: string;
}

export function generateTOC(html: string): TOCItem[] {
  const toc: TOCItem[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const headings = doc.querySelectorAll('h2, h3, h4');
  
  headings.forEach((heading) => {
    const level = parseInt(heading.tagName[1]);
    const title = heading.textContent?.trim() || '';
    const id = generateSlug(title);
    
    if (title) {
      toc.push({ level, title, id });
    }
  });
  
  return toc;
}
