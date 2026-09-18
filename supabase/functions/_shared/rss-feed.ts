/**
 * Shared RSS/Atom feed fetching + SSRF-safe URL validation.
 *
 * Canonical implementation used by both `parse-rss` (interactive import) and
 * `auto-process-rss` (scheduled batch processing) — previously each edge
 * function carried its own divergent copy, and `auto-process-rss`'s copy had
 * NO private-IP/localhost blocking at all (a real SSRF gap).
 *
 * Deliberately does NOT extract or expose an `imageUrl` field: RSS-sourced
 * images are never reused anywhere in this codebase (avoids copyright risk).
 * Do not add one back without updating that decision everywhere it applies.
 */

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  guid?: string;
  author?: string;
  categories?: string[];
  /**
   * Full-body content when the feed provides one separately from the (often
   * excerpt-only) `description` — RSS's `content:encoded` (common on
   * WordPress-sourced feeds). Atom has no separate case: its full content
   * already flows into `description` via the summary/content fallback below,
   * so this stays unset for Atom items.
   */
  content?: string;
}

export interface RSSFeed {
  title: string;
  description: string;
  link: string;
  lastBuildDate?: string;
  items: RSSItem[];
}

const MAX_FEED_BYTES = 5_000_000;
const FETCH_TIMEOUT_MS = 15_000;

// --- SSRF Protection ---
// Ported verbatim (behavior-preserving) from the former parse-rss/index.ts
// validateRSSUrl, converted from a boolean return to a throwing guard so
// callers can log/skip per-URL without duplicating the blocklist.
export function validateRSSUrl(urlString: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("URL de RSS inválida");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("URL de RSS inválida");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.16.") ||
    hostname.startsWith("172.17.") ||
    hostname.startsWith("172.18.") ||
    hostname.startsWith("172.19.") ||
    hostname.startsWith("172.20.") ||
    hostname.startsWith("172.21.") ||
    hostname.startsWith("172.22.") ||
    hostname.startsWith("172.23.") ||
    hostname.startsWith("172.24.") ||
    hostname.startsWith("172.25.") ||
    hostname.startsWith("172.26.") ||
    hostname.startsWith("172.27.") ||
    hostname.startsWith("172.28.") ||
    hostname.startsWith("172.29.") ||
    hostname.startsWith("172.30.") ||
    hostname.startsWith("172.31.") ||
    hostname === "169.254.169.254" ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("URL de RSS aponta para um alvo privado/local, o que não é permitido");
  }
}

// --- XML Parsing Helpers ---
function extractCDATA(content: string): string {
  const cdataMatch = content.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cdataMatch) return cdataMatch[1].trim();
  return content.replace(/<[^>]+>/g, "").trim();
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? extractCDATA(match[1]) : "";
}

function extractAttribute(xml: string, tag: string, attr: string): string {
  const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, "i");
  const match = xml.match(regex);
  return match ? match[1] : "";
}

function parseRSSXML(xmlText: string, feedUrl: string): RSSFeed {
  const isAtom = xmlText.includes("<feed") && xmlText.includes('xmlns="http://www.w3.org/2005/Atom"');

  let feedTitle = "";
  let feedDescription = "";
  let feedLink = "";
  const items: RSSItem[] = [];

  if (isAtom) {
    feedTitle = extractTag(xmlText, "title");
    feedDescription = extractTag(xmlText, "subtitle");
    feedLink = extractAttribute(xmlText, "link", "href") || feedUrl;

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    let match;

    while ((match = entryRegex.exec(xmlText)) !== null) {
      const entryContent = match[1];
      const link = extractAttribute(entryContent, "link", "href") || extractTag(entryContent, "id");
      const pubDate = extractTag(entryContent, "published") || extractTag(entryContent, "updated");
      const author = extractTag(entryContent, "name") || extractTag(entryContent, "author");

      items.push({
        title: extractTag(entryContent, "title"),
        link,
        description: extractTag(entryContent, "summary") || extractTag(entryContent, "content"),
        pubDate,
        source: feedTitle || new URL(feedUrl).hostname,
        guid: extractTag(entryContent, "id"),
        author,
      });
    }
  } else {
    const channelMatch = xmlText.match(/<channel>([\s\S]*?)<\/channel>/i);
    const channelContent = channelMatch ? channelMatch[1] : xmlText;

    feedTitle = extractTag(channelContent, "title");
    feedDescription = extractTag(channelContent, "description");
    feedLink = extractTag(channelContent, "link") || feedUrl;

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemContent = match[1];

      const categories: string[] = [];
      const catRegex = /<category[^>]*>([^<]+)<\/category>/gi;
      let catMatch;
      while ((catMatch = catRegex.exec(itemContent)) !== null) {
        categories.push(extractCDATA(catMatch[1]));
      }

      items.push({
        title: extractTag(itemContent, "title"),
        link: extractTag(itemContent, "link"),
        description: extractTag(itemContent, "description"),
        pubDate: extractTag(itemContent, "pubDate"),
        source: extractTag(itemContent, "source") || feedTitle || new URL(feedUrl).hostname,
        guid: extractTag(itemContent, "guid"),
        author: extractTag(itemContent, "author") || extractTag(itemContent, "dc:creator"),
        categories,
        content: extractTag(itemContent, "content:encoded") || undefined,
      });
    }
  }

  return {
    title: feedTitle,
    description: feedDescription,
    link: feedLink,
    items,
  };
}

/**
 * Fetches and parses an RSS or Atom feed. Callers MUST call `validateRSSUrl`
 * first — this function does not validate the URL itself, it only fetches it.
 */
export async function fetchFeed(feedUrl: string): Promise<RSSFeed> {
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ContentFactoryBot/1.0)",
      "Accept": "application/rss+xml, application/xml, text/xml, application/atom+xml",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status} ${response.statusText}`);
  }

  const xmlText = await response.text();
  if (xmlText.length > MAX_FEED_BYTES) {
    throw new Error("RSS excede o limite de 5 MB");
  }

  return parseRSSXML(xmlText, feedUrl);
}
