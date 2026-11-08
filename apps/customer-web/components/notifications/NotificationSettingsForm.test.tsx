import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MARKETING_CONSENT } from "@effy/legal-content/consent"
import type { NotificationPreferencesDTO } from "@effy/shared-types"

const toast = vi.hoisted(() => vi.fn())
vi.mock("@/lib/toast-store", () => ({ toast }))
vi.mock("@/lib/telemetry", () => ({ capture: vi.fn() }))

const { NotificationSettingsForm } = await import("./NotificationSettingsForm")

const PREFS: NotificationPreferencesDTO = {
  categories: [
    { category: "orders", required: false, marketing: false, push: true, email: true, changeable: ["push", "email"] },
    { category: "points", required: false, marketing: false, push: true, email: true, changeable: ["push", "email"] },
    { category: "offers", required: false, marketing: true, push: true, email: false, changeable: ["push"] },
    { category: "news", required: false, marketing: true, push: true, email: false, changeable: ["push"] },
    { category: "important", required: true, marketing: false, push: true, email: true, changeable: [] },
    { category: "support", required: true, marketing: false, push: true, email: true, changeable: [] },
  ],
  consent: { offers: { granted: false, answeredAt: null }, news: { granted: false, answeredAt: null } },
  askForOffers: false,
  wordingVersion: MARKETING_CONSENT.version,
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
})
