// Unit tests for the staff repository — the SQL orchestration + row→domain mapping, with the db
// seam mocked (the codebase pattern; live DB behavior is verified by the operator quickstart §US4,
// T038). Covers: authorizeAdmin (status+role), and the JIT upsert's idempotency + role reconcile.
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
  withTransaction,
}));

import { authorizeAdmin, upsertOnContact } from "./repository";

describe("authorizeAdmin (platform record: status active AND role admin)", () => {
  beforeEach(() => query.mockReset());

  it("is true when the record says active admin", async () => {
    query.mockResolvedValue({ rows: [{ ok: true }] });
    expect(await authorizeAdmin("sub-1")).toBe(true);
  });

  it("is false for a disabled or non-admin or absent record", async () => {
    query.mockResolvedValue({ rows: [{ ok: false }] });
    expect(await authorizeAdmin("sub-1")).toBe(false);
    query.mockResolvedValue({ rows: [] });
    expect(await authorizeAdmin("sub-1")).toBe(false);
  });
});

describe("upsertOnContact (JIT provisioning + role reconcile)", () => {
  beforeEach(() => {
    withTransaction.mockReset();
    withTransaction.mockImplementation(
      (fn: (c: unknown) => Promise<unknown>) => fn(fakeClient()),
    );
  });

  it("upserts idempotently (ON CONFLICT) and returns the mapped record with reconciled roles", async () => {
    const record = await upsertOnContact("sub-1", "op@effy.test", ["admin", "not-a-role"]);

    expect(record).toEqual({
      subject: "sub-1",
      email: "op@effy.test",
      roles: ["admin"], // unknown role filtered out
      status: "active",
      lastSeenAt: "2026-07-08T00:00:00.000Z",
    });
    // Idempotency guarantee is the ON CONFLICT upsert.
    expect(lastQueries.some((q) => q.includes("ON CONFLICT (cognito_sub)"))).toBe(true);
    // Reconcile removes roles not desired.
    expect(lastQueries.some((q) => q.includes("DELETE FROM admin.staff_role"))).toBe(true);
  });
});

// A fake pool client that answers each statement of upsertOnContact by SQL shape.
const lastQueries: string[] = [];
function fakeClient() {
  lastQueries.length = 0;
  return {
    query: vi.fn(async (text: string) => {
      lastQueries.push(text);
      if (text.includes("INSERT INTO admin.staff ")) return { rows: [{ id: "staff-1" }] };
      if (text.includes("DELETE FROM admin.staff_role")) return { rows: [] };
      if (text.includes("INSERT INTO admin.staff_role")) return { rows: [] };
      if (text.includes("LEFT JOIN admin.staff_role")) {
        return {
          rows: [
            {
              cognito_sub: "sub-1",
              email: "op@effy.test",
              status: "active",
              last_seen_at: new Date("2026-07-08T00:00:00Z"),
              role_keys: ["admin"],
            },
          ],
        };
      }
      return { rows: [] };
    }),
  };
}
