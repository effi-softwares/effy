import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MARKETING_CONSENT } from "@effy/legal-content/consent"

const capture = vi.hoisted(() => vi.fn())
vi.mock("@/lib/telemetry", () => ({ capture }))

const { OffersAsk } = await import("./OffersAsk")

let calls: Array<{ url: string; body: unknown }>
let ok = true
beforeEach(() => {
  calls = []
  ok = true
  capture.mockReset()
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) })
    return { ok, status: ok ? 200 : 502, json: async () => ({}) }
  }))
})

describe("the offers ask on the website (111 US2)", () => {
  it("shows Effy's words with two answers, nothing chosen", () => {
    render(<OffersAsk />)
    expect(screen.getByRole("heading", { name: MARKETING_CONSENT.heading })).toBeTruthy()
    expect(screen.getByText(MARKETING_CONSENT.body)).toBeTruthy()
    const yes = screen.getByRole("button", { name: MARKETING_CONSENT.yes })
    const no = screen.getByRole("button", { name: MARKETING_CONSENT.no })
    expect(yes.className).toBe(no.className)
    expect(capture).toHaveBeenCalledWith({ name: "offers_ask_shown", props: { surface: "web" } })
  })

  it("yes records both categories from the prompt with the wording shown", async () => {
    render(<OffersAsk />)
    await userEvent.click(screen.getByRole("button", { name: MARKETING_CONSENT.yes }))
    await waitFor(() => expect(screen.getByText(/we'll let you know/)).toBeTruthy())
    expect(calls).toEqual([
      { url: "/api/notification-preferences", body: { consent: { offers: true, news: true }, via: "prompt", wordingVersion: MARKETING_CONSENT.version } },
    ])
  })

  it("not now records two no's", async () => {
    render(<OffersAsk />)
    await userEvent.click(screen.getByRole("button", { name: MARKETING_CONSENT.no }))
    await waitFor(() => expect(screen.getByText(/we won't send you offers/)).toBeTruthy())
    expect(calls[0]!.body).toMatchObject({ consent: { offers: false, news: false } })
  })

  it("an answer that was not recorded leaves the ask in place", async () => {
    ok = false
    render(<OffersAsk />)
    await userEvent.click(screen.getByRole("button", { name: MARKETING_CONSENT.yes }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(screen.getByRole("heading", { name: MARKETING_CONSENT.heading })).toBeTruthy()
  })
})
