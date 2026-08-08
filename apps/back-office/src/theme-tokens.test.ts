import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Brand guard (017 SC-002 / SC-008): the design-system surfaces stay neutral-leaning, the retired
// Jade accent is gone, and Effy Forest #26483a is the single brand accent. Mirrors the no-Jade
// sweep, but automated. (Vitest runs from the app dir → resolve the SSOT from there.)
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

describe("design-system tokens — Effy Forest brand (017)", () => {
  it("contains none of the removed green-tinted surface blends", () => {
    for (const hex of FORBIDDEN_SURFACE_HEX) {
      expect(tokensCss, `unexpected green-tinted surface token ${hex}`).not.toContain(hex);
    }
  });

  // 026: the brand is monochrome. The accent INVERTS between appearances — that is the invariant
  // most likely to be "simplified" away by someone who assumes one accent value, so assert it.
  it("uses the monochrome neutral ramp as the accent, inverting by appearance", () => {
    expect(tokensCss).toMatch(/--primary:\s*#171717/); // light: near-black (adopted, feature 041)
    expect(tokensCss).toMatch(/--primary:\s*#e5e5e5/); // dark: near-white
    expect(tokensCss).toMatch(/--primary-foreground:\s*#fafafa/);
    expect(tokensCss).toMatch(/--primary-foreground:\s*#171717/);
    // the focus ring is an AA-tuned neutral (WCAG 1.4.11 UI bar), not the accent (041)
    expect(tokensCss).toMatch(/--ring:\s*#808080/); // light
    expect(tokensCss).toMatch(/--ring:\s*#737373/); // dark
  });

  it("carries exactly two semantic hues, and success has no foreground pair", () => {
    expect(tokensCss).toContain("#e01010"); // error, light
    expect(tokensCss).toContain("#0c9409"); // success, light — non-text indicator only
    expect(tokensCss).not.toContain("--success-foreground");
  });

  it("has fully retired both prior brand palettes (Jade and Effy Emerald)", () => {
    for (const hex of ["#0fb57e", "#047857", "#065f46", "#d0735a", "#bf5540", "#dd8368", "#69b08b"]) {
      expect(tokensCss, `retired brand value ${hex} is still present`).not.toContain(hex);
    }
  });
});
