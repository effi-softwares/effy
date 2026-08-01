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

  /**
   * ⚠ The clipboard can be refused outright — an insecure origin, a denied permission — and a
   * rejected promise must not surface as a failure. The code is on screen and selectable, so the
   * shopper has lost a shortcut, not the offer; an error about a convenience would read as the
   * PROMOTION having failed, which is the one message that must not appear here.
   */
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
