// A team member's activity (119 FR-025, FR-026): every change to their access, from `admin.audit_log`, in the one
// drawer (104). Who is named through staffNameSql ("Operator" for the break-glass tool, "Effy" for the migration).
import { activityFact, staffNameSql, type ActivityRow, type ActivitySource } from "@effy/edge-shared";
import { isMemberId, TeamNotFoundError } from "@effy/edge-shared/team";
import { SIGN_IN_ISSUE_WORDS, TEAM_ROLE_WORDS, type BackOfficeRole, type SignInIssue } from "@effy/shared-types";

const WORDS: Record<string, string> = {
  "team.added": "Added to the team",
  "team.readded": "Added to the team again",
  "team.invited": "Invitation sent",
  "team.role_changed": "Role changed",
  "team.disabled": "Disabled",
  "team.enabled": "Re-enabled",
  "team.removed": "Removed",
  "team.signed_out": "Signed out everywhere",
  "team.renamed": "Name changed",
  "team.repaired": "Sign-in account repaired",
  "team.sign_in_failed": "Sign-in account change did not finish",
};

const KIND_SQL = `CASE
  WHEN a.action IN ('team.added', 'team.readded', 'team.disabled', 'team.enabled', 'team.removed', 'team.signed_out') THEN 'access'
  WHEN a.action = 'team.role_changed' THEN 'role'
  WHEN a.action = 'team.invited' THEN 'invitation'
  WHEN a.action = 'team.renamed' THEN 'details'
  ELSE 'sign_in' END`;

const roleWord = (v: unknown) =>
  typeof v === "string" && v in TEAM_ROLE_WORDS ? TEAM_ROLE_WORDS[v as BackOfficeRole] : null;

const STEP_WORDS: Record<string, string> = {
  create: "creating the sign-in account",
  group: "setting the group",
  enable: "turning sign-in on",
  disable: "turning sign-in off",
  sign_out: "signing out everywhere",
  delete: "deleting the sign-in account",
};

function entry(r: ActivityRow) {
  const title = WORDS[r.action] ?? "Changed";
  const f = r.facts ?? {};
  switch (r.action) {
    case "team.added":
    case "team.readded":
      return {
        title,
        tone: "primary" as const,
        detail: [roleWord(f.role), f.adopted ? "Their sign-in account already existed" : null, f.invited ? "Invited" : null]
          .filter(Boolean)
          .join(" · ") || null,
      };
    case "team.role_changed": {
      const from = Array.isArray(f.from) ? f.from.map(roleWord).filter(Boolean).join(" and ") : roleWord(f.from);
      const to = roleWord(f.to);
      return f.reason === "one_role"
        ? { title: "Set to one role", detail: `Held ${from}; kept ${to}` }
        : { title, detail: from && to ? `${from} → ${to}` : to };
    }
    case "team.disabled":
      return {
        title,
        tone: "problem" as const,
        detail: f.reason === "no_role" ? "They had no role" : f.forced ? "Forced by the operator" : null,
      };
    case "team.enabled":
      return { title, tone: "primary" as const, detail: roleWord(f.role) };
    case "team.removed":
      return { title, tone: "problem" as const };
    case "team.invited":
      return { title, detail: f.failed ? "Could not be sent" : null, tone: f.failed ? ("problem" as const) : undefined };
    case "team.renamed":
      return { title, detail: `${activityFact(r, "from") ?? "No name"} → ${activityFact(r, "to") ?? ""}` };
    case "team.repaired": {
      const issue = activityFact(r, "issue") as SignInIssue | null;
      const steps = Array.isArray(f.steps) ? (f.steps as string[]).join(", ") : "";
      return { title, detail: [issue ? SIGN_IN_ISSUE_WORDS[issue]?.short : null, steps].filter(Boolean).join(": ") || null };
    }
    case "team.sign_in_failed":
      return { title, tone: "problem" as const, detail: `While ${STEP_WORDS[activityFact(r, "step") ?? ""] ?? "changing the sign-in account"}` };
    default:
      return { title };
  }
}

/** One team member's log: every `team.*` row aimed at them. */
export function teamMemberActivitySource(staffId: string): ActivitySource {
  if (!isMemberId(staffId)) throw new TeamNotFoundError(staffId);
  return {
    sql: `
      SELECT a.id::text AS id, a.created_at AS at, ${KIND_SQL} AS kind, a.action,
             ${staffNameSql("a.actor_sub")} AS actor,
             a.detail::text AS search_text,
             a.detail AS facts
        FROM admin.audit_log a
       WHERE a.target_type = 'staff' AND a.target_id = $1::uuid AND a.action LIKE 'team.%'`,
    args: [staffId],
    actionWords: WORDS,
    entry,
  };
}
