import "@testing-library/jest-dom/vitest"

// jsdom omits a few browser APIs that Radix Dialog / AlertDialog and vaul Drawer touch on mount.
// Polyfilling them here (once) keeps the overlay components — used by the address book — testable.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  }

  const win = window as unknown as { ResizeObserver?: unknown }
  if (!win.ResizeObserver) {
    win.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }

  // jsdom has no <dialog> behaviour. The storefront's dialogs are native ones opened with
  // `showModal`, so tests get the part of it they can observe: open, and closed again.
  const dialog = window.HTMLDialogElement?.prototype
  if (dialog && !dialog.showModal) {
    dialog.showModal = function (this: HTMLDialogElement) {
      this.open = true
    }
    dialog.close = function (this: HTMLDialogElement) {
      this.open = false
      this.dispatchEvent(new Event("close"))
    }
  }

  const proto = window.HTMLElement.prototype
  proto.scrollIntoView ??= () => {}
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
}
