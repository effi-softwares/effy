import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { toast, Toaster } from "./index";
import { toaster } from "./instance";
import { ENTER_MS, REANNOUNCE_MS } from "./store";
import { loadToastView } from "./Toaster";

beforeAll(async () => {
  await loadToastView();
});
beforeEach(() => {
  // A desktop-width window with full motion: the dialog is Radix's, not the bottom drawer.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  act(() => toaster.dismiss(undefined, { immediate: true }));
  cleanup();
  vi.useRealTimers();
});

const hidden = (el: Element) => el.closest('[aria-hidden="true"]') !== null;

describe("a toast raised while a dialog is open (research R5)", () => {
  it("is still read out, and its button still works by pointer", () => {
    vi.useFakeTimers();
    render(
      <>
        <p id="page">The order page</p>
        <Toaster />
        <Dialog open>
          <DialogContent>
            <DialogTitle>Refund</DialogTitle>
            <DialogDescription>Refund this order</DialogDescription>
          </DialogContent>
        </Dialog>
      </>,
    );
    const onClick = vi.fn();
    act(() => void toast.error("Couldn't refund.", { action: { label: "Retry", onClick } }));
    act(() => void vi.advanceTimersByTime(ENTER_MS));
    const alert = document.querySelector('[role="alert"]')!;
    expect(alert.textContent).toBe("Couldn't refund.");
    expect(hidden(alert)).toBe(false);
    // Proof the dialog really hid the page around it - and spared the live regions.
    expect(hidden(document.querySelector("#page")!)).toBe(true);
    const retry = Array.from(document.querySelectorAll<HTMLButtonElement>(".ef-toast button")).find((b) => b.textContent === "Retry")!;
    fireEvent.click(retry);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("what is said", () => {
  it("the same words twice are said twice; a progress-only change says nothing", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    const status = () => document.querySelector('[role="status"]')!.textContent;
    act(() => void toast.success("Copied."));
    act(() => void toast.info("Uploading", { id: "up", progress: 0 }));
    expect(status()).toBe("Uploading");
    act(() => toaster.update("up", { progress: 0.4 }));
    expect(status()).toBe("Uploading");
    act(() => void toast.info("Uploading", { id: "up" }));
    expect(status()).toBe("");
    act(() => void vi.advanceTimersByTime(REANNOUNCE_MS));
    expect(status()).toBe("Uploading");
  });
});
