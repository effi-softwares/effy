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

/**
 * Radix's Select needs three DOM APIs jsdom does not implement (042).
 *
 * ⚠ WITHOUT THESE, NO TEST IN THIS CONSOLE CAN OPEN A SELECT — and until now none ever had, despite
 * the console being full of them: the promotions status filter, the catalog forms, and every
 * enum field the home composer generates. The failure is not a clear "unsupported" message; the
 * trigger simply does nothing and the assertion reports that it could not find the option, which
 * reads like a component bug and sends you looking in the wrong place.
 *
 * These are shims for capabilities the browser has and jsdom omits, not workarounds for a defect.
 */
if (typeof window !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
