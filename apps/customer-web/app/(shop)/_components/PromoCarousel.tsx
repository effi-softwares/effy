"use client"

import { Children, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { animateSlideIn, warmSlideMotion } from "@/lib/slide-motion"

/**
 * The hero band's behaviour (reference: Home · hero): which promotion is showing, the previous /
 * dots / next controls, and the movement between slides. Everything it SHOWS is rendered on
 * the server and handed in.
 *
 * ⚠ IT MOVES ON BY ITSELF, AND WAITS for anyone reading or reaching for it — the pointer over it, or
 * KEYBOARD focus inside it (WCAG 2.2.2) — and never starts under a reduced-motion preference, where
 * the controls still change the slide and nothing animates. There is no pause button (operator
 * direction, 2026-10-12).
 *
 * ⚠ KEYBOARD focus, not any focus. A click leaves focus on the button that was clicked; holding for
 * that stopped the carousel for good the first time anyone pressed "next".
 *
 * ⚠ EVERY SLIDE IS IN THE DOCUMENT, stacked in one grid cell, so the band is as tall as its longest
 * slide and the first one is in the server's HTML with nothing to wait for. The ones not showing are
 * `invisible` and `inert` — out of sight, out of the tab order, out of the accessibility tree.
 *
 * ⚠ The animation is Motion (motion.dev), through `lib/slide-motion` — fetched after the page is
 * interactive, never in the first load. Nothing animates on first paint: the first slide's heading is
 * the page's largest element.
 */
const DWELL_MS = 6000

export function PromoCarousel({
  backdrop,
  children,
}: {
  /** The icon bubbles, drawn once behind every slide. They pop when the slide changes. */
  backdrop: React.ReactNode
  children: React.ReactNode
}) {
  const slides = Children.toArray(children)
  const count = slides.length
  const [index, setIndex] = useState(0)
  const [held, setHeld] = useState(false)
  const [focused, setFocused] = useState(false)
  const direction = useRef(1)
  const shown = useRef(0)
  const scope = useRef<HTMLDivElement>(null)

  const go = (to: number, dir: number) => {
    direction.current = dir
    setIndex((to + count) % count)
  }

  useEffect(() => {
    if (count < 2 || held || focused) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setTimeout(() => {
      direction.current = 1
      setIndex((i) => (i + 1) % count)
    }, DWELL_MS)
    return () => window.clearTimeout(id)
  }, [count, held, focused, index])

  useEffect(() => {
    if (count > 1) warmSlideMotion()
  }, [count])

  useEffect(() => {
    if (shown.current === index) return
    shown.current = index
    const root = scope.current
    animateSlideIn(root?.querySelector<HTMLElement>(`[data-slide="${index}"]`), direction.current, root)
  }, [index])

  const control =
    "grid size-8 place-items-center rounded-full border border-input bg-background text-foreground shadow-xs hover:bg-accent"

  return (
    <div
      ref={scope}
      className="grid"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={(e) => setFocused(e.target.matches(":focus-visible"))}
      onBlur={() => setFocused(false)}
    >
      {backdrop}
      {slides.map((slide, i) => (
        <div
          key={i}
          data-slide={i}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}`}
          inert={i !== index}
          className={`grid [grid-area:1/1] ${i === index ? "" : "invisible"}`}
        >
          {slide}
        </div>
      ))}
      {count > 1 && (
        <div className="absolute right-4 bottom-4 flex items-center gap-2">
          <button type="button" aria-label="Previous slide" onClick={() => go(index - 1, -1)} className={control}>
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <span aria-hidden="true" className="flex gap-1.5">
            {slides.map((_, i) => (
              <i
                key={i}
                className={`h-2 rounded-full bg-white transition-all duration-300 ${i === index ? "w-4" : "w-2 opacity-35"}`}
              />
            ))}
          </span>
          <button type="button" aria-label="Next slide" onClick={() => go(index + 1, 1)} className={control}>
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
