import type { TeamMemberDTO } from "@effy/shared-types";

import { authorizeAdmin, readBySub, touchLastSeen } from "./repository";

/** Why `/me` refuses: no record for this account, or a record that is not active (research R8). */
export type MeRefusal = "not_on_team" | "staff_disabled";

export type MeOutcome = { ok: true; member: TeamMemberDTO } | { ok: false; refusal: MeRefusal };

/** The caller's own record, read only; marks them seen when active (R1). */
export async function loadAndTouch(sub: string): Promise<MeOutcome> {
  const member = await readBySub(sub);
  if (!member) return { ok: false, refusal: "not_on_team" };
  if (member.status !== "active") return { ok: false, refusal: "staff_disabled" };
  await touchLastSeen(sub);
  return { ok: true, member: { ...member, lastSeenAt: new Date().toISOString() } };
}

// From the platform record (status and role), not the claim.
export async function isActiveAdmin(sub: string): Promise<boolean> {
  return authorizeAdmin(sub);
}
