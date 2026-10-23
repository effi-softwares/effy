import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CopyCodeButton } from "./CopyCodeButton"

function stubClipboard(impl: (text: string) => Promise<void>) {
  const writeText = vi.fn(impl)
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  })
  return writeText
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("CopyCodeButton", () => {
  it("copies the code and confirms it", async () => {
    const writeText = stubClipboard(async () => {})
    render(<CopyCodeButton code="FIRST20" />)

    await userEvent.click(screen.getByRole("button", { name: "Copy code" }))

    expect(writeText).toHaveBeenCalledWith("FIRST20")
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument()
  })

  /** A refused clipboard is not a failure: the code is on screen and selectable. */
  it("stays silent when the browser refuses the clipboard", async () => {
    stubClipboard(async () => {
      throw new Error("denied")
    })
    render(<CopyCodeButton code="FIRST20" />)

    await userEvent.click(screen.getByRole("button", { name: "Copy code" }))

    expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument()
    expect(screen.queryByText(/error|failed|sorry/i)).not.toBeInTheDocument()
  })
})
