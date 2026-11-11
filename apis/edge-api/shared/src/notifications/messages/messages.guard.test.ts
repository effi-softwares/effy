import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 112 - back-office messages have one writer per fact:
 * - a message is created by the admin service's repository, and its state changed only there and by the sending
 *   worker's repository;
 * - its activity log (`message_event`) is append-only;
 * - who a message is for is decided only in `audience.ts` (fixed fragments, never SQL from a client).
 */
const here = dirname(fileURLToPath(import.meta.url));
const services = resolve(here, "../../../..");
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

describe("112 - the message record's writers", () => {
  it("scans the services", () => expect(sources.length).toBeGreaterThan(300));

  it("a message is created by the admin service's repository only", () => {
    expect(where(/INSERT INTO\s+public\.message\b(?!_)/)).toEqual(["admin/src/messages/repository.ts"]);
  });

  it("a message's state is changed by the admin repository and the sending worker's repository only", () => {
    expect(where(/UPDATE\s+public\.message(_audience)?\b(?!_)/)).toEqual([
      "admin/src/messages/repository.ts",
      "notifications/src/messages/repository.ts",
      "notifications/src/purge/repository.ts",
    ]);
  });

  it("the activity log is never rewritten or removed", () => {
    expect(where(/(UPDATE|DELETE FROM)\s+public\.message_event\b/)).toEqual([]);
  });

  it("who a message is for is decided in audience.ts only", () => {
    // The fragments only the audience module may build for a message: the people of each audience and their filters.
    const fragments = /public\.shop_staff_role\b|public\.driver_zone_capability\b|public\.device_token\b|points_usable\(/;
    const messageModules = sources.filter((s) => /\/messages\//.test(s.file) && fragments.test(s.src)).map((s) => s.file);
    expect(messageModules).toEqual(["shared/src/notifications/messages/audience.ts"]);
  });
});
