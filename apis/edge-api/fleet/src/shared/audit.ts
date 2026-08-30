// The fleet service's writer for admin.audit_log (056, FR-024).
//
// ⚠ THIS CLOSES A DEFECT RATHER THAN ADDING A FEATURE. Driver management is currently the ONLY
// privileged back-office domain that writes no audit row: `grep -rn "audit_log"
// apis/edge-api/admin/src/drivers/` returns nothing, while shops (009), promotions (027) and
// catalog schema (016) all write one. The table was built general for exactly this
// ("General by design (ARCHITECTURE: admin schema = accounts + audit)").
//
// ⚠ NO PII IN `detail`. The column's own comment says so ("detail carries before/after with NO PII
// beyond governance"), and FR-050 makes it binding here. A changed phone, emergency contact or
// licence reference is recorded as CHANGED — the field name and nothing else. Recording the old and
// new value would put a person's phone number in a governance table that is read by everyone who
// can read any driver, and would put it in a place no deletion request knows to look.
import { query } from "@effy/edge-shared";
import type pg from "pg";

export type DriverAuditAction =
  | "driver.created"
  | "driver.updated"
  | "driver.status_changed"
  | "driver.duty_session_ended"
  | "driver.work_released"
  | "driver.exception_resolved"
  | "driver.proof.viewed";

/**
 * Field names whose VALUES must never reach admin.audit_log. Presence is recorded; content is not.
 * ⚠ Keep this list in step with the PII columns in data-model §1b.
 */
export const REDACTED_FIELDS = new Set([
  "contactPhone",
  "emergencyContactName",
  "emergencyContactPhone",
  "licenceReference",
  "workEmail",
]);

/**
 * Reduce a change set to an audit-safe detail payload.
 *
 * A redacted field contributes only its NAME to `changed`; a safe field contributes its name and
 * its new value. Nothing here ever carries an OLD value — a before/after pair doubles the exposure
 * for no governance gain, since the audit trail is a sequence and the previous row holds the before.
 */
export function auditDetail(changes: Record<string, unknown>): Record<string, unknown> {
  const changed: string[] = [];
  const values: Record<string, unknown> = {};
  for (const key of Object.keys(changes).sort()) {
    changed.push(key);
    if (!REDACTED_FIELDS.has(key)) values[key] = changes[key];
  }
  return { changed, values };
}

export interface AuditInput {
  actorSub: string;
  action: DriverAuditAction;
  driverId: string | null;
  detail?: Record<string, unknown>;
}

const INSERT = `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
                VALUES ($1, $2, 'driver', $3, $4::jsonb)`;

/** Write one audit row. Call inside the same transaction as the change wherever one exists. */
export async function recordAudit(input: AuditInput, tx?: pg.PoolClient): Promise<void> {
  const args = [input.actorSub, input.action, input.driverId, JSON.stringify(input.detail ?? {})];
  if (tx) {
    await tx.query(INSERT, args);
    return;
  }
  await query(INSERT, args);
}

export interface DriverAuditRow {
  id: string;
  actorSub: string;
  action: string;
  detail: Record<string, unknown>;
  at: string;
}

/** The profile's change history, newest first (FR-025). */
export async function listDriverAudit(driverId: string, limit = 100): Promise<DriverAuditRow[]> {
  const res = await query<{
    id: string;
    actor_sub: string;
    action: string;
    detail: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id, actor_sub, action, detail, created_at
       FROM admin.audit_log
      WHERE target_type = 'driver' AND target_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [driverId, limit],
  );
  return res.rows.map((r) => ({
    id: r.id,
    actorSub: r.actor_sub,
    action: r.action,
    detail: r.detail ?? {},
    at: r.created_at.toISOString(),
  }));
}
