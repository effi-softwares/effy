/**
 * How the person is driving the console right now — "keyboard" or "pointer" — written to
 * `<html data-input>` so the focus ring shows only to someone moving with the keyboard.
 *
 * Why not `:focus-visible` alone: a menu or dialog hands focus back to its trigger when it closes, and
 * browsers treat that programmatic focus as visible, so a ring appeared on the avatar after a TAP
 * (2026-10-25, operator: rings on everything clickable). A pointer or touch now hides every ring; the
 * first navigation key brings them back, so keyboard users still always see where they are.
 */
const NAVIGATION_KEYS = new Set([
  "Tab",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "F6",
]);

export function trackInputModality(root: HTMLElement = document.documentElement): () => void {
  const set = (mode: "keyboard" | "pointer") => {
    if (root.dataset.input !== mode) root.dataset.input = mode;
  };
  const onKey = (event: KeyboardEvent) => {
    if (NAVIGATION_KEYS.has(event.key)) set("keyboard");
  };
  const onPointer = () => set("pointer");

  set("pointer");
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("pointerdown", onPointer, true);
  return () => {
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("pointerdown", onPointer, true);
  };
}
