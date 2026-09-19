import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { applyUpdate, getRegistration, pwaStore, registerServiceWorker } from "../pwa"

const SRC = join(__dirname, "..", "..")

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

/** Source with `//` and block comments removed, so a mention in prose is not a match. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

describe("⚠ exactly one service worker (T036)", () => {
  /**
   * The single most valuable assertion in this slice's front end, and the cheapest to lose.
   *
   * The Firebase JS SDK registers its OWN `/firebase-messaging-sw.js` unless `getToken` is handed a
   * registration. Beside the Workbox worker that is two workers competing for one scope, and the
   * documented symptom is THE APP RELOADING ITSELF CONTINUOUSLY after every deploy
   * (vite-plugin-pwa #777) — a failure that appears only in a built, deployed console, never in a
   * test and never in `vite dev`.
   *
   * Nothing else in this repository would catch a second `register()` being added.
   */
  it("registers a service worker from exactly one place in the app", () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => /serviceWorker\s*\.\s*register\s*\(/.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => f.replace(`${SRC}/`, ""))

    expect(offenders).toEqual(["lib/pwa.ts"])
  })

  // ⚠ The other half of this guard — that every `getToken` call is handed OUR registration, so the
  // Firebase SDK never registers `firebase-messaging-sw.js` of its own — lives with the code it
  // guards, in src/features/notifications/__tests__/registration.test.ts. Both halves are needed:
  // this one stops a second `register()` being added, that one stops the SDK adding one for us.

  it("has no firebase-messaging-sw file in the served output", () => {
    const pub = join(SRC, "..", "public")
    expect(readdirSync(pub)).not.toContain("firebase-messaging-sw.js")
  })
})

describe("update handshake (T044, FR-010)", () => {
  beforeEach(() => {
    pwaStore.setState(() => ({ updateReady: false, ready: false }))
    vi.unstubAllGlobals()
  })

  it("does not activate a waiting worker without the operator's action", () => {
    const postMessage = vi.fn()
    // Nothing has accepted the update, so there is no registration to act on.
    applyUpdate()
    expect(postMessage).not.toHaveBeenCalled()
    expect(getRegistration()).toBeNull()
  })

  it("no-ops where service workers are unavailable, rather than throwing", () => {
    // ⚠ A private window, an insecure origin, or an old browser. The console must work exactly as it
    // did before 059 — a failed registration must never be able to take the console down.
    vi.stubGlobal("navigator", {})
    expect(() => registerServiceWorker()).not.toThrow()
    expect(pwaStore.state.ready).toBe(false)
  })

  it("does not register in dev, where there is no built worker to fetch", () => {
    // Registering /sw.js in dev 404s and logs an error on every load, which reads as "PWAs are
    // broken" to whoever next opens the console locally.
    expect(import.meta.env.DEV).toBe(true)
    vi.stubGlobal("navigator", { serviceWorker: { register: vi.fn() } })
    registerServiceWorker()
    expect(pwaStore.state.ready).toBe(false)
  })
})

describe("⚠ the service worker holds no credential", () => {
  it("never reads a token, a session or config from inside sw.ts", () => {
    const sw = stripComments(readFileSync(join(SRC, "sw.ts"), "utf8"))
    // A token placed in a service worker outlives the tab that put it there and survives sign-out,
    // which is the opposite of what signing out means.
    for (const forbidden of [/fetchAuthSession/, /getAccessToken/, /Authorization/, /localStorage/]) {
      expect(sw, `sw.ts must not touch ${forbidden}`).not.toMatch(forbidden)
    }
  })
})
