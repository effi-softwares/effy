/**
 * The pre-paint appearance script (025 T102).
 *
 * ── Why this is a raw inline <script> and not a component ────────────────────────────────────────
 *
 * The `.dark` class must be on `<html>` BEFORE the browser paints. Any React code — client
 * component, effect, hydration — runs after first paint, so a dark-mode visitor would see a white
 * page flash first. That flash is the entire reason `next-themes` shipped a blocking script, and
 * dropping the library does not drop the requirement.
 *
 * It is rendered as the first child of `<body>` so it executes synchronously, before any markup
 * below it is painted.
 *
 * ⚠ `suppressHydrationWarning` on `<html>` in the root layout is REQUIRED and already present: this
 * script mutates `<html>`'s class and style before React hydrates, so the server HTML and the live
 * DOM legitimately differ there. Removing that attribute makes every dark-mode page log a hydration
 * error.
 *
 * ⚠ Kept as a hand-minified string on purpose. It ships inline in the HTML of every page, so it is
 * paid for on every request by every visitor — including crawlers. Readability lives in this comment
 * instead, where it costs nothing:
 *
 *     read localStorage["theme"], defaulting to "system"
 *     dark = mode is "dark", or mode is "system" and the OS prefers dark
 *     set/remove the `dark` class, and set color-scheme so form controls and scrollbars match
 *     swallow everything — storage can throw in private mode, and a preference is never worth
 *     breaking the page for
 */
const THEME_SCRIPT = `!function(){try{var e=localStorage.getItem("theme")||"system",t="dark"===e||"system"===e&&matchMedia("(prefers-color-scheme: dark)").matches,o=document.documentElement;o.classList.toggle("dark",t),o.style.colorScheme=t?"dark":"light"}catch(e){}}()`

export function ThemeScript() {
  // eslint-disable-next-line react/no-danger -- a constant string defined above; no interpolation.
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
}
