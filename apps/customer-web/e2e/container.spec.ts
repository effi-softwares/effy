import { expect, test } from "@playwright/test"

/**
 * The content column — one `@utility container` in `app/globals.css`, used by every section, layout
 * and page on this surface (it replaced the string `mx-auto w-full max-w-7xl px-4 sm:px-6`, which was
 * written out in twenty-four places).
 *
 * ⚠ WHY THIS NEEDS A TEST AT ALL. Tailwind v4 still emits its own `.container` breakpoint rules
 * (40rem…96rem, no centring, no padding) alongside the override, and the override wins on SOURCE
 * ORDER rather than specificity. If that order ever flipped — a Tailwind upgrade, a change to where
 * the utility is declared — nothing would break: every page would just get wider and lose its
 * gutter, which is indistinguishable from a design decision. Nobody would file a bug against it.
 *
 * So this asserts the computed values, in a real browser, at the widths where each rule would take
 * over. A unit test cannot do this: the cascade is the thing under test.
 *
 * The numbers are the ones the storefront was built against, not new ones. 1280px is the old
 * `max-w-7xl`, and `productGrid`'s column counts were chosen from the card width they produce inside
 * it — so a wider column silently re-tunes every listing on the store.
 */

const CAP = 1280 // 80rem — the old `max-w-7xl`
const GUTTER_SM = 24 // sm:px-6
const GUTTER_BASE = 16 // px-4

/** Each width sits inside a different stock-container breakpoint, so each one is a distinct chance
 *  for the wrong rule to win. 1920 is the important one: it is where Tailwind's own 96rem rule is
 *  live and would widen the page by 256px. */
const WIDTHS = [
  { width: 1920, expectWidth: CAP, expectPad: GUTTER_SM },
  { width: 1536, expectWidth: CAP, expectPad: GUTTER_SM },
  { width: 1280, expectWidth: CAP, expectPad: GUTTER_SM },
  { width: 1024, expectWidth: 1024, expectPad: GUTTER_SM },
  { width: 640, expectWidth: 640, expectPad: GUTTER_SM },
  { width: 390, expectWidth: 390, expectPad: GUTTER_BASE },
] as const

test.describe("the content column is capped, centred and guttered at every width", () => {
  for (const { width, expectWidth, expectPad } of WIDTHS) {
    test(`${width}px — ${expectWidth}px wide, ${expectPad}px gutter`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto("/")

      const box = await page.locator(".container").first().evaluate((el) => {
        const cs = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return {
          maxWidth: cs.maxWidth,
          padLeft: cs.paddingLeft,
          padRight: cs.paddingRight,
          width: Math.round(rect.width),
          left: Math.round(rect.left),
        }
      })

      // The cap itself — this is the assertion Tailwind's 96rem rule would break.
      expect(box.maxWidth).toBe(`${CAP}px`)
      expect(box.width).toBe(expectWidth)
      expect(box.padLeft).toBe(`${expectPad}px`)
      expect(box.padRight).toBe(`${expectPad}px`)

      // Centred: equal space either side. The stock utility sets no margin at all, so a
      // left-aligned column is the other half of the same failure.
      expect(box.left).toBe(Math.round((width - expectWidth) / 2))
    })
  }
})
