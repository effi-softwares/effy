import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const SRC = join(__dirname, "..", "..", "..")

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue
      sourceFiles(full, acc)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full)
    }
  }
  return acc
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

describe("⚠ the Firebase SDK never registers a service worker of its own", () => {
  it("passes our own registration to every getToken call", () => {
    const callers = sourceFiles(SRC).filter((f) => /\bgetToken\s*\(/.test(stripComments(readFileSync(f, "utf8"))))

    expect(callers.length).toBeGreaterThan(0)

    for (const f of callers) {
      const src = stripComments(readFileSync(f, "utf8"))
      expect(src, `${f} calls getToken without serviceWorkerRegistration`).toMatch(/serviceWorkerRegistration/)
    }
  })

  it("refuses to obtain a token at all when there is no registration to hand it", () => {
    const src = stripComments(readFileSync(join(SRC, "features/notifications/messaging.ts"), "utf8"))
    expect(src).toMatch(/if\s*\(!registration\)\s*return null/)
  })
})

describe("⚠ Firebase is never statically imported", () => {
  it("only ever reaches firebase through a dynamic import", () => {
    for (const f of sourceFiles(SRC)) {
      const src = stripComments(readFileSync(f, "utf8"))
      const staticImport = /^\s*import\s[^\n]*from\s+["']firebase\//m
      expect(src, `${f} imports firebase statically`).not.toMatch(staticImport)
    }
  })

  it("does import it dynamically, so the capability actually exists", () => {
    const src = stripComments(readFileSync(join(SRC, "features/notifications/messaging.ts"), "utf8"))
    expect(src).toMatch(/import\(["']firebase\/app["']\)/)
    expect(src).toMatch(/import\(["']firebase\/messaging["']\)/)
  })
})

describe("⚠ permission is never requested without a deliberate action (FR-023)", () => {
  it("calls requestPermission from exactly one place, behind an operator action", () => {
    const callers = sourceFiles(SRC)
      .filter((f) => /\brequestPermission\s*\(/.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => f.replace(`${SRC}/`, ""))

    expect(callers.sort()).toEqual([
      "features/notifications/messaging.ts",
      "features/notifications/useNotifications.ts",
    ])
  })

  it("never requests permission from a module body or an effect", () => {
    const hook = stripComments(readFileSync(join(SRC, "features/notifications/useNotifications.ts"), "utf8"))
    const effects = hook.match(/useEffect\([\s\S]*?\n\s{2}\}, \[[^\]]*\]\)/g) ?? []
    for (const e of effects) {
      expect(e, "a useEffect requests notification permission").not.toMatch(/requestPermission/)
    }
  })

  it("does not omit mutedTypes-preserving registration on enable", () => {
    const hook = stripComments(readFileSync(join(SRC, "features/notifications/useNotifications.ts"), "utf8"))
    const call = hook.slice(hook.indexOf("registerDevice({"))
    expect(call.slice(0, 120)).not.toMatch(/mutedTypes/)
  })
})
