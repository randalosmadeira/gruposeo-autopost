
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, createRequestId } from "../_shared/logger.ts";

const FUNCTION_NAME = "parse-rss";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  guid?: string;
  author?: string;
  categories?: string[];
  imageUrl?: string;
}

export interface RSSFeed {
  title: string;
  description: string;
  link: string;
  lastBuildDate?: string;
  items: RSSItem[];
}

// --- SSRF Protection ---
function validateRSSUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.20.') ||
      hostname.startsWith('172.21.') ||
      hostname.startsWith('172.22.') ||
      hostname.startsWith('172.23.') ||
      hostname.startsWith('172.24.') ||
      hostname.startsWith('172.25.') ||
      hostname.startsWith('172.26.') ||
      hostname.startsWith('172.27.') ||
      hostname.startsWith('172.28.') ||
      hostname.startsWith('172.29.') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.') ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// --- XML Parsing Helpers ---
function extractCDATA(content: string): string {
  const cdataMatch = content.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cdataMatch) return cdataMatch[1].trim();
  return content.replace(/<[^>]+>/g, '').trim();
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? extractCDATA(match[1]) : '';
}

function extractAttribute(xml: string, tag: string, attr: string): string {
  const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : '';
}

function parseRSSXML(xmlText: string, feedUrl: string): RSSFeed {
  const isAtom = xmlText.includes('<feed') && xmlText.includes('xmlns="http://www.w3.org/2005/Atom"');

  let feedTitle = '';
  let feedDescription = '';
  let feedLink = '';
  const items: RSSItem[] = [];

  if (isAtom) {
    feedTitle = extractTag(xmlText, 'title');
    feedDescription = extractTag(xmlText, 'subtitle');
    feedLink = extractAttribute(xmlText, 'link', 'href') || feedUrl;

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    let match;

    while ((match = entryRegex.exec(xmlText)) !== null) {
      const entryContent = match[1];
      const link = extractAttribute(entryContent, 'link', 'href') || extractTag(entryContent, 'id');
      const pubDate = extractTag(entryContent, 'published') || extractTag(entryContent, 'updated');
      const author = extractTag(entryContent, 'name') || extractTag(entryContent, 'author');

      items.push({
        title: extractTag(entryContent, 'title'),
        link,
        description: extractTag(entryContent, 'summary') || extractTag(entryContent, 'content'),
        pubDate,
        source: feedTitle || new URL(feedUrl).hostname,
        guid: extractTag(entryContent, 'id'),
        author,
      });
    }
  } else {
    const channelMatch = xmlText.match(/<channel>([\s\S]*?)<\/channel>/i);
    const channelContent = channelMatch ? channelMatch[1] : xmlText;

    feedTitle = extractTag(channelContent, 'title');
    feedDescription = extractTag(channelContent, 'description');
    feedLink = extractTag(channelContent, 'link') || feedUrl;

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemContent = match[1];

      let imageUrl = extractAttribute(itemContent, 'media:content', 'url');
      if (!imageUrl) {
        imageUrl = extractAttribute(itemContent, 'enclosure', 'url');
        if (imageUrl && !imageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
          imageUrl = '';
        }
      }

      const categories: string[] = [];
      const catRegex = /<category[^>]*>([^<]+)<\/category>/gi;
      let catMatch;
      while ((catMatch = catRegex.exec(itemContent)) !== null) {
        categories.push(extractCDATA(catMatch[1]));
      }

      items.push({
        title: extractTag(itemContent, 'title'),
        link: extractTag(itemContent, 'link'),
        description: extractTag(itemContent, 'description'),
        pubDate: extractTag(itemContent, 'pubDate'),
        source: extractTag(itemContent, 'source') || feedTitle || new URL(feedUrl).hostname,
        guid: extractTag(itemContent, 'guid'),
        author: extractTag(itemContent, 'author') || extractTag(itemContent, 'dc:creator'),
        categories,
        imageUrl,
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

async function fetchRSSFeed(feedUrl: string): Promise<RSSFeed> {
  const response = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ContentFactoryBot/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch feed: ${response.status} ${response.statusText}`);
  }

  const xmlText = await response.text();
  return parseRSSXML(xmlText, feedUrl);
}

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  log.requestStart(req.method);

  // --- Authentication ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Authorization required" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    log.warn("auth_failed", { error: authError?.message });
    return new Response(
      JSON.stringify({ error: "Invalid authentication" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { feedUrls, limit = 10 } = await req.json();

    if (!feedUrls || !Array.isArray(feedUrls) || feedUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: "feedUrls array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cap number of feeds to prevent abuse
    const cappedFeedUrls = feedUrls.slice(0, 10);

    log.info("parsing_feeds", { count: cappedFeedUrls.length, user_id: user.id });

    const results: { url: string; feed?: RSSFeed; error?: string }[] = [];
    const allItems: RSSItem[] = [];

    for (const url of cappedFeedUrls) {
      // SSRF validation
      if (!validateRSSUrl(url)) {
        log.warn("ssrf_blocked", { url });
        results.push({ url, error: "Invalid or forbidden URL" });
        continue;
      }

      try {
        const feed = await fetchRSSFeed(url);
        results.push({ url, feed });
        allItems.push(...feed.items);
        log.info("feed_parsed", { url, items: feed.items.length });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        log.warn("feed_error", { url, error: errorMsg });
        results.push({ url, error: errorMsg });
      }
    }

    const sortedItems = allItems
      .filter(item => item.title && item.link)
      .sort((a, b) => {
        const dateA = new Date(a.pubDate || 0).getTime();
        const dateB = new Date(b.pubDate || 0).getTime();
        return dateB - dateA;
      })
      .filter((item, index, self) =>
        index === self.findIndex(t => t.link === item.link || t.title === item.title)
      )
      .slice(0, limit);

    log.info("parse_complete", {
      feeds: cappedFeedUrls.length,
      totalItems: allItems.length,
      uniqueItems: sortedItems.length,
    });
    log.requestEnd(200, Date.now() - startTime);

    return new Response(
      JSON.stringify({
        success: true,
        feeds: results,
        items: sortedItems,
        request_id: requestId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.error("parse_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        request_id: requestId,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
