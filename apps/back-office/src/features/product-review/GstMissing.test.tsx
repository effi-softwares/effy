import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listGstMissing = vi.hoisted(() => vi.fn());
const setGstBulk = vi.hoisted(() => vi.fn());
vi.mock("./repo", async (original) => ({ ...(await original<Record<string, unknown>>()), listGstMissing, setGstBulk }));
const roles = vi.hoisted(() => ({ value: ["manager"] as string[] }));
vi.mock("@/features/auth/useSessionRoles", () => ({ useSessionRoles: () => roles.value }));

const { GstMissing } = await import("./GstMissing");

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<GstMissing />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  roles.value = ["manager"];
  listGstMissing.mockResolvedValue({
    total: 2,
    items: [
      { productId: "p1", name: "Milk", shopName: "Green Grocer", categoryName: "Dairy" },
      { productId: "p2", name: "Soap", shopName: "Green Grocer", categoryName: "Household" },
    ],
  });
});

describe("GST missing (096 US9)", () => {
  it("sets the ticked products at once", async () => {
    setGstBulk.mockResolvedValue({ changed: 1 });
    show();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Milk" }));
    await userEvent.click(screen.getByRole("button", { name: "Set GST-free" }));
    await waitFor(() => expect(setGstBulk).toHaveBeenCalled());
    expect(setGstBulk.mock.calls[0]![0]).toEqual({ productIds: ["p1"], gstStatus: "gst_free" });
  });

  it("a csa sees the list but cannot set anything", async () => {
    roles.value = ["csa"];
    show();
    expect(await screen.findByText("Milk")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set GST-free" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("says so when every product is classified", async () => {
    listGstMissing.mockResolvedValue({ total: 0, items: [] });
    show();
    expect(await screen.findByText("Every live product has a GST status")).toBeInTheDocument();
  });
});
