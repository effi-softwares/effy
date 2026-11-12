import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 111 - a customer's choices and consent have one writer, and consent has one reader of "is it yes now":
 * - choices and consent answers are written by `preferences.ts` only;
 * - they are removed only by the erasure purge;
 * - the consent history is read directly only by `preferences.ts`, the back-office consent activity source and the purge;
 *   everything else asks the view `marketing_consent_current`.
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

describe("111 - choices and consent", () => {
  it("scans the services", () => expect(sources.length).toBeGreaterThan(300));

  it("choices and consent answers are written by preferences.ts only", () => {
    expect(where(/(INSERT INTO|UPDATE)\s+public\.customer_(notification_choice|marketing_consent)\b/)).toEqual([
      "shared/src/notifications/preferences.ts",
    ]);
  });

  it("they are removed by the erasure purge and account erasure (113) only", () => {
    expect(where(/DELETE FROM\s+public\.customer_(notification_choice|marketing_consent)\b/)).toEqual([
      "customer/src/erasure/repository.ts",
      "notifications/src/purge/repository.ts",
    ]);
  });

  it("the consent history is read directly only by preferences.ts, the consent activity source, the purge and erasure", () => {
    expect(where(/public\.customer_marketing_consent\b/)).toEqual([
      "customer/src/erasure/repository.ts",
      "notifications/src/purge/repository.ts",
      "orders/src/activity/consent.ts",
      "shared/src/notifications/preferences.ts",
    ]);
  });
});
