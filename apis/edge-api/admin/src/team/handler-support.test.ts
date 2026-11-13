import { describe, expect, it } from "vitest";

import { SignInError, TeamNotFoundError, TeamRefusalError, TeamValidationError } from "@effy/edge-shared/team";

import { mapTeamError } from "./handler-support";

const scope = { log: { info() {}, warn() {}, error() {} }, requestId: "r", instance: "/admin/v1/staff" } as never;
const body = (res: { body?: string }) => JSON.parse(res.body ?? "{}") as Record<string, unknown>;

describe("the team's refusals, in the spec's words (contracts/team-api.md)", () => {
  it.each([
    ["last_admin", 409, "Effy must always have an active administrator."],
    ["staff_changed", 409, "Someone else changed this person. Look again."],
    ["invited_recently", 409, "An invitation was sent a moment ago."],
    ["already_on_team", 409, "This person is already on the team."],
    ["role_required", 400, "Choose a role to re-enable them with."],
    ["sign_in_unavailable", 502, "The sign-in service did not answer. Try again."],
  ] as const)("%s → %i", (type, status, detail) => {
    const res = mapTeamError(new TeamRefusalError(type), scope);
    expect(res.statusCode).toBe(status);
    expect(body(res)).toMatchObject({ type: `https://effyshopping.com/problems/${type.replaceAll("_", "-")}`, detail });
  });

  it("carries the member to open beside the refusal", () => {
    expect(body(mapTeamError(new TeamRefusalError("disabled_on_team", { memberId: "m-1" }), scope))).toMatchObject({
      memberId: "m-1",
      errors: [{ field: "memberId", message: "m-1" }],
    });
  });

  it("validation 400, unknown 404, a pool failure 502, anything else 503", () => {
    expect(mapTeamError(new TeamValidationError("name", "Enter their full name."), scope).statusCode).toBe(400);
    expect(mapTeamError(new TeamNotFoundError("x"), scope).statusCode).toBe(404);
    expect(mapTeamError(new SignInError("create", "X", "x"), scope).statusCode).toBe(502);
    expect(mapTeamError(new Error("db"), scope).statusCode).toBe(503);
  });
});
