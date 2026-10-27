import { createHash } from "node:crypto";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  pool: null as Pool | null,
  enqueued: [] as { importId: string; step: string }[],
  staged: [] as string[],
  promoted: [] as string[],
}));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  const q = (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]);
  const SafeFetchError = actual.SafeFetchError as new (reason: string, message: string) => Error;
  return {
    ...actual,
    presignRead: async (key: string) => `signed:${key}`,
    publicImageUrl: (key: string | null) => (key ? `cdn:${key}` : null),
    emitMetric: () => undefined,
    // A link with "dead" in it does not answer; any other is a small JPEG.
    fetchPicture: async (link: string) => {
      if (link.includes("dead")) throw new SafeFetchError("http_error", "the link answered 404");
      return { bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: "image/jpeg", width: 800, height: 800 };
    },
    query: q,
    pooled: { query: q },
    withTransaction: async (fn: (c: unknown) => unknown) => {
      const client = await holder.pool!.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(client);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
});

vi.mock("@effy/edge-shared/live", () => ({ announce: async () => undefined }));

vi.mock("./aws", () => ({
  enqueue: async (importId: string, step: string) => {
    holder.enqueued.push({ importId, step });
  },
  stagePicture: async (importId: string, row: number, n: number) => {
    const key = `imports/${importId}/${row}/${n}.jpg`;
    holder.staged.push(key);
    return key;
  },
  promotePicture: async (staged: string, productId: string) => {
    const key = `products/${productId}/${staged.split("/").slice(2).join("-")}`;
    holder.promoted.push(key);
    return key;
  },
}));

import { migrationSql } from "@effy/edge-shared/testing";
import { IMPORT_COLUMNS } from "./rows";
import { create as askCreate, get, start } from "./service";
import { check, create } from "./worker";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const ADMIN = "staff-admin";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopId: string;
let plainPath: string;
let requiredPath: string;

const COLUMNS = IMPORT_COLUMNS.map((c) => c.name) as string[];

function sheetRow(rowNumber: number, cells: Record<string, string>) {
  return { rowNumber, cells: COLUMNS.map((c) => cells[c] ?? "") };
}

const good = (n: number, extra: Record<string, string> = {}) =>
  sheetRow(n + 1, {
    "Product key": `P${n}`, Name: `Product ${n}`, "Short description": "Fresh", Category: plainPath,
    Storage: "Room temperature", GST: "GST-free", "18+": "No", SKU: `SKU-${n}`, "Shop price": "10.00",
    "Picture links": `https://pictures.example/${n}.jpg`, ...extra,
  });

function body(rows: ReturnType<typeof sheetRow>[], fileName = "list.xlsx") {
  const sha = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  return { shopId, fileName, fileSha256: sha, margin: { kind: "percent", value: "10" }, columns: COLUMNS, rows };
}

const productCount = async () => (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.product`)).rows[0]!.n;

d("102 — importing a shop's list against real PostgreSQL", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    const leafPath = async (withRequired: boolean) =>
      (await pool.query<{ p: string[] }>(
        `SELECT r.path_names AS p FROM public.category_resolved r
          WHERE r.is_leaf AND ${withRequired ? "" : "NOT"} EXISTS
                (SELECT 1 FROM public.category_form f WHERE f.category_id = r.category_id AND f.level = 'required')
          ORDER BY r.category_id LIMIT 1`,
      )).rows[0]!.p.join(" › ");
    plainPath = await leafPath(false);
    requiredPath = await leafPath(true);
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    holder.enqueued = [];
    holder.staged = [];
    holder.promoted = [];
    await pool.query("DELETE FROM public.notification_request");
    await pool.query("DELETE FROM admin.audit_log");
    await pool.query("DELETE FROM public.product");
    await pool.query("DELETE FROM public.product_import");
    await pool.query("DELETE FROM public.shop_staff");
    await pool.query("DELETE FROM public.shop");
    shopId = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('IMP', 'Deli') RETURNING id::text`)).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.shop_staff (cognito_sub, email, name, status, shop_id) VALUES ('op-1', 'op1@effyshopping.com', 'Op', 'active', $1)`,
      [shopId],
    );
  });

  it("checks every row without creating anything, naming each problem; then creates only the ready ones, once", async () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => good(i + 1)),
      good(9, { Category: "Nowhere › At all" }),
      good(10, { Category: requiredPath }),
      good(11, { SKU: "SKU-1" }),
      good(12, { "Shop price": "ten dollars" }),
      good(13, { "Picture links": "https://pictures.example/dead.jpg" }),
      good(14, { "Picture links": "" }),
    ];
    const started = await start(body(rows), ADMIN);
    expect(started.state).toBe("checking");
    expect(holder.enqueued).toEqual([{ importId: started.importId, step: "check" }]);

    await check(started.importId);
    expect(await productCount()).toBe(0);
    const checked = await get(started.importId);
    expect(checked.state).toBe("checked");
    const byKey = new Map(checked.products.map((p) => [p.key, p]));
    // P1 and P11 share a SKU: both are told.
    expect(byKey.get("P1")!.result).toBe("not_ready");
    expect(byKey.get("P11")!.rows[0]!.problems).toContainEqual({ column: "SKU", message: "is used on rows 2, 12" });
    expect(byKey.get("P9")!.rows[0]!.problems).toContainEqual({ column: "Category", message: "is not an aisle Effy has" });
    expect(byKey.get("P10")!.result).toBe("not_ready");
    expect(byKey.get("P12")!.rows[0]!.problems.some((p) => p.column === "Shop price")).toBe(true);
    expect(byKey.get("P13")!.rows[0]!.problems).toContainEqual({ column: "Picture links", message: "picture 1: the link answered 404" });
    const ready = checked.products.filter((p) => p.result === "ready").map((p) => p.key).sort();
    expect(ready).toEqual(["P14", "P2", "P3", "P4", "P5", "P6", "P7", "P8"].sort());
    expect(checked.counts.ready).toBe(8);

    await askCreate(started.importId, { version: checked.version }, ADMIN);
    expect(holder.enqueued.at(-1)).toEqual({ importId: started.importId, step: "create" });
    await create(started.importId);

    const made = (await pool.query(
      `SELECT name, created_via, import_id::text, content_owner, status FROM public.product ORDER BY name`,
    )).rows;
    expect(made).toHaveLength(8);
    expect(made.every((p) => p.created_via === "import" && p.import_id === started.importId)).toBe(true);
    // With a picture it went on sale; without one it waits for Effy to finish it.
    expect(made.find((p) => p.name === "Product 2")).toMatchObject({ status: "active", content_owner: "shop" });
    expect(made.find((p) => p.name === "Product 14")).toMatchObject({ status: "draft", content_owner: "effy" });
    expect(holder.promoted).toHaveLength(7);

    const done = await get(started.importId);
    expect(done).toMatchObject({ state: "done", counts: { created: 8 } });
    expect(done.products.find((p) => p.key === "P2")!.productId).toBeTruthy();
    // The shop is told once, about the list.
    expect((await pool.query(`SELECT type FROM public.notification_request`)).rows).toEqual([{ type: "shop_products_imported" }]);

    // A repeated message creates nothing twice.
    await create(started.importId);
    expect(await productCount()).toBe(8);
  });

  it("the same file again is flagged, and every row whose SKU now exists is not ready", async () => {
    const rows = [good(1), good(2)];
    const first = await start(body(rows), ADMIN);
    await check(first.importId);
    await askCreate(first.importId, { version: (await get(first.importId)).version }, ADMIN);
    await create(first.importId);
    expect(await productCount()).toBe(2);

    const again = await start(body(rows), ADMIN);
    expect(again.repeatOf?.importId).toBe(first.importId);
    await check(again.importId);
    const checked = await get(again.importId);
    expect(checked.counts.ready).toBe(0);
    expect(checked.products[0]!.rows[0]!.problems[0]!.message).toMatch(/already used in this shop by "Product 1"/);
    await expect(askCreate(again.importId, { version: checked.version }, ADMIN)).rejects.toMatchObject({ kind: "conflict" });
  });

  it("refuses a sheet it cannot read before writing anything", async () => {
    await expect(start({ ...body([good(1)]), columns: [...COLUMNS, "Colour"] }, ADMIN)).rejects.toMatchObject({ kind: "validation" });
    await expect(start({ ...body([]) }, ADMIN)).rejects.toMatchObject({ kind: "validation" });
    const many = Array.from({ length: 501 }, (_, i) => good(i + 1));
    await expect(start(body(many), ADMIN)).rejects.toMatchObject({ kind: "validation" });
    expect((await pool.query(`SELECT count(*)::int AS n FROM public.product_import`)).rows[0]).toEqual({ n: 0 });
  });

  it("leaves out a product whose aisle is retired between the check and the create", async () => {
    const started = await start(body([good(1)]), ADMIN);
    await check(started.importId);
    // Another active leaf takes the product's place in the sheet's eyes: the category is no longer found.
    await pool.query(
      `UPDATE public.product_import_row SET cells = jsonb_set(cells, '{5}', '"Gone › Away"') WHERE import_id = $1`,
      [started.importId],
    );
    await askCreate(started.importId, { version: (await get(started.importId)).version }, ADMIN);
    await create(started.importId);
    expect(await productCount()).toBe(0);
    const done = await get(started.importId);
    expect(done.products[0]).toMatchObject({ result: "left_out" });
  });
});
