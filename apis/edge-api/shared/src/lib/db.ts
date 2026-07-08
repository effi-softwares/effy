// Module-singleton pg.Pool — ONE connection per warm container (research C4): a Node
// Lambda container serves one invocation at a time, so max > 1 is pure waste against
// the shared t4g.micro's ~85-connection budget. Pool (not bare Client) so an
// idle-killed connection is replaced transparently between invocations. TLS pins the
// RDS CA (002 forces TLS; bare `ssl: true` fails against the RDS chain).
import pg from "pg";

import { RDS_CA_BUNDLE } from "./rds-ca";
import { getDbPassword, invalidateDbPassword } from "./secrets";

let pool: pg.Pool | undefined;

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`db: required environment variable ${name} is not set`);
  return v;
}

async function getPool(): Promise<pg.Pool> {
  if (pool) return pool;

  pool = new pg.Pool({
    host: requiredEnv("DB_HOST"),
    port: Number(requiredEnv("DB_PORT")),
    database: requiredEnv("DB_NAME"),
    user: requiredEnv("DB_USER"),
    password: await getDbPassword(),
    max: 1,
    min: 0,
    idleTimeoutMillis: 120_000,
    // MUST stay below the 10s function timeout: a dead DB then fails through OUR
    // error mapping (problem+json / health 503) instead of a gateway timeout.
    connectionTimeoutMillis: 5_000,
    ssl: { ca: RDS_CA_BUNDLE, rejectUnauthorized: true },
  });
  return pool;
}

async function resetPool(): Promise<void> {
  const dead = pool;
  pool = undefined;
  invalidateDbPassword();
  await dead?.end().catch(() => undefined);
}

function isAuthFailure(err: unknown): boolean {
  // 28P01 invalid_password — the signature of a rotated credential (research C6).
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "28P01";
}

// query is the repository layer's single seam: parameterized raw SQL only (no ORM,
// no query builder). One transparent retry on credential rotation.
export async function query<R extends pg.QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<pg.QueryResult<R>> {
  try {
    return await (await getPool()).query<R>(text, values as never);
  } catch (err) {
    if (!isAuthFailure(err)) throw err;
    await resetPool();
    return await (await getPool()).query<R>(text, values as never);
  }
}

// withTransaction runs fn against a dedicated client inside BEGIN/COMMIT (ROLLBACK on throw).
// Used for multi-statement atomic writes (the staff JIT upsert + role reconcile, 005). The
// max:1 pool means the client is the container's single connection for the transaction's life.
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await (await getPool()).connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// pingDatabase is the health check's dependency probe — SELECT 1, no table dependency
// (the 2s budget is enforced by the caller). Shared by every service's /<service>/healthz.
export async function pingDatabase(): Promise<void> {
  await query("SELECT 1");
}
