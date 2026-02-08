import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    // Parse Atom format
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
    // Parse RSS 2.0 format
    const channelMatch = xmlText.match(/<channel>([\s\S]*?)<\/channel>/i);
    const channelContent = channelMatch ? channelMatch[1] : xmlText;
    
    feedTitle = extractTag(channelContent, 'title');
    feedDescription = extractTag(channelContent, 'description');
    feedLink = extractTag(channelContent, 'link') || feedUrl;

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemContent = match[1];
      
      // Extract image from media:content or enclosure
      let imageUrl = extractAttribute(itemContent, 'media:content', 'url');
      if (!imageUrl) {
        imageUrl = extractAttribute(itemContent, 'enclosure', 'url');
        // Only use enclosure if it's an image
        if (imageUrl && !imageUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
          imageUrl = '';
        }
      }
      
      // Extract categories
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

serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  log.requestStart(req.method);

  try {
    const { feedUrls, limit = 10 } = await req.json();

    if (!feedUrls || !Array.isArray(feedUrls) || feedUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: "feedUrls array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("parsing_feeds", { count: feedUrls.length });

    const results: { url: string; feed?: RSSFeed; error?: string }[] = [];
    const allItems: RSSItem[] = [];

    for (const url of feedUrls) {
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

    // Sort by date and dedupe
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
      feeds: feedUrls.length, 
      totalItems: allItems.length,
      uniqueItems: sortedItems.length 
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
        error: error instanceof Error ? error.message : "Unknown error",
        request_id: requestId 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
