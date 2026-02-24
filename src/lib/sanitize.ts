import DOMPurify from 'dompurify';

/**
 * Removes markdown code block markers from content.
 * Handles ```html, ```, and other variations.
 */
export function removeCodeBlockMarkers(content: string): string {
  if (!content) return '';
  
  let cleaned = content;
  
  // Remove opening code block markers (```html, ```markdown, ```, etc.)
  cleaned = cleaned.replace(/^```(?:html|markdown|md|text)?\s*\n?/gim, '');
  
  // Remove closing code block markers
  cleaned = cleaned.replace(/\n?```\s*$/gim, '');
  
  // Remove any remaining ``` at the start or end
  cleaned = cleaned.replace(/^```\s*/gm, '');
  cleaned = cleaned.replace(/\s*```$/gm, '');
  
  // Clean up any leftover triple backticks in the middle
  cleaned = cleaned.replace(/```html\s*/gi, '');
  cleaned = cleaned.replace(/```markdown\s*/gi, '');
  cleaned = cleaned.replace(/```\s*/g, '');
  
  // Trim whitespace
  cleaned = cleaned.trim();
  
  return cleaned;
}

/**
 * Removes technical CTA markers that should never be visible to readers.
 * Strips patterns like [CTA #1], [CTA #2 — AUTORIDADE], **[CTA #3]**, etc.
 */
export function removeCTAMarkers(content: string): string {
  if (!content) return '';
  
  let cleaned = content;
  
  // Remove [CTA #X] and [CTA #X — LABEL] patterns (with optional bold/strong wrappers)
  cleaned = cleaned.replace(/\*{0,2}\[CTA\s*#?\d+[^\]]*\]\*{0,2}/gi, '');
  
  // Remove <strong>[CTA ...]</strong> variants
  cleaned = cleaned.replace(/<strong>\s*\[CTA\s*#?\d+[^\]]*\]\s*<\/strong>/gi, '');
  
  // Remove standalone "CTA #X" text (not inside links/anchors)
  cleaned = cleaned.replace(/(?<![<\w])CTA\s*#\d+\s*(?:—\s*[A-ZÀ-Ü\s/]+)?(?![>\w])/gi, '');
  
  // Clean up resulting empty paragraphs, headings, bold markers
  cleaned = cleaned.replace(/<p>\s*<\/p>/gi, '');
  cleaned = cleaned.replace(/<strong>\s*<\/strong>/gi, '');
  cleaned = cleaned.replace(/\*\*\s*\*\*/g, '');
  
  // Clean up double line breaks left behind
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  return cleaned;
}

/**
 * Improves content structure by ensuring proper heading hierarchy and paragraph spacing.
 * Converts raw text blocks into properly structured HTML with headings.
 */
export function improveContentStructure(content: string): string {
  if (!content) return '';
  
  let improved = content;
  
  // Ensure H2 headings have proper structure
  // Convert standalone bold lines that look like titles to H2
  improved = improved.replace(
    /<p><strong>([^<]{10,80})<\/strong><\/p>\s*<p>/gi,
    '<h2>$1</h2>\n<p>'
  );
  
  // Convert markdown-style ## headings to HTML H2
  improved = improved.replace(
    /^## (.+)$/gm,
    '<h2>$1</h2>'
  );
  
  // Convert markdown-style ### headings to HTML H3
  improved = improved.replace(
    /^### (.+)$/gm,
    '<h3>$1</h3>'
  );
  
  // Ensure paragraphs that are too long get broken into smaller chunks
  // This is a soft approach - only adds breaks after sentences if paragraph is very long
  improved = improved.replace(
    /<p>([^<]{800,}?)<\/p>/gi,
    (match, content) => {
      // Split by sentence endings and create multiple paragraphs
      const sentences = content.split(/(?<=[.!?])\s+/);
      if (sentences.length <= 1) return match;
      
      // Group sentences into paragraphs of 2-3 sentences each
      const paragraphs = [];
      for (let i = 0; i < sentences.length; i += 3) {
        const chunk = sentences.slice(i, i + 3).join(' ');
        if (chunk.trim()) {
          paragraphs.push(`<p>${chunk.trim()}</p>`);
        }
      }
      return paragraphs.join('\n\n');
    }
  );
  
  // Add proper spacing between sections
  improved = improved.replace(/<\/h2>\s*<p>/gi, '</h2>\n\n<p>');
  improved = improved.replace(/<\/h3>\s*<p>/gi, '</h3>\n\n<p>');
  improved = improved.replace(/<\/p>\s*<h2>/gi, '</p>\n\n<h2>');
  improved = improved.replace(/<\/p>\s*<h3>/gi, '</p>\n\n<h3>');
  
  return improved;
}

/**
 * Sanitizes HTML content to prevent XSS attacks.
 * Allows only safe HTML tags and attributes commonly used in article content.
 */
export function sanitizeHTML(html: string): string {
  // First remove any code block markers
  let cleanedHtml = removeCodeBlockMarkers(html);
  
  // Remove technical CTA markers that leaked into content
  cleanedHtml = removeCTAMarkers(cleanedHtml);
  return DOMPurify.sanitize(cleanedHtml, {
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
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'id',
      'width', 'height', 'target', 'rel',
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    // Add rel="noopener noreferrer" to links with target="_blank"
    ADD_ATTR: ['target'],
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}
