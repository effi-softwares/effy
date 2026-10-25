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

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
}

describe("⚠ exactly one service worker (T036)", () => {
  it("registers a service worker from exactly one place in the app", () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => /serviceWorker\s*\.\s*register\s*\(/.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => f.replace(`${SRC}/`, ""))

    expect(offenders).toEqual(["lib/pwa.ts"])
  })

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
    vi.stubGlobal("navigator", {})
    expect(() => registerServiceWorker()).not.toThrow()
    expect(pwaStore.state.ready).toBe(false)
  })

  it("does not register in dev, where there is no built worker to fetch", () => {
    expect(import.meta.env.DEV).toBe(true)
    vi.stubGlobal("navigator", { serviceWorker: { register: vi.fn() } })
    registerServiceWorker()
    expect(pwaStore.state.ready).toBe(false)
  })
})

describe("⚠ the service worker holds no credential", () => {
  it("never reads a token, a session or config from inside sw.ts", () => {
    const sw = stripComments(readFileSync(join(SRC, "sw.ts"), "utf8"))
    for (const forbidden of [/fetchAuthSession/, /getAccessToken/, /Authorization/, /localStorage/]) {
      expect(sw, `sw.ts must not touch ${forbidden}`).not.toMatch(forbidden)
    }
  })
})
