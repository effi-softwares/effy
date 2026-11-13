import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { toast, Toaster } from "./index";
import { loadToastView } from "./Toaster";
import { toaster } from "./instance";
import { CLOSE_MS, ENTER_MS, LIFE_MS } from "./store";

function stubMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

const toasts = () => document.querySelectorAll(".ef-toast");
const one = () => document.querySelector<HTMLElement>(".ef-toast");

beforeAll(async () => {
  // Drawn by a view fetched apart; fetch it once so each test draws at once.
  await loadToastView();
});
beforeEach(() => {
  vi.useFakeTimers();
  stubMotion(false);
});
afterEach(() => {
  act(() => toaster.dismiss(undefined, { immediate: true }));
  cleanup();
  vi.useRealTimers();
});

describe("Toaster", () => {
  it("always renders the two live regions", () => {
    render(<Toaster />);
    const status = document.querySelector('[role="status"]')!;
    const alert = document.querySelector('[role="alert"]')!;
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(toasts()).toHaveLength(0);
  });

  it("draws one toast at a time and reads it out", () => {
    render(<Toaster />);
    act(() => void toast.success("Saved."));
    act(() => void toast.info("Copied."));
    expect(toasts()).toHaveLength(1);
    expect(one()!.textContent).toContain("Copied.");
    expect(document.querySelector('[role="status"]')!.textContent).toBe("Copied.");
    act(() => void toast.error("Couldn't save."));
    expect(document.querySelector('[role="alert"]')!.textContent).toBe("Couldn't save.");
  });

  it("stays bright and clickable during a guided tour (the tour keeps every [data-tour-above] element out of its dimming)", () => {
    render(<Toaster />);
    act(() => void toast.success("Saved."));
    expect(one()!.hasAttribute("data-tour-above")).toBe(true);
  });

  it("pointing at it pauses its time", () => {
    render(<Toaster />);
    act(() => void toast.success("Saved."));
    act(() => void vi.advanceTimersByTime(ENTER_MS));
    fireEvent.pointerEnter(one()!);
    act(() => void vi.advanceTimersByTime(LIFE_MS * 3));
    expect(one()!.dataset.phase).toBe("open");
    fireEvent.pointerLeave(one()!);
    act(() => void vi.advanceTimersByTime(LIFE_MS + CLOSE_MS));
    expect(toasts()).toHaveLength(0);
  });

  it("Alt+T moves focus into it; Escape closes it and gives focus back", () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        <Toaster />
      </>,
    );
    const elsewhere = document.querySelector("button")!;
    elsewhere.focus();
    act(() => void toast.error("No bag has that label."));
    act(() => void vi.advanceTimersByTime(ENTER_MS));
    fireEvent.keyDown(document, { altKey: true, code: "KeyT", key: "†" });
    expect(document.activeElement).toBe(one());
    fireEvent.keyDown(one()!, { key: "Escape" });
    act(() => void vi.advanceTimersByTime(CLOSE_MS));
    expect(toasts()).toHaveLength(0);
    expect(document.activeElement).toBe(elsewhere);
  });

  it("buttons are not reachable by Tab until it has opened", () => {
    render(<Toaster />);
    act(() => void toast("Notification archived", { action: { label: "Undo", onClick: () => undefined } }));
    const undo = () => Array.from(document.querySelectorAll<HTMLButtonElement>(".ef-toast button")).find((b) => b.textContent === "Undo")!;
    expect(undo().tabIndex).toBe(-1);
    act(() => void vi.advanceTimersByTime(ENTER_MS));
    expect(undo().tabIndex).toBe(0);
  });

  it("a close button only on a toast that stays", () => {
    render(<Toaster />);
    act(() => void toast.success("Saved."));
    expect(document.querySelector(".ef-toast-close")).toBeNull();
    act(() => void toast.error("Couldn't save."));
    expect(document.querySelector(".ef-toast-close")).not.toBeNull();
    act(() => void toast.loading("Saving…"));
    // a loading toast owned by a new caller waits behind the failure; the failure keeps its close button
    expect(document.querySelector(".ef-toast-close")).not.toBeNull();
  });

  it("a button press runs its action", () => {
    render(<Toaster />);
    const onClick = vi.fn(() => ({ kind: "success" as const, title: "Restored" }));
    act(() => void toast("Removed from cart", { action: { label: "Undo", onClick } }));
    act(() => void vi.advanceTimersByTime(ENTER_MS));
    const undo = Array.from(document.querySelectorAll<HTMLButtonElement>(".ef-toast button")).find((b) => b.textContent === "Undo")!;
    act(() => undo.click());
    expect(onClick).toHaveBeenCalledOnce();
    expect(one()!.textContent).toContain("Restored");
  });

  it("with reduced motion no frame loop is started", () => {
    stubMotion(true);
    const raf = vi.spyOn(window, "requestAnimationFrame");
    render(<Toaster />);
    act(() => void toast.success("Saved."));
    act(() => void toast.error("Couldn't save."));
    expect(raf).not.toHaveBeenCalled();
    expect(one()!.dataset.phase).toBe("open");
    raf.mockRestore();
  });

  it("a second Toaster draws nothing and says so", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <>
        <Toaster />
        <Toaster />
      </>,
    );
    expect(document.querySelectorAll(".ef-toast-viewport")).toHaveLength(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
