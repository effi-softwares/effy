import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the inventory service — 035's guard, on its sixth outing.
 *
 * 035's fourth defect: the audience map read four env vars `serverless.yml` never declared. Every
 * pool resolved "unknown", NO EMAIL WAS EVER SENT, and a hundred passing tests missed it because the
 * tests set those vars themselves. A unit test that provides its own environment can never catch an
 * environment that is not provisioned — so this reads the ACTUAL `serverless.yml`.
 *
 * ⚠ AND IT PINS THE TWO-AUDIENCE SPLIT, which is this service's one structural risk. Shop routes and
 * back-office routes live in ONE service here (research R6), and API Gateway authorizers are
 * per-route — that is the whole basis on which Principle IV holds. A shop route that acquired the
 * back-office authorizer would let a shop operator read and rewrite EVERY shop's stock, and nothing
 * in a unit test would notice, because the service code is shared by design.
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

/** Routes that MUST sit behind the SHOP authorizer — the caller's own shop only. */
const SHOP_ROUTES = [
  "stockGetV1",
  "stockTrackingPutV1",
  "stockPutV1",
  "stockAdjustPostV1",
  "stockThresholdPutV1",
  "settingsGetV1",
  "settingsPutV1",
] as const;

/** Public by design — liveness/readiness probes touch no shop data. */
const PUBLIC = ["healthz", "readyz"] as const;

describe("inventory service deployment contract", () => {
  const declared = readServerlessEnvKeys();

  it("declares every database key the repositories need at runtime", () => {
    const required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_SECRET_ARN"];
    const missing = required.filter((k) => !declared.has(k));
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("attaches to the shared HTTP API rather than creating one", () => {
    expect(yaml).toMatch(/httpApi:\s*\n\s+id: \$\{ssm:\/effy\/\$\{sls:stage\}\/edge\/http_api_id\}/);
  });

  it("puts every shop route behind the SHOP authorizer and never the back-office one", () => {
    for (const fn of SHOP_ROUTES) {
      const block = blockFor(fn);
      expect(block, `${fn} has no authorizer — it would be publicly writable`).toContain(
        "authorizer:",
      );
      expect(block, `${fn} must use the shop authorizer`).toContain("/edge/authorizer/shop_id");
      // ⚠ The failure that matters: a shop route on the back-office authorizer would hand one shop
      // operator every other shop's stock, and the shared service code could not tell.
      expect(block, `${fn} must NOT carry the back-office authorizer`).not.toContain(
        "/edge/authorizer/back-office_id",
      );
    }
  });

  it("puts every admin route behind the BACK-OFFICE authorizer and never the shop one", () => {
    // Derived, not listed: any function whose path contains /v1/admin/ must be back-office gated.
    // Written this way so a route added later is covered without anyone remembering to list it here.
    const adminFns = [...yaml.matchAll(/^ {2}([a-zA-Z0-9]+):\n(?:.*\n)*?.*?path: (\/inventory\/v1\/admin\/[^\n]*)/gm)];
    for (const [, fn] of adminFns) {
      if (!fn) continue;
      const block = blockFor(fn);
      expect(block, `${fn} must use the back-office authorizer`).toContain(
        "/edge/authorizer/back-office_id",
      );
      expect(block, `${fn} must NOT carry the shop authorizer`).not.toContain(
        "/edge/authorizer/shop_id",
      );
    }
  });

  it("exposes only the health probes without an authorizer", () => {
    for (const fn of PUBLIC) {
      expect(blockFor(fn)).not.toContain("authorizer:");
    }
    const routeCount = (yaml.match(/^ {4}handler:/gm) ?? []).length;
    const authorizerCount = (yaml.match(/authorizer:/g) ?? []).length;
    expect(authorizerCount).toBe(routeCount - PUBLIC.length);
  });

  it("disables function versioning from the first deploy", () => {
    // ⚠ This service exists BECAUSE admin ran out of CloudFormation resources (research R6). Starting
    // without this would be repeating, in a fresh stack, the exact mistake that created it.
    expect(yaml).toMatch(/^ {2}versionFunctions: false$/m);
  });
});
