import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/permissions";

export type WorkforceActor = { userId: string; email: string | null; role: StaffRole };
export type WorkforceContext = { actor: WorkforceActor; db: SupabaseClient };

export async function getWorkforceContext(): Promise<WorkforceContext | null> {
  const session = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) return null;

  const { data: profile, error: profileError } = await session
    .from("staff_profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  const roles: StaffRole[] = ["supreme", "admin", "manager", "employee", "staff"];
  if (profileError || !profile || profile.is_active !== true || !roles.includes(profile.role as StaffRole)) return null;

  if (profile.role === "supreme") {
    const { data: assurance, error } = await session.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || assurance.currentLevel !== "aal2") return null;
  }

  const { env } = await getCloudflareContext();
  const serviceKey = (env as typeof env & { SUPABASE_SERVICE_ROLE_KEY?: string }).SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) throw new Error("Workforce server configuration is incomplete.");

  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    actor: { userId: user.id, email: user.email ?? null, role: profile.role as StaffRole },
    db,
  };
}

export function isExecutive(role: StaffRole): boolean {
  return role === "supreme" || role === "admin";
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function readJson(request: Request, maxBytes = 8192): Promise<Record<string, unknown> | null> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) return null;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export async function getActorDepartmentIds(db: SupabaseClient, actor: WorkforceActor): Promise<string[]> {
  if (actor.role === "manager") {
    const { data } = await db.from("departments").select("id").eq("manager_user_id", actor.userId).eq("is_active", true);
    return (data ?? []).map((row) => row.id as string);
  }
  if (actor.role === "employee" || actor.role === "staff") {
    const { data } = await db.from("department_memberships").select("department_id").eq("user_id", actor.userId);
    return (data ?? []).map((row) => row.department_id as string);
  }
  return [];
}
