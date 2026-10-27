import type { ReactNode } from "react"

import { cn } from "@effy/design-system"
import { ResponsiveModal, ResponsiveModalContent } from "@effy/design-system/ui"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
  children: ReactNode
}

export function CatalogModal({ open, onOpenChange, className, children }: Props) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent className={cn("max-md:max-h-[92dvh] max-md:overflow-y-auto", className)}>
        {children}
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
