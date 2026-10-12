/**
 * Motion (motion.dev) for the storefront's carousels and the All aisles menu — its mini `animate`, loaded ON DEMAND.
 *
 * ⚠ NEVER IMPORT `motion` STATICALLY ON A GUEST ROUTE. Imported at the top of a client component it
 * cost 2.9 KB gzipped on EVERY guest route (measured 2026-10-12: the All aisles menu is in the chrome),
 * and the guest bundle gate counts first-load script. Nothing animates on first paint, so the library
 * is fetched after the page is interactive and is simply ready by the first slide change. If it has
 * not arrived, or the browser has no Web Animations API, the slide still changes — unanimated.
 */
type Animate = (typeof import("motion/mini"))["animate"]

let loading: Promise<Animate> | undefined
let ready: Animate | undefined

/** Start fetching the library. Call from an effect; safe to call any number of times. */
export function warmSlideMotion(): void {
  loading ??= import("motion/mini").then((m) => (ready = m.animate))
  loading.catch(() => (loading = undefined))
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Bring a slide in from the side it was asked for, and pop the icon bubbles under `bubbleRoot`.
 * Does nothing under reduced motion.
 */
export function animateSlideIn(slide: HTMLElement | null | undefined, direction: number, bubbleRoot?: ParentNode | null) {
  const animate = ready
  if (!animate || !slide || typeof slide.animate !== "function" || reduced()) return
  animate(
    slide,
    { opacity: [0, 1], transform: [`translateX(${direction * 28}px)`, "translateX(0px)"] },
    { duration: 0.45, ease: "easeOut" },
  )
  bubbleRoot?.querySelectorAll<HTMLElement>("[data-promo-bubble]").forEach((bubble, i) => {
    animate(bubble, { transform: ["scale(0.8)", "scale(1)"] }, { duration: 0.55, delay: i * 0.06, ease: [0.34, 1.56, 0.64, 1] })
  })
}

/** The All aisles menu arriving: the panel drops a few pixels into place. */
export function animateMenuOpen(panel: HTMLElement | null) {
  const animate = ready
  if (!animate || !panel || typeof panel.animate !== "function" || reduced()) return
  animate(panel, { opacity: [0, 1], transform: ["translateY(-8px)", "translateY(0px)"] }, { duration: 0.2, ease: "easeOut" })
}
