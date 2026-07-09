import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Amendment D2 guard (FR-024 / SC-014): the design-system surfaces must be NEUTRAL — the old
// green-tinted blends are gone — and Jade #0FB57E remains the single accent. Mirrors the SC-007
// hygiene grep, but automated. (Vitest runs from the app dir → resolve the SSOT from there.)
const tokensCss = readFileSync(
  resolve(process.cwd(), "../../packages/design-system/src/tokens.css"),
  "utf8",
)
  // Strip block comments — the guard checks declared token VALUES, not prose (the header may
  // mention historical/fill hexes).
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .toLowerCase();

// The green-tinted surface/accent values Amendment D2 removed (research Part H1/H3).
const FORBIDDEN_SURFACE_HEX = [
  "#e6f7f0", // old light accent (green hover)
  "#063a2b", // old dark accent
  "#6ee7b7", // old dark accent-foreground
  "#f4f8f6", // old light sidebar
  "#111815", // old dark sidebar/card (green-black)
  "#047857", // fill used as a surface tint (accent-foreground)
  "#f1f5f3", // greenish light secondary/muted
  "#1a2420", // greenish dark secondary/muted
  "#e2e8e5", // greenish light border
  "#24312b", // greenish dark border
  "#0a0f0d", // green-black foreground/background
  "#5c6b64", // green-grey muted-foreground
  "#94a39b", // green-grey dark muted-foreground
];

describe("design-system tokens — Amendment D2 (neutral surfaces, single accent)", () => {
  it("contains none of the removed green-tinted surface blends", () => {
    for (const hex of FORBIDDEN_SURFACE_HEX) {
      expect(tokensCss, `unexpected green-tinted surface token ${hex}`).not.toContain(hex);
    }
  });

  it("keeps Jade #0FB57E as the single brand accent", () => {
    expect(tokensCss).toContain("#0fb57e");
  });
});
