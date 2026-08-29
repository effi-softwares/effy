import "@testing-library/jest-dom/vitest";

// jsdom lacks matchMedia; the dashboard shell's responsive hook (useIsMobile) needs it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom implements no Pointer Capture API and no scrollIntoView. Radix's Select calls both while
// opening, so without these any test that opens a <Select> dies with an unhandled TypeError —
// which vitest reports as an "unhandled error", NOT as a failing assertion, so it is easy to
// mistake for flake. Every console surface that offers a choice uses this primitive.
for (const m of ["hasPointerCapture", "setPointerCapture", "releasePointerCapture"] as const) {
  if (!(m in Element.prototype)) {
    Object.defineProperty(Element.prototype, m, { value: () => false, writable: true });
  }
}
if (!("scrollIntoView" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => {}, writable: true });
}
