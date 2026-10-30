import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const raw = readFileSync(resolve(process.cwd(), "../../packages/design-system/src/tokens.css"), "utf8")
const tokensCss = raw.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase()
const stylesCss = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

describe("back-office identity tokens", () => {
  it("is the identity the app imports - and the only one", () => {
    expect(stylesCss).toContain('@import "@effy/design-system/console.css"')
    expect(stylesCss).not.toContain('@import "@effy/design-system/tokens.css"')
    expect(stylesCss).not.toContain("customer-web.css")
  })

  it("fills an action in blue-600 with white type in both appearances, and lifts blue text in dark", () => {
    expect(tokensCss).toMatch(/--primary-fill:\s*#2563eb/)
    expect(tokensCss).toMatch(/--primary:\s*#2563eb/)
    expect(tokensCss).toMatch(/--ring:\s*#2563eb/)
    expect(tokensCss).toMatch(/--primary:\s*#60a5fa/)
    expect(tokensCss.match(/--primary-foreground:\s*#ffffff/g)).toHaveLength(2)
  })

  it("says done in emerald, and keeps the label colour off success and warning", () => {
    expect(tokensCss).toMatch(/--brand-fill:\s*#059669/)
    expect(tokensCss).toMatch(/--success:\s*#047857/)
    expect(tokensCss).toMatch(/--success:\s*#10b981/)
    expect(tokensCss).not.toContain("--success-foreground")
    expect(tokensCss).not.toContain("--warning-foreground")
  })

  it("says a problem in rose: a rose-500 fill, a readable rose for text", () => {
    expect(tokensCss).toMatch(/--destructive-fill:\s*#f43f5e/)
    expect(tokensCss).toMatch(/--destructive:\s*#be123c/)
    expect(tokensCss).toMatch(/--destructive:\s*#fb7185/)
  })

  it("has retired the prior brand palettes (emerald-700 #047857 was adopted again on 2026-10-25)", () => {
    for (const hex of ["#0fb57e", "#065f46", "#d0735a", "#bf5540", "#dd8368", "#69b08b"]) {
      expect(tokensCss, `retired brand value ${hex} is still present`).not.toContain(hex)
    }
  })
})
