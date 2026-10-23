// One pg.Pool connection per warm container (a Lambda serves one invocation at a time, and the shared
// database's connection budget is small). A Pool replaces an idle-killed connection transparently. TLS
// pins the RDS ca.
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
    // Below the 10 s function timeout, so a dead database fails through our error mapping.
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

/** No connections left for this role (or the server): shopper services land here first, answered as a retryable 503. */
export class ConnectionLimitError extends Error {
  constructor() {
    super("db: connection limit reached");
    this.name = "ConnectionLimitError";
  }
}

export function isConnectionLimit(err: unknown): boolean {
  // 53300 too_many_connections: the server-wide limit and a role's connection limit.
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "53300";
}

function isAuthFailure(err: unknown): boolean {
  // 28P01 invalid_password: a rotated credential.
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "28P01";
}

// The repository's single seam: parameterised raw SQL, one transparent retry on credential rotation.
export async function query<R extends pg.QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<pg.QueryResult<R>> {
  try {
    return await (await getPool()).query<R>(text, values as never);
  } catch (err) {
    if (isConnectionLimit(err)) throw new ConnectionLimitError();
    if (!isAuthFailure(err)) throw err;
    await resetPool();
    return await (await getPool()).query<R>(text, values as never);
  }
}

// Runs fn on a dedicated client inside begin/commit (rollback on throw).
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  let client: pg.PoolClient;
  try {
    client = await (await getPool()).connect();
  } catch (err) {
    if (isConnectionLimit(err)) throw new ConnectionLimitError();
    throw err;
  }
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

// The health check's probe: SELECT 1 (the caller enforces the 2 s budget).
export async function pingDatabase(): Promise<void> {
  await query("SELECT 1");
}

/** Run one statement: the pool (`pooled`) or a transaction's client, so one repository function serves both. */
export interface Queryable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

export const pooled: Queryable = { query };

/** Commit on return, rollback on throw. */
export type Transactor = <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;

/** Over a specific pool, so a real-database test runs transactions against its own database. */
export function transactorFor(pool: pg.Pool): Transactor {
  return async (fn) => {
    const client = await pool.connect();
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
  };
}
