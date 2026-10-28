import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useHiddenColumns } from "../hidden-columns";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("useHiddenColumns", () => {
  it("ignores stored ids that are not columns any more, and never hides a locked one", () => {
    window.localStorage.setItem("effy.table.shop-web.orders.v1", JSON.stringify({ hidden: ["gone", "total", "number"] }));
    const { result } = renderHook(() => useHiddenColumns("shop-web", "orders", ["number", "total"], ["number"]));
    expect(result.current.hidden).toEqual(["total"]);
    act(() => result.current.toggle("number", false));
    expect(result.current.hidden).toEqual(["total"]);
  });

  it("works without storage (a private window)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useHiddenColumns("back-office", "shops", ["a", "b"], []));
    expect(result.current.hidden).toEqual([]);
    act(() => result.current.toggle("b", false));
    expect(result.current.hidden).toEqual(["b"]);
  });

  it("survives junk in storage", () => {
    window.localStorage.setItem("effy.table.back-office.shops.v1", "{not json");
    const { result } = renderHook(() => useHiddenColumns("back-office", "shops", ["a"], []));
    expect(result.current.hidden).toEqual([]);
  });
});
