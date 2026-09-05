import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  const authorization = req.headers.get("Authorization") || "";
  if (!url || !anonKey || !serviceKey || !authorization) return json({ error: "unauthorized" }, 401);

  const scoped = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: userError } = await scoped.auth.getUser();
  if (userError || !user) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "my_summary";

  if (action === "set_openai_byok" || action === "delete_openai_byok") {
    const organizationId = typeof body?.organization_id === "string" ? body.organization_id : "";
    if (!organizationId) return json({ error: "organization_required" }, 400);
    const { data: canManage } = await scoped.rpc("has_organization_role", { p_organization_id: organizationId, p_roles: ["owner", "admin"] });
    if (canManage !== true) return json({ error: "forbidden" }, 403);
    const args = action === "set_openai_byok"
      ? { p_organization_id: organizationId, p_secret: typeof body?.secret === "string" ? body.secret : "" }
      : { p_organization_id: organizationId };
    const rpc = action === "set_openai_byok" ? "set_organization_openai_byok" : "delete_organization_openai_byok";
    const { data, error } = await admin.rpc(rpc, args);
    if (error) return json({ error: error.message }, error.message.includes("forbidden") ? 403 : 400);
    return json({ success: true, credential: data });
  }

  if (action === "admin_summary") {
    const { data: isCeo } = await scoped.rpc("is_ceo");
    if (isCeo !== true) return json({ error: "admin_required" }, 403);
    const [{ data: organizations }, { data: projects }, { data: usage }, { data: jobs }] = await Promise.all([
      admin.from("organizations").select("id,name,slug,status,kind,created_at,organization_subscriptions(plan_id,status,current_period_end,commercial_plans(name,project_limit,article_limit_monthly))").order("created_at", { ascending: false }),
      admin.from("projects").select("organization_id,id"),
      admin.from("organization_usage_ledger").select("organization_id,metric,amount").gte("occurred_at", new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString()),
      admin.from("zica_brain_jobs").select("organization_id,status").in("status", ["queued", "processing", "retry", "dead_letter"]),
    ]);
    const projectCounts = new Map<string, number>();
    for (const row of projects || []) if (row.organization_id) projectCounts.set(row.organization_id, (projectCounts.get(row.organization_id) || 0) + 1);
    const articleCounts = new Map<string, number>();
    for (const row of usage || []) if (row.organization_id && row.metric === "article_generated") articleCounts.set(row.organization_id, (articleCounts.get(row.organization_id) || 0) + Number(row.amount || 0));
    const queueCounts = new Map<string, number>();
    for (const row of jobs || []) if (row.organization_id) queueCounts.set(row.organization_id, (queueCounts.get(row.organization_id) || 0) + 1);
    return json({ success: true, organizations: (organizations || []).map((row) => {
      const rawSubscription = row.organization_subscriptions;
      const subscriptions = rawSubscription
        ? (Array.isArray(rawSubscription) ? rawSubscription : [rawSubscription])
        : [];
      return {
        ...row,
        organization_subscriptions: subscriptions,
        projects_used: projectCounts.get(row.id) || 0,
        articles_used: articleCounts.get(row.id) || 0,
        active_jobs: queueCounts.get(row.id) || 0,
      };
    }) });
  }

  const { data: memberships, error: membershipError } = await admin.from("organization_members")
    .select("organization_id,role,status,organizations(id,name,slug,status,kind)")
    .eq("user_id", user.id).eq("status", "active");
  if (membershipError) return json({ error: "organization_lookup_failed" }, 500);
  const membership = memberships?.[0];
  if (!membership?.organization_id) return json({ error: "organization_not_found" }, 404);
  const organizationId = membership.organization_id;
  const periodStart = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString();
  const [{ count: projectCount }, { data: usage }, { count: assetCount }, { data: credential }, { data: subscription, error: subscriptionError }] = await Promise.all([
    admin.from("projects").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
    admin.from("organization_usage_ledger").select("amount").eq("organization_id", organizationId).eq("metric", "article_generated").gte("occurred_at", periodStart),
    admin.from("organization_brand_assets").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).neq("status", "archived"),
    admin.from("organization_provider_credentials").select("provider,secret_last_four,status,updated_at").eq("organization_id", organizationId).eq("provider", "openai").maybeSingle(),
    admin.from("organization_subscriptions").select("plan_id,status,current_period_start,current_period_end,commercial_plans(id,name,project_limit,article_limit_monthly,brand_asset_limit,byok_allowed,copilot_allowed)").eq("organization_id", organizationId).maybeSingle(),
  ]);
  if (subscriptionError) return json({ error: "subscription_lookup_failed" }, 500);
  const articlesUsed = (usage || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return json({
    success: true,
    membership: { ...membership, organization_subscriptions: subscription ? [subscription] : [] },
    usage: { projects: projectCount || 0, articles: articlesUsed, brand_assets: assetCount || 0 },
    byok: credential || null,
  });
});
