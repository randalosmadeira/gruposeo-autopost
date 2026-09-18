
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { validateRSSUrl as validateRSSUrlOrThrow, fetchFeed as fetchRSSFeed, type RSSItem, type RSSFeed } from "../_shared/rss-feed.ts";

const FUNCTION_NAME = "parse-rss";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export type { RSSItem, RSSFeed };

// Preserves this function's original boolean-returning contract while
// delegating the actual blocklist logic to the shared module.
function validateRSSUrl(urlString: string): boolean {
  try {
    validateRSSUrlOrThrow(urlString);
    return true;
  } catch {
    return false;
  }
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
