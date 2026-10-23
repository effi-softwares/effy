export type StaffStatus = "active" | "disabled";
export type BackOfficeRole = "admin" | "manager" | "csa";

export const KNOWN_ROLES: readonly BackOfficeRole[] = ["admin", "manager", "csa"];

export interface StaffRecord {
  subject: string;
  email: string;
  roles: BackOfficeRole[];
  status: StaffStatus;
  lastSeenAt: string;
}
