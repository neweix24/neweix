import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Role = "supreme" | "admin" | "staff";
type Access =
  | { ok: true; userId: string; role: Role }
  | { ok: false; error: string; status: 401 | 403 };

function respond(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function getAccess(): Promise<Access> {
  const session = await createServerSupabaseClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user) return { ok: false, error: "Authentication required.", status: 401 };

  const { data: profile, error: profileError } = await session
    .from("staff_profiles").select("role, is_active").eq("user_id", user.id).maybeSingle();

  if (profileError || !profile || profile.is_active !== true ||
      !["supreme", "admin"].includes(profile.role)) {
    return { ok: false, error: "You are not authorized to perform this action.", status: 403 };
  }

  if (profile.role === "supreme") {
    const { data: assurance, error: mfaError } = await session.auth.mfa.getAuthenticatorAssuranceLevel();
    if (mfaError || assurance?.currentLevel !== "aal2") {
      return { ok: false, error: "Complete MFA verification for the Supreme account.", status: 403 };
    }
  }

  return { ok: true, userId: user.id, role: profile.role as Role };
}

async function getAdminClient() {
  const { env } = await getCloudflareContext();
  const runtimeEnv = env as Record<string, unknown>;
  const url = runtimeEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof url !== "string" || !url || typeof key !== "string" || !key) {
    throw new Error("Supabase server configuration is missing.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validImageUrl(value: unknown): value is string | null {
  if (value === null || value === "") return true;
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 8192)) return null;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8192) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch { return null; }
}

function validateFields(input: Record<string, unknown>, partial: boolean) {
  const output: Record<string, unknown> = {};
  if (!partial || "name" in input) {
    if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 120) return "Category name must be between 1 and 120 characters.";
    output.name = input.name.trim();
  }
  if (!partial || "slug" in input) {
    if (typeof input.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug.trim()) || input.slug.trim().length > 140) return "Slug must use lowercase English letters, numbers, and hyphens.";
    output.slug = input.slug.trim();
  }
  if ("description" in input) {
    if (input.description !== null && (typeof input.description !== "string" || input.description.length > 2000)) return "Description must be 2,000 characters or fewer.";
    output.description = typeof input.description === "string" ? input.description.trim() || null : null;
  } else if (!partial) output.description = null;
  if ("image_url" in input) {
    if (!validImageUrl(input.image_url)) return "Image URL must be a secure HTTPS URL.";
    output.image_url = input.image_url || null;
  } else if (!partial) output.image_url = null;
  if ("sort_order" in input) {
    if (typeof input.sort_order !== "number" || !Number.isSafeInteger(input.sort_order) || input.sort_order < 0 || input.sort_order > 1000000) return "Sort order must be between 0 and 1,000,000.";
    output.sort_order = input.sort_order;
  } else if (!partial) output.sort_order = 0;
  if ("is_active" in input) {
    if (typeof input.is_active !== "boolean") return "Category status is invalid.";
    output.is_active = input.is_active;
  } else if (!partial) output.is_active = true;
  return output;
}

async function audit(client: Awaited<ReturnType<typeof getAdminClient>>, userId: string, action: string, id: string, details: Record<string, unknown>) {
  try {
    await writeAuditLog(client, { actorId: userId, action, targetType: "category", targetId: id, details });
  } catch (error) {
    console.error("Category mutation audit write failed:", error);
  }
}

export async function GET() {
  try {
    const access = await getAccess();
    if (!access.ok) return respond(access.error, access.status);
    const client = await getAdminClient();
    const { data, error } = await client.from("categories")
      .select("id, name, slug, description, image_url, is_active, sort_order, created_at")
      .order("sort_order", { ascending: true }).order("name", { ascending: true }).limit(200);
    if (error) {
      console.error("Categories GET failed:", error.message);
      return respond("Could not load categories.", 500);
    }
    return NextResponse.json({ success: true, categories: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Categories GET error:", error);
    return respond("A server error occurred.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if (!access.ok) return respond(access.error, access.status);
    if (access.role === "staff") return respond("You are not authorized to create categories.", 403);
    const body = await readBody(request);
    if (!body) return respond("Provide valid JSON data (maximum 8 KB).", 400);
    const fields = validateFields(body, false);
    if (typeof fields === "string") return respond(fields, 400);
    const client = await getAdminClient();
    const { data, error } = await client.from("categories").insert(fields).select("id, name, slug, description, image_url, is_active, sort_order, created_at").single();
    if (error) {
      if (error.code === "23505") return respond("A category with this slug already exists.", 409);
      console.error("Category create failed:", error.message);
      return respond("Could not create the category.", 500);
    }
    await audit(client, access.userId, "category.created", data.id, { name: data.name, slug: data.slug });
    return NextResponse.json({ success: true, category: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Category POST error:", error);
    return respond("A server error occurred.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getAccess();
    if (!access.ok) return respond(access.error, access.status);
    if (access.role === "staff") return respond("You are not authorized to edit categories.", 403);
    const body = await readBody(request);
    if (!body || typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) return respond("Provide a valid Category ID and JSON data.", 400);
    const fields = validateFields(body, true);
    if (typeof fields === "string") return respond(fields, 400);
    if (Object.keys(fields).length === 0) return respond("No changes were provided.", 400);
    const client = await getAdminClient();
    const { data, error } = await client.from("categories").update(fields).eq("id", body.id).select("id, name, slug, description, image_url, is_active, sort_order, created_at").maybeSingle();
    if (error) {
      if (error.code === "23505") return respond("Another category already uses this slug.", 409);
      console.error("Category update failed:", error.message);
      return respond("Could not update the category.", 500);
    }
    if (!data) return respond("Category not found.", 404);
    await audit(client, access.userId, "category.updated", data.id, { changedFields: Object.keys(fields) });
    return NextResponse.json({ success: true, category: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Category PATCH error:", error);
    return respond("A server error occurred.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await getAccess();
    if (!access.ok) return respond(access.error, access.status);
    if (access.role === "staff") return respond("You are not authorized to deactivate categories.", 403);
    const body = await readBody(request);
    if (!body || typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) return respond("Provide a valid Category ID.", 400);
    const client = await getAdminClient();
    const { data, error } = await client.from("categories").update({ is_active: false }).eq("id", body.id).select("id, name, slug, is_active").maybeSingle();
    if (error) {
      console.error("Category deactivate failed:", error.message);
      return respond("Could not deactivate the category.", 500);
    }
    if (!data) return respond("Category not found.", 404);
    await audit(client, access.userId, "category.deactivated", data.id, { name: data.name });
    return NextResponse.json({ success: true, category: data, message: "Category deactivated." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Category DELETE error:", error);
    return respond("A server error occurred.", 500);
  }
}
