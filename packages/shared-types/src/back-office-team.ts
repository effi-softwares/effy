// Settings › Team and access (119): the team's wire shapes and every sentence a person reads about it, in one file.
// The words are the spec's (specs/119-backoffice-team-management/spec.md), pinned by back-office-team.test.ts.
import type { BackOfficeRole } from "./back-office";
import type { ListPage } from "./list";

/** A team member's status. `removed` keeps the record so their name stays on what they did (FR-019, FR-021). */
export type TeamStatus = "active" | "disabled" | "removed";

/** How a person's sign-in account disagrees with their record (research R6). NULL on the wire = in step. */
export type SignInIssue =
  | "missing"
  | "enabled_while_off"
  | "disabled_while_on"
  | "group_differs"
  | "no_role"
  | "email_differs";

export const SIGN_IN_ISSUES: readonly SignInIssue[] = [
  "missing",
  "enabled_while_off",
  "disabled_while_on",
  "group_differs",
  "no_role",
  "email_differs",
];

/** What an administrator may do to a person - computed by the server from the rules it enforces (`actionsFor`). */
export type TeamAction = "rename" | "role" | "disable" | "enable" | "remove" | "invite" | "sign_out" | "repair";

/** The list's Status filter: the three statuses plus two views (FR-027). */
export type TeamStatusFilter = TeamStatus | "never" | "attention";

export const TEAM_STATUS_FILTERS: readonly TeamStatusFilter[] = ["active", "disabled", "removed", "never", "attention"];

/** `failed`: the send itself failed (no message id). */
export type InvitationDelivery = "sent" | "delivered" | "bounced" | "complained" | "failed";

export interface TeamMemberDTO {
  id: string;
  subject: string;
  /** null for records from before 119; the console shows the email alone. */
  name: string | null;
  email: string;
  /** Exactly one for an active person; null for a disabled person who never had one (FR-035). */
  role: BackOfficeRole | null;
  status: TeamStatus;
  /** null = Never signed in. */
  lastSeenAt: string | null;
  addedAt: string;
  /** null for records from before 119. */
  addedBy: { name: string } | null;
  invitation: { sentAt: string; delivery: InvitationDelivery } | null;
  signInIssue: SignInIssue | null;
  revision: number;
}

export interface TeamMemberDetailDTO extends TeamMemberDTO {
  disabledAt: string | null;
  disabledBy: { name: string } | null;
  removedAt: string | null;
  removedBy: { name: string } | null;
  isYou: boolean;
  actions: TeamAction[];
}

/** A sign-in account in the back-office pool with no team record (FR-007, FR-030). */
export interface NotOnTeamDTO {
  username: string;
  email: string | null;
  enabled: boolean;
  groups: string[];
  createdAt: string | null;
}

/** The list's filters (one value each, in the address). */
export interface TeamListFilters {
  role: BackOfficeRole;
  status: TeamStatusFilter;
}

/** GET /admin/v1/staff: 103's page, plus the accounts with no record and when the pool was last compared. */
export type TeamListDTO = ListPage<TeamMemberDTO> & {
  notOnTeam: NotOnTeamDTO[];
  checkedAt: string | null;
};

/** Every write route's answer. `complete: false` = a sign-in step failed; the person is marked Needs attention. */
export interface TeamChangeDTO {
  member: TeamMemberDetailDTO;
  complete: boolean;
}

/** The three roles, in the console's words. What each may do is the Roles and permissions table (FR-033). */
export const TEAM_ROLE_WORDS: Readonly<Record<BackOfficeRole, string>> = {
  admin: "Administrator",
  manager: "Manager",
  csa: "Customer support",
};

/** One line per role for the Add person and Change role radios. */
export const TEAM_ROLE_LINES: Readonly<Record<BackOfficeRole, string>> = {
  admin: "Everything, including the team and tax settings.",
  manager: "Runs the operation: drivers, shops, products, promotions and delivery settings.",
  csa: "Helps customers: orders, refunds, points and feedback.",
};

const ROLE_RANK: Readonly<Record<BackOfficeRole, number>> = { admin: 3, manager: 2, csa: 1 };

/** A lowered role signs the person out everywhere (FR-015). */
export function isLoweringRole(from: BackOfficeRole | null, to: BackOfficeRole): boolean {
  return from !== null && ROLE_RANK[to] < ROLE_RANK[from];
}

export const TEAM_STATUS_WORDS: Readonly<Record<TeamStatusFilter, string>> = {
  active: "Active",
  disabled: "Disabled",
  removed: "Removed",
  never: "Never signed in",
  attention: "Needs attention",
};

/** What disagrees, said on a person's page (FR-030). */
export const SIGN_IN_ISSUE_WORDS: Readonly<Record<SignInIssue, { short: string; sentence: string }>> = {
  missing: {
    short: "Sign-in account missing",
    sentence: "Their sign-in account does not exist, so they cannot sign in. Repair creates it again.",
  },
  enabled_while_off: {
    short: "Sign-in still enabled",
    sentence: "Their sign-in account can still sign in although their record is not active. Every request is refused; Repair turns the account off.",
  },
  disabled_while_on: {
    short: "Sign-in disabled",
    sentence: "Their record is active but their sign-in account is disabled, so they cannot sign in. Repair turns it back on.",
  },
  group_differs: {
    short: "Group differs",
    sentence: "Their sign-in account holds a different role from their record. The record decides; Repair makes the account match.",
  },
  no_role: {
    short: "No role",
    sentence: "They were never given a role, so they were disabled. Re-enable them with a role to give them access.",
  },
  email_differs: {
    short: "Email differs",
    sentence: "Their record's email is not their sign-in account's. Repair copies the sign-in account's email onto the record.",
  },
};

/** The spec's refusal sentences; the problem `type` is the key's machine word (contracts/team-api.md). */
export const TEAM_REFUSAL_WORDS = {
  alreadyOnTeam: "This person is already on the team.",
  disabledOnTeam: "This person is disabled.",
  lastAdmin: "Effy must always have an active administrator.",
  staffChanged: "Someone else changed this person. Look again.",
  invitedRecently: "An invitation was sent a moment ago.",
  accessEnded: "Your back-office access has ended. Ask an administrator.",
  notYourself: "You cannot change your own access. Ask another administrator.",
  notActive: "This person is not active.",
  notDisabled: "Disable this person before removing them.",
  roleRequired: "Choose a role to re-enable them with.",
  hasRecord: "This sign-in account belongs to a team member. Open them instead.",
  signInUnavailable: "The sign-in service did not answer. Try again.",
  incomplete: "Added, but their sign-in account did not finish. Open them to repair it.",
  changeIncomplete: "Saved, but their sign-in account did not finish. Repair them from Needs attention.",
} as const;

/** The problem types the team routes answer, beside the platform's own (`validation`, `forbidden`, `not_found`). */
export type TeamRefusal =
  | "already_on_team"
  | "disabled_on_team"
  | "last_admin"
  | "not_yourself"
  | "staff_changed"
  | "not_active"
  | "not_disabled"
  | "role_required"
  | "invited_recently"
  | "has_record"
  | "sign_in_unavailable";

export const TEAM_REFUSAL_SENTENCE: Readonly<Record<TeamRefusal, string>> = {
  already_on_team: TEAM_REFUSAL_WORDS.alreadyOnTeam,
  disabled_on_team: TEAM_REFUSAL_WORDS.disabledOnTeam,
  last_admin: TEAM_REFUSAL_WORDS.lastAdmin,
  not_yourself: TEAM_REFUSAL_WORDS.notYourself,
  staff_changed: TEAM_REFUSAL_WORDS.staffChanged,
  not_active: TEAM_REFUSAL_WORDS.notActive,
  not_disabled: TEAM_REFUSAL_WORDS.notDisabled,
  role_required: TEAM_REFUSAL_WORDS.roleRequired,
  invited_recently: TEAM_REFUSAL_WORDS.invitedRecently,
  has_record: TEAM_REFUSAL_WORDS.hasRecord,
  sign_in_unavailable: TEAM_REFUSAL_WORDS.signInUnavailable,
};

/** The two 403 types that end a browser's session (research R8). */
export const ACCESS_ENDED_TYPES = ["not_on_team", "staff_disabled"] as const;
export type AccessEndedType = (typeof ACCESS_ENDED_TYPES)[number];

/** The confirmations, word for word from the spec. */
export const TEAM_CONFIRM_WORDS = {
  disable: "They will be signed out everywhere and will not be able to sign in. Their name stays on everything they did.",
  remove: "Their sign-in account is deleted. Their name stays on everything they did, and they stay in the team's history.",
  lowering: "They will be signed out everywhere.",
  signOut: "Every open session ends and they sign in again with a code. Their role and status do not change.",
  emailChange: "To change an email, add the new address and disable the old one.",
} as const;

/** A name is 1–120 characters after trimming (data-model.md). */
export const TEAM_NAME_MAX = 120;

/** Deliberately plain: something@something.tld. Any domain (spec Clarifications). */
export const TEAM_EMAIL_SHAPE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** The one email rule: compared ignoring case and surrounding spaces (FR-009). */
export function normaliseTeamEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
