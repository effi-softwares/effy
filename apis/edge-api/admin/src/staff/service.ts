import { authorizeAdmin, listStaff, upsertOnContact } from "./repository";
import type { StaffMember, StaffRecord } from "./types";

export async function recordAndLoad(
  sub: string,
  email: string,
  tokenRoles: readonly string[],
): Promise<StaffRecord> {
  return upsertOnContact(sub, email, tokenRoles);
}

// From the platform record (status and role), not the claim.
export async function isActiveAdmin(sub: string): Promise<boolean> {
  return authorizeAdmin(sub);
}

/** The team, for an administrator (the caller is checked by the handler). */
export async function teamList(): Promise<StaffMember[]> {
  return listStaff();
}
