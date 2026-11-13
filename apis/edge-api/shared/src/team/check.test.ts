import type { BackOfficeRole, TeamStatus } from "@effy/shared-types";
import { describe, expect, it } from "vitest";

import { accountFor, issueFor, type CheckRecord } from "./check";
import type { SignInAccount } from "./sign-in";

const record = (status: TeamStatus, role: BackOfficeRole | null = "csa", email = "jo@x.test"): CheckRecord => ({
  id: "id-1",
  subject: "sub-1",
  email,
  status,
  role,
});
const account = (over: Partial<SignInAccount> = {}): SignInAccount => ({
  username: "u-1",
  sub: "sub-1",
  email: "jo@x.test",
  enabled: true,
  groups: ["csa"],
  createdAt: null,
  ...over,
});

describe("issueFor - where the pool disagrees with the record (R6)", () => {
  it("in step", () => {
    expect(issueFor(record("active"), account())).toBeNull();
    expect(issueFor(record("disabled"), account({ enabled: false }))).toBeNull();
    expect(issueFor(record("removed"), null)).toBeNull();
  });

  it.each([
    ["missing", record("active"), null],
    ["disabled_while_on", record("active"), account({ enabled: false })],
    ["group_differs", record("active"), account({ groups: ["admin"] })],
    ["group_differs", record("active"), account({ groups: [] })],
    ["group_differs", record("active"), account({ groups: ["csa", "manager"] })],
    ["email_differs", record("active", "csa", "3f2a-uuid"), account()],
    ["enabled_while_off", record("disabled"), account()],
    ["enabled_while_off", record("removed"), account({ enabled: false })],
    ["no_role", record("disabled", null), account({ enabled: false })],
  ] as const)("%s", (issue, r, a) => {
    expect(issueFor(r, a)).toBe(issue);
  });
});

describe("accountFor", () => {
  it("matches by subject, then by the username or email the record holds", () => {
    const a = account({ sub: "other", username: "3f2a-uuid", email: "x@y.z" });
    expect(accountFor(record("active", "csa", "3f2a-uuid"), [a])).toBe(a);
    expect(accountFor(record("active"), [account({ sub: "nope", username: "nope", email: "nope@x.test" })])).toBeNull();
  });
});
