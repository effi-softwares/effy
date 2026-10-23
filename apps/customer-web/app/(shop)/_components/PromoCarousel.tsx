"use client"

import { Children, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { animateSlideIn, warmSlideMotion } from "@/lib/slide-motion"

/**
 * The hero band's behaviour: which promotion is showing, the previous / dots / next controls, and the
 * movement between slides (all rendered on the server). It advances by itself, pauses while hovered or
 * while keyboard focus is inside (WCAG 2.2.2; a click's focus does not count), and never auto-advances
 * under reduced motion. Every slide is in the document in one grid cell, those not showing `invisible`
 * and `inert`. Motion (via `lib/slide-motion`) loads after the page is interactive; nothing animates on
 * first paint.
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
