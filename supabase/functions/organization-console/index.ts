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

const allowedRoles = new Set(["owner", "admin", "editor", "viewer", "campaign_manager"]);
const asNullableInteger = (value: unknown) => value === null || value === "" ? null : Number.isInteger(Number(value)) ? Number(value) : NaN;
const asRoleList = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((role): role is string => typeof role === "string" && allowedRoles.has(role)))] : [];

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

  const adminActions = new Set(["admin_summary", "business_config", "update_plan_terms", "update_organization_policy"]);
  if (adminActions.has(action)) {
    const { data: isCeo } = await scoped.rpc("is_ceo");
    if (isCeo !== true) return json({ error: "admin_required" }, 403);
  }

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
    const [{ data: organizations }, { data: projects }, { data: usage }, { data: jobs }, { data: plans }] = await Promise.all([
      admin.from("organizations").select("id,name,slug,status,kind,created_at,organization_subscriptions(plan_id,status,current_period_start,current_period_end,commercial_plans(name,project_limit,article_limit_monthly,price_cents,currency,billing_cycle,overage_policy,overage_unit_cents,overage_grace_articles)),organization_operating_policies(price_cents,currency,billing_cycle,project_limit_override,article_limit_monthly_override,overage_policy,overage_unit_cents,overage_grace_articles,publication_approval_required,publisher_roles,approver_roles,allow_automated_publish,version)").order("created_at", { ascending: false }),
      admin.from("projects").select("organization_id,id"),
      admin.from("organization_usage_ledger").select("organization_id,metric,amount").gte("occurred_at", new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString()),
      admin.from("zica_brain_jobs").select("organization_id,status").in("status", ["queued", "processing", "retry", "dead_letter"]),
      admin.from("commercial_plans").select("id,name,project_limit,article_limit_monthly,brand_asset_limit,byok_allowed,copilot_allowed,active,price_cents,currency,billing_cycle,overage_policy,overage_unit_cents,overage_grace_articles").order("id"),
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
        organization_operating_policies: row.organization_operating_policies
          ? (Array.isArray(row.organization_operating_policies) ? row.organization_operating_policies : [row.organization_operating_policies])
          : [],
        projects_used: projectCounts.get(row.id) || 0,
        articles_used: articleCounts.get(row.id) || 0,
        active_jobs: queueCounts.get(row.id) || 0,
      };
    }), plans: plans || [] });
  }

  if (action === "business_config") {
    const organizationId = typeof body?.organization_id === "string" ? body.organization_id : "";
    if (!organizationId) return json({ error: "organization_required" }, 400);
    const [{ data: organization }, { data: plans }, { data: versions }] = await Promise.all([
      admin.from("organizations").select("id,name,slug,status,kind,organization_subscriptions(*),organization_operating_policies(*)").eq("id", organizationId).maybeSingle(),
      admin.from("commercial_plans").select("id,name,project_limit,article_limit_monthly,brand_asset_limit,byok_allowed,copilot_allowed,active,price_cents,currency,billing_cycle,overage_policy,overage_unit_cents,overage_grace_articles").order("id"),
      admin.from("organization_policy_versions").select("version,changed_at,changed_by").eq("organization_id", organizationId).order("version", { ascending: false }).limit(10),
    ]);
    if (!organization) return json({ error: "organization_not_found" }, 404);
    return json({ success: true, organization, plans: plans || [], versions: versions || [] });
  }

  if (action === "update_plan_terms") {
    const planId = typeof body?.plan_id === "string" ? body.plan_id : "";
    const priceCents = asNullableInteger(body?.price_cents);
    const overageUnitCents = asNullableInteger(body?.overage_unit_cents);
    const grace = asNullableInteger(body?.overage_grace_articles);
    if (!planId || Number.isNaN(priceCents) || Number.isNaN(overageUnitCents) || grace === null || Number.isNaN(grace)) return json({ error: "invalid_plan_terms" }, 422);
    const { data, error } = await admin.rpc("update_commercial_plan_terms", {
      p_plan_id: planId,
      p_price_cents: priceCents,
      p_currency: String(body?.currency || "BRL").toUpperCase(),
      p_billing_cycle: String(body?.billing_cycle || "monthly"),
      p_overage_policy: String(body?.overage_policy || "block"),
      p_overage_unit_cents: overageUnitCents,
      p_overage_grace_articles: grace,
      p_changed_by: user.id,
    });
    if (error) return json({ error: error.message }, 422);
    return json({ success: true, result: data });
  }

  if (action === "update_organization_policy") {
    const organizationId = typeof body?.organization_id === "string" ? body.organization_id : "";
    const publisherRoles = asRoleList(body?.publisher_roles);
    const approverRoles = asRoleList(body?.approver_roles);
    const priceCents = asNullableInteger(body?.price_cents);
    const projectLimit = asNullableInteger(body?.project_limit_override);
    const articleLimit = asNullableInteger(body?.article_limit_monthly_override);
    const overageUnitCents = asNullableInteger(body?.overage_unit_cents);
    const grace = asNullableInteger(body?.overage_grace_articles);
    const periodStart = new Date(String(body?.current_period_start || ""));
    const periodEnd = new Date(String(body?.current_period_end || ""));
    if (!organizationId || publisherRoles.length === 0 || approverRoles.length === 0 || approverRoles.some((role) => !publisherRoles.includes(role))
      || [priceCents, projectLimit, articleLimit, overageUnitCents, grace].some((value) => Number.isNaN(value))
      || grace === null || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodEnd <= periodStart) {
      return json({ error: "invalid_organization_policy" }, 422);
    }
    const { data, error } = await admin.rpc("update_organization_business_policy", {
      p_organization_id: organizationId,
      p_plan_id: String(body?.plan_id || ""),
      p_subscription_status: String(body?.subscription_status || "active"),
      p_period_start: periodStart.toISOString(),
      p_period_end: periodEnd.toISOString(),
      p_price_cents: priceCents,
      p_currency: String(body?.currency || "BRL").toUpperCase(),
      p_billing_cycle: String(body?.billing_cycle || "monthly"),
      p_project_limit_override: projectLimit,
      p_article_limit_monthly_override: articleLimit,
      p_overage_policy: String(body?.overage_policy || "block"),
      p_overage_unit_cents: overageUnitCents,
      p_overage_grace_articles: grace,
      p_publication_approval_required: body?.publication_approval_required !== false,
      p_publisher_roles: publisherRoles,
      p_approver_roles: approverRoles,
      p_allow_automated_publish: body?.allow_automated_publish === true,
      p_changed_by: user.id,
    });
    if (error) return json({ error: error.message }, 422);
    return json({ success: true, result: data });
  }

  if (action !== "my_summary") return json({ error: "unsupported_action" }, 400);

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
    admin.from("organization_subscriptions").select("plan_id,status,current_period_start,current_period_end,commercial_plans(id,name,project_limit,article_limit_monthly,brand_asset_limit,byok_allowed,copilot_allowed,price_cents,currency,billing_cycle,overage_policy,overage_unit_cents,overage_grace_articles)").eq("organization_id", organizationId).maybeSingle(),
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
