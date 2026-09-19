import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { clientToFocus, parsePush, planNotification, safePath, shouldSuppress } from "../sw-logic"

const SW = readFileSync(join(__dirname, "..", "..", "sw.ts"), "utf8")
/** Source with comments removed, so a mention in prose is not a match. */
const SW_CODE = SW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const ORDER = {
  type: "shop_new_order",
  entityId: "f-1",
  webPath: "/orders/f-1",
  title: "New order to pick",
  body: "A new order needs picking.",
  tag: "shop-new-order",
  group: "orders",
}

describe("⚠ P5 — a malformed payload still produces something showable (FR-029)", () => {
  /**
   * iOS REVOKES notification permission from a service worker that receives a push and displays
   * nothing. So a parse failure would not cost one notification — it would cost that device EVERY
   * FUTURE notification, permanently, with nothing reported anywhere.
   */
  it.each([null, undefined, 42, "a string", [], { type: 1, webPath: {} }])(
    "never throws and always yields a title for %p",
    (raw) => {
      const d = parsePush(raw)
      expect(d.title.length).toBeGreaterThan(0)
      expect(d.body.length).toBeGreaterThan(0)
      expect(d.tag.length).toBeGreaterThan(0)
    },
  )

  it("keeps the fields it CAN read from a partial payload", () => {
    const d = parsePush({ type: "shop_low_stock", title: "Below reorder point" })
    expect(d.type).toBe("shop_low_stock")
    expect(d.title).toBe("Below reorder point")
    expect(d.webPath).toBe("/") // absent → the safe default, not "undefined"
  })

  it("the push handler wraps everything in waitUntil and cannot fall through silent", () => {
    // ⚠ Without `waitUntil` the worker may be terminated before showNotification resolves — the
    // same silent permission loss by another route. And a `push` handler with no fallback
    // showNotification is the failure this whole block exists to prevent.
    expect(SW_CODE).toMatch(/addEventListener\("push"[\s\S]{0,200}event\.waitUntil/)
    const pushBlock = SW_CODE.slice(SW_CODE.indexOf('addEventListener("push"'))
    const shows = pushBlock.slice(0, pushBlock.indexOf('addEventListener("notificationclick"'))
    expect(shows.match(/showNotification/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})

describe("⚠ same-origin only — a notification click is not an open redirect", () => {
  it.each([
    ["https://evil.test/x", "/"],
    ["//evil.test/x", "/"],
    ["javascript:alert(1)", "/"],
    ["orders", "/"],
    ["/orders/f-1", "/orders/f-1"],
  ])("%s → %s", (input, expected) => {
    expect(safePath(input)).toBe(expected)
  })

  it("sanitises webPath as it is parsed, not at the click", () => {
    // `webPath` arrives over the network. Sanitising at the click would leave a window in which a
    // hostile payload is stored in the notification's own `data`.
    expect(parsePush({ ...ORDER, webPath: "//evil.test" }).webPath).toBe("/")
  })
})

describe("⚠ P6/P7 — suppression is by VISIBILITY, not by a client existing (FR-030)", () => {
  it("stays silent when a VISIBLE client is already on the destination", () => {
    expect(
      shouldSuppress(ORDER, [
        { url: "https://shop.dev.effyshopping.com/orders/f-1", visibilityState: "visible" },
      ]),
    ).toBe(true)
  })

  it("⚠ STILL NOTIFIES when the client is in a BACKGROUND tab", () => {
    // A console open in a background tab, or on a tablet locked in a drawer, is not an operator
    // looking at it. Suppressing here means the order is never announced to anyone at all.
    expect(
      shouldSuppress(ORDER, [
        { url: "https://shop.dev.effyshopping.com/orders/f-1", visibilityState: "hidden" },
      ]),
    ).toBe(false)
  })

  it("notifies when a visible client is on a DIFFERENT screen", () => {
    expect(
      shouldSuppress(ORDER, [
        { url: "https://shop.dev.effyshopping.com/catalog", visibilityState: "visible" },
      ]),
    ).toBe(false)
  })

  it("treats a child route as the same destination", () => {
    const list = { ...ORDER, webPath: "/orders" }
    expect(
      shouldSuppress(list, [
        { url: "https://shop.dev.effyshopping.com/orders/f-9", visibilityState: "visible" },
      ]),
    ).toBe(true)
  })

  it("does not confuse a prefix that is not a path segment", () => {
    const list = { ...ORDER, webPath: "/orders" }
    expect(
      shouldSuppress(list, [
        { url: "https://shop.dev.effyshopping.com/orders-archive", visibilityState: "visible" },
      ]),
    ).toBe(false)
  })

  it("notifies when there are no clients at all — the case this feature exists for", () => {
    expect(shouldSuppress(ORDER, [])).toBe(false)
  })
})

describe("⚠ P8 — twenty orders in a minute are one banner that says twenty (FR-020, SC-005)", () => {
  it("counts up rather than repeating 'New order to pick'", () => {
    expect(planNotification(ORDER, 0).title).toBe("New order to pick")
    expect(planNotification(ORDER, 1).title).toBe("2 new orders to pick")
    expect(planNotification(ORDER, 19).title).toBe("20 new orders to pick")
  })

  it("sends the collapsed banner to the LIST, not to one arbitrary order", () => {
    // Taking the operator to one of twenty is arbitrary, and hides the other nineteen.
    expect(planNotification(ORDER, 5).webPath).toBe("/orders")
    expect(planNotification(ORDER, 0).webPath).toBe("/orders/f-1")
  })

  it("collapses attention separately from orders", () => {
    const attn = { ...ORDER, group: "attention", tag: "shop-attention" }
    expect(planNotification(attn, 2).title).toBe("3 things need attention")
    // ⚠ Separate tags, or "3 new orders" and "3 things need attention" overwrite each other's banner.
    expect(planNotification(attn, 2).tag).not.toBe(planNotification(ORDER, 2).tag)
  })

  it("⚠ sets BOTH tag and renotify — each is useless without the other", () => {
    // `tag` alone replaces the banner SILENTLY, so orders two through twenty arrive with no alert
    // at all. `renotify` without `tag` is ignored entirely. Both failures are invisible to a test
    // that only checks the notification was requested.
    expect(SW_CODE).toMatch(/tag:\s*plan\.tag/)
    expect(SW_CODE).toMatch(/renotify:\s*true/)
  })

  it("⚠ stores the count in IndexedDB, not in a module variable", () => {
    // A service worker is terminated between events, often within seconds. An in-memory counter
    // resets between the first order and the second, and every banner reads "1 new order".
    expect(SW_CODE).toMatch(/indexedDB\.open/)
  })
})

describe("⚠ P9/P10 — a click reuses the open console (FR-014)", () => {
  it("prefers a focused window", () => {
    const clients = [
      { url: "https://shop.dev.effyshopping.com/catalog", focused: false },
      { url: "https://shop.dev.effyshopping.com/orders", focused: true },
    ]
    expect(clientToFocus(clients)?.url).toContain("/orders")
  })

  it("takes any window over opening a second one", () => {
    const clients = [{ url: "https://shop.dev.effyshopping.com/catalog", focused: false }]
    expect(clientToFocus(clients)).toBe(clients[0])
  })

  it("returns null when there is genuinely nothing open", () => {
    expect(clientToFocus([])).toBeNull()
  })

  it("⚠ passes includeUncontrolled to matchAll, in BOTH handlers", () => {
    // A window loaded before this worker took control is not controlled by it, and is INVISIBLE to
    // matchAll without the flag — so the worker opens a SECOND console beside the one already open.
    const calls = SW_CODE.match(/matchAll\(\{[^}]*\}\)/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const c of calls) expect(c).toMatch(/includeUncontrolled:\s*true/)
  })

  it("⚠ navigates an existing client by postMessage, never client.navigate()", () => {
    // `client.navigate()` is a full document load: it throws away the Query cache, the scroll
    // position, and whatever the operator was half-way through.
    expect(SW_CODE).toMatch(/postMessage\(\{\s*type:\s*"NAVIGATE"/)
    expect(SW_CODE).not.toMatch(/\.navigate\(/)
  })
})

describe("⚠ the badge is a monochrome asset, not the icon", () => {
  it("uses notification-badge-96.png for badge and the colour icon for icon", () => {
    // Android renders `badge` as a silhouette — every non-transparent pixel becomes white — so a
    // full-colour icon arrives in the status bar as a solid white blob.
    expect(SW_CODE).toMatch(/badge:\s*"\/notification-badge-96\.png"/)
    expect(SW_CODE).toMatch(/icon:\s*"\/web-app-icon-192\.png"/)
  })
})
