import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const here = dirname(fileURLToPath(import.meta.url))

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry) || entry.includes(".test.")) continue
    out.push(full)
  }
  return out
}

const FILES = sourceFiles(resolve(here)).map((path) => ({
  path: path.slice(path.indexOf("features/drivers")),
  source: readFileSync(path, "utf8"),
}))

describe("driver console — Principle V, no exception claimed", () => {
  it("has source files to check (a passing-because-empty test proves nothing)", () => {
    expect(FILES.length).toBeGreaterThan(10)
  })

  it("imports no Card primitive anywhere", () => {
    for (const { path, source } of FILES) {
      expect(source, `${path} imports a Card primitive`).not.toMatch(
        /\b(Card|CardHeader|CardContent|CardFooter|CardTitle|CardDescription)\b/,
      )
    }
  })

  it("introduces no colour outside the design-system tokens", () => {
    for (const { path, source } of FILES) {
      expect(source, `${path} contains a raw hex colour`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(source, `${path} uses a Tailwind palette hue`).not.toMatch(
        /\b(?:text|bg|border|ring)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
      )
    }
  })

  it("⚠ shows no currency — the driver domain has never carried money (FR-049)", () => {
    for (const { path, source } of FILES) {
      expect(source, `${path} formats currency`).not.toMatch(/style:\s*["']currency["']/)
      expect(source, `${path} references a money field`).not.toMatch(/\b(grandTotal|subtotal|amountCents|currency)\b/)
    }
  })

  it("⚠ never renders a driver's contact details in a LIST view (FR-050)", () => {
    for (const { path, source } of FILES) {
      if (!/List|Panel/.test(path) || /ProfileEditForm/.test(path)) continue
      expect(source, `${path} renders a contact detail in a list view`).not.toMatch(
        /\b(contactPhone|emergencyContact)\b/,
      )
    }
  })
})
