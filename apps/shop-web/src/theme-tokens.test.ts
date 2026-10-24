import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// shop-web wears the back-office identity (Effy Shop Console Redesign, 2026-10-24) from the shared design
// system and declares no token values of its own — neither in styles.css nor in its touch layer.
// (Vitest runs from the app dir, so every file resolves from there.)
const appCss =
  readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8") +
  readFileSync(resolve(process.cwd(), "src/styles/touch.css"), "utf8");
const tokensCss = readFileSync(
  resolve(process.cwd(), "../../packages/design-system/src/backoffice/tokens.css"),
  "utf8",
).toLowerCase();

// Strip comments before scanning: prose may legitimately mention a hex or the word "theme".
const appCssCode = appCss.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();

describe("shop-web inherits the design system and defines no theme of its own", () => {
  it("imports the back-office identity and its shared primitive and pattern styles", () => {
    expect(appCssCode).toContain('@import "@effy/design-system/backoffice.css"');
    expect(appCssCode).toContain('@import "@effy/design-system/backoffice/primitives.css"');
    expect(appCssCode).toContain('@import "@effy/design-system/backoffice/patterns.css"');
  });

  it("imports exactly one identity file", () => {
    expect(appCssCode).not.toContain('@import "@effy/design-system/tokens.css"');
    expect(appCssCode.match(/@import "@effy\/design-system\/backoffice\.css"/g)).toHaveLength(1);
  });

  // An app-local copy would escape check-tokens.mjs entirely.
  it("keeps every adopted value in the shared package, none in the app", () => {
    expect(appCssCode).not.toMatch(/#[0-9a-f]{3,8}\b/);
    expect(appCssCode).not.toMatch(/--(pad|rowpad|font-sans|font-mono)\s*:/);
  });

  it("declares zero colour literals locally", () => {
    expect(appCssCode).not.toMatch(/#[0-9a-f]{3,8}\b/);
    expect(appCssCode).not.toMatch(/\b(rgb|hsl|oklch)a?\(/);
  });

  it("declares no theme tokens and no @theme block of its own", () => {
    expect(appCssCode).not.toMatch(/@theme\b/);
    expect(appCssCode).not.toMatch(/^\s*--(color|sidebar|radius|primary|background)[\w-]*\s*:/m);
  });

  it("declares no root font-size scaling of its own (shadcn defaults, no fluid scaling)", () => {
    expect(appCssCode).not.toMatch(/font-size\s*:\s*clamp\(/);
  });

  // The cobalt accent lifts in dark rather than inverting; an inversion would put dark on dark.
  it("resolves the cobalt action colour from the shared source, lifting (not inverting) in dark", () => {
    expect(tokensCss).toMatch(/--primary:\s*#1d4ed8/); // light
    expect(tokensCss).toMatch(/--primary:\s*#60a5fa/); // dark — brighter, same hue
    // --primary and --brand are one fact, equal in both appearances (see tokens.css).
    expect(tokensCss).toMatch(/--brand:\s*#1d4ed8/);
    expect(tokensCss).toMatch(/--brand:\s*#60a5fa/);
  });

  // No red and no orange (redesign brief §3.1): a problem is the foreground with an icon, and attention
  // (an unread dot, a "new" badge) is the action blue. A hue creeping back in is a second meaning.
  it("has no red and no orange: problems are the foreground, attention is blue", () => {
    const val = (name: string) => [...tokensCss.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "g"))].map((m) => m[1]);
    expect(val("destructive")).toEqual(val("foreground"));
    expect(val("warning")).toEqual(val("foreground"));
    expect(val("accent2")).toEqual(val("brand"));
  });

  // Charts carry hues, and never as text-on-fill.
  it("carries the bounded data-visualisation palette with no foreground pair", () => {
    expect(tokensCss).toMatch(/--chart-1:\s*#/);
    expect(tokensCss).not.toContain("--chart-1-foreground");
  });

  // --success and --warning may be text on their tint but never a fill with a label on it. The
  // structural guarantee is the absence of a paired foreground token — without one there is nothing
  // to write on the solid with. check-tokens.mjs enforces it for --success; this pins both.
  it("gives the non-fill semantics no foreground pair", () => {
    expect(tokensCss).not.toContain("--success-foreground");
    expect(tokensCss).not.toContain("--warning-foreground");
  });

  it("has fully retired both prior brand palettes (Jade and Effy Emerald)", () => {
    for (const hex of ["#0fb57e", "#047857", "#065f46", "#d0735a", "#bf5540", "#dd8368"]) {
      expect(tokensCss, `retired brand value ${hex} is still present`).not.toContain(hex);
    }
  });
});
