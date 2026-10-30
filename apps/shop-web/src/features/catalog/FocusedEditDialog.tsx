import type { ReactNode } from "react"

import {
  Button,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  useResponsiveModalIsMobile,
} from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

const WIDTH = { default: "sm:max-w-lg", wide: "sm:max-w-3xl", full: "sm:max-w-6xl" } as const

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  size?: keyof typeof WIDTH
  children: ReactNode
}

/**
 * A product edit, in shadcn's responsive dialog (its padding and gap marked important: the consoles' dialog rule in
 * console.css is unlayered, so it outweighs a plain utility). On a desktop the title stays put above a rule, only the fields scroll,
 * and the buttons stay put on a footer below them; on a phone it is the bottom drawer, scrolling as a whole.
 */
export function FocusedEditDialog({ open, onOpenChange, size = "default", children }: DialogProps) {
  const mobile = useResponsiveModalIsMobile()
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent
        className={cn(
          mobile
            ? "max-h-[92dvh] overflow-y-auto"
            : "grid max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0! overflow-hidden p-0!",
          WIDTH[size],
        )}
      >
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
  const mobile = useResponsiveModalIsMobile()
  return (
    <>
      <ResponsiveModalHeader className={mobile ? undefined : "border-b px-6 pt-6 pr-12 pb-4"}>
        <ResponsiveModalTitle>{title}</ResponsiveModalTitle>
        {description ? (
          <ResponsiveModalDescription className="max-w-[72ch]">{description}</ResponsiveModalDescription>
        ) : null}
      </ResponsiveModalHeader>

      <div className={mobile ? "space-y-4" : "min-h-0 space-y-4 overflow-y-auto px-6 py-5 [scrollbar-width:thin]"}>
        {children}
      </div>

      {error && mobile ? <p className="text-sm font-medium">{error}</p> : null}

      <ResponsiveModalFooter className={mobile ? undefined : "items-center border-t bg-muted/40 px-6 py-4"}>
        {error && !mobile ? (
          <p role="alert" className="mr-auto text-sm font-medium">
            {error}
          </p>
        ) : null}
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
