import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 066 — an address's default delivery instructions, against the REAL migrations.
 *
 * ⚠ THE UNIT TESTS MOCK THIS FILE'S SUBJECT. `service.test.ts` proves the service hands the
 * repository the right value; only a real UPDATE proves that "present and null" clears a column
 * while "absent" leaves it — the difference COALESCE cannot express (056) — and only a real CHECK
 * proves the database refuses what the rule would have.
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
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

import { migrationSql } from "@effy/edge-shared";

import { create, listByCustomer, update, type AddressInput } from "./repo";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let customerId: string;

const base: AddressInput = {
  label: "Home",
  recipientName: "Pat",
  phone: null,
  line1: "1 Test St",
  line2: null,
  city: "Carlton",
  region: "VIC",
  postalCode: "3053",
  country: "AU",
  makeDefault: false,
};

/** An update that touches nothing else — every other field null, as an absent field is. */
const untouched: AddressInput = {
  label: null,
  recipientName: null,
  phone: null,
  line1: null,
  line2: null,
  city: null,
  region: null,
  postalCode: null,
  country: null,
  makeDefault: false,
};

d("066 — address default delivery instructions against real PostgreSQL", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM public.customer_address");
    await pool.query("DELETE FROM public.customer");
    customerId = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.customer (cognito_sub, email)
         VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
      )
    ).rows[0]!.id;
  });

  it("round-trips both columns through create and list", async () => {
    await create(customerId, {
      ...base,
      defaultDeliveryInstructions: { handover: "leave_at_door", note: "Side gate, code 4411" },
    });
    const [row] = await listByCustomer(customerId);
    expect(row!.default_delivery_handover).toBe("leave_at_door");
    expect(row!.default_delivery_note).toBe("Side gate, code 4411");
  });

  it("an address created without them has none", async () => {
    const row = await create(customerId, base);
    expect(row.default_delivery_handover).toBeNull();
    expect(row.default_delivery_note).toBeNull();
  });

  /** ⚠ The case a COALESCE update gets wrong. */
  it("⚠ ABSENT on update leaves the saved default alone; PRESENT-and-null clears it", async () => {
    const created = await create(customerId, {
      ...base,
      defaultDeliveryInstructions: { handover: "meet_at_door", note: "Ring twice" },
    });

    const afterAbsent = await update(customerId, created.id, { ...untouched, label: "House" });
    expect(afterAbsent!.label).toBe("House");
    expect(afterAbsent!.default_delivery_handover).toBe("meet_at_door");
    expect(afterAbsent!.default_delivery_note).toBe("Ring twice");

    const afterClear = await update(customerId, created.id, {
      ...untouched,
      defaultDeliveryInstructions: { handover: null, note: null },
    });
    expect(afterClear!.default_delivery_handover).toBeNull();
    expect(afterClear!.default_delivery_note).toBeNull();
    expect(afterClear!.label).toBe("House");
  });

  it("an update can replace one part and clear the other", async () => {
    const created = await create(customerId, {
      ...base,
      defaultDeliveryInstructions: { handover: "meet_at_door", note: "Ring twice" },
    });
    const out = await update(customerId, created.id, {
      ...untouched,
      defaultDeliveryInstructions: { handover: "leave_at_door", note: null },
    });
    expect(out!.default_delivery_handover).toBe("leave_at_door");
    expect(out!.default_delivery_note).toBeNull();
  });

  it("another customer's address is not touched", async () => {
    const created = await create(customerId, base);
    const other = (
      await pool.query<{ id: string }>(
        `INSERT INTO public.customer (cognito_sub, email)
         VALUES ('c-' || gen_random_uuid(), (gen_random_uuid() || '@effyshopping.com')::citext) RETURNING id`,
      )
    ).rows[0]!.id;
    const out = await update(other, created.id, {
      ...untouched,
      defaultDeliveryInstructions: { handover: "leave_at_door", note: "Mine now" },
    });
    expect(out).toBeNull();
    const [row] = await listByCustomer(customerId);
    expect(row!.default_delivery_note).toBeNull();
  });

  /** ⚠ SC-009 — the database is the backstop for a caller that skipped the rule. */
  it("⚠ the CHECK refuses 251 characters, a blank note and an unknown handover", async () => {
    await expect(
      create(customerId, { ...base, defaultDeliveryInstructions: { handover: null, note: "x".repeat(251) } }),
    ).rejects.toThrow();
    await expect(
      create(customerId, { ...base, defaultDeliveryInstructions: { handover: null, note: "   " } }),
    ).rejects.toThrow();
    await expect(
      create(customerId, {
        ...base,
        defaultDeliveryInstructions: { handover: "over_the_fence" as never, note: null },
      }),
    ).rejects.toThrow();
    // 250 characters that are 1,000 bytes: the limit is characters as a person counts them.
    await expect(
      create(customerId, { ...base, defaultDeliveryInstructions: { handover: null, note: "🚪".repeat(250) } }),
    ).resolves.toBeTruthy();
  });

  /**
   * 076 — P16, the address half: the address book's answer IS the deciding function's, on create,
   * on list and on update, and it is today's answer rather than the day-it-was-saved's.
   */
  it("⚠ 076 — each address carries who delivers there NOW, on every read and write", async () => {
    await pool.query(`
      INSERT INTO public.locality (name, state, postcode) VALUES ('CARLTON', 'VIC', '3053'), ('HOBART', 'TAS', '7000')
        ON CONFLICT DO NOTHING;
      INSERT INTO public.delivery_zone_postcode (postcode, distance_km, distance_source, added_by)
        VALUES ('3053', 2.10, 'manual', 'test') ON CONFLICT (postcode) DO NOTHING;
    `);
    const viaFunction = async (postcode: string) =>
      (await pool.query<{ kind: string }>(`SELECT kind FROM public.coverage_for_postcode($1)`, [postcode])).rows[0]!.kind;

    const listed = await create(customerId, base);
    const unlisted = await create(customerId, { ...base, label: "Shack", postalCode: " 7000 " });
    const foreign = await create(customerId, { ...base, label: "Abroad", postalCode: "SW1A 1AA", country: "GB" });
    expect(listed.coverage).toBe("effy");
    expect(unlisted.coverage).toBe("none");
    expect(foreign.coverage).toBe("none"); // not a postcode the country's data knows: never an error
    expect(listed.coverage).toBe(await viaFunction("3053"));
    expect(unlisted.coverage).toBe(await viaFunction("7000"));

    // The postcode leaves the list. Nothing about the address row changes — and its answer does.
    await pool.query(`DELETE FROM public.delivery_zone_postcode WHERE postcode = '3053'`);
    const after = (await listByCustomer(customerId)).find((a) => a.id === listed.id)!;
    expect(after.coverage).toBe("none");
    expect(after.coverage).toBe(await viaFunction("3053"));

    // And there is no column to go stale.
    const cols = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_address' AND column_name = 'coverage'`);
    expect(cols.rowCount).toBe(0);
  });
});
