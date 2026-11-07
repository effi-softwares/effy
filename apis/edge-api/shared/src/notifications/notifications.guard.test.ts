import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 109 - the notification record has one writer per kind of write:
 * - a notification and its deliveries are created by `notify.ts` only, inside the change they report;
 * - a notification's state changes through `read.ts` (spec 2's inbox adds its own module here);
 * - a delivery's outcome is written by the notifications worker's repository only;
 * - removal is the daily purge's;
 * - nothing names the old `notification_request` outbox, which Stage B dropped.
 */
const here = dirname(fileURLToPath(import.meta.url));
const services = resolve(here, "../../..");
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
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");
const sources = files(services).map((f) => ({ file: relative(services, f), src: strip(readFileSync(f, "utf8")) }));
const where = (re: RegExp) => sources.filter((s) => re.test(s.src)).map((s) => s.file).sort();

describe("109 - the notification record's writers", () => {
  it("scans the services", () => expect(sources.length).toBeGreaterThan(300));

  it("a notification is created by notify.ts only", () => {
    expect(where(/INSERT INTO\s+public\.notification\b(?!_)/)).toEqual(["shared/src/notifications/notify.ts"]);
  });

  it("a delivery is created by notify.ts only", () => {
    expect(where(/INSERT INTO\s+public\.notification_delivery\b/)).toEqual(["shared/src/notifications/notify.ts"]);
  });

  it("a notification's state is changed by read.ts only", () => {
    expect(where(/UPDATE\s+public\.notification\b(?!_)/)).toEqual(["shared/src/notifications/read.ts"]);
  });

  it("a delivery's outcome is written by the worker's repository only", () => {
    expect(where(/UPDATE\s+public\.notification_delivery\b/)).toEqual(["notifications/src/worker/repository.ts"]);
  });

  it("notifications and deliveries are removed by the purge only", () => {
    expect(where(/DELETE FROM\s+public\.notification(_delivery)?\b/)).toEqual(["notifications/src/purge/repository.ts"]);
  });

  it("nothing names the old notification_request (dropped in Stage B)", () => {
    expect(where(/public\.notification_request\b/)).toEqual([]);
  });
});
