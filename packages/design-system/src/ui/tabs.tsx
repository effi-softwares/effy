import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "../cn"

/**
 * shadcn Tabs, its default look, and the ONE tab design in both consoles: a `--muted` trough with
 * the active tab raised on it. Sections of a record, saved views of a list and mode switches all use
 * it. A view that lives in the URL renders its trigger `asChild` around a `Link`, under a
 * `<Tabs value>` that names the active view.
 */
const InTabsList = React.createContext(false)

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
    <InTabsList.Provider value={true}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        className={cn(
          // shadcn's list one step taller (40, 44 on a touch screen); it scrolls sideways (no bar) rather than overflow a narrow page.
          "inline-flex h-10 pointer-coarse:h-11 w-fit max-w-full items-center justify-start overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
        {...props}
      />
    </InTabsList.Provider>
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
        // shadcn's trigger: muted until hovered, the active one raised on the trough.
        "group/tab inline-flex h-[calc(100%-1px)] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground no-underline transition-[color,background-color,box-shadow] duration-(--dur-fast) hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm dark:data-[state=active]:bg-input [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
 * The count inside a tab: a soft tag in the tab's own text colour. `tone="primary"` marks a queue
 * that needs a person (blue). Also used on its own beside a heading or a button.
 */
function TabsCount({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & { tone?: "primary" }) {
  const inList = React.useContext(InTabsList)
  return (
    <span
      data-slot="tabs-count"
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium tabular-nums",
        inList ? "h-5 min-w-5 px-1.5 text-xs" : "h-6 px-2 text-xs",
        tone === "primary"
          ? "bg-primary-muted text-primary"
          : inList
            ? "bg-foreground/10 text-current"
            : "bg-muted text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsCount }
