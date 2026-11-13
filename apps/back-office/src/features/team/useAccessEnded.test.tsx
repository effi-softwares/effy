import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

const { get, mutate, navigate } = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn(), navigate: vi.fn() }))
vi.mock("@/lib/api", () => ({ api: { get } }))
vi.mock("@/features/auth/queries", () => ({ useSignOut: () => ({ mutate }) }))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }))

import { useAccessEnded } from "./useAccessEnded"

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
)
const problem = (status: number, word: string) => ({
  kind: status === 403 ? "forbidden" : "unknown",
  status,
  title: "x",
  type: `https://effyshopping.com/problems/${word}`,
})

describe("access ended (119 R8)", () => {
  it.each(["not-on-team", "staff-disabled"])("a 403 %s signs the browser out and says why at sign-in", async (word) => {
    get.mockRejectedValue(problem(403, word))
    mutate.mockImplementation((_v: unknown, opts: { onSettled: () => void }) => opts.onSettled())
    renderHook(() => useAccessEnded(true), { wrapper })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth/sign-in", search: { ended: "1" } }))
  })

  it("an ordinary 403 does not sign anyone out", async () => {
    mutate.mockReset()
    get.mockRejectedValue(problem(403, "forbidden"))
    const { result } = renderHook(() => useAccessEnded(true), { wrapper })
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(mutate).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it("answers the record's one role", async () => {
    get.mockResolvedValue({ subject: "s", name: "Jo", email: "jo@x.test", roles: ["manager"], status: "active", lastSeenAt: "" })
    const { result } = renderHook(() => useAccessEnded(true), { wrapper })
    await waitFor(() => expect(result.current).toEqual(["manager"]))
  })
})
