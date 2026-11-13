import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MARKETING_CONSENT, MARKETING_EMAIL_CONSENT } from "@effy/legal-content/consent"
import type { NotificationPreferencesDTO } from "@effy/shared-types"

// Every kind records into one mock, so a test reads what was said whatever kind it was said as.
const toast = vi.hoisted(() => {
  const said = vi.fn()
  return Object.assign(said, { success: said, error: said, info: said, warning: said })
})
vi.mock("@effy/design-system/toast", () => ({ toast }))
vi.mock("@/lib/telemetry", () => ({ capture: vi.fn() }))

const { NotificationSettingsForm } = await import("./NotificationSettingsForm")

const PREFS: NotificationPreferencesDTO = {
  categories: [
    { category: "orders", required: false, marketing: false, push: true, email: true, changeable: ["push", "email"] },
    { category: "points", required: false, marketing: false, push: true, email: true, changeable: ["push", "email"] },
    { category: "offers", required: false, marketing: true, push: true, email: false, changeable: ["push", "email"] },
    { category: "news", required: false, marketing: true, push: true, email: false, changeable: ["push", "email"] },
    { category: "important", required: true, marketing: false, push: true, email: true, changeable: [] },
    { category: "support", required: true, marketing: false, push: true, email: true, changeable: [] },
  ],
  consent: { offers: { granted: false, answeredAt: null }, news: { granted: false, answeredAt: null } },
  askForOffers: false,
  wordingVersion: MARKETING_CONSENT.version,
  emailWordingVersion: MARKETING_EMAIL_CONSENT.version,
}

let calls: Array<{ url: string; body: unknown }>
let respond: (body: unknown) => { ok: boolean; status: number; json: () => Promise<unknown> }
beforeEach(() => {
  calls = []
  toast.mockReset()
  respond = () => ({ ok: true, status: 200, json: async () => PREFS })
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, body })
    return respond(body)
  }))
})

describe("notification settings on the website (111 US1)", () => {
  it("shows every category, offers and news off, important and support fixed with the reason", () => {
    render(<NotificationSettingsForm initial={PREFS} />)
    for (const h of ["Order updates", "Points", "Offers", "News", "Important", "Support"]) expect(screen.getByRole("heading", { name: h })).toBeTruthy()
    expect(screen.getByRole("switch", { name: "Hear about offers" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getAllByText("Always on")).toHaveLength(2)
    expect(screen.getAllByText("These can't be turned off.")).toHaveLength(2)
    expect(screen.getByText(MARKETING_CONSENT.footnote)).toBeTruthy()
  })

  it("a switch sends only that change", async () => {
    render(<NotificationSettingsForm initial={PREFS} />)
    const orderSwitches = screen.getAllByRole("switch", { name: "App notifications" })
    await userEvent.click(orderSwitches[0]!)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual({ url: "/api/notification-preferences", body: { changes: [{ category: "orders", channel: "push", enabled: false }] } })
  })

  it("turning offers on is a yes in Effy's current words, and shows its app switch", async () => {
    respond = () => ({ ok: true, status: 200, json: async () => ({ ...PREFS, consent: { ...PREFS.consent, offers: { granted: true, answeredAt: "2026-11-10T00:00:00Z" } } }) })
    render(<NotificationSettingsForm initial={PREFS} />)
    await userEvent.click(screen.getByRole("switch", { name: "Hear about offers" }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.body).toEqual({ consent: { offers: true }, via: "settings", wordingVersion: MARKETING_CONSENT.version })
    expect(screen.getByRole("switch", { name: "Hear about offers" }).getAttribute("aria-checked")).toBe("true")
  })

  it("a refused change comes back, with a reason", async () => {
    respond = () => ({ ok: false, status: 502, json: async () => ({}) })
    render(<NotificationSettingsForm initial={PREFS} />)
    const email = screen.getAllByRole("switch", { name: "Email" })[0]!
    await userEvent.click(email)
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect(email.getAttribute("aria-checked")).toBe("true")
  })

  // 115: email for offers is its own yes, in Effy's email words shown beside the switch.
  it("email for offers appears once they said yes, shows the email wording, and sends it when turned on", async () => {
    const yes = { ...PREFS, consent: { ...PREFS.consent, offers: { granted: true, answeredAt: "2026-11-10T00:00:00Z" } } }
    render(<NotificationSettingsForm initial={yes} />)
    expect(screen.getByText(MARKETING_EMAIL_CONSENT.body)).toBeTruthy()
    const emails = screen.getAllByRole("switch", { name: "Email" })
    // orders, points, then offers (news has no yes, so no email switch)
    expect(emails).toHaveLength(3)
    await userEvent.click(emails[2]!)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.body).toEqual({
      changes: [{ category: "offers", channel: "email", enabled: true }],
      via: "settings",
      emailWordingVersion: MARKETING_EMAIL_CONSENT.version,
    })
  })
})
