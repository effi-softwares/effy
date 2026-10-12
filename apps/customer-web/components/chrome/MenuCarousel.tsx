"use client"

import { Children, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

/**
 * The offers and information panel in the All aisles menu: one slide at a time, with the controls
 * to move between them.
 *
 * ⚠ It moves on by itself, and STOPS for anyone reading or reaching for it — pointer over it, focus
 * inside it, or a reduced-motion preference. It is mounted only while the menu is open, so nothing
 * ticks behind a closed menu.
 */
const DWELL_MS = 6000

export function MenuCarousel({ children }: { children: React.ReactNode }) {
  const slides = Children.toArray(children)
  const [index, setIndex] = useState(0)
  const [held, setHeld] = useState(false)
  const count = slides.length
  const current = count === 0 ? 0 : index % count

  useEffect(() => {
    if (count < 2 || held) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % count), DWELL_MS)
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
      className="flex h-full min-h-[22rem] flex-col rounded-lg bg-primary-muted p-4"
    >
      <div className="relative flex-1">
        {slides.map((slide, i) => (
          <div
            key={i}
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
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {slides.map((_, i) => (
              <span
                key={i}
                className={`size-1.5 rounded-full ${i === current ? "bg-primary" : "bg-primary/25"}`}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => setIndex((current - 1 + count) % count)}
              className="grid size-7 place-items-center rounded-md text-primary hover:bg-primary/10"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => setIndex((current + 1) % count)}
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
