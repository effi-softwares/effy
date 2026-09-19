import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dismissInstall, installStore, isIosSafari, isStandalone, watchInstallability } from "../install"

const DISMISSED_KEY = "effy-shop.install-dismissed"

function stubUA(userAgent: string, maxTouchPoints = 0) {
  vi.stubGlobal("navigator", { userAgent, maxTouchPoints })
}

function stubDisplayMode(standalone: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: standalone && q.includes("standalone"),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (q: string) => ({ matches: standalone && q.includes("standalone"), media: q }),
  })
}

beforeEach(() => {
  localStorage.clear()
  installStore.setState(() => ({ method: "none", installed: false }))
  stubDisplayMode(false)
})
afterEach(() => vi.unstubAllGlobals())

describe("⚠ iPad detection (T043) — the device this audience actually uses", () => {
  it("recognises an iPad that reports itself as a Mac", () => {
    // ⚠ THE DEFECT THIS PREVENTS. iPadOS 13+ sends a Macintosh user-agent. A check that only looks
    // for /iPad|iPhone/ therefore treats every shop iPad as a desktop, shows no install
    // instructions — and on iPadOS the Push API exists ONLY for a home-screen app, so the operator
    // can never even be asked for notification permission. The whole of US1 would be unreachable on
    // the primary device, with nothing failing anywhere.
    stubUA(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      5,
    )
    expect(isIosSafari()).toBe(true)
  })

  it("does not mistake a real Mac for an iPad", () => {
    stubUA(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      0,
    )
    expect(isIosSafari()).toBe(false)
  })

  it("recognises an iPhone", () => {
    stubUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1")
    expect(isIosSafari()).toBe(true)
  })

  it("excludes Chrome and Firefox on iOS, which cannot add to the home screen", () => {
    stubUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120.0 Mobile Safari/604.1")
    expect(isIosSafari()).toBe(false)
    stubUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) FxiOS/120.0 Mobile Safari/604.1")
    expect(isIosSafari()).toBe(false)
  })

  it("is false on Android Chrome, which gets the real prompt instead", () => {
    stubUA("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36", 5)
    expect(isIosSafari()).toBe(false)
  })
})

describe("standalone detection", () => {
  it("uses Safari's own non-standard flag as well as display-mode", () => {
    // ⚠ `navigator.standalone` is the only reliable signal on older iOS. Checking display-mode alone
    // makes an installed iPad look uninstalled, so the console keeps telling an operator to install
    // something they are already using.
    stubDisplayMode(false)
    vi.stubGlobal("navigator", { userAgent: "iPad", maxTouchPoints: 5, standalone: true })
    expect(isStandalone()).toBe(true)
  })

  it("is false in an ordinary tab", () => {
    stubDisplayMode(false)
    stubUA("Mozilla/5.0 (iPad)")
    expect(isStandalone()).toBe(false)
  })
})

describe("dismissal is remembered (FR-006 — not nagged on every visit)", () => {
  it("hides the affordance and persists the choice", () => {
    installStore.setState(() => ({ method: "ios-manual", installed: false }))
    dismissInstall()
    expect(installStore.state.method).toBe("none")
    expect(localStorage.getItem(DISMISSED_KEY)).toBe("1")
  })

  it("stays hidden on the next visit", () => {
    localStorage.setItem(DISMISSED_KEY, "1")
    stubUA("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Version/17.0 Safari/604.1", 5)
    watchInstallability()
    expect(installStore.state.method).toBe("none")
  })

  it("survives blocked storage instead of throwing", () => {
    // A private window, or site data blocked. The affordance is a courtesy; a thrown read must
    // never be able to take the console down with it.
    const orig = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error("blocked")
    }
    stubUA("Mozilla/5.0 (iPad)", 5)
    expect(() => watchInstallability()).not.toThrow()
    Storage.prototype.getItem = orig
  })
})

describe("nothing is offered once installed", () => {
  it("shows no affordance in standalone mode", () => {
    stubDisplayMode(true)
    stubUA("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Version/17.0 Safari/604.1", 5)
    watchInstallability()
    expect(installStore.state.method).toBe("none")
    expect(installStore.state.installed).toBe(true)
  })
})
