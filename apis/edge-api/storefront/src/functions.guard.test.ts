import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Every function exports through `shopperHandler`, so the shopper connection limit answers a
 * retryable 503. Also: every declared handler has a file and every function file is deployed.
 */

const here = dirname(fileURLToPath(import.meta.url));
const functionsDir = resolve(here, "functions");
const yaml = readFileSync(resolve(here, "..", "serverless.yml"), "utf8");

const HEALTH = new Set(["healthz-get.ts", "readyz-get.ts"]);

const files = readdirSync(functionsDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
const declared = [...yaml.matchAll(/^\s+handler: src\/functions\/([a-z0-9-]+)\.handler$/gm)].map((m) => `${m[1]}.ts`);

describe("storefront functions", () => {
  it("there are functions to check", () => {
    expect(files.length).toBeGreaterThan(HEALTH.size);
  });

  it.each(files.filter((f) => !HEALTH.has(f)))("%s exports its handler through shopperHandler", (file) => {
    const src = readFileSync(resolve(functionsDir, file), "utf8");
    expect(src, `${file} must export \`handler = shopperHandler(...)\``).toMatch(/export const handler = shopperHandler\(/);
    if (/catch \(err\)/.test(src)) {
      expect(src, `${file} catches errors but does not rethrow ConnectionLimitError`).toMatch(
        /if \(err instanceof ConnectionLimitError\) throw err;/,
      );
    }
  });

  it("every declared handler has a source file", () => {
    expect(declared.filter((f) => !existsSync(resolve(functionsDir, f)))).toEqual([]);
  });

  it("every function file is deployed", () => {
    expect(files.filter((f) => !declared.includes(f))).toEqual([]);
  });
});
