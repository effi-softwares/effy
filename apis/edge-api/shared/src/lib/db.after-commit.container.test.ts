import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { afterCommit, transactorFor, type Queryable, type Transactor } from "./db";

/** 110 R6 - work queued with afterCommit runs only once its transaction has committed. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;

d("afterCommit (110)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query("CREATE TABLE t (n int)");
    transact = transactorFor(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("runs after COMMIT, when the row is visible to others", async () => {
    let seen = -1;
    await transact(async (tx) => {
      await tx.query("INSERT INTO t VALUES (1)");
      await afterCommit(tx, async () => {
        seen = Number((await pool.query("SELECT count(*) FROM t WHERE n = 1")).rows[0].count);
      });
      expect(seen).toBe(-1);
    });
    expect(seen).toBe(1);
  });

  it("never runs when the transaction rolls back", async () => {
    let ran = false;
    await expect(
      transact(async (tx) => {
        await afterCommit(tx, async () => {
          ran = true;
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(ran).toBe(false);
  });

  it("runs straight away outside a transaction", async () => {
    let ran = false;
    const autocommit: Queryable = { query: (text, values) => pool.query(text, values as never) as never };
    await afterCommit(autocommit, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it("a failing callback neither fails the change nor stops the next one", async () => {
    let second = false;
    await transact(async (tx) => {
      await afterCommit(tx, async () => {
        throw new Error("lost update");
      });
      await afterCommit(tx, async () => {
        second = true;
      });
    });
    expect(second).toBe(true);
  });
});
