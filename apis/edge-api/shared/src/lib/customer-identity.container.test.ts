import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Context } from "aws-lambda";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthedEvent } from "./claims";
import { CUSTOMER_BY_SUB, resolveCustomer, type CustomerRow } from "./customer-identity";
import { preamble } from "./http";
import { migrationSql } from "./load-migrations";

/**
 * 070 — the customer gate against the REAL schema. The unit test proves the branching; this proves
 * the statement: that `status` and `closure_state` are the columns the migrations actually define,
 * and that the values the gate compares against are values the CHECK constraints actually allow.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

const event = (sub: string): AuthedEvent =>
  ({ rawPath: "/commerce/v1/cart", requestContext: { requestId: "r", authorizer: { jwt: { claims: { sub } } } } }) as unknown as AuthedEvent;
const scope = preamble(event("x"), { callbackWaitsForEmptyEventLoop: true } as unknown as Context);
const lookup = async (sub: string) => (await pool.query<CustomerRow>(CUSTOMER_BY_SUB, [sub])).rows[0];

d("070 — customer gate against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    await pool.query(
      `INSERT INTO public.customer (cognito_sub, email) VALUES
         ('sub-active', 'active@example.test'),
         ('sub-barred', 'barred@example.test'),
         ('sub-closing', 'closing@example.test')`,
    );
    await pool.query(`UPDATE public.customer SET status = 'barred' WHERE cognito_sub = 'sub-barred'`);
    await pool.query(`UPDATE public.customer SET closure_state = 'closing' WHERE cognito_sub = 'sub-closing'`);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("an active customer resolves to their id", async () => {
    const r = await resolveCustomer(event("sub-active"), scope, lookup);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.customer.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("a barred customer is refused 403", async () => {
    const r = await resolveCustomer(event("sub-barred"), scope, lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.statusCode).toBe(403);
  });

  it("a closing customer is refused 403", async () => {
    const r = await resolveCustomer(event("sub-closing"), scope, lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.statusCode).toBe(403);
  });

  it("an unknown subject is the uniform 401", async () => {
    const r = await resolveCustomer(event("sub-nobody"), scope, lookup);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.statusCode).toBe(401);
  });
});
