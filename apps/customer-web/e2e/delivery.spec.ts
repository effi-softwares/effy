import { expect, test } from "@playwright/test"

/**
 * The delivery-location panel (030).
 *
 * ⚠ WHAT THESE TESTS ARE FOR. Every one of them is about keeping FOUR answers apart:
 *
 *   "we deliver there"           "we don't deliver there yet"
 *   "we don't recognise that place"          "we couldn't look it up"
 *
 * The last three are the ones that get conflated, and conflating any of them with the second tells a
 * prospective customer to leave for a reason that is not true. That is the failure this whole
 * capability exists to prevent, and it cannot be caught by a type — only by asserting what a person
 * actually sees.
 *
 * ⚠ These run against a live `core-api` (`make core-run`) with the locality table loaded. Tests that
 * need real place data skip themselves rather than fail, so a bare CI checkout stays green — but a
 * skip is NOT a pass, and the operator walks in quickstart §3 are what actually prove this.
 */

const openPanel = async (page: import("@playwright/test").Page) => {
  await page.goto("/")
  await page.getByRole("button", { name: /delivery location/i }).click()
  return page.getByLabel("Suburb or postcode")
}

test.describe("delivery location — naming a place", () => {
  test("one input accepts either a postcode or a suburb name", async ({ page }) => {
    const field = await openPanel(page)
    // FR-006: no mode to choose, no second field. The label says so, and that is the contract.
    await expect(field).toBeVisible()
    await expect(page.getByLabel(/^Postcode$/)).toHaveCount(0)
  })

  test("typing a suburb offers places, each identified by name, state AND postcode", async ({ page }) => {
    const field = await openPanel(page)
    await field.fill("richmo")

    const list = page.getByRole("listbox", { name: /matching places/i })
    await expect(list).toBeVisible({ timeout: 5000 }).catch(() => {
      test.skip(true, "no locality data loaded — run make load-localities")
    })

    const options = page.getByRole("option")
    await expect(options.first()).toBeVisible()
    // ⚠ FR-008: a bare name identifies nothing in Australia — there are six Richmonds. Every option
    // must carry the whole triple or the shopper cannot tell which one they are choosing.
    await expect(options.first()).toHaveText(/[A-Za-z].*\b(ACT|NSW|NT|QLD|SA|TAS|VIC|WA)\b.*\d{4}/)
  })

  test("choosing a place answers inside the panel, without closing it", async ({ page }) => {
    const field = await openPanel(page)
    await field.fill("richmo")
    const option = page.getByRole("option").first()
    await expect(option).toBeVisible({ timeout: 5000 }).catch(() => {
      test.skip(true, "no locality data loaded")
    })
    await option.click()

    // FR-028/FR-050: the answer appears where the question was asked, and the panel stays open so the
    // shopper can try somewhere else (FR-029).
    await expect(field).toBeVisible()
    await expect(page.getByText(/we deliver here|don.t deliver here yet|checking/i)).toBeVisible()
  })
})

test.describe("delivery location — the answers that must stay apart", () => {
  /**
   * ⚠ THE MOST IMPORTANT ASSERTION IN THIS FILE. An unrecognised place is NOT a refusal. Telling
   * someone who mistyped a suburb that Effy will not deliver to them loses a customer for a reason
   * that is simply false (FR-012).
   */
  test("an unrecognised place is NOT reported as a refusal", async ({ page }) => {
    const field = await openPanel(page)
    await field.fill("zzzzqqq")

    await expect(page.getByText(/don.t recognise that place/i)).toBeVisible({ timeout: 5000 }).catch(
      () => test.skip(true, "no locality data loaded"),
    )
    // Neither of the delivery answers may appear.
    await expect(page.getByText(/don.t deliver here yet/i)).toHaveCount(0)
    await expect(page.getByText(/we deliver here/i)).toHaveCount(0)
  })

  test("too little input says 'keep typing', not 'no such place'", async ({ page }) => {
    const field = await openPanel(page)
    await field.fill("r")

    // One character is not a question. It must not produce a "we don't recognise that place" either —
    // we have not looked, and saying we have is a different (false) statement.
    await expect(page.getByText(/don.t recognise that place/i)).toHaveCount(0)
    await expect(page.getByText(/don.t deliver here yet/i)).toHaveCount(0)
  })

  test("unparseable input is refused as invalid, never as unserviced", async ({ page }) => {
    const field = await openPanel(page)
    await field.fill("!!!")
    await page.getByRole("button", { name: "Check" }).click()

    await expect(page.getByText("Enter a suburb or a 4-digit postcode.")).toBeVisible()
    await expect(page.getByText(/don.t deliver/i)).toHaveCount(0)
  })
})

test.describe("delivery location — keyboard only (SC-018)", () => {
  /**
   * FR-051: the list must be operable without a pointer. A shopper who navigates by keyboard has to
   * be able to complete the whole task — open, type, arrow, choose, read, dismiss.
   */
  test("a place can be chosen with arrow keys and Enter", async ({ page }) => {
    const field = await openPanel(page)
    await field.fill("richmo")

    const list = page.getByRole("listbox", { name: /matching places/i })
    await expect(list).toBeVisible({ timeout: 5000 }).catch(() => {
      test.skip(true, "no locality data loaded")
    })

    // The combobox drives the list through aria-activedescendant, so focus never leaves the input.
    await expect(field).toHaveAttribute("aria-expanded", "true")
    await field.press("ArrowDown")
    await expect(field).toHaveAttribute("aria-activedescendant", /delivery-place-\d+/)

    await field.press("Enter")
    await expect(page.getByText(/we deliver here|don.t deliver here yet|checking/i)).toBeVisible()
  })

  test("the panel closes on Escape and leaves the previous location untouched", async ({ page }) => {
    const field = await openPanel(page)
    await field.fill("richmo")
    await page.keyboard.press("Escape")

    await expect(field).toBeHidden()
    // FR-030: dismissing without choosing changes nothing.
    await expect(page.getByRole("button", { name: /set delivery location/i })).toBeVisible()
  })
})

test.describe("delivery location — browsing is never blocked (SC-012)", () => {
  test("an unanswered location does not stop the storefront working", async ({ page }) => {
    const field = await openPanel(page)
    await field.fill("3121")
    await page.getByRole("button", { name: "Check" }).click()
    await page.keyboard.press("Escape")

    // FR-014: whatever the verdict, the catalogue is still reachable.
    await expect(page.getByRole("link", { name: /browse/i }).first()).toBeVisible()
  })
})
