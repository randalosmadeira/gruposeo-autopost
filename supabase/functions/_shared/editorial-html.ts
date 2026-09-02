export type EditorialAudit = {
  html: string;
  pass: boolean;
  issues: string[];
  fatalIssues: string[];
  metrics: {
    wordCount: number;
    h2Count: number;
    h3Count: number;
    paragraphCount: number;
    strongCount: number;
    listCount: number;
    blockquoteCount: number;
    tableCount: number;
  };
};

const ALLOWED_TAGS = new Set([
  "p", "h2", "h3", "h4", "strong", "em", "b", "i", "u", "s", "ul", "ol", "li",
  "blockquote", "a", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "figure",
  "figcaption", "hr", "br", "div", "span", "sup", "sub", "small", "mark", "details", "summary",
]);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeUrl(value: string) {
  const url = value.trim();
  if (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(url)) return url;
  return "#";
}

function inlineMarkdown(value: string) {
  let out = escapeHtml(value.trim());
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, label, href) => `<a href="${escapeHtml(safeUrl(href))}">${label}</a>`);
  return out;
}

function markdownToHtml(input: string) {
  const source = input
    .replace(/^```(?:html|markdown|md|json)?\s*$/gim, "")
    .replace(/^```\s*$/gim, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  const lines = source.split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    if (text) html.push(`<p>${inlineMarkdown(text)}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(4, Math.max(2, heading[1].length));
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  closeList();
  return html.join("\n");
}

function sanitizeAttributes(tag: string, attrs: string) {
  if (tag !== "a") return "";
  const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || "#";
  const title = attrs.match(/\btitle\s*=\s*["']([^"']+)["']/i)?.[1] || "";
  const safeHref = escapeHtml(safeUrl(href));
  const safeTitle = title ? ` title="${escapeHtml(title.slice(0, 240))}"` : "";
  const external = /^https?:\/\//i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
  return ` href="${safeHref}"${safeTitle}${external}`;
}

function sanitizeHtml(input: string) {
  let html = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<(?:iframe|object|embed|form|input|button|textarea|select|option|svg|canvas|meta|link)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|form|button|textarea|select|option|svg|canvas)>/gi, "")
    .replace(/<(?:iframe|object|embed|form|input|button|textarea|select|option|svg|canvas|meta|link)\b[^>]*\/?\s*>/gi, "")
    .replace(/^```(?:html|markdown|md|json)?\s*$/gim, "")
    .replace(/^```\s*$/gim, "");

  html = html.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, "<h2>$1</h2>");
  html = html.replace(/(^|\n)\s*#{1}\s+([^\n<]+)/g, (_m, prefix, text) => `${prefix}<h2>${inlineMarkdown(text)}</h2>`);
  html = html.replace(/(^|\n)\s*#{2}\s+([^\n<]+)/g, (_m, prefix, text) => `${prefix}<h2>${inlineMarkdown(text)}</h2>`);
  html = html.replace(/(^|\n)\s*#{3,6}\s+([^\n<]+)/g, (_m, prefix, text) => `${prefix}<h3>${inlineMarkdown(text)}</h3>`);
  html = html.replace(/\*\*([^*<\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_<\n]+)__/g, "<strong>$1</strong>");

  html = html.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (full, rawTag, attrs) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (full.startsWith("</")) return `</${tag}>`;
    if (tag === "br" || tag === "hr") return `<${tag}>`;
    return `<${tag}${sanitizeAttributes(tag, String(attrs || ""))}>`;
  });

  html = html
    .replace(/<b>/gi, "<strong>").replace(/<\/b>/gi, "</strong>")
    .replace(/<i>/gi, "<em>").replace(/<\/i>/gi, "</em>")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/(?:<br>\s*){3,}/gi, "<br><br>")
    .trim();

  if (html && !/<(?:p|h2|h3|h4|ul|ol|blockquote|table|figure|details)\b/i.test(html)) {
    html = `<p>${html}</p>`;
  }

  html = html.replace(/<p>([\s\S]*?)<\/p>/i, '<p class="zica-answer-capsule">$1</p>');
  html = html.replace(/<blockquote>/gi, '<blockquote class="zica-law-callout">');
  html = html.replace(/<table>/gi, '<table class="zica-editorial-table">');
  return html;
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function countTag(html: string, tag: string) {
  return (html.match(new RegExp(`<${tag}\\b`, "gi")) || []).length;
}

function looksLikeJsonDocument(value: string) {
  const trimmed = value.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

export function normalizeEditorialHtml(input: string): EditorialAudit {
  const original = String(input || "").trim();
  const issues: string[] = [];
  const fatalIssues: string[] = [];

  if (!original) {
    return {
      html: "",
      pass: false,
      issues: ["Conteúdo vazio."],
      fatalIssues: ["empty_content"],
      metrics: { wordCount: 0, h2Count: 0, h3Count: 0, paragraphCount: 0, strongCount: 0, listCount: 0, blockquoteCount: 0, tableCount: 0 },
    };
  }

  if (looksLikeJsonDocument(original)) fatalIssues.push("raw_json_document");
  if (/```/.test(original)) issues.push("code_fence_detected_and_removed");
  if (/(^|\n)\s*#{1,6}\s+/.test(original)) issues.push("markdown_heading_detected_and_normalized");
  if (/\*\*[^*\n]+\*\*/.test(original) || /__[^_\n]+__/.test(original)) issues.push("markdown_emphasis_detected_and_normalized");
  if (/<h1\b/i.test(original)) issues.push("body_h1_detected_and_demoted");
  if (/<(?:script|style|iframe|object|embed|form)\b/i.test(original)) issues.push("unsafe_markup_detected_and_removed");

  const hasBlockHtml = /<(?:p|h1|h2|h3|h4|ul|ol|li|blockquote|table|figure|div|details)\b/i.test(original);
  const initial = hasBlockHtml ? original : markdownToHtml(original);
  const html = sanitizeHtml(initial);
  const plain = stripTags(html);

  if (!plain) fatalIssues.push("empty_after_sanitization");
  if (/(^|\n)\s*#{1,6}\s+/.test(html)) fatalIssues.push("raw_markdown_heading_remaining");
  if (/\*\*[^*\n]+\*\*/.test(html)) fatalIssues.push("raw_markdown_emphasis_remaining");
  if (/```/.test(html)) fatalIssues.push("code_fence_remaining");
  if (/<h1\b/i.test(html)) fatalIssues.push("body_h1_remaining");
  if (/<(?:script|style|iframe|object|embed|form)\b/i.test(html)) fatalIssues.push("unsafe_markup_remaining");
  if (/\b(?:system prompt|developer message|ignore previous instructions|retorne somente json)\b/i.test(plain)) fatalIssues.push("prompt_residue_detected");

  const words = plain.split(/\s+/).filter(Boolean);
  const paragraphs = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
  const overlong = paragraphs.filter((p) => stripTags(p).split(/\s+/).filter(Boolean).length > 130).length;
  if (overlong) issues.push(`${overlong} parágrafo(s) acima de 130 palavras.`);

  const metrics = {
    wordCount: words.length,
    h2Count: countTag(html, "h2"),
    h3Count: countTag(html, "h3"),
    paragraphCount: countTag(html, "p"),
    strongCount: countTag(html, "strong"),
    listCount: countTag(html, "ul") + countTag(html, "ol"),
    blockquoteCount: countTag(html, "blockquote"),
    tableCount: countTag(html, "table"),
  };

  if (metrics.wordCount >= 500 && metrics.h2Count === 0) issues.push("long_content_without_h2");
  if (metrics.wordCount >= 700 && metrics.strongCount === 0) issues.push("long_content_without_semantic_emphasis");

  return { html, pass: fatalIssues.length === 0, issues, fatalIssues, metrics };
}
