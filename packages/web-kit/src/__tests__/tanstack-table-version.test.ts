import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

/**
 * Every package that renders a console table pins the SAME `@tanstack/react-table` (103). Two versions in one
 * app compile, pass their tests and then disagree at runtime about a table instance's shape - the driver app's
 * material3 / foundation mismatch (CLAUDE.md) is the same failure in another family.
 */
const ROOT = resolve(__dirname, "../../../..");
const PACKAGES = ["packages/web-kit/package.json", "apps/back-office/package.json", "apps/shop-web/package.json"];

function versionsIn(file: string): string[] {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, file), "utf8")) as Record<string, Record<string, string> | undefined>;
  return ["dependencies", "devDependencies", "peerDependencies"].flatMap((k) => {
    const v = pkg[k]?.["@tanstack/react-table"];
    return v ? [v] : [];
  });
}

describe("@tanstack/react-table is one exact version everywhere", () => {
  const all = PACKAGES.flatMap((f) => versionsIn(f).map((v) => ({ f, v })));

  it("is declared by every console package", () => {
    for (const f of PACKAGES) expect(versionsIn(f).length, f).toBeGreaterThan(0);
  });

  it("is pinned exactly (no range) and identical", () => {
    for (const { f, v } of all) expect(v, f).toMatch(/^\d+\.\d+\.\d+$/);
    expect(new Set(all.map((x) => x.v)).size).toBe(1);
  });
});
