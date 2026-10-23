// The fleet service's writer for admin.audit_log. No PII in `detail`: a changed phone, emergency
// contact or licence reference is recorded by field name only.
import { query } from "@effy/edge-shared";
import type pg from "pg";

export type DriverAuditAction =
  | "driver.created"
  | "driver.updated"
  | "driver.status_changed"
  | "driver.duty_session_ended"
  | "driver.work_released"
  | "driver.exception_resolved"
  | "driver.proof.viewed"
  /** A clearance is a fact about a person, so the target is `driver`. */
  | "driver.capability_granted"
  | "driver.capability_revoked";

/** A vehicle is a different target, not a different audit trail. */
export type VehicleAuditAction =
  | "vehicle.created"
  | "vehicle.updated"
  | "vehicle.status_changed"
  | "vehicle.holding_issued"
  | "vehicle.holding_returned"
  | "vehicle.check_cleared";

/** A dispatcher's manual overrides: the engine's choices are reconstructable from `dispatch_wave`, a person's are not. */
export type DispatchAuditAction =
  | "dispatch.reassign"
  | "dispatch.unassign"
  | "dispatch.reorder"
  | "dispatch.lock"
  | "dispatch.unlock" // No longer written; kept so earlier audit rows still type
  | "dispatch.manual_assign"
  | "dispatch.manual_unassign"
  // Closing a delivery exception asserts something no query can verify.
  | "dispatch.exception_resolve"
  | "dispatch.parcels_returned"
  | "dispatch.sequence_waived"
  | "dispatch.hold_resolved";

/** Delivery capacity and calendar: each change alters what checkout offers the moment it is saved. */
export type DeliveryConfigAuditAction =
  | "delivery_slot.created"
  | "delivery_slot.updated"
  | "delivery_slot.disabled"
  | "delivery_slot.enabled"
  | "delivery_days.updated"
  | "delivery_days.date_added"
  | "delivery_days.date_removed";

/** Whether every bag must be scanned as packed. */
export type ShopOpsAuditAction = "shop.pack_scanning_changed";

export type FleetAuditAction =
  | ShopOpsAuditAction
  | DriverAuditAction
  | VehicleAuditAction
  | DispatchAuditAction
  | DeliveryConfigAuditAction;

/** What the audited row is. One writer for every target, so the PII redaction always applies. */
export type AuditTargetType =
  | "driver"
  | "vehicle"
  | "driver_round"
  | "delivery_exception"
  | "delivery_slot"
  | "delivery_settings"
  | "package_hold"
  | "vehicle_check"
  | "shop";

/** Field names whose values never reach admin.audit_log; keep in step with the PII columns. */
export const REDACTED_FIELDS = new Set([
  "contactPhone",
  "emergencyContactName",
  "emergencyContactPhone",
  "licenceReference",
  "workEmail",
]);

/** A redacted field contributes only its name to `changed`; nothing carries an old value. */
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
  action: FleetAuditAction;
  /** The target id, whatever the target. */
  driverId: string | null;
  targetType?: AuditTargetType;
  detail?: Record<string, unknown>;
}

const INSERT = `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
                VALUES ($1, $2, $3, $4, $5::jsonb)`;

/** Call inside the change's transaction wherever one exists. */
export async function recordAudit(input: AuditInput, tx?: pg.PoolClient): Promise<void> {
  const args = [
    input.actorSub,
    input.action,
    input.targetType ?? "driver",
    input.driverId,
    JSON.stringify(input.detail ?? {}),
  ];
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

/** Newest first. */
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
