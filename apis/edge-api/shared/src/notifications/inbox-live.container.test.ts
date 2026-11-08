import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { transactorFor, type Transactor } from "../lib/db";
import { migrationSql } from "../testing/migrations";
import { announceInbox } from "./announce-inbox";
import { notify } from "./notify";

/**
 * 110 R6 / FR-018 / FR-019 - who hears "inbox": the customer on their own channel, the driver on theirs, every operator
 * of a shop on the shop's (once, however many of them were told), and nothing for a stood-down operator. One word, no
 * content.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let published: string[] = [];
let seq = 0;

d("the inbox live update (110)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(() => {
    published = [];
    vi.stubEnv("LIVE_HTTP_HOST", "live.example.test");
    vi.stubEnv("AWS_REGION", "ap-southeast-2");
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { channel: string; events: string[] };
      published.push(`${body.channel.split("/").slice(0, 3).join("/")} ${body.events.join(",")}`);
      return new Response(null, { status: 200 });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const channels = () => [...new Set(published)].sort();

  it("a customer hears it on their own channel, as the one word", async () => {
    await transact((tx) => notify(tx, { type: "order_paid", recipients: [{ sub: "c-live" }], subject: { entityId: "o" }, dedupeScope: `s-${++seq}`, channels: ["push"] }));
    expect(channels()).toEqual(['/customer/c-live {"k":"inbox"}']);
  });

  it("a driver hears it on their driver channel", async () => {
    const id = (await pool.query<{ id: string }>(`INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('d-live', 'D', 'd-live@effyshopping.com') RETURNING id::text AS id`)).rows[0]!.id;
    await transact((tx) => notify(tx, { type: "run_assigned", recipients: [{ sub: "d-live" }], subject: { entityId: "r" }, dedupeScope: `s-${++seq}`, channels: ["push"] }));
    expect(channels()).toEqual([`/driver/${id} {"k":"inbox"}`]);
  });

  it("two operators at one shop: the shop's channel once; a stood-down operator is not a reason to publish", async () => {
    const shop = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('LIV', 'Live') RETURNING id::text AS id`)).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.shop_staff (cognito_sub, shop_id, status) VALUES ('op-1', $1, 'active'), ('op-2', $1, 'active'), ('op-gone', $1, 'disabled')`,
      [shop],
    );
    await transact((tx) =>
      notify(tx, { type: "shop_new_order", recipients: [{ sub: "op-1" }, { sub: "op-2" }], subject: { entityId: "f" }, dedupeScope: `s-${++seq}`, channels: ["push"] }),
    );
    expect(published.filter((p) => p.startsWith(`/shop/${shop} `))).toHaveLength(published.length);
    expect(channels()).toEqual([`/shop/${shop} {"k":"inbox"}`]);

    published = [];
    await announceInbox([{ audience: "shop", sub: "op-gone" }], pool);
    expect(published).toEqual([]);
  });
});
