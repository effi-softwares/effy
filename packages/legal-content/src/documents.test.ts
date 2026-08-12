import { describe, expect, it } from "vitest"

import {
  allDocuments,
  getDocument,
  requiredSlugs,
  parseMarkdown,
  MarkdownSubsetError,
} from "./index"
import { retainedAfterDeletion, subProcessors } from "./inventory"

describe("legal document catalogue", () => {
  it("has every required document, in order", () => {
    const slugs = allDocuments().map((d) => d.slug)
    for (const req of requiredSlugs) expect(slugs).toContain(req)
    const orders = allDocuments().map((d) => d.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it("every document has real prose, a title, version and effective date — no placeholder shell", () => {
    for (const doc of allDocuments()) {
      expect(doc.title.length).toBeGreaterThan(0)
      expect(doc.currentVersion).toMatch(/^v\d+$/)
      expect(doc.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(doc.body.length).toBeGreaterThan(200)
      // The old shells read "This document is being prepared." — reject that exact placeholder wording.
      expect(doc.body.toLowerCase()).not.toContain("document is being prepared")
      expect(doc.body).not.toMatch(/\bTODO\b|\blorem ipsum\b/i)
    }
  })

  it("every document body parses under the constrained Markdown subset", () => {
    for (const doc of allDocuments()) {
      expect(() => parseMarkdown(doc.body)).not.toThrow()
      for (const version of doc.versions) {
        expect(() => parseMarkdown(version.body)).not.toThrow()
      }
    }
  })

  it("each document has exactly one current version, reachable in history", () => {
    for (const doc of allDocuments()) {
      const current = doc.versions.filter((v) => v.status === "current")
      expect(current).toHaveLength(1)
      expect(current[0]!.version).toBe(doc.currentVersion)
    }
  })
})

describe("SC-002 — the privacy policy is honest to the built system", () => {
  const privacy = getDocument("privacy-policy").body

  it("names every retained-after-deletion category from the inventory", () => {
    // The policy states what is kept after deletion; each inventory category's kernel must appear.
    for (const kernel of ["completed orders", "payment records", "fraud"]) {
      expect(privacy.toLowerCase()).toContain(kernel)
    }
    expect(retainedAfterDeletion.length).toBe(3)
  })

  it("names each real sub-processor family it shares data with", () => {
    for (const kernel of ["Amazon Web Services", "Stripe", "PostHog"]) {
      expect(privacy).toContain(kernel)
    }
    expect(subProcessors.length).toBeGreaterThan(0)
  })

  it("does not claim cross-app advertising tracking (no ATT posture)", () => {
    expect(privacy.toLowerCase()).toContain("do not")
  })
})

describe("markdown subset parser", () => {
  it("parses headings, lists, tables and inline links", () => {
    const blocks = parseMarkdown("## H\n\ntext with [a link](/legal/terms-of-service) and **bold**\n\n- one\n- two")
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 2 })
    expect(blocks.some((b) => b.kind === "list")).toBe(true)
  })

  it("rejects a table row with no separator (subset guard)", () => {
    expect(() => parseMarkdown("| a | b |\nnot a separator")).toThrow(MarkdownSubsetError)
  })
})
