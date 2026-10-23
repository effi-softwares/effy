// Read: any active staff, csa included. Reply (an outward email): admin or manager. A throw propagates.
import { hasStaffRole, isActiveStaff, OUTWARD_ACTION_ROLES, query } from "@effy/edge-shared"

import type { StaffActor } from "./types"

export { isActiveStaff }

export async function canReplyFeedback(sub: string): Promise<boolean> {
  return hasStaffRole(sub, OUTWARD_ACTION_ROLES)
}

/** The staff display name, snapshotted onto a reply/note at write time. Null when unset. */
export async function staffActor(sub: string): Promise<StaffActor> {
  const res = await query<{ name: string | null }>(
    `SELECT s.name FROM admin.staff s WHERE s.cognito_sub = $1`,
    [sub],
  )
  return { sub, name: res.rows[0]?.name ?? null }
}
