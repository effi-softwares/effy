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

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

describe("⚠ the Firebase SDK never registers a service worker of its own", () => {
  /**
   * The other half of the single-service-worker guard (`lib/__tests__/pwa.test.ts` holds the first).
   *
   * `getToken` WITHOUT `serviceWorkerRegistration` makes the SDK register its own
   * `/firebase-messaging-sw.js`. Beside the Workbox worker that is two workers competing for one
   * scope, and the documented symptom is THE APP RELOADING ITSELF CONTINUOUSLY after every deploy
   * (vite-plugin-pwa #777) — a failure that appears only in a built, deployed console. Never in a
   * test, never in `vite dev`, never in a typecheck.
   */
  it("passes our own registration to every getToken call", () => {
    const callers = sourceFiles(SRC).filter((f) => /\bgetToken\s*\(/.test(stripComments(readFileSync(f, "utf8"))))

    // ⚠ Guards the guard: if `getToken` is ever renamed or moved, a zero-caller sweep would pass
    // vacuously and prove nothing. 054 found exactly that shape in `TestRailsCarryOnlyAvailable
    // Products`, which passed once the rails emptied.
    expect(callers.length).toBeGreaterThan(0)

    for (const f of callers) {
      const src = stripComments(readFileSync(f, "utf8"))
      expect(src, `${f} calls getToken without serviceWorkerRegistration`).toMatch(
        /serviceWorkerRegistration/,
      )
    }
  })

  it("refuses to obtain a token at all when there is no registration to hand it", () => {
    // ⚠ The code must NOT fall through and let the SDK make its own registration — which is exactly
    // what happens if the argument is simply omitted when ours is null.
    const src = stripComments(readFileSync(join(SRC, "features/notifications/messaging.ts"), "utf8"))
    expect(src).toMatch(/if\s*\(!registration\)\s*return null/)
  })
})

describe("⚠ Firebase is never statically imported", () => {
  it("only ever reaches firebase through a dynamic import", () => {
    // A static import puts `firebase/app` + `firebase/messaging` in the entry chunk, where every
    // operator downloads them on every cold load — including the ones who never turn notifications
    // on, for whom SC-012 promises no change at all. The one screen an operator waits on is sign-in.
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

    // ⚠ There is ONE permission prompt per browser per lifetime, and a denial is NOT recoverable
    // in-app on any browser — after it, nothing this slice builds can reach that operator again.
    // Spending it on load, or from a second unguarded place, costs it permanently.
    expect(callers.sort()).toEqual([
      "features/notifications/messaging.ts",
      "features/notifications/useNotifications.ts",
    ])
  })

  it("never requests permission from a module body or an effect", () => {
    const hook = stripComments(
      readFileSync(join(SRC, "features/notifications/useNotifications.ts"), "utf8"),
    )
    // The call must sit inside `enable`, the callback a button invokes — not inside any useEffect.
    const effects = hook.match(/useEffect\([\s\S]*?\n\s{2}\}, \[[^\]]*\]\)/g) ?? []
    for (const e of effects) {
      expect(e, "a useEffect requests notification permission").not.toMatch(/requestPermission/)
    }
  })

  it("does not omit mutedTypes-preserving registration on enable", () => {
    // ⚠ Sending `mutedTypes: []` here would clear the operator's choices every time they re-enabled
    // notifications, and the console re-registers on launch. Omitting the key preserves them.
    const hook = stripComments(
      readFileSync(join(SRC, "features/notifications/useNotifications.ts"), "utf8"),
    )
    const call = hook.slice(hook.indexOf("registerDevice({"))
    expect(call.slice(0, 120)).not.toMatch(/mutedTypes/)
  })
})
