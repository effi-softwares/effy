import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 078 — a window becomes an instant in ONE place (`slots.ts`). 058 found two calendar defects from
 * rebuilding an instant out of wall-clock fields in more than one.
 */
const here = dirname(fileURLToPath(import.meta.url));
const services = resolve(here, "../../..");
const rel = (file: string) => relative(services, file);
const SKIP = new Set(["node_modules", "build", "dist", ".serverless", "generated"]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(name)) out.push(path);
  }
  return out;
}
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sources = files(services).map((f) => ({ file: rel(f), src: stripComments(readFileSync(f, "utf8")) }));

describe("078 — a window becomes an instant in one place", () => {
  it("scans the services", () => {
    expect(sources.length).toBeGreaterThan(300);
  });

  it("only slots.ts turns a delivery clock into an instant", () => {
    const where = sources
      .filter((s) => /^(shared\/src\/delivery|commerce\/src|fleet\/src\/slots|fleet\/src\/deliverydays)\//.test(s.file))
      .filter((s) => !s.file.endsWith("/test-clock.ts")) // test helpers only
      .filter((s) => s.src.includes("instantAtLocalTime("))
      .map((s) => s.file);
    expect(where).toEqual(["shared/src/delivery/slots.ts"]);
  });
});
