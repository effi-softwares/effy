import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ EVERY STOREFRONT FUNCTION EXPORTS THROUGH `shopperHandler` (070 FR-030).
 *
 * This service connects as a database role with a connection limit. When a burst of shoppers
 * exhausts it, the database refuses the next connection and `shopperHandler` turns that refusal
 * into a retryable 503. A function exported WITHOUT the wrapper would answer the same moment with
 * an opaque 500 — or a gateway timeout — and the limit that exists to protect staff traffic would
 * look, to shoppers, like the site being broken.
 *
 * It also checks the deployment and the source agree: every declared handler has a file, and every
 * function file is deployed. A handler file nobody routes to is dead code that reads as live.
 */

const here = dirname(fileURLToPath(import.meta.url));
const functionsDir = resolve(here, "functions");
const yaml = readFileSync(resolve(here, "..", "serverless.yml"), "utf8");

/** The shared health probes do no shopper work and connect to nothing a shopper burst can exhaust… */
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
    // And lets the wrapper see the connection limit instead of swallowing it as a plain 503.
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
