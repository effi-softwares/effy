import * as React from "react"
import { createPortal } from "react-dom"
import { Popover as PopoverPrimitive } from "radix-ui"
import { FocusScope } from "radix-ui/internal"
import { XIcon } from "lucide-react"

import { cn } from "../cn"
import { Button } from "./button"

/**
 * One step of a guided tour (106): the page dimmed on the one blurred backdrop, a hole cut around the thing the step
 * describes, and a card beside it. Presentational only - which step, and what happens on Next, belong to the caller
 * (`@effy/web-kit/tour`). Built on Radix Popover (`Anchor virtualRef` points the card at any element), so it is
 * placed, flipped and styled like every other popover; anatomy after Dice UI's Tour.
 *
 * - The page cannot be clicked while a step shows - not even inside the hole: a tour explains, it never presses.
 * - `above` elements (urgent banners) get their own hole, stay bright and stay clickable.
 * - With no `target`, the card sits in the middle of the window over a plain dim.
 * - → next, ← back, Esc close; Tab stays inside the card; focus returns where it was when the tour ends.
 */

export type TourSide = "top" | "right" | "bottom" | "left"

export interface TourStepViewProps {
  open: boolean
  /** What the step outlines; null = a centred card. */
  target: HTMLElement | null
  /** Cut out of the dim and left clickable (e.g. the new-order banner). */
  above?: readonly HTMLElement[]
  side?: TourSide
  title: string
  text: string
  /** 1-based, counting only the steps shown. */
  step: number
  of: number
  /** Omitted on the first step. */
  onBack?: () => void
  onNext: () => void
  onClose: () => void
  /** "Done" on the last step by default. */
  nextLabel?: string
}

const HOLE_PAD = 6
const HOLE_RADIUS = 8

interface Box {
  x: number
  y: number
  w: number
  h: number
}

function boxOf(el: HTMLElement, pad: number): Box {
  const r = el.getBoundingClientRect()
  return { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 }
}

function roundedRect({ x, y, w, h }: Box, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  return (
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}` +
    `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}` +
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  )
}

/** The window with holes cut out (even-odd), as a CSS clip path. */
function clipWithHoles(holes: readonly Box[]): string {
  const w = window.innerWidth
  const h = window.innerHeight
  const outer = `M0 0H${w}V${h}H0Z`
  return `path(evenodd, "${outer}${holes.map((b) => roundedRect(b, HOLE_RADIUS)).join("")}")`
}

/** Re-measures on scroll (any container), resize and the elements' own size changes. */
function useLayoutTick(active: boolean, elements: readonly (HTMLElement | null)[]): number {
  const [tick, setTick] = React.useState(0)
  React.useLayoutEffect(() => {
    if (!active) return
    let frame = 0
    const bump = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setTick((t) => t + 1))
    }
    window.addEventListener("resize", bump)
    window.addEventListener("scroll", bump, true)
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(bump)
    for (const el of elements) if (el) observer?.observe(el)
    bump()
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", bump)
      window.removeEventListener("scroll", bump, true)
      observer?.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...elements])
  return tick
}

/** The dim layer and the click catcher. */
function TourSpotlight({
  target,
  above,
}: {
  target: HTMLElement | null
  above: readonly HTMLElement[]
}) {
  useLayoutTick(true, [target, ...above])
  const aboveBoxes = above.map((el) => boxOf(el, 0))
  const dimHoles = target ? [boxOf(target, HOLE_PAD), ...aboveBoxes] : aboveBoxes
  return (
    <>
      <div
        aria-hidden="true"
        data-slot="tour-spotlight"
        className="pointer-events-none fixed inset-0 z-50 bg-scrim/60 duration-(--dur-standard) animate-in fade-in-0 supports-backdrop-filter:backdrop-blur-[2px]"
        style={{ clipPath: clipWithHoles(dimHoles) }}
      />
      {target ? (
        <div
          aria-hidden="true"
          data-slot="tour-spotlight-ring"
          className="pointer-events-none fixed z-50 rounded-lg ring-2 ring-ring"
          style={(() => {
            const b = boxOf(target, HOLE_PAD)
            return { left: b.x, top: b.y, width: b.w, height: b.h }
          })()}
        />
      ) : null}
      {/* Catches every click except over an `above` element: the hole around the target is not a way through. */}
      <div
        aria-hidden="true"
        data-slot="tour-blocker"
        className="fixed inset-0 z-50"
        style={{ clipPath: clipWithHoles(aboveBoxes) }}
        onPointerDown={(e) => e.preventDefault()}
      />
    </>
  )
}

function TourTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 data-slot="tour-title" tabIndex={-1} className={cn("text-base font-semibold outline-none", className)} {...props} />
}

function TourDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="tour-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function TourFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="tour-footer" className={cn("mt-4 flex items-center gap-2", className)} {...props} />
}

function TourStepCounter({ step, of, className }: { step: number; of: number; className?: string }) {
  return (
    <span data-slot="tour-step-counter" className={cn("mr-auto text-sm text-muted-foreground tabular-nums", className)}>
      Step {step} of {of}
    </span>
  )
}

function TourStepView({
  open,
  target,
  above = [],
  side = "bottom",
  title,
  text,
  step,
  of,
  onBack,
  onNext,
  onClose,
  nextLabel,
}: TourStepViewProps) {
  const titleId = React.useId()
  const textId = React.useId()
  const titleRef = React.useRef<HTMLHeadingElement>(null)
  const returnTo = React.useRef<HTMLElement | null>(null)

  // The card points at the target, or at the middle of the window when there is none.
  const anchor = React.useRef<{ getBoundingClientRect: () => DOMRect }>({
    getBoundingClientRect: () => new DOMRect(),
  })
  anchor.current = target
    ? target
    : { getBoundingClientRect: () => new DOMRect(window.innerWidth / 2, window.innerHeight * 0.3, 0, 0) }

  // Focus: remember where it was, and give it back when the tour ends.
  React.useEffect(() => {
    if (!open) return
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      const el = returnTo.current
      if (el && el.isConnected) el.focus({ preventScroll: true })
    }
  }, [open])

  // Each step is announced: its title takes focus.
  React.useEffect(() => {
    if (open) requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }))
  }, [open, step, title])

  // → and ← move between steps while the tour is open.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key === "ArrowRight") {
        e.preventDefault()
        onNext()
      } else if (e.key === "ArrowLeft" && onBack) {
        e.preventDefault()
        onBack()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onNext, onBack])

  if (!open) return null
  const last = step >= of

  return (
    <PopoverPrimitive.Root open modal={false}>
      <PopoverPrimitive.Anchor virtualRef={anchor} />
      {createPortal(<TourSpotlight target={target} above={above} />, document.body)}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="tour-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={textId}
          side={target ? side : "bottom"}
          align="center"
          sideOffset={target ? HOLE_PAD + 8 : 0}
          collisionPadding={16}
          avoidCollisions
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            onClose()
          }}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          className="z-[51] w-80 max-w-[calc(100vw-32px)] origin-(--radix-popover-content-transform-origin) rounded-lg border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <FocusScope.Root loop trapped>
              <div className="flex items-start gap-2">
                <TourTitle ref={titleRef} id={titleId} className="flex-1 pt-1">
                  {title}
                </TourTitle>
                <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-2" aria-label="Close tour" onClick={onClose}>
                  <XIcon aria-hidden="true" />
                </Button>
              </div>
              <TourDescription id={textId} className="mt-1">
                {text}
              </TourDescription>
              <TourFooter>
                {of > 1 ? <TourStepCounter step={step} of={of} /> : <span className="mr-auto" />}
                {onBack && step > 1 ? (
                  <Button variant="ghost" onClick={onBack}>
                    Back
                  </Button>
                ) : null}
                <Button onClick={onNext}>{nextLabel ?? (last ? "Done" : "Next")}</Button>
              </TourFooter>
          </FocusScope.Root>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { TourStepView, TourSpotlight, TourTitle, TourDescription, TourFooter, TourStepCounter }
