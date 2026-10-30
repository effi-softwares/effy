"use client"

import { Children, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { animateSlideIn, warmSlideMotion } from "@/lib/slide-motion"

/**
 * The offers and information panel in the All aisles menu: one slide at a time, with the controls
 * to move between them.
 *
 * It moves on by itself, and stops for anyone reading or reaching for it - pointer over it, focus
 * inside it, or a reduced-motion preference. It is mounted only while the menu is open, so nothing
 * ticks behind a closed menu.
 *
 * Each slide paints its own card - an offer is a full promo-coloured banner, an information slide a
 * tinted panel - so this draws no ground of its own, and its controls sit below the card, on the
 * menu's white, where one colour reads whatever the slide above is.
 *
 * The slide that arrives is animated with Motion (motion.dev) through `lib/slide-motion`, which is
 * fetched when the menu first opens; never under reduced motion, and never on first open.
 */
const DWELL_MS = 6000

export function MenuCarousel({ children }: { children: React.ReactNode }) {
  const slides = Children.toArray(children)
  const [index, setIndex] = useState(0)
  const [held, setHeld] = useState(false)
  const count = slides.length
  const current = count === 0 ? 0 : index % count
  const shown = useRef(0)
  const direction = useRef(1)
  const scope = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (count > 1) warmSlideMotion()
  }, [count])

  useEffect(() => {
    if (shown.current === current) return
    shown.current = current
    const slide = scope.current?.querySelector<HTMLElement>(`[data-slide="${current}"]`)
    animateSlideIn(slide, direction.current, slide)
  }, [current])

  const go = (to: number, dir: number) => {
    direction.current = dir
    setIndex((to + count) % count)
  }

  useEffect(() => {
    if (count < 2 || held) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setTimeout(() => go(current + 1, 1), DWELL_MS)
    return () => window.clearTimeout(id)
  }, [count, held, index])

  if (count === 0) return null

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Offers and information"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className="flex h-full min-h-88 flex-col"
    >
      <div ref={scope} className="relative flex-1 overflow-hidden rounded-lg">
        {slides.map((slide, i) => (
          <div
            key={i}
            data-slide={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            hidden={i !== current}
            className="flex h-full flex-col"
          >
            {slide}
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex items-center gap-2" aria-hidden="true">
            {slides.map((_, i) => (
              <span
                key={i}
                className={`size-2 rounded-full ${i === current ? "bg-primary-fill" : "bg-primary/25"}`}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => go(current - 1, -1)}
              className="grid size-7 place-items-center rounded-md text-primary hover:bg-primary/10"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => go(current + 1, 1)}
              className="grid size-7 place-items-center rounded-md text-primary hover:bg-primary/10"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
