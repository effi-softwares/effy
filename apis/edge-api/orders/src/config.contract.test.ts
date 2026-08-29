import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the orders service — 035's guard, on its fifth outing.
 *
 * 035's fourth defect: the audience map read four env vars `serverless.yml` never declared. Every
 * pool resolved "unknown", NO EMAIL WAS EVER SENT, and a hundred passing tests missed it because the
 * tests set those vars themselves. A unit test that provides its own environment can never catch an
 * environment that is not provisioned — so this reads the ACTUAL `serverless.yml` and asserts what a
 * live invocation needs.
 *
 * It also pins the authorizer. Every /orders/v1/* route carries back-office identity; a route that
 * lost its authorizer would be an unauthenticated read of every customer's order and address.
 */

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

/** Every route that must sit behind the back-office authorizer. */
const AUTHED = [
  "ordersListV1",
  "orderDetailV1",
  "fulfillmentHandoffV1",
  "fulfillmentArrivalV1",
  "refundProposalDismissV1",
] as const;

/** Public by design — liveness/readiness probes touch no customer data. */
const PUBLIC = ["healthz", "readyz"] as const;

describe("orders service deployment contract", () => {
  const declared = readServerlessEnvKeys();

  it("declares every database key the repositories need at runtime", () => {
    // `@effy/edge-shared`'s db module reads these; none is set by this service's own code.
    const required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_SECRET_ARN"];
    const missing = required.filter((k) => !declared.has(k));
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("attaches to the shared HTTP API rather than creating one", () => {
    // A3's contract: the gateway, its stage, its CORS and its authorizers are Terraform-owned. A
    // service that created its own would silently serve on a different hostname with no CORS.
    expect(yaml).toMatch(/httpApi:\s*\n\s+id: \$\{ssm:\/effy\/\$\{sls:stage\}\/edge\/http_api_id\}/);
  });

  it("puts EVERY /orders/v1 route behind the back-office authorizer", () => {
    for (const fn of AUTHED) {
      const block = blockFor(fn);
      expect(block, `${fn} has no authorizer — it would be publicly readable`).toContain(
        "authorizer:",
      );
      expect(block, `${fn} must use the back-office authorizer`).toContain(
        "/edge/authorizer/back-office_id",
      );
    }
  });

  it("exposes only the health probes without an authorizer", () => {
    for (const fn of PUBLIC) {
      expect(blockFor(fn)).not.toContain("authorizer:");
    }
    // Belt and braces: no route outside the health probes may be unauthenticated. Counting means a
    // route added later without an authorizer fails here rather than shipping open.
    const routeCount = (yaml.match(/^ {4}handler:/gm) ?? []).length;
    const authorizerCount = (yaml.match(/authorizer:/g) ?? []).length;
    expect(authorizerCount).toBe(routeCount - PUBLIC.length);
  });

  it("disables function versioning from the first deploy", () => {
    // ⚠ Not cosmetic. admin hit CloudFormation's 500-resource limit in 049 and had to add this under
    // pressure; measured at 434/500 in 053 T001. Starting with it costs nothing and removes the
    // failure mode entirely.
    expect(yaml).toMatch(/^ {2}versionFunctions: false$/m);
  });
});
