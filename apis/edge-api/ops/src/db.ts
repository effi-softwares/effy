// The operator's database connection: one client, from the DSN `make` composes at invocation.
//
// ⚠ The DSN arrives in the ENVIRONMENT (`DB_DSN`), never on the command line — an argument is
// visible to every process on the machine and lands in shell history; this carries a password.
import { RDS_CA_BUNDLE } from "@effy/edge-shared";
import pg from "pg";

/**
 * Parse a DSN in either form `make` may hand over: libpq keywords
 * (`host=… port=… dbname=… user=… password=… sslmode=require`) or a `postgres://` URL.
 */
export function parseDsn(dsn: string): pg.ClientConfig {
  const trimmed = dsn.trim();
  if (/^postgres(ql)?:\/\//.test(trimmed)) return { connectionString: trimmed };

  const kv = new Map<string, string>();
  // key=value, where value is bare or 'single-quoted' with \' and \\ escapes (libpq's own rule).
  const re = /(\w+)\s*=\s*(?:'((?:[^'\\]|\\.)*)'|(\S*))/g;
  for (let m = re.exec(trimmed); m; m = re.exec(trimmed)) kv.set(m[1]!, m[2] !== undefined ? m[2].replace(/\\(.)/g, "$1") : (m[3] ?? ""));

  const host = kv.get("host");
  const database = kv.get("dbname");
  const user = kv.get("user");
  if (!host || !database || !user) throw new Error("DB_DSN must name host, dbname and user");
  const timeout = Number(kv.get("connect_timeout") ?? "10");
  return {
    host, database, user,
    port: Number(kv.get("port") ?? "5432"),
    password: kv.get("password"),
    connectionTimeoutMillis: (Number.isFinite(timeout) ? timeout : 10) * 1000,
    // The platform database requires TLS, and its chain is not in Node's default trust store.
    // `disable` exists for a local container only.
    ssl: kv.get("sslmode") === "disable" ? undefined : { ca: RDS_CA_BUNDLE, rejectUnauthorized: true },
  };
}

/** Run `work` on one connection and always close it. */
export async function withDatabase<T>(work: (db: pg.Client) => Promise<T>): Promise<T> {
  const dsn = process.env.DB_DSN;
  if (!dsn) throw new Error("missing required env: DB_DSN must be set (run this through `make`)");
  const db = new pg.Client(parseDsn(dsn));
  await db.connect();
  try {
    return await work(db);
  } finally {
    await db.end();
  }
}

/** `--flag value` and bare `--flag` from argv. Unknown flags are an error, not ignored. */
export function parseFlags(argv: readonly string[], spec: Record<string, "string" | "boolean">): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [name, inline] = arg.startsWith("--") ? arg.slice(2).split(/=(.*)/s, 2) : [undefined, undefined];
    const kind = name ? spec[name] : undefined;
    if (!name || !kind) throw new Error(`unknown argument: ${arg}`);
    if (kind === "boolean") {
      out[name] = true;
    } else {
      const value = inline ?? argv[++i];
      if (value === undefined) throw new Error(`--${name} needs a value`);
      out[name] = value;
    }
  }
  return out;
}

/** Run a tool's `main`, printing a one-line failure and exiting non-zero. */
export function runTool(name: string, main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    console.error(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
