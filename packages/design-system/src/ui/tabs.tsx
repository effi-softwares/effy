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
        // A `--muted` trough, so the active segment sits in a track.
        "inline-flex h-12 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground dark:bg-[#18181b]",
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
        // The active segment is a raised chip on the trough; the others sit at 70%.
        "group/tab inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent px-4 text-[15px] font-medium text-foreground opacity-70 [transition:background-color_var(--dur-standard)_var(--ease-move),opacity_var(--dur-fast)_ease] outline-none hover:opacity-100 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:opacity-100 data-[state=active]:shadow-xs dark:data-[state=active]:bg-[#27272a] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
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

/** The count inside a segment: a grey tag, inverted on the active segment. */
function TabsCount({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="tabs-count"
      className={cn(
        "inline-flex h-[18px] items-center rounded-sm bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground group-data-[state=active]/tab:bg-foreground group-data-[state=active]/tab:text-background",
        className,
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsCount }
