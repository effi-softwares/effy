import { describe, expect, it } from "vitest"

import { APP_LINK_PATHS } from "@effy/shared-types"

import { appleAssociation, assetLinks, wellKnown } from "./app-links"

const FP = Array.from({ length: 32 }, () => "AB").join(":")

describe("116 - the website says which app may open its links", () => {
  it("publishes nothing until the operator supplies an identity", async () => {
    for (const v of [undefined, "", " ", "not-a-fingerprint"]) expect(assetLinks(v)).toBeNull()
    for (const v of [undefined, "", "off", "abc.com.effy"]) expect(appleAssociation(v)).toBeNull()
    expect(wellKnown(null).status).toBe(404)
  })

  it("Android: the customer app's package and every valid fingerprint", () => {
    expect(assetLinks(`${FP}, junk`)).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "com.effyshopping.customer.mobile", sha256_cert_fingerprints: [FP] },
      },
    ])
  })

  it("Apple: only the claimed paths - never unsubscribe, help or sign-in", () => {
    const a = appleAssociation("AB12CD34EF.com.effyshopping.customer.mobile")!
    const paths = a.applinks.details[0]!.components.map((c) => c["/"])
    expect(paths).toEqual(APP_LINK_PATHS.map((p) => (p.prefix ? `${p.path}*` : p.path)))
    expect(paths.some((p) => /email|help|legal|sign|account$/.test(p))).toBe(false)
    expect(a.applinks.details[0]!.appIDs).toEqual(["AB12CD34EF.com.effyshopping.customer.mobile"])
  })

  it("is served as JSON with no redirect", async () => {
    const res = wellKnown({ a: 1 })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/json")
    expect(await res.json()).toEqual({ a: 1 })
  })
})
