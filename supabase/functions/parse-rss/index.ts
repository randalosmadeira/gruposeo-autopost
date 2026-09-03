import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger, createRequestId } from "../_shared/logger.ts";
import { discoverFeed, fetchValidatedFeedItems, type FeedItem } from "../_shared/rss-discovery.ts";

const FUNCTION_NAME = "parse-rss";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Input = {
  feedUrls?: string[];
  siteUrls?: string[];
  limit?: number;
  projectId?: string | null;
  portalId?: string | null;
  persistAssociation?: boolean;
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  const requestId = createRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const startTime = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return response({ success: false, error: "Method not allowed", request_id: requestId }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return response({ success: false, error: "Authorization required", request_id: requestId }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    log.warn("auth_failed", { error: authError?.message });
    return response({ success: false, error: "Invalid authentication", request_id: requestId }, 401);
  }

  try {
    const input = await req.json().catch(() => ({})) as Input;
    const direct = Array.isArray(input.feedUrls) ? input.feedUrls.filter(Boolean) : [];
    const sites = Array.isArray(input.siteUrls) ? input.siteUrls.filter(Boolean) : [];
    const targets = [
      ...direct.map((url) => ({ siteUrl: url, directCandidate: url })),
      ...sites.map((url) => ({ siteUrl: url, directCandidate: null as string | null })),
    ].slice(0, 10);
    if (!targets.length) return response({ success: false, error: "feedUrls ou siteUrls é obrigatório", request_id: requestId }, 400);

    const limit = Math.max(1, Math.min(100, Number(input.limit || 10)));
    const results: any[] = [];
    const allItems: FeedItem[] = [];
    let firstValidFeed: any = null;

    for (const target of targets) {
      const discovery = await discoverFeed(target.siteUrl, { directCandidate: target.directCandidate });
      if (!discovery.valid) {
        results.push({ input_url: target.siteUrl, success: false, discovery });
        continue;
      }
      const fetched = await fetchValidatedFeedItems(discovery.url, limit);
      if (!fetched.validation.valid) {
        results.push({ input_url: target.siteUrl, success: false, discovery, validation: fetched.validation });
        continue;
      }
      firstValidFeed ||= discovery;
      allItems.push(...fetched.items);
      results.push({ input_url: target.siteUrl, success: true, discovery, validation: fetched.validation, items: fetched.items });
      log.info("feed_parsed", { input: target.siteUrl, feed: discovery.url, items: fetched.items.length, method: discovery.discovery_method });
    }

    if (input.persistAssociation && firstValidFeed && serviceKey && (input.projectId || input.portalId)) {
      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const validatedAt = new Date().toISOString();
      const validation = {
        url: firstValidFeed.url,
        format: firstValidFeed.format,
        http_status: firstValidFeed.status,
        content_type: firstValidFeed.content_type,
        content_type_valid: firstValidFeed.content_type_valid,
        structure_valid: firstValidFeed.structure_valid,
        discovery_method: firstValidFeed.discovery_method,
        attempted: firstValidFeed.attempted,
      };
      if (input.projectId) {
        const { data: owned } = await admin.from("projects").select("id").eq("id", input.projectId).eq("user_id", user.id).maybeSingle();
        if (owned) await admin.from("projects").update({ rss_feed_url: firstValidFeed.url, rss_feed_validation: validation, rss_feed_validated_at: validatedAt, updated_at: validatedAt }).eq("id", input.projectId);
      }
      if (input.portalId) {
        const { data: owned } = await admin.from("monitored_portals").select("id").eq("id", input.portalId).eq("user_id", user.id).maybeSingle();
        if (owned) await admin.from("monitored_portals").update({ rss_feed_url: firstValidFeed.url, rss_feed_validation: validation, rss_feed_validated_at: validatedAt, updated_at: validatedAt }).eq("id", input.portalId);
      }
    }

    const unique = new Map<string, FeedItem>();
    for (const item of allItems) {
      const key = item.link || item.title.toLowerCase();
      if (!unique.has(key)) unique.set(key, item);
    }
    const items = [...unique.values()]
      .sort((a, b) => Date.parse(b.published_at || "1970-01-01") - Date.parse(a.published_at || "1970-01-01"))
      .slice(0, limit);

    log.requestEnd(200, Date.now() - startTime);
    return response({ success: true, feeds: results, items, request_id: requestId });
  } catch (error) {
    log.error("parse_error", { error: error instanceof Error ? error.message : "unknown" });
    log.requestEnd(500, Date.now() - startTime);
    return response({ success: false, error: error instanceof Error ? error.message : "Internal server error", request_id: requestId }, 500);
  }
});
