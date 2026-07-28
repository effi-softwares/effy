"use client"

import { Check, X } from "lucide-react"

import { dismissToast, useToasts } from "@/lib/toast-store"

/**
 * Where toasts render (025 FR-039, FR-045).
 *
 * ⚠ `role="status"` + `aria-live="polite"` is the point, not decoration: an add-to-cart that is only
 * visible has not been communicated to a shopper using a screen reader, and "did that work?" is
 * exactly the uncertainty that produces duplicate adds.
 */
export function ToastRegion() {
  const toasts = useToasts()

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
            t.tone === "error"
              ? "border-destructive/40 bg-background text-foreground"
              : "border-border bg-background text-foreground"
          }`}
        >
          {t.tone === "success" && (
            <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
          )}
          <span className="flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.run()
                dismissToast(t.id)
              }}
              className="shrink-0 font-medium text-primary underline underline-offset-2"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
