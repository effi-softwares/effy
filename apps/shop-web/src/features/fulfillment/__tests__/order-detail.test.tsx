import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * US2 / FR-012 + FR-013 (T023) — the shop console must offer NO action the platform cannot perform.
 *
 * ⚠ WHY THIS IS A SOURCE GUARD AND NOT ONLY A RENDER TEST. A render assertion proves that today's
 * fixture happens not to show a "Capture payment" button; it proves nothing about the button someone
 * adds next month. The imported mockup this redesign is built from is a GENERIC e-commerce console —
 * it ships `isCapture`, `isFulfil`, `hasShipments`/`shipRows`, `isEditLines` and `isReturn` screens,
 * all of which look perfectly reasonable to port and none of which Effy can honour:
 *
 *   • PAYMENT CAPTURE — Effy captures at payment (`CaptureMethod: automatic`, 055 R3). There is no
 *     later capture step to expose, and a button implying one would suggest money is being held.
 *   • CARRIER / TRACKING — a shop hands its portion to an Effy driver at collection (049's
 *     hub-and-spoke). The shop never books a carrier and never sees a tracking number; 053 settled
 *     that references are per-package and are deliberately staff-only (FR-022).
 *   • ORDER-LINE EDITING / DUPLICATION — an order is a paid financial record. 055 is explicit that
 *     `order_item` and `payment` are untouched by a refund: "the receipt is a historical record of
 *     what was charged; a refund is a later row, never an edit."
 *
 * Each of those is a control that would either lie to the operator or corrupt a paid record. So the
 * guard reads the source and fails NAMING the file, the way `guard_test.go` (054) and
 * `storefront-locks` (039) do.
 */

const FULFILLMENT_DIR = resolve(__dirname, "..")

/**
 * ⚠ COMMENTS ARE STRIPPED BEFORE SCANNING. Prose must stay free to explain WHY these controls are
 * banned — including this file's own docblock and OrderDetailScreen's — while the code itself is held
 * strictly. A guard that fires on its own justification gets deleted by the next person, and takes the
 * requirement with it. (theme-tokens.test.ts strips comments for the same reason.)
 *
 * ⚠ AND THE PATTERNS ARE WORD-BOUNDED PHRASES, NOT DELIMITER-ANCHORED ONES. The first draft of this
 * guard required a quote or `<` immediately after the phrase, and the negative proof exposed it: a
 * button reading `<RotateCcw />Capture payment` — the exact shape a real regression takes — was
 * followed by a newline and sailed straight through. 056 records the identical near-miss ("the break
 * was NOT caught and the guard had to be fixed"). Every pattern below was re-verified by breaking it.
 */
const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: "payment capture", pattern: /\bcapture\s+(payment|funds)\b|\bpayment\s+capture\b/i },
  { label: "carrier selection", pattern: /\b(select|choose|book|assign)\s+(a\s+)?carrier\b/i },
  { label: "tracking number", pattern: /\b(tracking\s+(number|code|id)|add\s+tracking)\b/i },
  { label: "shipment creation", pattern: /\b(create|new)\s+shipment\b|\bmark\s+as\s+shipped\b/i },
  { label: "order-line editing", pattern: /\bedit\s+(lines|items)\b|\b(add|remove)\s+(a\s+)?line\b/i },
  { label: "order duplication", pattern: /\b(duplicate|copy)\s+order\b|\breorder\s+this\b/i },
]

/** Strip block and line comments so prose can explain the ban without tripping it. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue
      out.push(...sourceFiles(path))
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path)
    }
  }
  return out
}

describe("the shop console offers no action the platform cannot perform", () => {
  const files = sourceFiles(FULFILLMENT_DIR)

  it("finds the fulfillment sources to scan (a guard over nothing proves nothing)", () => {
    // ⚠ 054's `TestRailsCarryOnlyAvailableProducts` passed VACUOUSLY once its rails emptied. If this
    // directory is ever moved, the loop below would silently assert nothing — so assert the corpus.
    expect(files.length).toBeGreaterThan(5)
  })

  for (const { label, pattern } of FORBIDDEN) {
    it(`offers no ${label} control`, () => {
      const offenders = files.filter((f) => pattern.test(code(f)))
      expect(
        offenders,
        `${label} is not something Effy's model supports — see this file's docblock`,
      ).toEqual([])
    })
  }

  /**
   * The other half of the same rule, stated positively: the backend's projection does not SELECT an
   * order-level total, a payment status, or another shop's lines (020 FR-007/FR-008, SC-007), so the
   * omission is structural rather than a rendering choice. This pins that the client never asks.
   *
   * ⚠ THE FIRST DRAFT OF THIS ASSERTION BANNED THE BARE WORD `amount`, AND IT WAS WRONG. 057 added
   * `issueShopRefund`, whose response legitimately carries the refund's own amount — the figure the
   * operator must be shown after refunding. A guard that cannot tell "this order was charged $84" from
   * "this refund returned $12" fails on correct code, and the next person deletes it. The vocabulary
   * below is order-level money and shop identity, which are the two things that must never appear.
   */
  it("never asks the backend for order-level money or another shop's identity", () => {
    const repo = code(join(FULFILLMENT_DIR, "repo.ts"))
    for (const banned of [
      /\border(_|\s*)?total\b/i,
      /\bgrand(_|\s*)?total\b/i,
      /\bpayment(_|\s*)?(status|intent|method)\b/i,
      /\bshop_?[iI]d\b/,
    ]) {
      expect(repo, `repo.ts must not mention ${banned}`).not.toMatch(banned)
    }
  })
})
