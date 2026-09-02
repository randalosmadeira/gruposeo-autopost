import { createClient } from "jsr:@supabase/supabase-js@2";

export type RequestActor = {
  userId: string;
  mode: "user" | "service";
};

export class RequestAuthError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 401, code = "unauthorized") {
    super(message);
    this.name = "RequestAuthError";
    this.status = status;
    this.code = code;
  }
}

function env(name: string) {
  return String(Deno.env.get(name) || "").trim();
}

function serviceCredentials() {
  return [env("SUPABASE_SERVICE_ROLE_KEY"), env("SUPABASE_SECRET_KEY")].filter(Boolean);
}

export function isServiceCredential(token: string) {
  return Boolean(token) && serviceCredentials().some((candidate) => candidate === token);
}

export async function resolveRequestActor(req: Request, requestedUserId?: string | null): Promise<RequestActor> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new RequestAuthError("Autorização necessária", 401, "authorization_required");
  }

  const token = authHeader.slice(7).trim();
  if (!token) throw new RequestAuthError("Autorização necessária", 401, "authorization_required");

  if (isServiceCredential(token)) {
    const userId = String(requestedUserId || "").trim();
    if (!userId) {
      throw new RequestAuthError("userId é obrigatório em chamada interna", 400, "background_user_required");
    }
    return { userId, mode: "service" };
  }

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !anonKey) {
    throw new RequestAuthError("Backend de autenticação incompleto", 500, "auth_backend_incomplete");
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new RequestAuthError("Sessão inválida", 401, "session_invalid");
  }

  if (requestedUserId && requestedUserId !== data.user.id) {
    throw new RequestAuthError("userId incompatível", 403, "user_mismatch");
  }

  return { userId: data.user.id, mode: "user" };
}
