import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import type { ListPage } from "@effy/shared-types";

import { useListNeighbours } from "../list-neighbours";

const page = (ids: string[], p: Partial<ListPage<{ id: string }>> = {}): ListPage<{ id: string }> => ({
  items: ids.map((id) => ({ id })),
  pageSize: 25,
  total: 40,
  totalCapped: false,
  page: null,
  nextCursor: null,
  ignored: [],
  ...p,
});

function setup(seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(qc);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return wrapper;
}

describe("useListNeighbours", () => {
  it("steps through the list the record was opened from, with its place in it", () => {
    const wrapper = setup((qc) => qc.setQueryData(["orders", "list", "sort=placed"], page(["a", "b", "c"])));
    const { result } = renderHook(() => useListNeighbours<{ id: string }>({ key: ["orders"], id: "b", rowId: (r) => r.id }), { wrapper });
    expect(result.current).toMatchObject({ position: 2, total: 40, prev: "a", next: "c" });
  });

  it("follows the list most recently read that holds it", async () => {
    const wrapper = setup((qc) => {
      qc.setQueryData(["orders", "list", "sort=placed"], page(["a", "b", "c"]));
      qc.setQueryData(["orders", "list", "q=mia&sort=placed"], page(["x", "b"], { total: 2 }), { updatedAt: Date.now() + 1000 });
    });
    const { result } = renderHook(() => useListNeighbours<{ id: string }>({ key: ["orders"], id: "b", rowId: (r) => r.id }), { wrapper });
    expect(result.current).toMatchObject({ position: 2, total: 2, prev: "x", next: undefined });
  });

  it("cannot say a place on a keyset page past the first, but still steps", () => {
    const wrapper = setup((qc) => qc.setQueryData(["orders", "list", "cursor=k1&sort=placed"], page(["a", "b"])));
    const { result } = renderHook(() => useListNeighbours<{ id: string }>({ key: ["orders"], id: "a", rowId: (r) => r.id }), { wrapper });
    expect(result.current).toMatchObject({ position: null, next: "b", prev: undefined });
  });

  it("counts from the page on an offset list", () => {
    const wrapper = setup((qc) => qc.setQueryData(["orders", "list", "page=2"], page(["a", "b"], { page: 2, pageSize: 25 })));
    const { result } = renderHook(() => useListNeighbours<{ id: string }>({ key: ["orders"], id: "b", rowId: (r) => r.id }), { wrapper });
    expect(result.current.position).toBe(27);
  });

  it("opened from anywhere else, reads the list as it opens by default", async () => {
    const wrapper = setup(() => {});
    const { result } = renderHook(
      () =>
        useListNeighbours<{ id: string }>({
          key: ["orders"],
          id: "b",
          rowId: (r) => r.id,
          fallback: { queryKey: ["orders", "list", "default"], queryFn: async () => page(["a", "b"]) },
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.prev).toBe("a"));
    expect(result.current.position).toBe(2);
  });
});
