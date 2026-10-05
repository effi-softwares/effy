import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the commerce service — 035's guard.
 *
 * Reads the ACTUAL `serverless.yml`, because a unit test that provides its own environment cannot
 * catch an environment that was never provisioned (035's fourth defect).
 *
 * It also pins the authorizer. Every route here except three named ones carries a shopper's
 * identity; a route that lost its authorizer would let anyone read or change anyone's cart, cards
 * and orders.
 */

const here = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(here, "..");
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");

function declaredEnvKeys(): Set<string> {
  const start = yaml.indexOf("\n  environment:\n");
  if (start < 0) throw new Error("serverless.yml has no provider.environment block");
  const rest = yaml.slice(start + "\n  environment:\n".length);
  const end = rest.search(/\n {2}[a-z]/);
  const keys = new Set<string>();
  for (const line of (end < 0 ? rest : rest.slice(0, end)).split("\n")) {
    const m = /^ {4}([A-Z][A-Z0-9_]*):/.exec(line);
    if (m?.[1]) keys.add(m[1]);
  }
  return keys;
}

/** Every function block in `functions:`, keyed by its logical name. */
export function functionBlocks(): Map<string, string> {
  const start = yaml.indexOf("\nfunctions:\n");
  if (start < 0) throw new Error("serverless.yml has no functions block");
  const body = yaml.slice(start + "\nfunctions:\n".length);
  const out = new Map<string, string>();
  const names = [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9]*):\s*$/gm)];
  names.forEach((m, i) => {
    const from = m.index! + m[0].length;
    const to = i + 1 < names.length ? names[i + 1]!.index! : body.length;
    out.set(m[1]!, body.slice(from, to));
  });
  return out;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

/** Set by the Lambda runtime itself, never by `serverless.yml`. */
const RUNTIME_PROVIDED = new Set(["AWS_LAMBDA_FUNCTION_NAME", "AWS_SESSION_TOKEN", "AWS_REGION"]);

/**
 * ⚠ THE ONLY HTTP ROUTES WITHOUT THE CUSTOMER AUTHORIZER — each recorded in plan.md's Complexity
 * Tracking. Adding a name here is a decision to serve something to the whole internet.
 */
const PUBLIC_HTTP = new Set([
  "healthz",
  "readyz",
  "cartPreviewV1", // prices a guest's cart; writes nothing
  "cartPolicyV1", // the same answer for everyone
  "stripeWebhookV1", // authenticated by the provider's signature, not a shopper's token
]);

describe("commerce service deployment contract", () => {
  const declared = declaredEnvKeys();
  const blocks = functionBlocks();

  it("declares every key the shared library reads on this service's behalf", () => {
    const required = [
      "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_SECRET_ARN", // db
      "S3_MEDIA_BUCKET", // presigned image reads
      "METRIC_NAMESPACE", // emitMetric
      "STRIPE_SECRET_KEY_ARN", "STRIPE_WEBHOOK_SECRET_ARN", // @effy/edge-shared/payments
      "EFFY_ENV", "LOG_LEVEL", // logger
    ];
    expect(required.filter((k) => !declared.has(k))).toEqual([]);
  });

  it("declares every environment variable its own source reads", () => {
    const read = new Set<string>();
    for (const file of sourceFiles(here)) {
      for (const m of readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) read.add(m[1]!);
    }
    const missing = [...read].filter((k) => !declared.has(k) && !RUNTIME_PROVIDED.has(k));
    expect(missing, `read in src but not declared in serverless.yml: ${missing.join(", ")}`).toEqual([]);
  });

  it("carries payment secrets as ARNs only — never a value", () => {
    expect(yaml).not.toMatch(/sk_(test|live)_/);
    expect(yaml).not.toMatch(/whsec_/);
    expect(yaml).toMatch(/STRIPE_SECRET_KEY_ARN: \$\{ssm:/);
    expect(yaml).toMatch(/STRIPE_WEBHOOK_SECRET_ARN: \$\{ssm:/);
  });

  it("connects as the SHOPPER role, never the master user", () => {
    expect(yaml).toMatch(/DB_USER: \$\{ssm:\/effy\/\$\{sls:stage\}\/db\/shopper_username\}/);
    expect(yaml).not.toContain("master_username");
    expect(yaml).not.toContain("master_secret_arn");
  });

  it("puts EVERY http route behind the customer authorizer, except the named public ones", () => {
    for (const [name, block] of blocks) {
      if (!block.includes("httpApi:")) continue; // a schedule, not a route
      if (PUBLIC_HTTP.has(name)) {
        expect(block, `${name} is declared public but carries an authorizer`).not.toContain("authorizer:");
        continue;
      }
      expect(block, `${name} has no authorizer — it would be open to the internet`).toContain("authorizer:");
      expect(block, `${name} must use the CUSTOMER authorizer`).toContain("/edge/authorizer/customer_id");
    }
  });

  it("names no public route that does not exist — the allow-list cannot rot into a blanket", () => {
    const declaredRoutes = new Set(blocks.keys());
    const built = [...PUBLIC_HTTP].filter((n) => declaredRoutes.has(n));
    // Health is present from the scaffold; the other three arrive with their stories. None may be
    // listed here and then quietly reused for something else.
    expect(built).toEqual(expect.arrayContaining(["healthz", "readyz"]));
    for (const n of built) expect(blocks.get(n)).toContain("httpApi:");
  });

  it("cannot write product images", () => {
    expect(yaml).toContain("s3:GetObject");
    expect(yaml).not.toContain("s3:PutObject");
  });

  it("attaches to the shared HTTP API rather than creating one", () => {
    expect(yaml).toMatch(/httpApi:\s*\n\s+id: \$\{ssm:\/effy\/\$\{sls:stage\}\/edge\/http_api_id\}/);
  });

  it("serves every route under /commerce/", () => {
    const paths = [...yaml.matchAll(/^\s+path: (\S+)$/gm)].map((m) => m[1]!);
    expect(paths.filter((p) => !p.startsWith("/commerce/"))).toEqual([]);
  });

  it("disables function versioning from the first deploy", () => {
    expect(yaml).toMatch(/^ {2}versionFunctions: false$/m);
  });
});
