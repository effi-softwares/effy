/** Back-office roles. The staff record is their origin and authority (119); the pool group mirrors it. */
export type BackOfficeRole = "admin" | "manager" | "csa";

export const BACK_OFFICE_ROLES: readonly BackOfficeRole[] = ["admin", "manager", "csa"];

/** GET /admin/v1/me. */
export interface StaffRecordDTO {
  subject: string;
  /** null for records from before 119. */
  name: string | null;
  email: string;
  roles: string[];
  status: StaffStatus;
  lastSeenAt: string;
}

export type StaffStatus = "active" | "disabled" | "removed";

/** What the console renders: roles narrowed to known BackOfficeRole. */
export interface StaffRecord {
  subject: string;
  name: string | null;
  email: string;
  roles: BackOfficeRole[];
  status: StaffStatus;
}

// The team list and a person's page are `back-office-team.ts` (119).

/** GET /admin/v1/admin-ping. */
export interface BackOfficeAdminPingDTO {
  audience: "back-office";
  scope: "admin";
  subject: string;
  message: string;
}

export interface AdminPingResult {
  subject: string;
}

/** Narrows group strings to known roles. */
export function toBackOfficeRoles(input: readonly string[] | undefined): BackOfficeRole[] {
  if (!input) return [];
  return input.filter((r): r is BackOfficeRole =>
    (BACK_OFFICE_ROLES as readonly string[]).includes(r),
  );
}
