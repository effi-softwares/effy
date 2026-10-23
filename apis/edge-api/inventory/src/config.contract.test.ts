import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Reads the real serverless files. Shop and back-office routes share handlers, so this pins each
 * route's authorizer: a shop route behind the back-office one would expose every shop's stock.
 */

const here = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(here, "..");
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
/** The back-office half is a second stack (`serverless.staff.yml`) on the staff gateway. */
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

/** Behind the shop authorizer: the caller's own shop only. */
const SHOP_ROUTES = [
  "stockGetV1",
  "stockTrackingPutV1",
  "stockPutV1",
  "stockAdjustPostV1",
  "stockThresholdPutV1",
  "settingsGetV1",
  "settingsPutV1",
] as const;

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
    // The handlers are shared, so a key one stack lacks is a function that throws on one gateway.
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
      expect(block, `${fn} must NOT carry the back-office authorizer`).not.toContain("back-office_id");
    }
    // No back-office route may be in this file: it is on the other gateway.
    expect(yaml, "a /inventory/v1/admin/ route is declared in the SHOP stack").not.toContain("/inventory/v1/admin/");
  });

  it("puts every admin route behind the BACK-OFFICE authorizer and never the shop one", () => {
    // Derived from the path, so a route added later is covered. Walks `functions:` only.
    const fnSection = staffYaml.slice(staffYaml.indexOf("\nfunctions:\n"));
    const adminFns = [...fnSection.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*):$/gm)]
      .map(([, name]) => name!)
      .filter((name) => blockFor(name, staffYaml).includes("/inventory/v1/admin/"));

    expect(adminFns.length, "the five admin routes — the derivation above is broken").toBe(5);

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
    expect(yaml).toMatch(/^ {2}versionFunctions: false$/m);
    expect(staffYaml).toMatch(/^ {2}versionFunctions: false$/m);
  });
});
