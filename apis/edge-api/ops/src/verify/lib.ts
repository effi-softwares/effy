// Shared plumbing for the 070 measurement harness. Everything it needs arrives in the ENVIRONMENT,
// supplied by the operator at run time; nothing here has a default that names a real system.
import { createHmac, randomUUID } from "node:crypto";

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env: ${name} (see scripts/verify-070/README.md)`);
  return v;
}

/** The payment provider's TEST key. ⚠ Refuses anything else: this harness creates and pays charges. */
export function stripeTestKey(): string {
  const key = env("STRIPE_TEST_SECRET_KEY");
  if (!key.startsWith("sk_test_")) throw new Error("STRIPE_TEST_SECRET_KEY must be a TEST key (sk_test_…). Refusing to run against live money.");
  return key;
}

export const base = () => env("EDGE_API_BASE_URL").replace(/\/$/, "");
export const uuid = () => randomUUID();

export interface Reply {
  status: number;
  ms: number;
  body: Record<string, unknown> | null;
  headers: Headers;
}

/** One request to the platform. `token` is an ID token; the access token rides beside it when given. */
export async function call(method: string, path: string, opts: { token?: string; access?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {}): Promise<Reply> {
  const started = performance.now();
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: {
      ...(opts.body !== undefined || opts.raw !== undefined ? { "content-type": "application/json" } : {}),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.access ? { "x-effy-access-token": opts.access } : {}),
      ...opts.headers,
    },
    body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, ms: performance.now() - started, body, headers: res.headers };
}

/** A form-encoded call to the payment provider's API, in test mode. */
export async function stripe(method: string, path: string, form: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${stripeTestKey()}`, "content-type": "application/x-www-form-urlencoded" },
    body: method === "GET" ? undefined : new URLSearchParams(form).toString(),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`provider ${method} ${path} → ${res.status}: ${JSON.stringify(body.error ?? body).slice(0, 200)}`);
  return body;
}

/** The provider's own signature scheme: `t=<unix>,v1=HMAC-SHA256(secret, "<unix>.<payload>")`. */
export function sign(payload: string, secret: string, at = Math.floor(Date.now() / 1000)): string {
  return `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${payload}`).digest("hex")}`;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!);
}

/** Collects checks; prints a table; sets a failing exit code if any did not hold. */
export function report(title: string) {
  const rows: { check: string; ok: boolean; detail: string }[] = [];
  return {
    check(check: string, ok: boolean, detail = "") {
      rows.push({ check, ok, detail });
    },
    done() {
      console.log(`\n${title}`);
      for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.check}${r.detail ? `  — ${r.detail}` : ""}`);
      const failed = rows.filter((r) => !r.ok).length;
      console.log(failed === 0 ? `\n${rows.length} checks, all held.` : `\n${failed} of ${rows.length} checks did NOT hold.`);
      if (failed > 0) process.exitCode = 1;
    },
  };
}
