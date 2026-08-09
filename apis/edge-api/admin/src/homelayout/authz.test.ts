import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
}));

import { canComposeHome } from "./authz";

beforeEach(() => vi.clearAllMocks());

/**
 * ⚠ THE GATE IS ONE SQL PREDICATE, and these tests are about what is IN it.
 *
 * The composer's output is the front page of the platform's only public surface. Read access is
 * deliberately open — a CSA asked "why does the site say X" needs to be able to look — but the gate
 * on writing has to hold three terms at once, and dropping any of them is invisible in a UI test
 * because the console hides the controls anyway.
 */
describe("the mutate gate", () => {
  it("is decided from the platform record, never from the token claim", async () => {
    // ⚠ 005/009's rule. A `cognito:groups` claim is the ORIGIN of a role assignment; the platform
    // record is authoritative for the access decision, because a person can be disabled in the
    // record while holding a perfectly valid token issued before that happened.
    query.mockResolvedValue({ rows: [{ ok: true }] });
    await canComposeHome("sub-1");
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/admin\.staff/);
    expect(sql).toMatch(/admin\.staff_role/);
    expect(params).toEqual(["sub-1"]);
  });

  it("requires the staff record to be active, not merely to exist", async () => {
    query.mockResolvedValue({ rows: [{ ok: true }] });
    await canComposeHome("sub-1");
    expect(query.mock.calls[0]![0]).toMatch(/s\.status = 'active'/);
  });

  /**
   * ⚠ csa IS EXCLUDED, and this is the assertion that pins it. A CSA can read the layout — support
   * work — and cannot change what shoppers see. Adding `csa` to this list is a one-word edit that
   * would pass every other test in the slice.
   */
  it("admits only admin and manager", async () => {
    query.mockResolvedValue({ rows: [{ ok: true }] });
    await canComposeHome("sub-1");
    const sql = query.mock.calls[0]![0] as string;
    expect(sql).toMatch(/role_key IN \('admin', 'manager'\)/);
    expect(sql).not.toMatch(/'csa'/);
  });

  it("refuses when the record says no", async () => {
    query.mockResolvedValue({ rows: [{ ok: false }] });
    expect(await canComposeHome("sub-1")).toBe(false);
  });

  /**
   * ⚠ FAIL-CLOSED. A row that came back empty — no record at all — must not read as permission. The
   * `?? false` is what makes an absent answer a refusal rather than `undefined`, which is falsy today
   * and would become a bug the moment anything compared it with `!==`.
   */
  it("refuses when there is no answer at all", async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await canComposeHome("sub-1")).toBe(false);
  });
});
