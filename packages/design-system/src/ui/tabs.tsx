import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "../cn"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        // ⚠ A 3px-padded `--muted` TROUGH at the container step. The padding is what makes the active
        // segment read as sitting IN a track rather than as a button that happens to be adjacent —
        // remove it and the control stops looking segmented at all.
        "inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // ⚠ THE ACTIVE SEGMENT IS A SOLID `--brand` FILL WITH WHITE TEXT AT 600 — not a raised white
        // chip. shadcn's default lifts the active segment with `bg-background` + `shadow-sm`, which
        // on a flat, shadowless design reads as a rendering artifact. The fill is also what ties the
        // control to the one action colour: the selected tab and the primary button are the same
        // statement.
        "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2.5 py-1 text-[13px] font-medium text-muted-foreground transition-[color,background-color] outline-none focus-visible:ring-[3px] focus-visible:ring-muted disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-brand data-[state=active]:font-semibold data-[state=active]:text-primary-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

/**
 * The optional count inside a segment: monospace at .65 opacity.
 *
 * ⚠ It dims rather than changing colour, so ONE rule works on both an active segment (white on
 * cobalt) and an inactive one (muted on the trough). A second colour would need a variant per state
 * and would be wrong the moment a third state exists.
 */
function TabsCount({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="tabs-count"
      className={cn("font-mono text-[12px] tabular-nums opacity-65", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsCount }
