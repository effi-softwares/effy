// US4 — the record is the PLATFORM's, not the identity provider's.
//
// These assert the lifecycle properties FR-020/FR-006a promise: the upsert is idempotent, roles
// reconcile down as well as up, the record survives role removal (for audit), and the
// platform-owned columns (status, shop_id) are never reachable from token data.
//
// The live proof — flip a term, watch a valid token stop working — is the operator's quickstart §6.
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
  withTransaction,
}));

import { upsertOnContact } from "./repository";

interface Row {
  cognito_sub: string;
  email: string | null;
  status: string;
  last_seen_at: Date;
  role_keys: string[];
  shop_id: string | null;
  shop_code: string | null;
  shop_name: string | null;
  shop_status: "active" | "suspended" | "disabled" | null;
}

/**
 * A fake shop table that behaves like the real table: one row per cognito_sub (the UNIQUE constraint),
 * `ON CONFLICT DO UPDATE` semantics for email/last_seen, and role rows reconciled per statement.
 * This is what lets us assert idempotency rather than merely assert the SQL text contains
 * "ON CONFLICT".
 */
const table = new Map<string, Row>();
let seq = 0;

function fakeClient() {
  let staffId = "";
  return {
    query: vi.fn(async (text: string, args?: unknown[]) => {
      const a = (args ?? []) as string[];

      if (text.includes("INSERT INTO public.shop_staff ")) {
        const [sub, email] = a;
        const existing = table.get(sub!);
        if (existing) {
          // COALESCE(EXCLUDED.email, shop_staff.email) — a null token email never clobbers.
          existing.email = email ?? existing.email;
          existing.last_seen_at = new Date(Date.now() + ++seq * 1000);
          staffId = existing.cognito_sub;
        } else {
          table.set(sub!, {
            cognito_sub: sub!,
            email: email ?? null,
            status: "active",
            last_seen_at: new Date(Date.now() + ++seq * 1000),
            role_keys: [],
            shop_id: null,
            shop_code: null,
            shop_name: null,
            shop_status: null,
          });
          staffId = sub!;
        }
        return { rows: [{ id: staffId }] };
      }

      if (text.includes("DELETE FROM public.shop_staff_role")) {
        const [id, desired] = a as unknown as [string, string[]];
        const row = table.get(id)!;
        row.role_keys = row.role_keys.filter((r) => desired.includes(r));
        return { rows: [] };
      }

      if (text.includes("INSERT INTO public.shop_staff_role")) {
        const [id, role] = a as unknown as [string, string];
        const row = table.get(id)!;
        if (!row.role_keys.includes(role)) row.role_keys.push(role); // ON CONFLICT DO NOTHING
        return { rows: [] };
      }

      if (text.includes("LEFT JOIN public.shop_staff_role")) {
        return { rows: [table.get(a[0]!)] };
      }
      return { rows: [] };
    }),
  };
}

describe("shop staff record lifecycle", () => {
  beforeEach(() => {
    table.clear();
    seq = 0;
    query.mockReset();
    withTransaction.mockReset();
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(fakeClient()));
  });

  // SC-011
  it("creates exactly one row on first contact and never duplicates on repeat contact", async () => {
    await upsertOnContact("sub-1", "sam@effy.test", ["shop_manager"]);
    await upsertOnContact("sub-1", "sam@effy.test", ["shop_manager"]);
    await upsertOnContact("sub-1", "sam@effy.test", ["shop_manager"]);
    expect(table.size).toBe(1);
  });

  it("advances last_seen_at on every authenticated contact", async () => {
    const first = await upsertOnContact("sub-1", "sam@effy.test", []);
    const second = await upsertOnContact("sub-1", "sam@effy.test", []);
    expect(new Date(second.lastSeenAt).getTime()).toBeGreaterThan(
      new Date(first.lastSeenAt).getTime(),
    );
  });

  // SC-011: two simultaneous first requests must resolve to one row (UNIQUE + ON CONFLICT).
  it("collapses concurrent first contact to a single row", async () => {
    await Promise.all([
      upsertOnContact("sub-1", "sam@effy.test", ["shop_staff"]),
      upsertOnContact("sub-1", "sam@effy.test", ["shop_staff"]),
    ]);
    expect(table.size).toBe(1);
    expect(table.get("sub-1")!.role_keys).toEqual(["shop_staff"]);
  });

  it("reconciles roles UP when the claim gains one", async () => {
    await upsertOnContact("sub-1", "sam@effy.test", ["shop_staff"]);
    const record = await upsertOnContact("sub-1", "sam@effy.test", ["shop_staff", "shop_manager"]);
    expect(record.roles.sort()).toEqual(["shop_manager", "shop_staff"]);
  });

  it("reconciles roles DOWN when the claim loses one", async () => {
    await upsertOnContact("sub-1", "sam@effy.test", ["shop_staff", "shop_manager"]);
    const record = await upsertOnContact("sub-1", "sam@effy.test", ["shop_staff"]);
    expect(record.roles).toEqual(["shop_staff"]);
  });

  // The record is never deleted on role removal — it persists for audit and grants nothing.
  it("keeps the record, granting nothing, when every role is removed in the identity provider", async () => {
    await upsertOnContact("sub-1", "sam@effy.test", ["shop_manager"]);
    const record = await upsertOnContact("sub-1", "sam@effy.test", []);

    expect(table.size).toBe(1);
    expect(record.roles).toEqual([]);
    expect(record.status).toBe("active");
  });

  // research R6 — provisioning owns the email; a token that lacks one must not erase it.
  it("never overwrites a provisioned email with null", async () => {
    await upsertOnContact("sub-1", "sam@effy.test", []);
    const record = await upsertOnContact("sub-1", null, []);
    expect(record.email).toBe("sam@effy.test");
  });

  it("fills in an email once the token starts carrying one", async () => {
    await upsertOnContact("sub-1", null, []);
    const record = await upsertOnContact("sub-1", "sam@effy.test", []);
    expect(record.email).toBe("sam@effy.test");
  });

  // FR-006a: status and shop_id are platform-owned. A JIT contact must not touch them, whatever
  // the token says — this is what makes "disabled" and "unassigned" stick.
  it("leaves platform-owned status and shop assignment untouched across contacts", async () => {
    await upsertOnContact("sub-1", "sam@effy.test", ["shop_manager"]);

    // The operator disables them and assigns a shop, out of band.
    const row = table.get("sub-1")!;
    row.status = "disabled";
    row.shop_id = "shop-1";
    row.shop_code = "CMB-01";
    row.shop_name = "Colombo 01";
    row.shop_status = "active";

    const record = await upsertOnContact("sub-1", "sam@effy.test", ["shop_manager"]);

    expect(record.status).toBe("disabled");
    expect(record.shop).toEqual({
      id: "shop-1",
      code: "CMB-01",
      name: "Colombo 01",
      status: "active",
    });
  });
});
