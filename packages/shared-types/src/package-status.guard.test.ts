import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ ONE MAP FROM WHERE A PACKAGE IS TO WORDS (073, S7).
 *
 * Until 073 four files — back-office `packagePositionFor`, shop-web `STATUS_LABEL`,
 * `ORDER_STATUS_LABEL` and the unused `FulfillmentStatusBadge` — each turned the SHOP's status into a
 * word. The shop's status stops at `collected` by design, so back-office said "At hub" the moment a
 * driver picked a package up and the shop console never moved past "Collected". Every one of them was
 * reasonable on its own.
 *
 * This fails if a staff console maps a shop status to display words again. A map keyed by
 * `collected:` with a string value is the shape; tab and filter labels (`TAB_LABEL`) are workflow
 * filters, not positions, and are allowed by name.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const ROOTS = ["apps/back-office/src", "apps/shop-web/src"];
const ALLOWED = [/TAB_LABEL/, /TEAM_ACTIVITY|TeamActivitySheet/, /queries\.ts$/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : files(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !p.includes("__tests__") ? [p] : [];
  });
}

describe("no staff console maps shop statuses to position words (073)", () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    for (const file of files(resolve(repo, root))) {
      const src = readFileSync(file, "utf8")
        .split("\n")
        .map((l) => l.replace(/\/\/.*$/, ""))
        .join("\n");
      // A record literal that names `collected:` with a quoted string value — a status→word map.
      if (!/\bcollected\s*:\s*["']/.test(src)) continue;
      if (ALLOWED.some((a) => a.test(src) || a.test(file))) continue;
      offenders.push(file.slice(repo.length + 1));
    }
  }

  it("finds the consoles", () => {
    expect(files(resolve(repo, ROOTS[0]!)).length).toBeGreaterThan(20);
  });

  it("uses STATUS_WORD (via PackageStatusPill) and nothing else", () => {
    expect(offenders, "a status → words map outside package-status.ts").toEqual([]);
  });
});
