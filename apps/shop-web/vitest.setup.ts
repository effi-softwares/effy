import "@testing-library/jest-dom/vitest";

// jsdom has no matchMedia; useIsMobile (sidebar) and the theme initializer both read it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// 057: jsdom implements none of the Pointer Capture API and no scrollIntoView, and Radix's Select
// uses all three when its listbox opens. Without them `userEvent.click` on a SelectTrigger renders no
// options at all — the control looks broken in tests while working perfectly in a browser, which is
// how a filter ends up shipped untested. Added here rather than per-test so every Select in this app
// is testable by default.
if (typeof Element !== "undefined") {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}
