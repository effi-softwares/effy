import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isLoweringRole,
  normaliseTeamEmail,
  SIGN_IN_ISSUES,
  SIGN_IN_ISSUE_WORDS,
  TEAM_CONFIRM_WORDS,
  TEAM_EMAIL_SHAPE,
  TEAM_REFUSAL_WORDS,
  TEAM_STATUS_WORDS,
} from "./back-office-team";

const SPEC = readFileSync(resolve(__dirname, "../../../specs/119-backoffice-team-management/spec.md"), "utf8")
  .replace(/\s+/g, " ");

describe("119 - the team's words are the spec's", () => {
  it.each([
    TEAM_REFUSAL_WORDS.alreadyOnTeam,
    TEAM_REFUSAL_WORDS.lastAdmin,
    TEAM_REFUSAL_WORDS.staffChanged,
    TEAM_REFUSAL_WORDS.invitedRecently,
    TEAM_CONFIRM_WORDS.disable,
    TEAM_CONFIRM_WORDS.remove,
  ])("the spec says %s", (sentence) => {
    expect(SPEC).toContain(sentence);
  });

  it("access ended and the lowering line are the contracts' sentences", () => {
    const contracts = ["team-api.md", "team-screens.md"]
      .map((f) => readFileSync(resolve(__dirname, "../../../specs/119-backoffice-team-management/contracts", f), "utf8"))
      .join(" ")
      .replace(/\s+/g, " ");
    expect(contracts).toContain(TEAM_REFUSAL_WORDS.accessEnded);
    expect(contracts).toContain(TEAM_CONFIRM_WORDS.lowering);
  });

  it("the status filter says the spec's five words", () => {
    for (const word of Object.values(TEAM_STATUS_WORDS)) expect(SPEC).toContain(word);
  });

  it("every sign-in issue has words", () => {
    for (const issue of SIGN_IN_ISSUES) expect(SIGN_IN_ISSUE_WORDS[issue].sentence.length).toBeGreaterThan(10);
  });
});

describe("the email rule (FR-009)", () => {
  it("ignores case and surrounding spaces", () => {
    expect(normaliseTeamEmail(" Jane@Effy.test ")).toBe("jane@effy.test");
  });

  it.each(["a@b.co", "contractor@gmail.com", "x.y+z@sub.example.org"])("allows any domain: %s", (e) => {
    expect(TEAM_EMAIL_SHAPE.test(e)).toBe(true);
  });

  it.each(["", "no-at", "a@b", "a b@c.d", "<a@b.c>"])("refuses %s", (e) => {
    expect(TEAM_EMAIL_SHAPE.test(e)).toBe(false);
  });
});

describe("isLoweringRole (FR-015)", () => {
  it.each([
    ["admin", "manager", true],
    ["admin", "csa", true],
    ["manager", "csa", true],
    ["csa", "manager", false],
    ["manager", "admin", false],
    ["admin", "admin", false],
    [null, "csa", false],
  ] as const)("%s → %s is lowering: %s", (from, to, lowering) => {
    expect(isLoweringRole(from, to)).toBe(lowering);
  });
});
