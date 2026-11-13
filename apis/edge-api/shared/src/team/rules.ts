// What may be done to a team member, by whom. ONE set of predicates: the writer refuses with `refusalFor`, and the
// person page offers exactly `actionsFor` - so the screen and the server cannot disagree (FR-023, FR-028).
// The last-administrator rule needs the whole team and lives in the writer (`assertAdminsRemain`).
import type { SignInIssue, TeamAction, TeamRefusal, TeamStatus } from "@effy/shared-types";

export interface RuleSubject {
  subject: string;
  status: TeamStatus;
  signInIssue: SignInIssue | null;
}

const ALL: readonly TeamAction[] = ["rename", "role", "disable", "enable", "remove", "invite", "sign_out", "repair"];

/** Why `callerSub` may not do `action` to `member` now, or null when it is allowed. */
export function refusalFor(action: TeamAction, member: RuleSubject, callerSub: string): TeamRefusal | null {
  if (action === "rename") return null;
  if (member.subject === callerSub) return "not_yourself";
  switch (action) {
    case "role":
    case "disable":
    case "sign_out":
    case "invite":
      return member.status === "active" ? null : "not_active";
    case "enable":
      return member.status === "disabled" ? null : "staff_changed";
    case "remove":
      return member.status === "disabled" ? null : "not_disabled";
    case "repair":
      return null;
  }
}

/** The actions a person's page offers. Repair only when something disagrees (a missing role is fixed by re-enabling). */
export function actionsFor(member: RuleSubject, callerSub: string): TeamAction[] {
  return ALL.filter((a) => {
    if (refusalFor(a, member, callerSub) !== null) return false;
    if (a === "repair") return member.signInIssue !== null && member.signInIssue !== "no_role";
    return true;
  });
}
