import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** Reads the real serverless.yml, and pins the back-office authorizer on every /orders/v1/* route. */

const here = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(here, "..");
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");

function readServerlessEnvKeys(): Set<string> {
  const start = yaml.indexOf("\n  environment:\n");
  if (start < 0) throw new Error("serverless.yml has no provider.environment block");
  const rest = yaml.slice(start + "\n  environment:\n".length);
  const end = rest.search(/\n {2}[a-z]/);
  const block = end < 0 ? rest : rest.slice(0, end);
  const keys = new Set<string>();
  for (const line of block.split("\n")) {
    const m = /^ {4}([A-Z][A-Z0-9_]*):/.exec(line);
    if (m?.[1]) keys.add(m[1]);
  }
  return keys;
}

function blockFor(fn: string): string {
  const start = yaml.indexOf(`  ${fn}:`);
  if (start < 0) throw new Error(`serverless.yml declares no function \`${fn}\``);
  const rest = yaml.slice(start + `  ${fn}:`.length);
  const end = rest.search(/\n {2}[a-zA-Z]/);
  return end < 0 ? rest : rest.slice(0, end);
}

const AUTHED = [
  "ordersListV1",
  "orderDetailV1",
  "fulfillmentHandoffV1",
  "fulfillmentArrivalV1",
  "refundProposalDismissV1",
  "orderRefundV1",
  "orderCancelV1",
  "refundRequestDeclineV1",
] as const;

const PUBLIC = ["healthz", "readyz"] as const;

describe("orders service deployment contract", () => {
  const declared = readServerlessEnvKeys();

  it("declares every database key the repositories need at runtime", () => {
    const required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_SECRET_ARN"];
    const missing = required.filter((k) => !declared.has(k));
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("can reach the payment provider - and holds the secret key ONLY, never the webhook secret (070)", () => {
    // Refunds are issued here, so the Stripe key ARN must be declared.
    expect(declared.has("STRIPE_SECRET_KEY_ARN")).toBe(true);
    expect(yaml).toMatch(/Resource:\s*\n\s+- \$\{ssm:\/effy\/\$\{sls:stage\}\/db\/master_secret_arn\}\s*\n\s+- \$\{ssm:\/effy\/\$\{sls:stage\}\/stripe\/secret_key_arn\}/);
    // No webhook here, so no signing secret.
    expect(yaml).not.toContain("webhook_secret");
    expect(declared.has("STRIPE_WEBHOOK_SECRET_ARN")).toBe(false);
    expect(yaml).not.toMatch(/sk_(test|live)_/);
  });

  it("gives the two functions that call the provider room to finish (research R8)", () => {
    for (const fn of ["orderRefundV1", "orderCancelV1"]) expect(blockFor(fn), fn).toMatch(/^ {4}timeout: 25$/m);
  });

  it("attaches to the STAFF HTTP API (075) rather than creating one", () => {
    // The gateway, stage, CORS and authorizers are Terraform's.
    expect(yaml).toMatch(/httpApi:\s*\n\s+id: \$\{ssm:\/effy\/\$\{sls:stage\}\/staff\/http_api_id\}/);
  });

  it("puts EVERY /orders/v1 route behind the back-office authorizer", () => {
    for (const fn of AUTHED) {
      const block = blockFor(fn);
      expect(block, `${fn} has no authorizer - it would be publicly readable`).toContain(
        "authorizer:",
      );
      expect(block, `${fn} must use the back-office authorizer`).toContain(
        "/staff/authorizer/back-office_id",
      );
    }
  });

  it("exposes only the health probes without an authorizer", () => {
    for (const fn of PUBLIC) {
      expect(blockFor(fn)).not.toContain("authorizer:");
    }
    // No route outside the health probes may be unauthenticated; scheduled functions are not routes.
    const scheduledCount = (yaml.match(/^ {6}- schedule:/gm) ?? []).length;
    const routeCount = (yaml.match(/^ {4}handler:/gm) ?? []).length - scheduledCount;
    const authorizerCount = (yaml.match(/authorizer:/g) ?? []).length;
    expect(authorizerCount).toBe(routeCount - PUBLIC.length);
  });

  it("disables function versioning from the first deploy", () => {
    expect(yaml).toMatch(/^ {2}versionFunctions: false$/m);
  });
});
