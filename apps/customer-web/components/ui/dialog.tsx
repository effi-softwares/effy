import * as React from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The storefront's dialog (reference: `ui-dialog`): a title, an optional line under it, a body and a
 * row of actions.
 *
 * ⚠ A NATIVE `<dialog>`, opened with `ref.current.showModal()`. It gets focus trapping, Escape and an
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
}) {
  const id = React.useId()
  return (
    <dialog
      ref={ref}
      role={alert ? "alertdialog" : undefined}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onClose={onClose}
      className={cn(
        "fx-dialog fx-dialog-modal fx-responsive m-auto w-[calc(100%-2rem)] rounded-lg border bg-background p-6 text-foreground shadow-lg",
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
            onClick={() => ref.current?.close()}
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
