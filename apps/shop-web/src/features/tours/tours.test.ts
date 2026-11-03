import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { validateTours } from "@effy/web-kit/tour"

import { SHOP_TOURS } from "./tours"

/**
 * 106 FR-016/FR-017: the tours' words are the spec's Tour Inventory, word for word, within the limits. Change a word
 * in one place and this fails until it is changed in both - the spec stays the reviewable list.
 */

const SPEC = readFileSync(resolve(__dirname, "../../../../../specs/106-guided-tours/spec.md"), "utf8")

/** The inventory's tour codes, as the spec heads them, to the console's tour keys. */
const CODE_TO_KEY: Record<string, string> = {
  W: "welcome",
  T: "today",
  OQ: "orders-queue",
  OT: "orders-table",
  OD: "order",
  C: "catalog",
  N: "product-new",
  P: "product",
  A: "availability",
  I: "insights",
  IS: "insights-sales",
  IP: "insights-products",
  IV: "insights-service",
  TM: "team",
  NS: "settings-notifications",
  PS: "settings-printing",
}

interface SpecStep {
  title: string
  text: string
  shownWhen: string
}

function inventory(): Map<string, SpecStep[]> {
  const out = new Map<string, SpecStep[]>()
  const body = SPEC.slice(SPEC.indexOf("## Tour Inventory"))
  for (const section of body.split(/^### /m).slice(1)) {
    const code = /^([A-Z]+) - /.exec(section)?.[1]
    if (!code) continue
    const steps = section
      .split("\n")
      .filter((line) => /^\| \d+ \|/.test(line))
      .map((line) => {
        const cells = line
          .trim()
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim())
        return { title: cells[2]!, text: cells[3]!, shownWhen: cells[4] ?? "" }
      })
    out.set(code, steps)
  }
  return out
}

const specTours = inventory()

describe("the shop console's tours (106)", () => {
  it("found the spec's inventory (the test must not pass vacuously)", () => {
    expect(specTours.size).toBe(16)
  })

  it("are within the limits: titles ≤ 40, texts ≤ 220, ≤ 12 steps, unique keys", () => {
    expect(validateTours(SHOP_TOURS)).toEqual([])
  })

  it("say exactly what the spec says, step for step", () => {
    for (const tour of SHOP_TOURS) {
      const code = Object.keys(CODE_TO_KEY).find((c) => CODE_TO_KEY[c] === tour.key)
      expect(code, `${tour.key} is not in the spec's inventory`).toBeDefined()
      const spec = specTours.get(code!)!
      expect(
        tour.steps.map((s) => ({ title: s.title, text: s.text, shownWhen: s.shownWhen ?? "" })),
        tour.key,
      ).toEqual(spec)
    }
  })

  it("hide from staff exactly the steps the spec shows to managers", () => {
    for (const tour of SHOP_TOURS) {
      for (const step of tour.steps) {
        expect(Boolean(step.managersOnly), `${tour.key}: ${step.title}`).toBe(
          (step.shownWhen ?? "").startsWith("Manager"),
        )
      }
    }
  })
})
