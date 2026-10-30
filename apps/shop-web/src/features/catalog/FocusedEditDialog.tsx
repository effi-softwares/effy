import type { ReactNode } from "react"

import {
  Button,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

const WIDTH = { default: "sm:max-w-lg", wide: "sm:max-w-3xl", full: "sm:max-w-6xl" } as const

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  size?: keyof typeof WIDTH
  children: ReactNode
}

export function FocusedEditDialog({ open, onOpenChange, size = "default", children }: DialogProps) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className={cn("max-h-[90vh] overflow-y-auto max-md:max-h-[92dvh]", WIDTH[size])}>
        {children}
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}

interface FormProps {
  title: string
  /** The save button's word: "Send to Effy" on an approved product. */
  saveLabel?: string
  description?: string
  canSave: boolean
  saving: boolean
  error: string | null
  stale: boolean
  onReload: () => void
  onSave: () => void
  onCancel: () => void
  children: ReactNode
}

export function FocusedEditForm({
  title,
  saveLabel = "Save",
  description,
  canSave,
  saving,
  error,
  stale,
  onReload,
  onSave,
  onCancel,
  children,
}: FormProps) {
  return (
    <>
      <ResponsiveModalHeader>
        <ResponsiveModalTitle>{title}</ResponsiveModalTitle>
        {description ? <ResponsiveModalDescription>{description}</ResponsiveModalDescription> : null}
      </ResponsiveModalHeader>

      <div className="space-y-4">{children}</div>

      {error ? <p className="text-sm font-medium">{error}</p> : null}

      <ResponsiveModalFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        {stale ? (
          <Button type="button" variant="outline" onClick={onReload}>
            Reload
          </Button>
        ) : (
          <Button type="button" onClick={onSave} disabled={!canSave || saving}>
            {saving ? "Saving…" : saveLabel}
          </Button>
        )}
      </ResponsiveModalFooter>
    </>
  )
}
