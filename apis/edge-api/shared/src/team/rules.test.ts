import type { SignInIssue, TeamAction, TeamStatus } from "@effy/shared-types";
import { describe, expect, it } from "vitest";

import { actionsFor, refusalFor } from "./rules";

const ME = "sub-me";
const member = (status: TeamStatus, you = false, signInIssue: SignInIssue | null = null) => ({
  subject: you ? ME : "sub-other",
  status,
  signInIssue,
});

describe("what a person's page offers (actionsFor) - and the writer refuses the rest", () => {
  it.each<[TeamStatus, boolean, SignInIssue | null, TeamAction[]]>([
    ["active", false, null, ["rename", "role", "disable", "invite", "sign_out"]],
    ["active", false, "group_differs", ["rename", "role", "disable", "invite", "sign_out", "repair"]],
    ["active", true, null, ["rename"]],
    ["active", true, "group_differs", ["rename"]],
    ["disabled", false, null, ["rename", "enable", "remove"]],
    ["disabled", false, "no_role", ["rename", "enable", "remove"]],
    ["disabled", false, "enabled_while_off", ["rename", "enable", "remove", "repair"]],
    ["disabled", true, null, ["rename"]],
    ["removed", false, null, ["rename"]],
    ["removed", false, "enabled_while_off", ["rename", "repair"]],
  ])("%s, you=%s, issue=%s → %j", (status, you, issue, expected) => {
    expect(actionsFor(member(status, you, issue), ME)).toEqual(expected);
  });

  it("never yourself (FR-023)", () => {
    for (const a of ["role", "disable", "enable", "remove", "sign_out", "invite", "repair"] as const) {
      expect(refusalFor(a, member("active", true), ME)).toBe("not_yourself");
    }
    expect(refusalFor("rename", member("active", true), ME)).toBeNull();
  });

  it("an active person cannot be removed (FR-019)", () => {
    expect(refusalFor("remove", member("active"), ME)).toBe("not_disabled");
  });

  it("only an active person's role changes, or is invited or signed out", () => {
    for (const a of ["role", "invite", "sign_out", "disable"] as const) {
      expect(refusalFor(a, member("disabled"), ME)).toBe("not_active");
      expect(refusalFor(a, member("removed"), ME)).toBe("not_active");
    }
  });
});
