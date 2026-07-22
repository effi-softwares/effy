import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@effy/design-system/ui"

/**
 * T003 (RELOCATED). This test belongs to the design-system's `ResponsiveModal` (Phase 1), but the
 * design-system package has NO test runner — so per the task it is recorded here, in customer-web's
 * vitest, the first surface that consumes the component. It asserts the responsive switch: a Dialog
 * at/above the 768px breakpoint, a Drawer below it, driven by the `useIsMobile` hook (mocked).
 */

const { mockIsMobile } = vi.hoisted(() => ({ mockIsMobile: { value: false } }))
vi.mock("@effy/design-system/hooks/use-mobile", () => ({
  useIsMobile: () => mockIsMobile.value,
}))

function Modal() {
  return (
    <ResponsiveModal open onOpenChange={() => {}}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Add address</ResponsiveModalTitle>
        </ResponsiveModalHeader>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}

describe("ResponsiveModal (T003, relocated from design-system)", () => {
  it("renders a Dialog at/above the breakpoint", () => {
    mockIsMobile.value = false
    render(<Modal />)
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="drawer-content"]')).not.toBeInTheDocument()
  })

  it("renders a Drawer below the breakpoint", () => {
    mockIsMobile.value = true
    render(<Modal />)
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument()
  })

  it("shows the title in both containers", () => {
    mockIsMobile.value = false
    const { unmount } = render(<Modal />)
    expect(screen.getByText("Add address")).toBeInTheDocument()
    unmount()
    mockIsMobile.value = true
    render(<Modal />)
    expect(screen.getByText("Add address")).toBeInTheDocument()
  })
})
