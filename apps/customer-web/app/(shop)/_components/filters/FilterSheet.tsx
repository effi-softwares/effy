"use client"

import { X } from "lucide-react"

import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@effy/design-system/ui"

import { ActionButton, iconBtnClass } from "@/components/storefront/actions"

/**
 * The phone and tablet filters: shadcn's Drawer from the bottom edge, around the same controls as the
 * desktop column. Its own module, fetched on demand — vaul and radix never reach /search's first load,
 * nor the desktop filter chunk.
 */
export function FilterSheet({
  open,
  onOpenChange,
  total,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  total: number | null
  children: React.ReactNode
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined} className="max-h-[88vh] lg:hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <DrawerTitle className="text-base font-semibold">Filters</DrawerTitle>
          <DrawerClose aria-label="Close" className={iconBtnClass("ghost", "md")}>
            <X aria-hidden="true" />
          </DrawerClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
        <div className="border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <ActionButton type="button" onClick={() => onOpenChange(false)} size="xl" className="w-full">
            Show {total ?? ""} results
          </ActionButton>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
