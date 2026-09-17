import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Brand guard (017 SC-002 / SC-008), UPDATED BY THE PLATFORM-WIDE THEME ADOPTION.
//
// ⚠ THE PLATFORM IS NO LONGER MONOCHROME. This file used to assert a neutral ramp carrying every UI
// accent, which was the constitution from v1.10.0 to v1.13.0. The adopted identity makes cobalt the
// one action colour platform-wide, so the two assertions that pinned the monochrome rule now pin the
// cobalt one instead — REWRITTEN, not deleted. A guard that is deleted because its premise changed
// takes the real requirement with it; the requirement here was never "be grey", it was "there is
// exactly ONE action colour and it is declared in one place".
//
// The retired-palette sweeps below are untouched and still binding: Jade and Effy Emerald stay gone.
// (Vitest runs from the app dir → resolve the SSOT from there.)
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

  // ⚠ ONE ACTION COLOUR, DECLARED ONCE. --primary and --brand must resolve to the SAME value: the
  // shadcn-vocabulary name the primitives consume and the role name the screens read are two names
  // for one fact, and letting them drift would give the platform two "primary" colours that are
  // almost the same — the worst possible outcome, because nobody would notice.
  it("uses cobalt as the single action colour, under both of its names", () => {
    expect(tokensCss).toMatch(/--primary:\s*#1d4ed8/); // light
    expect(tokensCss).toMatch(/--brand:\s*#1d4ed8/);
    expect(tokensCss).toMatch(/--primary:\s*#60a5fa/); // dark — the hue LIFTS, it does not invert
  });

  // ⚠ The focus ring is a TUNED neutral-blue, never the accent itself. A ring in the action colour
  // is indistinguishable from a selected state on a cobalt-accented form.
  it("keeps the focus ring off the action colour and above the WCAG 1.4.11 bar", () => {
    expect(tokensCss).toMatch(/--ring:\s*#7993ca/); // light — 3.07:1 on white
    expect(tokensCss).toMatch(/--ring:\s*#737373/); // dark — 3.19:1 on the neutral-grey ground
  });

  // ⚠ FOUR state semantics now, not two — and none of them may become a fill with a label on it.
  // The structural guarantee is the ABSENCE of a foreground pair: without one there is nothing to
  // write on the solid with, so a well-meaning "make the success pill solid" cannot typecheck its
  // way to 4.00:1 white-on-green.
  it("carries the four state semantics, none of which may be a labelled fill", () => {
    expect(tokensCss).toContain("#cf2b1f"); // destructive, light
    expect(tokensCss).toContain("#0d8043"); // success, light
    expect(tokensCss).toContain("#a85c05"); // warning, light
    expect(tokensCss).not.toContain("--success-foreground");
    expect(tokensCss).not.toContain("--warning-foreground");
  });

  it("has fully retired both prior brand palettes (Jade and Effy Emerald)", () => {
    for (const hex of ["#0fb57e", "#047857", "#065f46", "#d0735a", "#bf5540", "#dd8368", "#69b08b"]) {
      expect(tokensCss, `retired brand value ${hex} is still present`).not.toContain(hex);
    }
  });
});
