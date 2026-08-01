"use client"

import type { LocalityDTO } from "@effy/shared-types"
import { X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { checkServiceability } from "@/lib/delivery-check"
import { formatPlace } from "@/lib/delivery-display"
import {
  clearDeliveryContext,
  setDeliveryPlace,
  setDeliveryPostcode,
  useDeliveryContext,
} from "@/lib/delivery-store"
import { searchLocalities, type LocalityResult } from "@/lib/localities"

/**
 * The body of the delivery-location dialog — everything a shopper interacts with to name a place.
 *
 * ── Why this is a separate module (030 T027, FR-043) ───────────────────────────────────────────
 *
 * `DeliveryAffordance` renders in the storefront chrome on EVERY public route, against a 174 KB
 * budget with **0.1–0.2 KB** of measured headroom. So the affordance keeps only what a shopper who
 * never opens it needs, and everything else lives here, behind `next/dynamic`, loaded on first open.
 *
 * ⚠ Anything added to this file is free. Anything added to `DeliveryAffordance` is spent from ~0.1 KB.
 *
 * ── Why the list is hand-rolled ────────────────────────────────────────────────────────────────
 *
 * `radix-ui`, `sonner` and `vaul` are barred from the public path by `.dependency-cruiser.cjs`
 * (`no-heavy-ui-deps-on-guest-path`), whose own comment names the delivery picker as a native-dialog
 * case. So this is a plain `role="listbox"` with `aria-activedescendant`, arrow keys and Enter —
 * about sixty lines and zero dependencies (FR-045, FR-051).
 */

const DEBOUNCE_MS = 200

export default function DeliveryPanel({ onClose }: { onClose: () => void }) {
  const context = useDeliveryContext()
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LocalityResult | null>(null)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── The lookup, debounced and cancellable ─────────────────────────────────────────────────────
  //
  // ⚠ The AbortController is not an optimisation. Type "Rich" then "Richm": without it the slower
  // "Rich" response can land AFTER the "Richm" one and repaint the list under a finger that has
  // already moved on. Same staleness rule the store applies to the verdict (025).
  useEffect(() => {
    const q = draft.trim()
    if (q.length < 2) {
      setResult(null)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      const r = await searchLocalities(q, controller.signal)
      if (!controller.signal.aborted) {
        setResult(r)
        setActive(0)
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [draft])

  const places: LocalityDTO[] = result?.kind === "ok" ? result.places : []

  const choose = useCallback(
    (place: LocalityDTO) => {
      const postcode = setDeliveryPlace({
        locality: place.name,
        state: place.state,
        postcode: place.postcode,
      })
      if (!postcode) return
      setError(null)
      void checkServiceability(postcode)
    },
    [],
  )

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      // A highlighted suggestion wins — Enter on a list means "take this one".
      if (places.length > 0) {
        choose(places[active] ?? places[0])
        return
      }
      const postcode = setDeliveryPostcode(draft)
      if (!postcode) {
        // ⚠ "That isn't a place we know" — deliberately NOT "we don't deliver there" (FR-012).
        setError("Enter a suburb or a 4-digit postcode.")
        return
      }
      setError(null)
      void checkServiceability(postcode)
    },
    [draft, places, active, choose],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (places.length === 0) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActive((i) => (i + 1) % places.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActive((i) => (i - 1 + places.length) % places.length)
      }
    },
    [places],
  )

  return (
    <>
      <div className="flex items-start justify-between border-b px-5 py-4">
        <div>
          <h2 id="delivery-dialog-title" className="text-base font-semibold">
            Delivery location
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            We&rsquo;ll tell you straight away whether we deliver to you.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <form onSubmit={submit} className="px-5 py-4">
        <label htmlFor="delivery-place" className="text-sm font-medium">
          Suburb or postcode
        </label>
        <input
          ref={inputRef}
          id="delivery-place"
          name="place"
          autoComplete="off"
          role="combobox"
          aria-expanded={places.length > 0}
          aria-controls="delivery-place-list"
          aria-autocomplete="list"
          aria-activedescendant={places.length > 0 ? `delivery-place-${active}` : undefined}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          onKeyDown={onKeyDown}
          placeholder="Richmond, or 3121"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "delivery-place-error" : undefined}
          className="mt-1.5 h-11 w-full rounded-md border px-3 text-sm"
          autoFocus
        />

        {error && (
          <p id="delivery-place-error" role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* ── The places ──────────────────────────────────────────────────────────────────────
            ⚠ THREE non-answers, three different messages, and NONE of them is a refusal:
              invalid → keep typing · empty → we don't know that place · failed → we couldn't look  */}
        {result?.kind === "ok" && places.length > 0 && (
          <ul
            id="delivery-place-list"
            role="listbox"
            aria-label="Matching places"
            className="mt-2 max-h-64 overflow-y-auto rounded-md border"
          >
            {places.map((p, i) => (
              <li key={`${p.name}-${p.state}-${p.postcode}`} role="none">
                <button
                  type="button"
                  id={`delivery-place-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(p)}
                  // 44px min height — a suggestion is a touch target, not a text run (FR-032).
                  className={`flex min-h-11 w-full items-center px-3 text-left text-sm ${
                    i === active ? "bg-accent" : ""
                  }`}
                >
                  {formatPlace({ locality: p.name, state: p.state, postcode: p.postcode })}
                </button>
              </li>
            ))}
          </ul>
        )}

        {result?.kind === "ok" && places.length === 0 && draft.trim().length >= 2 && (
          <p className="mt-2 text-sm text-muted-foreground">
            We don&rsquo;t recognise that place. Check the spelling, or enter a 4-digit postcode.
          </p>
        )}

        {result?.kind === "failed" && (
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn&rsquo;t look that up just now. You can still enter a 4-digit postcode.
          </p>
        )}

        {/* The verdict, in the panel — the shopper learns the answer where they asked the question
            (FR-050), and can try somewhere else without reopening (FR-029). */}
        {context && (
          <p className="mt-4 border-t pt-3 text-sm" role="status" aria-live="polite">
            <span className="font-medium">{formatPlace(context)}</span>
            {" — "}
            {context.serviced === true && <span>we deliver here</span>}
            {context.serviced === false && (
              <span>we don&rsquo;t deliver here yet, but you can keep browsing</span>
            )}
            {context.serviced === null && <span className="text-muted-foreground">checking…</span>}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Check
          </button>
          {context && (
            <button
              type="button"
              onClick={() => {
                clearDeliveryContext()
                setDraft("")
                setResult(null)
              }}
              className="inline-flex h-10 items-center justify-center rounded-full border px-5 text-sm hover:bg-accent"
            >
              Clear
            </button>
          )}
        </div>
      </form>
    </>
  )
}
