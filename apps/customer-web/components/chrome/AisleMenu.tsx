"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { LayoutGrid } from "lucide-react"

import { animateMenuOpen, warmSlideMotion } from "@/lib/slide-motion"
import { cn } from "@/lib/utils"

/**
 * The All aisles menu's behaviour (reference: Home · All aisles mega menu). Everything it SHOWS is
 * rendered on the server and handed in — this file is only when it is open and which aisle is showing,
 * so it adds a few hundred bytes to the guest bundle and no icon set.
 *
 * ⚠ IT OPENS ON HOVER, AND NEVER ONLY ON HOVER. A mouse resting on the button opens it; so does a
 * press, a tap, or Enter — touch screens and keyboards have no hover.
 *
 * ⚠ THE DELAYS ARE THE FEATURE. Without the short wait before opening, the menu flashes every time
 * the pointer crosses the header; without the wait before closing, it vanishes when the pointer
 * cuts a corner on its way from the button to the panel; without the wait on an aisle row, sweeping
 * diagonally towards the groups switches aisle on the way there.
 */
const OPEN_AFTER_MS = 120
const CLOSE_AFTER_MS = 220
const SWITCH_AFTER_MS = 90

export interface AisleMenuItem {
  key: string
  /** The aisle's row in the left-hand list (a link, rendered on the server). */
  row: React.ReactNode
  /** Its groups and sub-aisles. */
  panel: React.ReactNode
}

export function AisleMenu({
  items,
  aside,
  footer,
}: {
  items: AisleMenuItem[]
  /** The offers and information panel on the right. Mounted only while the menu is open. */
  aside: React.ReactNode
  footer: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(items[0]?.key ?? "")
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const switchTimer = useRef<number | undefined>(undefined)
  const panelId = useId()
  const panel = useRef<HTMLDivElement>(null)

  // The menu drops into place when it opens (Motion, fetched once the page is interactive — see
  // `lib/slide-motion`). Closing is immediate: the shopper is already on their way somewhere else.
  useEffect(() => warmSlideMotion(), [])
  useEffect(() => {
    if (open) animateMenuOpen(panel.current)
  }, [open])

  const later = useCallback((fn: () => void, ms: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(fn, ms)
  }, [])

  const close = useCallback(() => {
    window.clearTimeout(timer.current)
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      close()
      button.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close()
    }
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("pointerdown", onPointerDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [open, close])

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      window.clearTimeout(switchTimer.current)
    },
    [],
  )

  // Hover is a MOUSE idea. A finger "enters" an element at the moment it presses it, and that press
  // is already handled as a press.
  const hover = (fn: () => void) => (event: React.PointerEvent) => {
    if (event.pointerType === "mouse") fn()
  }

  // The button and the panel keep it open; the page around them does not.
  const stayOpen = {
    onPointerEnter: hover(() => later(() => setOpen(true), OPEN_AFTER_MS)),
    onPointerLeave: hover(() => later(() => setOpen(false), CLOSE_AFTER_MS)),
  }

  const show = (key: string, wait: number) => {
    window.clearTimeout(switchTimer.current)
    switchTimer.current = window.setTimeout(() => setActive(key), wait)
  }

  return (
    <div
      ref={root}
      className="shrink-0"
      // Tabbing out of the menu closes it; moving between its own links does not.
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) close()
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
        {...stayOpen}
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-md border border-input pr-3 pl-2.5 text-sm font-medium whitespace-nowrap shadow-xs hover:bg-accent",
          open && "bg-accent",
        )}
      >
        <LayoutGrid aria-hidden="true" className="size-4 text-muted-foreground" />
        All aisles
      </button>

      <div id={panelId} hidden={!open}>
        <div
          ref={panel}
          // Following any link in the menu closes it — the page under it is about to change.
          onClick={(event) => {
            if ((event.target as Element).closest("a")) close()
          }}
          {...stayOpen}
          className="absolute top-full left-0 z-10 w-full overflow-hidden rounded-b-lg border border-t-0 bg-popover text-popover-foreground shadow-lg"
        >
          <div className="grid max-h-[min(34rem,calc(100dvh-12rem))] grid-cols-[15rem_minmax(0,1fr)_17rem]">
            <ul className="overflow-y-auto p-2">
              {items.map((item) => (
                <li
                  key={item.key}
                  data-active={item.key === active || undefined}
                  onPointerEnter={hover(() => show(item.key, SWITCH_AFTER_MS))}
                  onPointerLeave={hover(() => window.clearTimeout(switchTimer.current))}
                  onFocus={() => show(item.key, 0)}
                  className="rounded-md data-active:bg-accent"
                >
                  {item.row}
                </li>
              ))}
            </ul>
            <div className="overflow-y-auto px-6 py-5">
              {items.map((item) => (
                <div key={item.key} hidden={item.key !== active}>
                  {item.panel}
                </div>
              ))}
            </div>
            <div className="p-4 pl-0">{open && aside}</div>
          </div>
          {footer}
        </div>
      </div>
    </div>
  )
}
