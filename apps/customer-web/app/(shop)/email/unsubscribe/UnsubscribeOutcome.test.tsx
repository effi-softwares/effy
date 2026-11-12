import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { UNSUBSCRIBE_WORDS } from "@effy/shared-types"

const unsubscribe = vi.hoisted(() => vi.fn())
const undo = vi.hoisted(() => vi.fn())
const capture = vi.hoisted(() => vi.fn())
vi.mock("./actions", () => ({ unsubscribeFromEmailLink: unsubscribe, undoEmailUnsubscribeLink: undo }))
vi.mock("@/lib/telemetry", () => ({ capture }))

const { UnsubscribeOutcome } = await import("./UnsubscribeOutcome")

const TOKEN = "A".repeat(43)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("115 - the unsubscribe page", () => {
  it("posts once after loading, then says it worked, with Undo and a link to settings", async () => {
    unsubscribe.mockResolvedValue({ ok: true, undoable: true })
    render(<UnsubscribeOutcome token={TOKEN} messageId="m-1" />)
    expect(screen.getByRole("status")).toBeTruthy()
    expect(await screen.findByText(UNSUBSCRIBE_WORDS.done)).toBeTruthy()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribe).toHaveBeenCalledWith(TOKEN, "m-1")
    expect(screen.getByRole("button", { name: UNSUBSCRIBE_WORDS.undo })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Notification settings" }).getAttribute("href")).toBe("/account/notifications/settings")
    expect(capture).toHaveBeenCalledWith({ name: "email_unsubscribed", props: {} })
  })

  it("a link that does not work says so, with no Undo", async () => {
    unsubscribe.mockResolvedValue({ ok: false, undoable: false })
    render(<UnsubscribeOutcome token="bad" messageId={null} />)
    expect(await screen.findByText(UNSUBSCRIBE_WORDS.failed)).toBeTruthy()
    expect(screen.queryByRole("button", { name: UNSUBSCRIBE_WORDS.undo })).toBeNull()
    expect(capture).not.toHaveBeenCalled()
  })

  it("Undo turns email back on", async () => {
    unsubscribe.mockResolvedValue({ ok: true, undoable: true })
    undo.mockResolvedValue({ ok: true })
    render(<UnsubscribeOutcome token={TOKEN} messageId={null} />)
    await userEvent.click(await screen.findByRole("button", { name: UNSUBSCRIBE_WORDS.undo }))
    expect(await screen.findByText(UNSUBSCRIBE_WORDS.undone)).toBeTruthy()
    expect(undo).toHaveBeenCalledWith(TOKEN)
    expect(capture).toHaveBeenCalledWith({ name: "email_unsubscribe_undone", props: {} })
  })

  it("an Undo that is no longer possible removes the button and keeps the outcome", async () => {
    unsubscribe.mockResolvedValue({ ok: true, undoable: true })
    undo.mockResolvedValue({ ok: false })
    render(<UnsubscribeOutcome token={TOKEN} messageId={null} />)
    await userEvent.click(await screen.findByRole("button", { name: UNSUBSCRIBE_WORDS.undo }))
    await waitFor(() => expect(screen.queryByRole("button", { name: UNSUBSCRIBE_WORDS.undo })).toBeNull())
    expect(screen.getByText(UNSUBSCRIBE_WORDS.done)).toBeTruthy()
  })
})
