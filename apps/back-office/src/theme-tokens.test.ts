import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Back-office wears the storefront identity (backoffice/tokens.css): black, white, zinc, Effy blue for
// actions, Effy green for done, no red or orange. This pins exactly one action colour declared in one place,
// with the retired palettes gone; the full law is scripts/check-backoffice-tokens.mjs in @effy/design-system.
// (Vitest runs from the app dir.)
const raw = readFileSync(resolve(process.cwd(), "../../packages/design-system/src/backoffice/tokens.css"), "utf8");
const tokensCss = raw.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();
const stylesCss = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("back-office identity tokens", () => {
  it("is the identity the app imports — and the only one", () => {
    expect(stylesCss).toContain('@import "@effy/design-system/backoffice.css"');
    expect(stylesCss).not.toContain('@import "@effy/design-system/tokens.css"');
    expect(stylesCss).not.toContain("storefront.css");
  });

  // One action colour, under every name a screen or primitive reads it by. --primary is the shadcn
  // name, --brand the console's role name, --ring the focus: they must be the same blue.
  it("uses Effy blue as the single action colour, lifted in dark", () => {
    expect(tokensCss).toMatch(/--primary:\s*#1d4ed8/);
    expect(tokensCss).toMatch(/--brand:\s*#1d4ed8/);
    expect(tokensCss).toMatch(/--ring:\s*#1d4ed8/);
    expect(tokensCss).toMatch(/--primary:\s*#60a5fa/);
    expect(tokensCss).toMatch(/--brand:\s*#60a5fa/);
  });

  // Green only ever means done, delivered, paid or active — and a status is never a labelled fill.
  it("says done in green, and keeps green off every fill with a label on it", () => {
    expect(tokensCss).toMatch(/--success:\s*#0d7a40/);
    expect(tokensCss).toMatch(/--success:\s*#4cd97b/);
    expect(tokensCss).not.toContain("--success-foreground");
    expect(tokensCss).not.toContain("--warning-foreground");
  });

  // No red, no orange. A problem is the foreground with an icon and its words.
  it("says a problem in black (white in dark), never red or orange", () => {
    expect(tokensCss).toMatch(/--destructive:\s*#09090b/);
    expect(tokensCss).toMatch(/--destructive:\s*#fafafa/);
    for (const hex of ["#cf2b1f", "#f87171", "#b4550a", "#fb923c", "#a85c05", "#fbbf24"]) {
      expect(tokensCss, `the console's red/orange ${hex} reached the back-office`).not.toContain(hex);
    }
  });

  it("has fully retired both prior brand palettes (Jade and Effy Emerald)", () => {
    for (const hex of ["#0fb57e", "#047857", "#065f46", "#d0735a", "#bf5540", "#dd8368", "#69b08b"]) {
      expect(tokensCss, `retired brand value ${hex} is still present`).not.toContain(hex);
    }
  });
});
