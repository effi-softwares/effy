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
  footer?: React.ReactNode
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
