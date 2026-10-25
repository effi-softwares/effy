"use client"

import * as React from "react"

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Dialog as DialogRoot,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

/**
 * The storefront's dialog (reference: `ui-dialog`): a title, an optional line under it, a body and a
 * row of actions. The design system's Dialog / AlertDialog: shadcn's responsive dialog (centred from
 * `md`, a bottom Drawer below it) on the blurred backdrop.
 *
 * `alert` is for a question that must be answered (delete, cancel): no close button, no dismissal by
 * clicking outside, and it is announced as an alert dialog.
 *
 * Guest routes may not reach radix or vaul at load (`scripts/dependency-cruiser.cjs`), so they import
 * this module on demand (`useOnDemand`); account and checkout pages import it directly.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  alert = false,
  size = "md",
  children,
  footer,
  onDismiss,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  alert?: boolean
  size?: "md" | "lg"
  children?: React.ReactNode
  /** The actions, least committing first. They sit right-aligned, and stack on a phone. */
  footer?: React.ReactNode
  /**
   * The shopper asked to leave (the close button, Escape, a click outside) — for a dialog that may
   * refuse, because what was typed would be lost. Without it, each of those simply closes.
   */
  onDismiss?: () => void
}) {
  const change = (next: boolean) => {
    if (!next && onDismiss) onDismiss()
    else onOpenChange(next)
  }
  const width = size === "lg" ? "sm:max-w-140" : "sm:max-w-md"

  if (alert) {
    return (
      <AlertDialog open={open} onOpenChange={change}>
        <AlertDialogContent className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto", width)}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg leading-tight">{title}</AlertDialogTitle>
            {description ? (
              <AlertDialogDescription className="text-sm">{description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          {children}
          {footer ? <AlertDialogFooter>{footer}</AlertDialogFooter> : null}
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <DialogRoot open={open} onOpenChange={change}>
      <DialogContent
        // Radix asks for a description; with none, an explicit `undefined` says so on purpose.
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto", width)}
      >
        <DialogHeader>
          <DialogTitle className="leading-tight">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter className="flex-wrap">{footer}</DialogFooter> : null}
      </DialogContent>
    </DialogRoot>
  )
}
