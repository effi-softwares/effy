import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AdminPromotionDTO, AdminPromotionImageDTO } from "@effy/shared-types"

vi.mock("@/lib/telemetry", () => ({ track: vi.fn() }))
const repo = vi.hoisted(() => ({
  addPromotionImage: vi.fn(),
  updatePromotionImage: vi.fn(),
  removePromotionImage: vi.fn(),
}))
vi.mock("../repo", () => repo)

const { PicturesSection } = await import("./PicturesSection")

const image = (over: Partial<AdminPromotionImageDTO> = {}): AdminPromotionImageDTO => ({
  id: "i1",
  url: "https://media.test/promotions/p1/a.jpg",
  width: 1600,
  height: 900,
  alt: "A basket of oranges",
  focusX: 0.5,
  focusY: 0.5,
  position: 0,
  usedIn: [],
  ...over,
})
const promotion = (images: AdminPromotionImageDTO[]) => ({ id: "p1", images }) as unknown as AdminPromotionDTO

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

afterEach(() => vi.clearAllMocks())

describe("PicturesSection (095 US1)", () => {
  it("uploads a picture with its description", async () => {
    const user = userEvent.setup()
    repo.addPromotionImage.mockResolvedValue(image())
    wrap(<PicturesSection promotion={promotion([])} canManage />)
    const file = new File(["x"], "basket.jpg", { type: "image/jpeg" })
    await user.upload(screen.getByLabelText("Picture"), file)
    expect(screen.getByRole("button", { name: "Add picture" })).toBeDisabled() // a description is needed
    await user.type(screen.getByLabelText("Description"), "A basket of oranges")
    await user.click(screen.getByRole("button", { name: "Add picture" }))
    await waitFor(() => expect(repo.addPromotionImage).toHaveBeenCalledWith("p1", file, "A basket of oranges"))
  })

  it("refuses a file that is not a picture before uploading anything", async () => {
    const user = userEvent.setup({ applyAccept: false })
    wrap(<PicturesSection promotion={promotion([])} canManage />)
    await user.upload(screen.getByLabelText("Picture"), new File(["x"], "terms.pdf", { type: "application/pdf" }))
    expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG or WebP")
    expect(repo.addPromotionImage).not.toHaveBeenCalled()
  })

  it("removing a picture a group chose says where, then removes it", async () => {
    const user = userEvent.setup()
    repo.removePromotionImage.mockResolvedValue(undefined)
    wrap(
      <PicturesSection
        promotion={promotion([image({ usedIn: [{ id: "g", key: "home-hero", name: "Home hero" }] })])}
        canManage
      />,
    )
    await user.click(screen.getByRole("button", { name: "Remove A basket of oranges" }))
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("It is chosen in Home hero")
    await user.click(screen.getByRole("button", { name: "Remove picture" }))
    await waitFor(() => expect(repo.removePromotionImage).toHaveBeenCalledWith("p1", "i1", true))
  })

  it("a customer-service agent sees the pictures and can change nothing", () => {
    wrap(<PicturesSection promotion={promotion([image()])} canManage={false} />)
    expect(screen.getByRole("img", { name: "A basket of oranges" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add picture" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument()
  })
})
