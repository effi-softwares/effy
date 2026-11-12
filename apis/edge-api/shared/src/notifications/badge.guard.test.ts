import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 116 C6 - the badge queue has three writers, each with one job: `badge.ts` queues (and owns the sweep's watermark), the
 * drain's `badge-repository.ts` claims, and erasure deletes a closed account's rows.
 */
const here = dirname(fileURLToPath(import.meta.url));
const services = resolve(here, "../../..");
const SKIP = new Set(["node_modules", "build", "dist", ".serverless", "generated"]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(name) && !name.includes(".tmp.")) out.push(path);
  }
  return out;
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");
const sources = files(services).map((f) => ({ file: relative(services, f), src: strip(readFileSync(f, "utf8")) }));
const where = (re: RegExp) => sources.filter((s) => re.test(s.src)).map((s) => s.file).sort();

describe("116 - the badge queue's writers", () => {
  it("scans the services", () => expect(sources.length).toBeGreaterThan(300));

  it("queued by badge.ts, claimed by the drain, deleted by erasure - nothing else", () => {
    expect(where(/(INSERT INTO|UPDATE|DELETE FROM)\s+public\.notification_badge_correction\b/)).toEqual([
      "customer/src/erasure/repository.ts",
      "notifications/src/worker/badge-repository.ts",
      "shared/src/notifications/badge.ts",
    ]);
  });

  it("the sweep's watermark belongs to badge.ts", () => {
    expect(where(/public\.notification_badge_sweep\b/)).toEqual(["shared/src/notifications/badge.ts"]);
  });
});
