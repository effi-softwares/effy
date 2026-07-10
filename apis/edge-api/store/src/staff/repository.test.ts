// Unit tests for the store staff repository — SQL orchestration + row→domain mapping, with the db
// seam mocked (the codebase pattern). The LIVE behavior of the three-term gate is verified by the
// operator quickstart §6; what we assert here is that the SQL says what we think it says, and that
// the platform-owned columns are never written from token data.
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
  withTransaction,
}));

import { authorizeStoreManager, upsertOnContact } from "./repository";

describe("authorizeStoreManager (platform record: role AND status AND store scope)", () => {
  beforeEach(() => query.mockReset());

  it("is true when the record says active manager at an active store", async () => {
    query.mockResolvedValue({ rows: [{ ok: true }] });
    expect(await authorizeStoreManager("sub-1")).toBe(true);
  });

  it("is false for a denied or absent record", async () => {
    query.mockResolvedValue({ rows: [{ ok: false }] });
    expect(await authorizeStoreManager("sub-1")).toBe(false);
    query.mockResolvedValue({ rows: [] });
    expect(await authorizeStoreManager("sub-1")).toBe(false);
  });

  // The gate must decide from the platform record, and all three terms must be in the predicate:
  // role, status, and store scope. Dropping any one of them silently widens access.
  it("conjoins role, status, and an inner join to an active store", async () => {
    query.mockResolvedValue({ rows: [{ ok: true }] });
    await authorizeStoreManager("sub-1");

    const sql = (query.mock.calls[0]?.[0] as string).replace(/\s+/g, " ");
    expect(sql).toContain("ss.status = 'active'");
    expect(sql).toContain("ssr.role_key = 'store_manager'");
    expect(sql).toContain("JOIN public.store st ON st.id = ss.store_id");
    expect(sql).toContain("st.is_active");
    // An unassigned operator must drop out of the join, not be LEFT JOINed back in.
    expect(sql).not.toContain("LEFT JOIN public.store st");
  });
});

describe("upsertOnContact (JIT provisioning + role reconcile)", () => {
  beforeEach(() => {
    withTransaction.mockReset();
    // Reset the row fixtures HERE, not inside fakeClient() — the client is constructed lazily when
    // withTransaction runs, i.e. after a test has already customized the fixture.
    roleKeys = ["store_manager"];
    storeRow = {
      store_id: "store-1",
      store_code: "CMB-01",
      store_name: "Colombo 01",
      store_is_active: true,
    };
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(fakeClient()));
  });

  it("upserts idempotently and returns the mapped record with reconciled roles", async () => {
    const record = await upsertOnContact("sub-1", "sam@effy.test", [
      "store_manager",
      "not-a-role",
    ]);

    expect(record).toEqual({
      subject: "sub-1",
      email: "sam@effy.test",
      roles: ["store_manager"], // unknown group filtered out before reconcile
      status: "active",
      store: { id: "store-1", code: "CMB-01", name: "Colombo 01", isActive: true },
      lastSeenAt: "2026-07-09T00:00:00.000Z",
    });

    // SC-011: the idempotency guarantee is the ON CONFLICT upsert on the unique subject.
    expect(lastQueries.some((q) => q.includes("ON CONFLICT (cognito_sub)"))).toBe(true);
    // Reconcile removes roles the claim no longer carries.
    expect(lastQueries.some((q) => q.includes("DELETE FROM public.store_staff_role"))).toBe(true);
  });

  it("grants exactly the known roles from the claim, and no others", async () => {
    await upsertOnContact("sub-1", null, ["store_staff", "admin", "manager", "picker"]);

    const grants = lastQueryArgs.filter((a) =>
      String(a[0]).includes("INSERT INTO public.store_staff_role"),
    );
    expect(grants).toHaveLength(1);
    expect(grants[0]?.[1]).toEqual(["staff-1", "store_staff"]);
  });

  it("records a role-less operator rather than refusing them", async () => {
    roleKeys = [];
    const record = await upsertOnContact("sub-1", "sam@effy.test", []);
    expect(record.roles).toEqual([]);
    expect(record.status).toBe("active");
  });

  it("returns store: null for an operator with no assignment", async () => {
    storeRow = { store_id: null, store_code: null, store_name: null, store_is_active: null };
    const record = await upsertOnContact("sub-1", "sam@effy.test", ["store_staff"]);
    expect(record.store).toBeNull();
  });

  // research R6: a token that carries no email must never clobber the address provisioning set.
  it("preserves a stored email when the token supplies none (COALESCE)", async () => {
    await upsertOnContact("sub-1", null, []);
    const upsert = lastQueries.find((q) => q.includes("ON CONFLICT (cognito_sub)")) ?? "";
    expect(upsert.replace(/\s+/g, " ")).toContain(
      "email = COALESCE(EXCLUDED.email, public.store_staff.email)",
    );
  });

  // FR-006a: status and store_id are platform-owned. No token-derived value may reach them.
  it("never writes status or store_id from token data", async () => {
    await upsertOnContact("sub-1", "sam@effy.test", ["store_manager"]);
    const writes = lastQueries.filter(
      (q) => q.includes("INSERT INTO") || q.includes("UPDATE") || q.includes("DO UPDATE"),
    );
    for (const sql of writes) {
      expect(sql).not.toMatch(/\bstatus\s*=/);
      expect(sql).not.toMatch(/\bstore_id\s*=/);
    }
  });
});

// A fake pool client answering each statement of upsertOnContact by SQL shape.
const lastQueries: string[] = [];
const lastQueryArgs: unknown[][] = [];
let roleKeys: string[] = ["store_manager"];
let storeRow: Record<string, unknown> = {
  store_id: "store-1",
  store_code: "CMB-01",
  store_name: "Colombo 01",
  store_is_active: true,
};

function fakeClient() {
  lastQueries.length = 0;
  lastQueryArgs.length = 0;

  return {
    query: vi.fn(async (text: string, args?: unknown[]) => {
      lastQueries.push(text);
      lastQueryArgs.push([text, args]);
      if (text.includes("INSERT INTO public.store_staff ")) return { rows: [{ id: "staff-1" }] };
      if (text.includes("DELETE FROM public.store_staff_role")) return { rows: [] };
      if (text.includes("INSERT INTO public.store_staff_role")) return { rows: [] };
      if (text.includes("LEFT JOIN public.store_staff_role")) {
        return {
          rows: [
            {
              cognito_sub: "sub-1",
              email: "sam@effy.test",
              status: "active",
              last_seen_at: new Date("2026-07-09T00:00:00Z"),
              role_keys: roleKeys,
              ...storeRow,
            },
          ],
        };
      }
      return { rows: [] };
    }),
  };
}
