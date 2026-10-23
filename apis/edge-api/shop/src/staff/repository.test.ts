// The SQL says what we think, and platform-owned columns are never written from token data.
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
  withTransaction,
}));

import { authorizeShopManager, upsertOnContact } from "./repository";

describe("authorizeShopManager (platform record: role AND status AND shop scope)", () => {
  beforeEach(() => query.mockReset());

  it("is true when the record says active manager at an active shop", async () => {
    query.mockResolvedValue({ rows: [{ ok: true }] });
    expect(await authorizeShopManager("sub-1")).toBe(true);
  });

  it("is false for a denied or absent record", async () => {
    query.mockResolvedValue({ rows: [{ ok: false }] });
    expect(await authorizeShopManager("sub-1")).toBe(false);
    query.mockResolvedValue({ rows: [] });
    expect(await authorizeShopManager("sub-1")).toBe(false);
  });

  // Role, status and shop scope must all be in the predicate.
  it("conjoins role, status, and an inner join to an active shop", async () => {
    query.mockResolvedValue({ rows: [{ ok: true }] });
    await authorizeShopManager("sub-1");

    const sql = (query.mock.calls[0]?.[0] as string).replace(/\s+/g, " ");
    expect(sql).toContain("ss.status = 'active'");
    expect(sql).toContain("ssr.role_key = 'shop_manager'");
    expect(sql).toContain("JOIN public.shop st ON st.id = ss.shop_id");
    expect(sql).toContain("st.status = 'active'");
    // An unassigned operator drops out of the join.
    expect(sql).not.toContain("LEFT JOIN public.shop st");
  });
});

describe("upsertOnContact (JIT provisioning + role reconcile)", () => {
  beforeEach(() => {
    withTransaction.mockReset();
    // Fixtures reset here: the client is constructed lazily, after a test customised them.
    roleKeys = ["shop_manager"];
    shopRow = {
      shop_id: "shop-1",
      shop_code: "CMB-01",
      shop_name: "Colombo 01",
      shop_status: "active",
    };
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(fakeClient()));
  });

  it("upserts idempotently and returns the mapped record with reconciled roles", async () => {
    const record = await upsertOnContact("sub-1", "sam@effy.test", [
      "shop_manager",
      "not-a-role",
    ]);

    expect(record).toEqual({
      subject: "sub-1",
      email: "sam@effy.test",
      roles: ["shop_manager"],
      status: "active",
      shop: { id: "shop-1", code: "CMB-01", name: "Colombo 01", status: "active" },
      lastSeenAt: "2026-07-09T00:00:00.000Z",
    });

    // Idempotent: the on conflict upsert on the unique subject.
    expect(lastQueries.some((q) => q.includes("ON CONFLICT (cognito_sub)"))).toBe(true);
    // Reconcile removes roles the claim no longer carries.
    expect(lastQueries.some((q) => q.includes("DELETE FROM public.shop_staff_role"))).toBe(true);
  });

  it("grants exactly the known roles from the claim, and no others", async () => {
    await upsertOnContact("sub-1", null, ["shop_staff", "admin", "manager", "picker"]);

    const grants = lastQueryArgs.filter((a) =>
      String(a[0]).includes("INSERT INTO public.shop_staff_role"),
    );
    expect(grants).toHaveLength(1);
    expect(grants[0]?.[1]).toEqual(["staff-1", "shop_staff"]);
  });

  it("records a role-less operator rather than refusing them", async () => {
    roleKeys = [];
    const record = await upsertOnContact("sub-1", "sam@effy.test", []);
    expect(record.roles).toEqual([]);
    expect(record.status).toBe("active");
  });

  it("returns shop: null for an operator with no assignment", async () => {
    shopRow = { shop_id: null, shop_code: null, shop_name: null, shop_status: null };
    const record = await upsertOnContact("sub-1", "sam@effy.test", ["shop_staff"]);
    expect(record.shop).toBeNull();
  });

  // A token without an email never clobbers the provisioned address.
  it("preserves a stored email when the token supplies none (COALESCE)", async () => {
    await upsertOnContact("sub-1", null, []);
    const upsert = lastQueries.find((q) => q.includes("ON CONFLICT (cognito_sub)")) ?? "";
    expect(upsert.replace(/\s+/g, " ")).toContain(
      "email = COALESCE(EXCLUDED.email, public.shop_staff.email)",
    );
  });

  // status and shop_id are platform-owned.
  it("never writes status or shop_id from token data", async () => {
    await upsertOnContact("sub-1", "sam@effy.test", ["shop_manager"]);
    const writes = lastQueries.filter(
      (q) => q.includes("INSERT INTO") || q.includes("UPDATE") || q.includes("DO UPDATE"),
    );
    for (const sql of writes) {
      expect(sql).not.toMatch(/\bstatus\s*=/);
      expect(sql).not.toMatch(/\bshop_id\s*=/);
    }
  });
});

const lastQueries: string[] = [];
const lastQueryArgs: unknown[][] = [];
let roleKeys: string[] = ["shop_manager"];
let shopRow: Record<string, unknown> = {
  shop_id: "shop-1",
  shop_code: "CMB-01",
  shop_name: "Colombo 01",
  shop_status: "active",
};

function fakeClient() {
  lastQueries.length = 0;
  lastQueryArgs.length = 0;

  return {
    query: vi.fn(async (text: string, args?: unknown[]) => {
      lastQueries.push(text);
      lastQueryArgs.push([text, args]);
      if (text.includes("INSERT INTO public.shop_staff ")) return { rows: [{ id: "staff-1" }] };
      if (text.includes("DELETE FROM public.shop_staff_role")) return { rows: [] };
      if (text.includes("INSERT INTO public.shop_staff_role")) return { rows: [] };
      if (text.includes("LEFT JOIN public.shop_staff_role")) {
        return {
          rows: [
            {
              cognito_sub: "sub-1",
              email: "sam@effy.test",
              status: "active",
              last_seen_at: new Date("2026-07-09T00:00:00Z"),
              role_keys: roleKeys,
              ...shopRow,
            },
          ],
        };
      }
      return { rows: [] };
    }),
  };
}
