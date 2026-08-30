import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Principle V, mechanically (056).
 *
 * ⚠ THIS FEATURE TAKES NO EXCEPTION TO THE NO-CARD RULE, and this test is what makes that claim
 * checkable rather than a comment. The driver console is the most card-shaped screen on the platform:
 * "drivers on duty", "unresolved reports", "uncovered zones" as tiles across the top is the obvious
 * design, and the constitution forbids it. A future edit that reaches for the Card primitive should
 * fail here and be forced to record a justification in the plan — which is exactly what the
 * constitution's escape clause requires and what a comment could never enforce.
 *
 * The one permitted card application on this platform is the console dashboard overview (041), which
 * this feature does not touch.
 */

const here = dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry) || entry.includes(".test.")) continue;
    out.push(full);
  }
  return out;
}

const FILES = sourceFiles(resolve(here)).map((path) => ({
  path: path.slice(path.indexOf("features/drivers")),
  source: readFileSync(path, "utf8"),
}));

describe("driver console — Principle V, no exception claimed", () => {
  it("has source files to check (a passing-because-empty test proves nothing)", () => {
    // ⚠ 054 found `TestRailsCarryOnlyAvailableProducts` passing VACUOUSLY once the rails emptied.
    // A guard over a file list must assert the list is not empty, or it silently stops guarding.
    expect(FILES.length).toBeGreaterThan(10);
  });

  it("imports no Card primitive anywhere", () => {
    for (const { path, source } of FILES) {
      expect(source, `${path} imports a Card primitive`).not.toMatch(
        /\b(Card|CardHeader|CardContent|CardFooter|CardTitle|CardDescription)\b/,
      );
    }
  });

  it("introduces no colour outside the design-system tokens", () => {
    // The ramp is monochrome and inverts by appearance; 041 removed `amber` used as a "warning"
    // colour across shop-web for exactly this reason. Status here is carried by weight and wording.
    for (const { path, source } of FILES) {
      expect(source, `${path} contains a raw hex colour`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source, `${path} uses a Tailwind palette hue`).not.toMatch(
        /\b(?:text|bg|border|ring)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
      );
    }
  });

  it("⚠ shows no currency — the driver domain has never carried money (FR-049)", () => {
    for (const { path, source } of FILES) {
      expect(source, `${path} formats currency`).not.toMatch(/style:\s*["']currency["']/);
      expect(source, `${path} references a money field`).not.toMatch(
        /\b(grandTotal|subtotal|amountCents|currency)\b/,
      );
    }
  });

  it("⚠ never renders a driver's contact details in a LIST view (FR-050)", () => {
    // Phone and emergency contact belong on the profile only. A register or a queue that shows many
    // drivers must not carry a contact detail it never needed.
    for (const { path, source } of FILES) {
      if (!/List|Panel/.test(path) || /ProfileEditForm/.test(path)) continue;
      expect(source, `${path} renders a contact detail in a list view`).not.toMatch(
        /\b(contactPhone|emergencyContact)\b/,
      );
    }
  });
});
