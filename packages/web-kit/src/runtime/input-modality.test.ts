import { afterEach, describe, expect, it } from "vitest";

import { trackInputModality } from "./input-modality";

describe("trackInputModality — rings for the keyboard only", () => {
  let stop: () => void = () => {};
  afterEach(() => stop());

  it("starts as pointer, so nothing clicked or tapped shows a ring", () => {
    stop = trackInputModality();
    expect(document.documentElement.dataset.input).toBe("pointer");
  });

  it("switches to keyboard on a navigation key, and back on a pointer", () => {
    stop = trackInputModality();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(document.documentElement.dataset.input).toBe("keyboard");
    window.dispatchEvent(new Event("pointerdown"));
    expect(document.documentElement.dataset.input).toBe("pointer");
  });

  it("ignores typing — a letter is not navigation", () => {
    stop = trackInputModality();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(document.documentElement.dataset.input).toBe("pointer");
  });
});
