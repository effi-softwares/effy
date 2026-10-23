"use client"

import * as React from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The storefront's dialog (reference: `ui-dialog`): a title, an optional line under it, a body and a
 * row of actions.
 *
 * A native `<dialog>`, opened with `ref.current.showModal`. It gets focus trapping, Escape and an
 * inert page for nothing, and it is why this surface loads no overlay library. Centred from `md`;
 * below it the same element docks to the bottom edge with full-width actions (`fx-responsive`).
 *
 * `alert` is for a question that must be answered (delete, cancel): no close button, and it is
 * announced as an alert dialog.
 */
export function Dialog({
  ref,
  title,
  description,
  alert = false,
  size = "md",
  children,
  footer,
  onClose,
  onDismiss,
}: {
  ref: React.RefObject<HTMLDialogElement | null>
  title: string
  description?: React.ReactNode
  alert?: boolean
  size?: "md" | "lg"
  children?: React.ReactNode
  /** The actions, least committing first. They sit right-aligned, and stack on a phone. */
  footer?: React.ReactNode
  onClose?: () => void
  /**
   * The shopper asked to leave (the close button, or Escape) — for a dialog that may refuse, because
   * what was typed would be lost. Without it, both simply close.
   */
  onDismiss?: () => void
}) {
  const id = React.useId()
  return (
    <dialog
      ref={ref}
      role={alert ? "alertdialog" : undefined}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onClose={onClose}
      onCancel={(event) => {
        if (!onDismiss) return
        event.preventDefault()
        onDismiss()
      }}
      className={cn(
        // Taller than the screen scrolls inside the dialog; the page behind never moves.
        "fx-dialog fx-dialog-modal fx-responsive m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-lg border bg-background p-6 text-foreground shadow-lg",
        size === "lg" ? "max-w-[560px]" : "max-w-md",
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 pr-6 max-md:items-center max-md:pr-0 max-md:text-center">
          <h2 id={`${id}-title`} className="text-lg font-semibold leading-tight">
            {title}
          </h2>
          {description && (
            <p id={`${id}-description`} className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {!alert && (
          <button
            type="button"
            aria-label="Close"
            onClick={() => (onDismiss ? onDismiss() : ref.current?.close())}
            className="absolute top-4 right-4 grid size-6 place-items-center rounded-sm opacity-70 hover:opacity-100 max-md:hidden"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
        {children}
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 max-md:flex-col-reverse max-md:[&>*]:w-full">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  )
}

/**
 * For a dialog whose open state lives in its parent (`open` / `onOpenChange`): a ref that opens and
 * closes the native element to match. Pass `onClose={ => onOpenChange(false)}` to the dialog so a
 * dismissal the browser handles itself (Escape) is reported back.
 */
export function useDialogOpen(open: boolean): React.RefObject<HTMLDialogElement | null> {
  const ref = React.useRef<HTMLDialogElement>(null)
  React.useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])
  return ref
}
