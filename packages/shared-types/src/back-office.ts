/** Back-office roles, from `cognito:groups`. */
export type BackOfficeRole = "admin" | "manager" | "csa";

export const BACK_OFFICE_ROLES: readonly BackOfficeRole[] = ["admin", "manager", "csa"];

/** GET /admin/v1/me. */
export interface StaffRecordDTO {
  subject: string;
  email: string;
  roles: string[];
  status: StaffStatus;
  lastSeenAt: string;
}

export type StaffStatus = "active" | "disabled";

/** What the console renders: roles narrowed to known BackOfficeRole. */
export interface StaffRecord {
  subject: string;
  email: string;
  roles: BackOfficeRole[];
  status: StaffStatus;
}

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
