import { createClient } from "jsr:@supabase/supabase-js@2";

export type RuntimeKeys = {
  url: string;
  publicKey: string;
  secretKey: string;
};

function firstNamedKey(envName: string): string {
  const raw = Deno.env.get(envName) || "";
  if (!raw.trim()) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferred = parsed.default;
    if (typeof preferred === "string" && preferred.trim()) return preferred.trim();
    const first = Object.values(parsed).find((value) => typeof value === "string" && value.trim());
    return typeof first === "string" ? first.trim() : "";
  } catch {
    return "";
  }
}

export function getRuntimeKeys(): RuntimeKeys {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publicKey = firstNamedKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const secretKey = firstNamedKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return { url, publicKey, secretKey };
}

export function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isInternalServiceRequest(req: Request, secretKey: string): boolean {
  const apiKey = (req.headers.get("apikey") || "").trim();
  if (safeEqual(apiKey, secretKey)) return true;

  // Transitional support for callers still using the legacy service-role JWT as Bearer.
  // New secret keys must use `apikey` and are never treated as JWTs.
  const auth = req.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const bearer = auth.slice(7).trim();
    if (bearer.includes(".") && safeEqual(bearer, secretKey)) return true;
  }
  return false;
}

export function adminClient(keys: RuntimeKeys) {
  if (!keys.url || !keys.secretKey) throw new Error("supabase_secret_runtime_missing");
  return createClient(keys.url, keys.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function resolveUserCaller(
  req: Request,
  keys: RuntimeKeys,
  requestedUserId?: string | null,
): Promise<{ userId: string; internal: boolean }> {
  if (isInternalServiceRequest(req, keys.secretKey)) {
    const userId = String(requestedUserId || "").trim();
    if (!userId) throw Object.assign(new Error("userId_required_internal"), { status: 422 });
    return { userId, internal: true };
  }

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw Object.assign(new Error("authorization_required"), { status: 401 });
  if (!keys.publicKey) throw Object.assign(new Error("supabase_public_runtime_missing"), { status: 500 });

  const token = auth.slice(7);
  const client = createClient(keys.url, keys.publicKey, { global: { headers: { Authorization: auth } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error("session_invalid"), { status: 401 });
  if (requestedUserId && requestedUserId !== data.user.id) throw Object.assign(new Error("user_mismatch"), { status: 403 });
  return { userId: data.user.id, internal: false };
}

export function errorStatus(error: unknown, fallback = 500): number {
  const status = Number((error as { status?: number })?.status || 0);
  return Number.isFinite(status) && status >= 400 && status <= 599 ? status : fallback;
}
