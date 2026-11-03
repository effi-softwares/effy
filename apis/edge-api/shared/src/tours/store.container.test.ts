import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../testing/migrations";
import { readTourState, writeTourState } from "./store";

/** The tour state against the real schema (106): the upsert, the merge, the reset and the size guard. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let seq = 0;
const person = () => `tour-${++seq}`;

d("console_tour_state (106)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 4 });
    await pool.query(migrationSql());
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("a person with no row reads as offer everything, nothing seen", async () => {
    expect(await readTourState("shop", person(), pool)).toEqual({ offerTours: true, seen: {} });
  });

  it("the first write creates the row, and two tours merge without loss", async () => {
    const sub = person();
    await writeTourState("shop", sub, { tour: "welcome", version: 1, outcome: "finished" }, pool);
    const written = await writeTourState("shop", sub, { tour: "orders-queue", version: 2, outcome: "declined" }, pool);
    expect(written.ok).toBe(true);
    const state = await readTourState("shop", sub, pool);
    expect(Object.keys(state.seen).sort()).toEqual(["orders-queue", "welcome"]);
    expect(state.seen["orders-queue"]).toMatchObject({ version: 2, outcome: "declined" });
    expect(Number.isNaN(Date.parse(state.seen.welcome!.at))).toBe(false);
  });

  it("a later outcome and version overwrite the earlier ones", async () => {
    const sub = person();
    await writeTourState("shop", sub, { tour: "today", version: 1, outcome: "closed" }, pool);
    await writeTourState("shop", sub, { tour: "today", version: 2, outcome: "finished" }, pool);
    expect((await readTourState("shop", sub, pool)).seen.today).toMatchObject({ version: 2, outcome: "finished" });
  });

  it("the switch and the reset change only their own part", async () => {
    const sub = person();
    await writeTourState("shop", sub, { tour: "today", version: 1, outcome: "finished" }, pool);
    await writeTourState("shop", sub, { offerTours: false }, pool);
    expect(await readTourState("shop", sub, pool)).toMatchObject({ offerTours: false, seen: { today: { version: 1 } } });
    const reset = await writeTourState("shop", sub, { reset: true }, pool);
    expect(reset).toEqual({ ok: true, state: { offerTours: false, seen: {} } });
  });

  it("refuses the 101st tour but still updates one already there", async () => {
    const sub = person();
    for (let i = 0; i < 100; i++) await writeTourState("shop", sub, { tour: `t${i}`, version: 1, outcome: "declined" }, pool);
    expect(await writeTourState("shop", sub, { tour: "one-more", version: 1, outcome: "declined" }, pool)).toEqual({
      ok: false,
      reason: "full",
    });
    expect((await writeTourState("shop", sub, { tour: "t5", version: 2, outcome: "finished" }, pool)).ok).toBe(true);
  });

  it("a shop person's row is never an admin person's row", async () => {
    const sub = person();
    await writeTourState("admin", sub, { tour: "welcome", version: 1, outcome: "finished" }, pool);
    expect(await readTourState("shop", sub, pool)).toEqual({ offerTours: true, seen: {} });
  });

  it("the table refuses an unknown audience", async () => {
    await expect(
      pool.query(`INSERT INTO public.console_tour_state (audience, subject) VALUES ('customer', 'x')`),
    ).rejects.toThrow(/console_tour_state_audience_check/);
  });
});
