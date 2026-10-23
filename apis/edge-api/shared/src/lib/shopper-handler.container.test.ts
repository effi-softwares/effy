import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ConnectionLimitError, isConnectionLimit } from "./db";
import { shopperHandler } from "./shopper-handler";

/**
 * The shopper connection limit against a real database: Postgres must refuse with sqlstate 53300, and
 * the refusal must reach the caller as a 503.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let held: Client;

const event = { rawPath: "/storefront/v1/home", requestContext: { requestId: "r" } } as unknown as APIGatewayProxyEventV2;
const context = { awsRequestId: "a", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

function asRole(): Client {
  const u = new URL(container.getConnectionUri());
  return new Client({ host: u.hostname, port: Number(u.port), database: u.pathname.slice(1), user: "limited_shopper", password: "pw" });
}

d("070 — a role's connection limit becomes a retryable 503", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const admin = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    await admin.query(`CREATE ROLE limited_shopper LOGIN PASSWORD 'pw' CONNECTION LIMIT 1`);
    await admin.end();
    held = asRole();
    await held.connect(); // the role's one connection is now taken
  }, 120_000);

  afterAll(async () => {
    await held?.end();
    await container?.stop();
  });

  it("the database refuses the second connection with 53300", async () => {
    const second = asRole();
    const err = await second.connect().then(() => null, (e: unknown) => e);
    await second.end().catch(() => undefined);
    expect(err).not.toBeNull();
    expect(isConnectionLimit(err)).toBe(true);
  });

  it("and a shopper request that hits it gets 503 with Retry-After, not a 500", async () => {
    const res = await shopperHandler(async () => {
      const second = asRole();
      try {
        await second.connect();
      } catch (e) {
        if (isConnectionLimit(e)) throw new ConnectionLimitError();
        throw e;
      } finally {
        await second.end().catch(() => undefined);
      }
      return { statusCode: 200 };
    })(event, context);

    expect(res.statusCode).toBe(503);
    expect(res.headers?.["retry-after"]).toBeDefined();
  });

  it("another role is unaffected while the limited one is full", async () => {
    const other = new Client({ connectionString: container.getConnectionUri() });
    await other.connect();
    expect((await other.query("SELECT 1 AS ok")).rows[0]?.ok).toBe(1);
    await other.end();
  });
});
