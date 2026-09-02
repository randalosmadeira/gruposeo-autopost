import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

function env(name: string) {
  return String(Deno.env.get(name) || "").trim();
}

function normalizeQuery(value: unknown, max = 80) {
  return String(value ?? "").replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

async function requireCeo(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return { error: json({ error: "authorization_required" }, 401) };

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !anonKey) return { error: json({ error: "auth_backend_incomplete" }, 500) };

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authHeader.slice(7);
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return { error: json({ error: "invalid_session" }, 401) };

  const { data: isCeo, error: roleError } = await userClient.rpc("is_ceo");
  if (roleError || isCeo !== true) return { error: json({ error: "ceo_access_required" }, 403) };
  return { user: authData.user };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const access = await requireCeo(req);
  if ("error" in access) return access.error;

  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "service_backend_incomplete" }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const page = Math.max(1, Number(body.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(body.pageSize || 50)));
    const status = normalizeQuery(body.status, 40).toLowerCase();
    const search = normalizeQuery(body.search, 80);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let listQuery = admin
      .from("supporter_avatar_requests")
      .select("id,supporter_name,email,whatsapp,city,state,status,source_count,generation_count,max_generations,candidate_preset_slug,output_format,consent_image_use,consent_terms,consent_public_gallery,consent_at,supporter_approved_at,created_at,updated_at,completed_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status && status !== "all") listQuery = listQuery.eq("status", status);
    if (search) {
      listQuery = listQuery.or(`supporter_name.ilike.%${search}%,email.ilike.%${search}%,whatsapp.ilike.%${search}%,city.ilike.%${search}%`);
    }

    const [listResult, total, completed, failed, processing, gallery] = await Promise.all([
      listQuery,
      admin.from("supporter_avatar_requests").select("id", { count: "exact", head: true }),
      admin.from("supporter_avatar_requests").select("id", { count: "exact", head: true }).eq("status", "completed"),
      admin.from("supporter_avatar_requests").select("id", { count: "exact", head: true }).eq("status", "failed"),
      admin.from("supporter_avatar_requests").select("id", { count: "exact", head: true }).in("status", ["queued", "processing", "qa"]),
      admin.from("supporter_avatar_requests").select("id", { count: "exact", head: true }).eq("consent_public_gallery", true),
    ]);

    if (listResult.error) throw listResult.error;
    return json({
      ok: true,
      items: listResult.data || [],
      pagination: { page, pageSize, total: listResult.count || 0, pages: Math.max(1, Math.ceil((listResult.count || 0) / pageSize)) },
      stats: {
        total: total.count || 0,
        completed: completed.count || 0,
        failed: failed.count || 0,
        processing: processing.count || 0,
        galleryAuthorized: gallery.count || 0,
      },
    });
  } catch (error) {
    console.error("supporter-avatar-admin:", error);
    return json({ error: error instanceof Error ? error.message : "internal_error" }, 500);
  }
});
