import type { SupabaseClient } from "@supabase/supabase-js";

type AuditLogInput = {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
};

export async function writeAuditLog(
  supabase: SupabaseClient,
  input: AuditLogInput
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: input.actorId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    details: input.details ?? {},
  });

  if (error) {
    console.error("Audit log write failed:", {
      action: input.action,
      targetType: input.targetType,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    throw new Error("Audit log could not be recorded.");
  }
}