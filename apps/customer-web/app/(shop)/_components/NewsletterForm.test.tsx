import { readFileSync } from "node:fs"
import { join } from "node:path"

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("../newsletter/actions", () => ({
  subscribeToNewsletter: vi.fn(async () => ({ status: "ok" as const })),
}))

const { NEWSLETTER_MESSAGES, NewsletterForm } = await import("./NewsletterForm")

describe("NewsletterForm — validation before any request (FR-030)", () => {
  it("uses the browser's own email validation, which costs nothing and needs no round trip", () => {
    render(<NewsletterForm />)

    const field = screen.getByLabelText(/email address/i)
    expect(field.getAttribute("type")).toBe("email")
    expect(field.hasAttribute("required")).toBe(true)
  })

  /** ⚠ `noValidate` would disable exactly the check FR-030 asks for. */
  it("does not disable native validation on the form", () => {
    const { container } = render(<NewsletterForm />)

    expect(container.querySelector("form")!.hasAttribute("noValidate")).toBe(false)
  })

  it("posts a real form, so it still works with JavaScript disabled", () => {
    const { container } = render(<NewsletterForm />)

    expect(container.querySelector("form")).not.toBeNull()
    expect(container.querySelector('button[type="submit"]')).not.toBeNull()
  })

  it("labels the field for assistive technology", () => {
    render(<NewsletterForm />)

    expect(screen.getByLabelText(/email address/i)).toBeTruthy()
  })
})

describe("NewsletterForm — no unbacked claim (FR-034)", () => {
  /**
   * ⚠ The reference storefront's newsletter band promises "Get 20% Off On Your First Purchase". Effy
   * has no such promotion. An incentive claim on a signup form is a contract with the reader.
   */
  it("promises no discount or incentive", () => {
    const { container } = render(<NewsletterForm />)
    const text = (container.textContent ?? "").toLowerCase()

    expect(text).not.toMatch(/\d+\s*%/)
    expect(text).not.toMatch(/\bdiscount\b|\bvoucher\b|\bcoupon\b|\bfree (delivery|shipping)\b/)
  })
})

/**
 * ⚠ THREE STATES, NOT FOUR — and the fourth is the one that matters. An "already subscribed" message
 * would rebuild in the UI exactly the subscriber-enumeration oracle FR-032 removes from the API: type
 * an address, read the response, learn whether that person is on the list.
 *
 * The messages are asserted against the SOURCE rather than by driving `useActionState` through a real
 * submission, which in jsdom would exercise React's action plumbing rather than this component's
 * decisions. What is being pinned here is the set of things it can say.
 */
describe("NewsletterForm — the states it can render (FR-032/FR-033)", () => {
  it("has wording for exactly the three statuses the contract defines", () => {
    expect(Object.keys(NEWSLETTER_MESSAGES).sort()).toEqual(["error", "invalid", "ok"])
  })

  /**
   * ⚠ THE STATE THAT MUST NOT EXIST. An "already subscribed" message would rebuild in the UI exactly
   * the subscriber-enumeration oracle FR-032 removes from the API: type an address, read the response,
   * learn whether that person is on the list.
   */
  it("says nothing about an address already being on the list", () => {
    const all = Object.values(NEWSLETTER_MESSAGES).join(" ").toLowerCase()

    expect(all).not.toMatch(/already/)
    expect(NEWSLETTER_MESSAGES).not.toHaveProperty("already")
  })

  it("puts the meaning of each state in words, not in colour (SC-009)", () => {
    expect(NEWSLETTER_MESSAGES.ok).toMatch(/check your inbox/i)
    expect(NEWSLETTER_MESSAGES.invalid).toMatch(/email address/i)
    expect(NEWSLETTER_MESSAGES.error).toMatch(/try again/i)
  })

  /** ⚠ The failure message must not imply the address was at fault — the service was. */
  it("blames the failure on us, not on the visitor's address", () => {
    expect(NEWSLETTER_MESSAGES.error.toLowerCase()).toMatch(/we (couldn't|could not)/)
    expect(NEWSLETTER_MESSAGES.error.toLowerCase()).toContain("still here")
  })
})

/**
 * ⚠ These two ARE source assertions, deliberately — they pin structural choices that have no
 * observable output in jsdom. Comments are stripped first, because the first version of this suite
 * failed on its own explanatory prose, which is a fair warning about grepping source at all.
 */
describe("NewsletterForm — structural guarantees", () => {
  const code = readFileSync(join(__dirname, "NewsletterForm.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

  /**
   * FR-033 — the requirement that forced the client boundary in the first place.
   *
   * ⚠ THE FIELD MUST BE CONTROLLED. React resets an UNCONTROLLED form automatically once its action
   * completes, so the first implementation — uncontrolled, cleared only on success — actually cleared
   * it on every outcome, including the failure whose whole point is that the address survives. Nothing
   * in the source hinted at it, because the reset is React's behaviour rather than this component's.
   */
  it("holds the field value in state, so React's form reset cannot clear it", () => {
    expect(code).toMatch(/value=\{email\}/)
    expect(code).toMatch(/onChange=\{\(e\) => setEmail\(e\.target\.value\)\}/)
    expect(code).not.toMatch(/defaultValue=/)
  })

  it("clears the field ONLY on success", () => {
    expect(code).toMatch(/if \(state\?\.status === "ok"\) setEmail\(""\)/)
  })

  it("announces the outcome to a screen reader rather than only showing it", () => {
    expect(code).toContain('role="status"')
  })
})
