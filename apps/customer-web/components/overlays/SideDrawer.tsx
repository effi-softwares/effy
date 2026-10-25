"use client"

import { X } from "lucide-react"
import type * as React from "react"

import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

/**
 * A panel from the left or right edge — the cart and the phone menu. shadcn's Drawer (vaul) on the
 * shared blurred backdrop: focus trap, Escape, tap outside and swipe toward the edge all close it.
 * Fetched on demand by guest routes (`loadSideDrawer`), never at load.
 */
export function SideDrawer({
  open,
  onOpenChange,
  side,
  title,
  closeLabel = "Close",
  width,
  maxWidth,
  headerClassName,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  side: "left" | "right"
  /** The drawer's name, shown in its header and announced as its title. */
  title: React.ReactNode
  closeLabel?: string
  /** Inline, so it wins over the Drawer's default side width without a variant-prefixed class. */
  width: string
  maxWidth: string
  headerClassName?: string
  children: React.ReactNode
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction={side}>
      <DrawerContent
        aria-describedby={undefined}
        style={{ width, maxWidth }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className={cn("flex items-center justify-between px-4", headerClassName)}>
            <DrawerTitle className="text-base font-semibold">{title}</DrawerTitle>
            <DrawerClose
              aria-label={closeLabel}
              className="-mr-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-5" aria-hidden="true" />
            </DrawerClose>
          </div>
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
