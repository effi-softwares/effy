import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const getTaxSettings = vi.hoisted(() => vi.fn())
const putTaxSettings = vi.hoisted(() => vi.fn())
vi.mock("./repo", () => ({ getTaxSettings, putTaxSettings }))

const { TaxSettingsScreen } = await import("./TaxSettingsScreen")

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <QueryClientProvider client={qc}>
          <TaxSettingsScreen />
        </QueryClientProvider>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  getTaxSettings.mockResolvedValue({
    legalName: null,
    abn: null,
    feeTreatment: null,
    invoicesEnabled: false,
    unclassifiedProducts: 3,
  })
})

describe("Settings → Tax (096 US8)", () => {
  it("starts empty — nothing is guessed — and says how many products still need a GST status", async () => {
    show()
    expect(await screen.findByText(/3 live products have no GST status/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText("As registered")).toHaveValue("")
    expect(screen.getByPlaceholderText("11 digits")).toHaveValue("")
  })

  it("names what is still missing when invoices cannot be turned on", async () => {
    putTaxSettings.mockRejectedValue({
      kind: "conflict",
      status: 409,
      title: "Refused",
      fields: [
        { field: "setup", message: "ABN" },
        { field: "setup", message: "a GST status on every live product" },
      ],
    })
    show()
    await userEvent.type(await screen.findByPlaceholderText("As registered"), "Effy Pty Ltd")
    await userEvent.click(screen.getByRole("switch", { name: "Tax invoices on" }))
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(putTaxSettings).toHaveBeenCalled())
    expect(putTaxSettings.mock.calls[0]![0]).toEqual({
      legalName: "Effy Pty Ltd",
      abn: null,
      feeTreatment: null,
      invoicesEnabled: true,
    })
    expect(await screen.findByRole("alert")).toHaveTextContent("Still needed: ABN, a GST status on every live product.")
  })
})
