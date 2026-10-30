import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * One map from where a package is to words. The shop's status stops at `collected`, so a console that
 * maps it to words shows the wrong place; this fails if one does (a record keyed by `collected:` with a
 * string value). Tab and filter labels (`TAB_LABEL`) are allowed by name.
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
      // A record literal that names `collected:` with a quoted string value - a status→word map.
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
