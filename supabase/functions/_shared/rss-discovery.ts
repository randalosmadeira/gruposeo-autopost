export type FeedFormat = "rss" | "atom" | "rdf" | "unknown";

export type FeedValidation = {
  valid: boolean;
  url: string;
  requested_url: string;
  status: number | null;
  content_type: string | null;
  content_type_valid: boolean;
  structure_valid: boolean;
  format: FeedFormat;
  bytes: number;
  reason?: string;
};

export type FeedDiscovery = FeedValidation & {
  discovery_method: "html_alternate" | "fallback" | "direct" | "none";
  site_url: string;
  attempted: string[];
};

export type FeedItem = {
  title: string;
  link: string;
  description: string;
  content?: string;
  published_at: string | null;
  guid?: string;
  author?: string;
  categories?: string[];
  image_url?: string;
};

const ACCEPTED_CONTENT_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/xml",
  "application/rdf+xml",
  "text/xml",
];

const DEFAULT_HEADERS = {
  "User-Agent": "Zica.ai-RSS-Discovery/3.11 (+https://app.zica.posts.zicajuris.com.br)",
  Accept: "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, text/html;q=0.5",
};

function ipv4ToNumber(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return null;
  return (((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3]) >>> 0;
}

function inIpv4Range(value: number, start: string, end: string): boolean {
  const a = ipv4ToNumber(start);
  const b = ipv4ToNumber(end);
  return a !== null && b !== null && value >= a && value <= b;
}

export function isSafePublicHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (url.username || url.password) return false;

    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (host === '::1' || host === '0:0:0:0:0:0:0:1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false;

    const ipv4 = ipv4ToNumber(host);
    if (ipv4 !== null) {
      if (
        inIpv4Range(ipv4, '0.0.0.0', '0.255.255.255') ||
        inIpv4Range(ipv4, '10.0.0.0', '10.255.255.255') ||
        inIpv4Range(ipv4, '100.64.0.0', '100.127.255.255') ||
        inIpv4Range(ipv4, '127.0.0.0', '127.255.255.255') ||
        inIpv4Range(ipv4, '169.254.0.0', '169.254.255.255') ||
        inIpv4Range(ipv4, '172.16.0.0', '172.31.255.255') ||
        inIpv4Range(ipv4, '192.0.0.0', '192.0.0.255') ||
        inIpv4Range(ipv4, '192.168.0.0', '192.168.255.255') ||
        inIpv4Range(ipv4, '198.18.0.0', '198.19.255.255') ||
        inIpv4Range(ipv4, '224.0.0.0', '255.255.255.255')
      ) return false;
    }

    return host !== '169.254.169.254' && host !== 'metadata.google.internal';
  } catch {
    return false;
  }
}

function formatFromXml(xml: string): FeedFormat {
  const sample = xml.slice(0, 12000).toLowerCase();
  if (/<feed\b/.test(sample)) return "atom";
  if (/<rdf:rdf\b/.test(sample) || /<rdf\b/.test(sample)) return "rdf";
  if (/<rss\b/.test(sample) || /<channel\b/.test(sample)) return "rss";
  return "unknown";
}

export function hasValidFeedStructure(xml: string): boolean {
  const sample = xml.slice(0, 100000).replace(/^\uFEFF/, '').trim().toLowerCase();
  if (!sample) return false;
  if (/<feed\b/.test(sample) && (/<entry\b/.test(sample) || /<title\b/.test(sample))) return true;
  if (/<rss\b/.test(sample) && /<channel\b/.test(sample)) return true;
  if (/<rdf:rdf\b/.test(sample) && /<item\b/.test(sample)) return true;
  return false;
}

function validContentType(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase().split(';')[0].trim();
  return ACCEPTED_CONTENT_TYPES.includes(normalized) || normalized.endsWith('+xml');
}

async function readResponseBody(response: Response, maxBytes: number): Promise<{ text: string; bytes: number }> {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error(`RSS excede ${Math.round(maxBytes / 1_000_000)} MB`);
  const text = await response.text();
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxBytes) throw new Error(`RSS excede ${Math.round(maxBytes / 1_000_000)} MB`);
  return { text, bytes };
}

export async function validateFeedUrl(
  requestedUrl: string,
  options: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<FeedValidation> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxBytes = options.maxBytes ?? 3_000_000;
  if (!isSafePublicHttpUrl(requestedUrl)) {
    return { valid: false, url: requestedUrl, requested_url: requestedUrl, status: null, content_type: null, content_type_valid: false, structure_valid: false, format: 'unknown', bytes: 0, reason: 'unsafe_url' };
  }

  try {
    const response = await fetch(requestedUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const finalUrl = response.url || requestedUrl;
    if (!isSafePublicHttpUrl(finalUrl)) {
      return { valid: false, url: finalUrl, requested_url: requestedUrl, status: response.status, content_type: response.headers.get('content-type'), content_type_valid: false, structure_valid: false, format: 'unknown', bytes: 0, reason: 'unsafe_redirect' };
    }
    if (!response.ok) {
      return { valid: false, url: finalUrl, requested_url: requestedUrl, status: response.status, content_type: response.headers.get('content-type'), content_type_valid: validContentType(response.headers.get('content-type')), structure_valid: false, format: 'unknown', bytes: 0, reason: `http_${response.status}` };
    }

    const contentType = response.headers.get('content-type');
    const contentTypeValid = validContentType(contentType);
    const { text, bytes } = await readResponseBody(response, maxBytes);
    const structureValid = hasValidFeedStructure(text);
    const format = formatFromXml(text);
    const valid = response.ok && contentTypeValid && structureValid;
    return {
      valid,
      url: finalUrl,
      requested_url: requestedUrl,
      status: response.status,
      content_type: contentType,
      content_type_valid: contentTypeValid,
      structure_valid: structureValid,
      format,
      bytes,
      reason: valid ? undefined : (!contentTypeValid ? 'invalid_content_type' : 'invalid_xml_structure'),
    };
  } catch (error) {
    return { valid: false, url: requestedUrl, requested_url: requestedUrl, status: null, content_type: null, content_type_valid: false, structure_valid: false, format: 'unknown', bytes: 0, reason: error instanceof Error ? error.message : 'fetch_failed' };
  }
}

function attrMap(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])(.*?)\2/gis)) result[match[1].toLowerCase()] = match[3];
  return result;
}

export function extractAlternateFeedLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gis)) {
    const attrs = attrMap(match[0]);
    const rel = String(attrs.rel || '').toLowerCase().split(/\s+/);
    const type = String(attrs.type || '').toLowerCase();
    if (!rel.includes('alternate') || !['application/rss+xml', 'application/atom+xml', 'application/rdf+xml', 'application/xml', 'text/xml'].includes(type)) continue;
    if (!attrs.href) continue;
    try {
      const resolved = new URL(attrs.href, baseUrl).toString();
      if (isSafePublicHttpUrl(resolved)) links.push(resolved);
    } catch { /* invalid href */ }
  }
  return [...new Set(links)];
}

function normalizedPathBase(url: URL): string {
  let path = url.pathname || '/';
  if (!path.endsWith('/')) path += '/';
  return `${url.origin}${path}`;
}

function parentBase(url: URL): string {
  const parts = (url.pathname || '/').split('/').filter(Boolean);
  if (parts.length <= 1) return `${url.origin}/`;
  parts.pop();
  return `${url.origin}/${parts.join('/')}/`;
}

export function fallbackFeedCandidates(siteUrl: string): string[] {
  const url = new URL(siteUrl);
  const bases = [...new Set([normalizedPathBase(url), parentBase(url), `${url.origin}/`])];
  const result: string[] = [];
  for (const base of bases) {
    result.push(new URL('feed/', base).toString());
    const q1 = new URL(base); q1.searchParams.set('feed', 'rss2'); result.push(q1.toString());
    const q2 = new URL(base); q2.searchParams.set('format', 'rss'); result.push(q2.toString());
    for (const suffix of ['rss', 'rss.xml', 'feed.xml', 'atom.xml']) result.push(new URL(suffix, base).toString());
  }
  return [...new Set(result)].filter(isSafePublicHttpUrl);
}

async function fetchHtml(siteUrl: string, timeoutMs: number, maxBytes: number): Promise<{ html: string; finalUrl: string }> {
  if (!isSafePublicHttpUrl(siteUrl)) throw new Error('unsafe_url');
  const response = await fetch(siteUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: { ...DEFAULT_HEADERS, Accept: 'text/html, application/xhtml+xml;q=0.9, application/rss+xml;q=0.6, application/xml;q=0.5' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  if (!isSafePublicHttpUrl(response.url || siteUrl)) throw new Error('unsafe_redirect');
  const { text } = await readResponseBody(response, maxBytes);
  return { html: text, finalUrl: response.url || siteUrl };
}

export async function discoverFeed(
  siteUrl: string,
  options: { timeoutMs?: number; maxFeedBytes?: number; maxHtmlBytes?: number; directCandidate?: string | null } = {},
): Promise<FeedDiscovery> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxFeedBytes = options.maxFeedBytes ?? 3_000_000;
  const attempted: string[] = [];

  if (options.directCandidate) {
    attempted.push(options.directCandidate);
    const direct = await validateFeedUrl(options.directCandidate, { timeoutMs, maxBytes: maxFeedBytes });
    if (direct.valid) return { ...direct, discovery_method: 'direct', site_url: siteUrl, attempted };
  }

  try {
    const page = await fetchHtml(siteUrl, timeoutMs, options.maxHtmlBytes ?? 2_000_000);
    for (const candidate of extractAlternateFeedLinks(page.html, page.finalUrl)) {
      if (attempted.includes(candidate)) continue;
      attempted.push(candidate);
      const validation = await validateFeedUrl(candidate, { timeoutMs, maxBytes: maxFeedBytes });
      if (validation.valid) return { ...validation, discovery_method: 'html_alternate', site_url: siteUrl, attempted };
    }
  } catch { /* fallbacks remain authoritative */ }

  for (const candidate of fallbackFeedCandidates(siteUrl)) {
    if (attempted.includes(candidate)) continue;
    attempted.push(candidate);
    const validation = await validateFeedUrl(candidate, { timeoutMs, maxBytes: maxFeedBytes });
    if (validation.valid) return { ...validation, discovery_method: 'fallback', site_url: siteUrl, attempted };
  }

  return {
    valid: false,
    url: '',
    requested_url: siteUrl,
    status: null,
    content_type: null,
    content_type_valid: false,
    structure_valid: false,
    format: 'unknown',
    bytes: 0,
    reason: 'feed_not_found',
    discovery_method: 'none',
    site_url: siteUrl,
    attempted,
  };
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'").trim();
}

function stripHtml(value: string): string {
  return decodeXml(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstTag(xml: string, tag: string): string {
  const escaped = tag.replace(':', '\\:');
  const match = xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match?.[1] ? decodeXml(match[1]) : '';
}

function attr(xml: string, tag: string, name: string): string {
  const escaped = tag.replace(':', '\\:');
  return xml.match(new RegExp(`<${escaped}\\b[^>]*${name}=["']([^"']+)["'][^>]*>`, 'i'))?.[1] || '';
}

export function parseFeedXml(xml: string, feedUrl: string, limit = 20): FeedItem[] {
  const rssBlocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  const atomBlocks = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  const blocks = rssBlocks.length ? rssBlocks : atomBlocks;
  const items: FeedItem[] = [];

  for (const block of blocks.slice(0, Math.max(1, Math.min(100, limit)))) {
    const title = stripHtml(firstTag(block, 'title'));
    let link = stripHtml(firstTag(block, 'link'));
    if (!link) link = attr(block, 'link', 'href') || stripHtml(firstTag(block, 'id'));
    if (!title || !link) continue;
    try { link = new URL(link, feedUrl).toString(); } catch { continue; }
    if (!isSafePublicHttpUrl(link)) continue;

    const rawDescription = firstTag(block, 'description') || firstTag(block, 'summary');
    const rawContent = firstTag(block, 'content:encoded') || firstTag(block, 'content');
    const date = firstTag(block, 'pubDate') || firstTag(block, 'published') || firstTag(block, 'updated');
    let publishedAt: string | null = null;
    if (date && Number.isFinite(Date.parse(date))) publishedAt = new Date(date).toISOString();

    const categories = [...block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => stripHtml(m[1])).filter(Boolean);
    const imageUrl = attr(block, 'media:content', 'url') || attr(block, 'enclosure', 'url') || undefined;
    const safeImage = imageUrl && isSafePublicHttpUrl(imageUrl) ? imageUrl : undefined;

    items.push({
      title,
      link,
      description: stripHtml(rawDescription),
      content: rawContent ? stripHtml(rawContent) : undefined,
      published_at: publishedAt,
      guid: stripHtml(firstTag(block, 'guid') || firstTag(block, 'id')) || undefined,
      author: stripHtml(firstTag(block, 'author') || firstTag(block, 'dc:creator') || firstTag(block, 'name')) || undefined,
      categories,
      image_url: safeImage,
    });
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.link}|${item.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchValidatedFeedItems(feedUrl: string, limit = 20): Promise<{ validation: FeedValidation; items: FeedItem[] }> {
  const validation = await validateFeedUrl(feedUrl);
  if (!validation.valid) return { validation, items: [] };
  const response = await fetch(validation.url, { headers: DEFAULT_HEADERS, signal: AbortSignal.timeout(15000) });
  const { text } = await readResponseBody(response, 3_000_000);
  return { validation, items: parseFeedXml(text, validation.url, limit) };
}
