import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { functionsOf, listStacks } from "../lib/serverless-stacks";

/**
 * 119 - the record is the origin and the authority for a back-office role (research R1, R12):
 *  (a) only `shared/src/team/` writes the team's tables;
 *  (b) nothing anywhere edits or deletes `admin.audit_log` (FR-025);
 *  (c) no back-office handler reads the token's groups - the record decides;
 *  (d) only `admin-team` may change the back-office sign-in pool.
 * Each was proven by breaking it once (FEATURE-HISTORY 119).
 */
const EDGE_API = fileURLToPath(new URL("../../..", import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !full.includes("/src/testing/")) out.push(full);
  }
  return out;
}

const files = readdirSync(EDGE_API)
  .filter((d) => d !== "node_modules" && statSync(join(EDGE_API, d)).isDirectory())
  .flatMap((d) => {
    const src = join(EDGE_API, d, "src");
    try {
      return statSync(src).isDirectory() ? sourceFiles(src) : [];
    } catch {
      return [];
    }
  });

const TEAM_DIR = "shared/src/team/";
const TEAM_TABLES = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+admin\.(staff|staff_role|staff_former_subject|sign_in_orphan|team_check)\b/i;
/** Named exceptions to "appended only", each with its reason. A team row is never one of them. */
const AUDIT_EDIT_ALLOWED: Record<string, string> = {
  "customer/src/erasure/repository.ts":
    "113 - erasing a deleted customer strikes their address from `email_address` rows (the law); it touches no team row",
};
const AUDIT_EDIT = /\b(UPDATE|DELETE\s+FROM)\s+admin\.audit_log\b/i;

/** What changes the pool; reading it (AdminGetUser) and the auth triggers' AdminUpdateUserAttributes are not team writes. */
const POOL_WRITES = [
  "AdminCreateUser",
  "AdminEnableUser",
  "AdminDisableUser",
  "AdminDeleteUser",
  "AdminAddUserToGroup",
  "AdminRemoveUserFromGroup",
  "AdminUserGlobalSignOut",
];
const POOL_WRITE = new RegExp(`cognito-idp:(${POOL_WRITES.join("|")})\\b`);

/** IAM statements: each `- Effect:` block of the provider's role. */
function statements(yml: string): string[] {
  const start = yml.indexOf("\n      statements:");
  if (start === -1) return [];
  const end = yml.indexOf("\n  layers:", start);
  return yml.slice(start, end === -1 ? undefined : end).split(/\n\s+- Effect:/).slice(1);
}

export function offendersIn(sources: readonly { path: string; text: string }[]) {
  return {
    teamWrites: sources.filter((f) => !f.path.startsWith(TEAM_DIR) && TEAM_TABLES.test(f.text)).map((f) => f.path),
    auditEdits: sources.filter((f) => !(f.path in AUDIT_EDIT_ALLOWED) && AUDIT_EDIT.test(f.text)).map((f) => f.path),
  };
}

describe("119 - one writer of the back-office team", () => {
  const sources = files.map((f) => ({ path: relative(EDGE_API, f), text: readFileSync(f, "utf8") }));

  it("scans the backend", () => {
    expect(sources.length).toBeGreaterThan(200);
  });

  it("(a) only @effy/edge-shared/team writes admin.staff, staff_role, staff_former_subject, sign_in_orphan, team_check", () => {
    expect(offendersIn(sources).teamWrites, "change the team through @effy/edge-shared/team writer.ts").toEqual([]);
  });

  it("(b) admin.audit_log is appended only, never updated or deleted", () => {
    expect(offendersIn(sources).auditEdits).toEqual([]);
  });

  it("(a, b) are real: a planted write is caught", () => {
    const planted = offendersIn([
      { path: "admin/src/x.ts", text: "await q(`UPDATE admin.staff SET status = 'active'`)" },
      { path: "ops/src/y.ts", text: "INSERT INTO admin.staff_role (staff_id, role_key)" },
      { path: "shared/src/team/writer.ts", text: "UPDATE admin.staff SET name = $2" },
      { path: "orders/src/z.ts", text: "DELETE FROM admin.audit_log WHERE id = $1" },
    ]);
    expect(planted.teamWrites).toEqual(["admin/src/x.ts", "ops/src/y.ts"]);
    expect(planted.auditEdits).toEqual(["orders/src/z.ts"]);
  });

  it("(c) no staff-gateway handler reads the token's groups (the record decides, R1)", () => {
    const offenders = listStacks()
      .filter((s) => s.gateway === "staff")
      .flatMap((s) =>
        functionsOf(s).map((fn) => {
          const file = join(EDGE_API, s.dir, `${fn.handler.replace(/\.handler$/, "")}.ts`);
          return { file, text: readFileSync(file, "utf8") };
        }),
      )
      .filter((f) => /\bgroups\(event\)/.test(f.text))
      .map((f) => relative(EDGE_API, f.file));
    expect(offenders).toEqual([]);
  });

  it("(d) only admin-team may change the back-office sign-in pool", () => {
    const offenders = listStacks()
      .filter((s) => s.name !== "admin-team")
      .filter((s) =>
        statements(s.yml).some(
          (st) => st.includes("/auth/back-office/user_pool_arn") && POOL_WRITE.test(st),
        ),
      )
      .map((s) => s.name);
    expect(offenders).toEqual([]);
  });

  it("(d) is real: admin-team itself holds the grant", () => {
    const team = listStacks().find((s) => s.name === "admin-team");
    expect(team).toBeDefined();
    expect(
      statements(team!.yml).some((st) => st.includes("/auth/back-office/user_pool_arn") && st.includes("cognito-idp:AdminCreateUser")),
    ).toBe(true);
  });
});
