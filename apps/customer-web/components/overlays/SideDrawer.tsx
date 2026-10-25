"use client"

import { X } from "lucide-react"
import type * as React from "react"

import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

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
  title: React.ReactNode
  closeLabel?: string
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
