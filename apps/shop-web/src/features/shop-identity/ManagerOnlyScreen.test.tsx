import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/features/team/TeamRoster", () => ({ TeamRoster: () => <div>team roster</div> }))

import { ManagerOnlyScreen } from "./ManagerOnlyScreen"

describe("ManagerOnlyScreen", () => {
  it("renders the team roster", () => {
    render(<ManagerOnlyScreen />)

    expect(screen.getByText("team roster")).toBeInTheDocument()
    expect(screen.queryByText(/shop management/i)).not.toBeInTheDocument()
  })
})
