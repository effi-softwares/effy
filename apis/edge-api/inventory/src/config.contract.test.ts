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
/**
 * ⚠ 075 — the back-office half is a SECOND STACK from this same directory, on the staff gateway.
 * A stack attaches to exactly one gateway, so the two audiences are now told apart per stack as
 * well as per route. Every assertion below says which file it is reading.
 */
const staffYaml = readFileSync(resolve(serviceRoot, "serverless.staff.yml"), "utf8");

function readServerlessEnvKeys(yaml: string): Set<string> {
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

function blockFor(fn: string, from: string = yaml): string {
  const yaml = from;
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
  it.each([
    ["serverless.yml", yaml],
    ["serverless.staff.yml", staffYaml],
  ])("%s declares every database key the repositories need at runtime", (file, text) => {
    const declared = readServerlessEnvKeys(text);
    const required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_SECRET_ARN"];
    const missing = required.filter((k) => !declared.has(k));
    expect(missing, `${file} is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("⚠ the two stacks declare the SAME environment — one service, deployed twice", () => {
    // The handlers are shared. A key one stack has and the other lacks is a function that works on
    // one gateway and throws on the other, and no unit test would see it.
    expect([...readServerlessEnvKeys(staffYaml)].sort()).toEqual([...readServerlessEnvKeys(yaml)].sort());
  });

  it("the shop stack attaches to the SHARED HTTP API, the staff stack to the STAFF one", () => {
    expect(yaml).toMatch(/httpApi:\s*\n\s+id: \$\{ssm:\/effy\/\$\{sls:stage\}\/edge\/http_api_id\}/);
    expect(staffYaml).toMatch(/httpApi:\s*\n\s+id: \$\{ssm:\/effy\/\$\{sls:stage\}\/staff\/http_api_id\}/);
    expect(yaml).not.toContain("/staff/");
    expect(staffYaml).not.toContain("/edge/");
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
      expect(block, `${fn} must NOT carry the back-office authorizer`).not.toContain("back-office_id");
    }
    // ⚠ 075: and no back-office route may be in this file at all — it is on the other gateway.
    expect(yaml, "a /inventory/v1/admin/ route is declared in the SHOP stack").not.toContain("/inventory/v1/admin/");
  });

  it("puts every admin route behind the BACK-OFFICE authorizer and never the shop one", () => {
    // Derived, not listed: any function whose path contains /v1/admin/ must be back-office gated.
    // Written this way so a route added later is covered without anyone remembering to list it here.
    //
    // ⚠ Walk the `functions:` section only. A regex spanning arbitrary lines from an anchor matched
    // back into `params.default:` on the first run — it "found" a function called `default` and then
    // reported a real route as unauthorized. A guard that misfires is worse than none: it trains the
    // next person to ignore it.
    const fnSection = staffYaml.slice(staffYaml.indexOf("\nfunctions:\n"));
    const adminFns = [...fnSection.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*):$/gm)]
      .map(([, name]) => name!)
      .filter((name) => blockFor(name, staffYaml).includes("/inventory/v1/admin/"));

    expect(adminFns.length, "the six admin routes — the derivation above is broken").toBe(6);

    for (const fn of adminFns) {
      const block = blockFor(fn, staffYaml);
      expect(block, `${fn} must use the STAFF gateway's back-office authorizer`).toContain(
        "/staff/authorizer/back-office_id",
      );
      expect(block, `${fn} must NOT carry the shop authorizer`).not.toContain("shop_id");
    }
  });

  it("exposes only the health probes without an authorizer", () => {
    for (const text of [yaml, staffYaml]) {
      for (const fn of PUBLIC) {
        expect(blockFor(fn, text)).not.toContain("authorizer:");
      }
      const routeCount = (text.match(/^ {4}handler:/gm) ?? []).length;
      const authorizerCount = (text.match(/^ {10}authorizer:/gm) ?? []).length;
      expect(authorizerCount).toBe(routeCount - PUBLIC.length);
    }
  });

  it("disables function versioning from the first deploy", () => {
    // ⚠ This service exists BECAUSE admin ran out of CloudFormation resources (research R6). Starting
    // without this would be repeating, in a fresh stack, the exact mistake that created it.
    expect(yaml).toMatch(/^ {2}versionFunctions: false$/m);
    expect(staffYaml).toMatch(/^ {2}versionFunctions: false$/m);
  });
});
