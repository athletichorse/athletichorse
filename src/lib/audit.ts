import "server-only";
import { db } from "./supabase/admin";

/** Best-effort audit entry (never blocks the action that triggered it). */
export async function audit(userId: string | null, action: string, entity: string, entityId: string | null, details: Record<string, unknown> = {}) {
  try {
    await db().from("audit_log").insert({ user_id: userId, action, entity, entity_id: entityId, details });
  } catch {
    // ignore: auditing must not break the business action
  }
}
