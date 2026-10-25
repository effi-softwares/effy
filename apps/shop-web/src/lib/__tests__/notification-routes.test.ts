import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const COPY_SRC = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "apis",
  "edge-api",
  "notifications",
  "src",
  "worker",
  "copy.ts",
)
const ROUTES_DIR = join(__dirname, "..", "..", "routes")

function declaredDestinations(): Array<{ webPath: string; group: string }> {
  const src = readFileSync(COPY_SRC, "utf8")
  const entries: Array<{ webPath: string; group: string }> = []
  const re = /webPath:\s*"([^"]+)"[\s\S]{0,200}?group:\s*"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) entries.push({ webPath: m[1]!, group: m[2]! })
  return entries
}

function declaredRouteRoots(): Set<string> {
  const roots = new Set<string>()
  for (const f of readdirSync(ROUTES_DIR)) {
    if (!f.endsWith(".tsx") || f.startsWith("__")) continue
    const root = f.replace(/\.tsx$/, "").split(".")[0]!
    roots.add(root)
  }
  return roots
}

describe("⚠ P3 — no shop notification opens a 404", () => {
  it("found the copy catalogue and parsed destinations from it", () => {
    const all = declaredDestinations()
    expect(all.length).toBeGreaterThanOrEqual(10)
    expect(all.some((d) => d.group === "orders")).toBe(true)
    expect(all.some((d) => d.group === "attention")).toBe(true)
  })

  it("every shop destination is a route this console declares", () => {
    const roots = declaredRouteRoots()
    const shop = declaredDestinations().filter((d) => d.group === "orders" || d.group === "attention")

    expect(shop.length).toBeGreaterThan(0)
    for (const { webPath, group } of shop) {
      expect(webPath.startsWith("/"), `${webPath} must be an absolute path`).toBe(true)
      const root = webPath.split("/")[1] ?? ""
      expect(roots.has(root), `${group}: "${webPath}" has no route file for "${root}"`).toBe(true)
    }
  })

  it("does not claim other surfaces' routes as its own", () => {
    const roots = declaredRouteRoots()
    expect(roots.has("runs")).toBe(false)
  })
})
