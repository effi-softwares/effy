import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { emptyDraft } from "../draft"
import { Previews } from "./Previews"

/** 115 US5 (T034): the previews show a sample name where people will see theirs, and the fallback on every lock screen. */
describe("115 - previews with a first name", () => {
  const draft = { ...emptyDraft("important"), title: "Hub hours", body: "Hi {first name}, from Effy", nameFallback: "friend", email: true }

  it("the lock screen uses the fallback; the inbox, the opened message and the email use a sample name", () => {
    render(<Previews draft={draft} audience="customer" />)
    expect(within(screen.getByRole("region", { name: "On a locked phone" })).getAllByText("Hi friend, from Effy").length).toBeGreaterThan(0)
    expect(within(screen.getByRole("region", { name: "In the inbox" })).getByText("Hi Sam, from Effy")).toBeTruthy()
    expect(within(screen.getByRole("region", { name: "Opened" })).getByText("Hi Sam, from Effy")).toBeTruthy()
    expect(within(screen.getByRole("region", { name: "By email" })).getByText("Hi Sam, from Effy")).toBeTruthy()
    expect(within(screen.getByRole("region", { name: "On a locked phone" })).queryByText(/Sam/)).toBeNull()
  })
})
