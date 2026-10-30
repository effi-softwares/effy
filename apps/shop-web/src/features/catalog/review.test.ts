import { describe, expect, it } from "vitest"

import type { ProductDetail } from "./model"
import { isApproved, proposedRows, reviewChip, workingDetail } from "./review"
import { visibilityAction } from "./statusControl"

const live = {
  id: "p1",
  name: "Oat milk",
  brand: "Oatly",
  shortDescription: "One litre",
  longDescription: null,
  status: "active",
  reviewState: "live_change_pending",
  currency: "AUD",
  // One size; its shop price is 4.00, customers pay 4.60.
  options: [],
  variants: [
    {
      id: "v1",
      optionValueIds: [null, null],
      label: null,
      sku: null,
      gtin: null,
      shopPriceAmount: "4.00",
      customerPriceAmount: "4.60",
      state: "active",
    },
  ],
  categoryName: "Plant Milk",
  categoryPath: ["Dairy, Eggs & Fridge", "Plant Milk"],
  storage: "chilled",
  gstStatus: "gst_free",
  ageRestricted: false,
  details: [{ attributeId: "a1", value: { valueIds: ["oat"] } }],
  media: [{ id: "m1" }],
  pendingChange: {
    state: "in_review",
    reason: null,
    submittedAt: "2026-10-04T00:00:00Z",
    proposed: {
      name: "Oat milk barista",
      options: [],
      variants: [{ id: "v1", position: 0, optionValueIds: [null, null], shopPriceAmount: "4.50" }],
      storage: "ambient",
      details: [
        { attributeId: "a1", value: { valueIds: ["oat"] } },
        { attributeId: "a2", value: { number: "12", unit: "g" } },
      ],
    },
    media: null,
  },
} as unknown as ProductDetail

describe("reviewChip", () => {
  it("says nothing for a draft or a live product - the lifecycle chip already does", () => {
    expect(reviewChip("draft")).toBeNull()
    expect(reviewChip("live")).toBeNull()
    expect(reviewChip(undefined)).toBeNull()
  })
  it("names the four states where something is waiting or came back", () => {
    expect(reviewChip("in_review")?.label).toBe("In review")
    expect(reviewChip("sent_back")).toEqual({ label: "Sent back", tone: "warning" })
    expect(reviewChip("live_change_pending")?.label).toBe("Change in review")
    expect(reviewChip("live_change_sent_back")?.tone).toBe("warning")
  })
})

describe("isApproved", () => {
  it("is the review state, not the lifecycle status", () => {
    expect(isApproved({ reviewState: "in_review", status: "draft" })).toBe(false)
    expect(isApproved({ reviewState: "live", status: "unavailable" })).toBe(true)
    expect(isApproved({ reviewState: "live_change_sent_back", status: "active" })).toBe(true)
  })
  it("reads a reply from an older backend the way it behaved: anything past draft was published", () => {
    expect(isApproved({ reviewState: undefined, status: "active" })).toBe(true)
    expect(isApproved({ reviewState: undefined, status: "draft" })).toBe(false)
  })
})

describe("workingDetail", () => {
  it("is the live product itself when nothing is pending", () => {
    const none = { ...live, pendingChange: null } as ProductDetail
    expect(workingDetail(none)).toBe(none)
  })

  it("lays the shop's proposal over the live details, so an editor opens on what the shop last saved", () => {
    const w = workingDetail(live)
    expect(w.name).toBe("Oat milk barista")
    // Untouched details stay live.
    expect(w.brand).toBe("Oatly")
  })

  it("carries the proposed details and facts, including a detail the live product never had", () => {
    const w = workingDetail(live)
    expect(w.details.map((d) => d.attributeId)).toEqual(["a1", "a2"])
    expect(w.storage).toBe("ambient")
    expect(w.gstStatus).toBe("gst_free")
  })

  it("uses the proposed image set only when images are part of the change", () => {
    expect(workingDetail(live).media).toBe(live.media)
    const withMedia = {
      ...live,
      pendingChange: { ...live.pendingChange!, media: [{ id: "c1" }, { id: "c2" }] },
    } as unknown as ProductDetail
    expect(workingDetail(withMedia).media).toHaveLength(2)
  })

  it("does not touch the live detail it was given", () => {
    workingDetail(live)
    expect(live.name).toBe("Oat milk")
  })
})

describe("proposedRows", () => {
  it("lists only what differs, with the SHOP's price on both sides", () => {
    const rows = proposedRows(live)
    expect(rows.map((r) => r.label)).toEqual(["Name", "Price", "Storage", "Details"])
    expect(rows[2]).toEqual({ label: "Storage", now: "Chilled", proposed: "Room temperature" })
    expect(rows[1]).toEqual({ label: "Price", now: "AUD 4.00", proposed: "AUD 4.50" })
  })
  it("never shows the customer price or a margin", () => {
    expect(JSON.stringify(proposedRows(live))).not.toContain("4.60")
  })
  it("names a proposed category by its path when the tree is loaded", () => {
    const moved = {
      ...live,
      pendingChange: { ...live.pendingChange!, proposed: { primaryCategoryId: "c9" } },
    } as ProductDetail
    const tree = [
      {
        id: "c9",
        parentId: "d",
        name: "Oat Milk",
        path: ["Dairy, Eggs & Fridge", "Oat Milk"],
        isLeaf: true,
        synonyms: [],
        icon: null,
      },
    ]
    expect(proposedRows(moved, tree)).toEqual([
      { label: "Category", now: "Dairy, Eggs & Fridge › Plant Milk", proposed: "Dairy, Eggs & Fridge › Oat Milk" },
    ])
    expect(proposedRows(moved)[0]!.proposed).toBe("A different category")
  })
  it("is empty when nothing is pending", () => {
    expect(proposedRows({ ...live, pendingChange: null } as ProductDetail)).toEqual([])
  })
})

describe("visibilityAction (067)", () => {
  it("never offers Publish for a never-approved product", () => {
    for (const s of ["draft", "in_review", "sent_back", undefined] as const) {
      const a = visibilityAction("draft", s)
      expect(a?.kind).not.toBe("status")
      expect(a?.label).not.toMatch(/publish/i)
    }
  })
  it("submits a draft, withdraws one in review, and resubmits one sent back", () => {
    expect(visibilityAction("draft", "draft")).toMatchObject({ kind: "submit", label: "Submit for review" })
    expect(visibilityAction("draft", "in_review")).toMatchObject({ kind: "withdraw", label: "Withdraw" })
    expect(visibilityAction("draft", "sent_back")).toMatchObject({ kind: "submit", label: "Submit again" })
  })
  it("says it is NOT on sale until approved", () => {
    expect(visibilityAction("draft", "draft")?.confirmBody).toMatch(/when it is approved - not before/)
  })
  // Taking a product off sale and putting it back is the shop's own call.
  it("leaves an approved product's on/off sale moves immediate", () => {
    expect(visibilityAction("active", "live_change_pending")).toMatchObject({ kind: "status", target: "unavailable" })
    expect(visibilityAction("unavailable", "live")).toMatchObject({ kind: "status", target: "active" })
    expect(visibilityAction("archived", "live")).toMatchObject({ kind: "status", target: "active" })
  })
})
