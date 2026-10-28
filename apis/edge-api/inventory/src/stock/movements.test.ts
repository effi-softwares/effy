import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  query,
  withTransaction: vi.fn(),
}));

const { readMovementPage } = await import("./repository");
const { encodeCursor, parseListQuery } = await import("@effy/edge-shared");
const { MOVEMENT_LIST_SPEC } = await import("./list");

const req = (qs: Record<string, string> = {}) => parseListQuery(qs, MOVEMENT_LIST_SPEC);
const pageSql = () => String(query.mock.calls[0]?.[0] ?? "").replace(/\s+/g, " ");

const row = (id: string, at: string) => ({
  id,
  quantity_delta: -1,
  quantity_before: 5,
  quantity_after: 4,
  reason: "order_paid",
  actor_kind: "system",
  actor_label: null,
  order_number: "EF-1",
  note: null,
  created_at: new Date(at),
  list_sort_key: `${at.replace("T", " ").replace("Z", "")}123+00`,
  list_row_id: id,
});

beforeEach(() => {
  vi.clearAllMocks();
  query.mockImplementation(async (sql: string) => (sql.includes("count") ? { rows: [{ n: 0 }] } : { rows: [] }));
});

describe("a variant's stock movements (103 T048)", () => {
  it("reads newest first with the id breaking ties, one extra row to know of a next page", async () => {
    await readMovementPage("v-1", req());
    expect(pageSql()).toContain("ORDER BY m.created_at DESC, m.id DESC");
    expect(query.mock.calls[0]?.[1]).toEqual(["v-1", null, 26]);
  });

  it("narrows to one reason", async () => {
    await readMovementPage("v-1", req({ reason: "damage" }));
    expect(pageSql()).toContain("($2::text IS NULL OR m.reason = $2)");
    expect(query.mock.calls[0]?.[1]?.[1]).toBe("damage");
  });

  it("starts after the cursor, compared as a timestamp to the microsecond", async () => {
    const cursor = encodeCursor("2026-10-28 01:00:00.123456+00", "8b1c7c1e-0000-4000-8000-000000000001");
    await readMovementPage("v-1", req({ cursor }));
    expect(pageSql()).toContain("(m.created_at, m.id) < ($3::timestamptz, $4::uuid)");
  });

  it("returns a next cursor only when there is a further page", async () => {
    const rows = Array.from({ length: 26 }, (_, i) => row(`id-${i}`, "2026-10-28T01:00:00.000Z"));
    query.mockImplementation(async (sql: string) => (sql.includes("count") ? { rows: [{ n: 40 }] } : { rows }));
    const page = await readMovementPage("v-1", req());
    expect(page.items).toHaveLength(25);
    expect(page.total).toBe(40);
    expect(page.nextCursor).not.toBeNull();
    expect(page.items[0]).toMatchObject({ reason: "order_paid", orderNumber: "EF-1", quantityAfter: 4 });
  });
});
