import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const appCss = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8")
const tokensCss = readFileSync(
  resolve(process.cwd(), "../../packages/design-system/src/tokens.css"),
  "utf8",
).toLowerCase()

const appCssCode = appCss.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase()

describe("shop-web inherits the design system and defines no theme of its own", () => {
  it("imports the back-office identity, which carries the shared console styles", () => {
    expect(appCssCode).toContain('@import "@effy/design-system/console.css"')
  })

  it("imports exactly one identity file", () => {
    expect(appCssCode).not.toContain('@import "@effy/design-system/tokens.css"')
    expect(appCssCode.match(/@import "@effy\/design-system\/console\.css"/g)).toHaveLength(1)
  })

  // An app-local copy would escape check-tokens.mjs entirely.
  it("keeps every adopted value in the shared package, none in the app", () => {
    expect(appCssCode).not.toMatch(/#[0-9a-f]{3,8}\b/)
    expect(appCssCode).not.toMatch(/--(pad|rowpad|font-sans|font-mono)\s*:/)
  })

  it("declares zero colour literals locally", () => {
    expect(appCssCode).not.toMatch(/#[0-9a-f]{3,8}\b/)
    expect(appCssCode).not.toMatch(/\b(rgb|hsl|oklch)a?\(/)
  })

  it("declares no theme tokens and no @theme block of its own", () => {
    expect(appCssCode).not.toMatch(/@theme\b/)
    expect(appCssCode).not.toMatch(/^\s*--(color|sidebar|radius|primary|background)[\w-]*\s*:/m)
  })

  it("declares no root font-size scaling of its own (shadcn defaults, no fluid scaling)", () => {
    expect(appCssCode).not.toMatch(/font-size\s*:\s*clamp\(/)
  })

  it("resolves the action blue from the shared source: one fill, a lifted text blue in dark", () => {
    expect(tokensCss.match(/--primary-fill:\s*#2563eb/g)).toHaveLength(2) // the same fill in both
    expect(tokensCss).toMatch(/--primary:\s*#60a5fa/) // dark text - brighter, same hue
    expect(tokensCss.match(/--brand-fill:\s*#059669/g)).toHaveLength(2)
    expect(tokensCss).toMatch(/--brand:\s*#10b981/)
  })

  it("says a problem in rose, attention in orange, a warning in the foreground", () => {
    const val = (name: string) =>
      [...tokensCss.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "g"))].map((m) => m[1])
    expect(val("destructive-fill")).toEqual(["#f43f5e", "#f43f5e"])
    expect(val("accent2")).toEqual(["#c2410c", "#f97316"])
    expect(val("warning")).toEqual(val("foreground"))
  })

  // Charts carry hues, and never as text-on-fill.
  it("carries the bounded data-visualisation palette with no foreground pair", () => {
    expect(tokensCss).toMatch(/--chart-1:\s*#/)
    expect(tokensCss).not.toContain("--chart-1-foreground")
  })

  it("gives the non-fill semantics no foreground pair", () => {
    expect(tokensCss).not.toContain("--success-foreground")
    expect(tokensCss).not.toContain("--warning-foreground")
  })

  it("has retired the prior brand palettes (emerald-700 #047857 was adopted again on 2026-10-25)", () => {
    for (const hex of ["#0fb57e", "#065f46", "#d0735a", "#bf5540", "#dd8368"]) {
      expect(tokensCss, `retired brand value ${hex} is still present`).not.toContain(hex)
    }
  })
})
