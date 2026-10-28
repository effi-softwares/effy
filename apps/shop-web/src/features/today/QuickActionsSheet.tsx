import { useNavigate } from "@tanstack/react-router"

import { BarChart3, ChevronRight, Download, Inbox, PackagePlus, Plus, Printer, type LucideIcon } from "lucide-react"

import { Button, toast } from "@effy/design-system/ui"
import { ResponsiveSheet } from "@effy/web-kit/patterns"

import { track } from "@/lib/telemetry"

import { exportOrdersCsv } from "@/features/fulfillment/exportOrders"

import { printAwaitingPickLists } from "./printPickLists"

export function QuickActionsSheet({
  open,
  onOpenChange,
  awaitingPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  awaitingPick: number
}) {
  const navigate = useNavigate()

  const close = () => onOpenChange(false)

  const groups: Array<{
    label: string
    items: Array<{ icon: LucideIcon; title: string; description: string; run: () => void }>
  }> = [
    {
      label: "Create",
      items: [
        {
          icon: Plus,
          title: "New product",
          description: "Four steps: details, pricing, inventory, visibility.",
          run: () => {
            close()
            track({ name: "quick_action_used", action: "new_product" })
            void navigate({ to: "/catalog/new" })
          },
        },
      ],
    },
    {
      label: "Fulfilment",
      items: [
        {
          icon: Printer,
          title: "Print pick lists",
          description: `${awaitingPick} ${awaitingPick === 1 ? "order is" : "orders are"} waiting to be picked.`,
          run: () => {
            close()
            track({ name: "quick_action_used", action: "print_pick_lists" })
            void printLists()
          },
        },
        {
          icon: PackagePlus,
          title: "Receive stock",
          description: "Count units into a product and its variants.",
          run: () => {
            close()
            track({ name: "quick_action_used", action: "receive_stock" })
            toast("Pick a product to receive stock into")
            void navigate({ to: "/catalog" })
          },
        },
        {
          icon: Inbox,
          title: "Open the attention queue",
          description: "Flagged and high-risk orders, oldest first.",
          run: () => {
            close()
            track({ name: "quick_action_used", action: "attention_queue" })
            void navigate({ to: "/orders", search: { attention: "at_risk", sort: "placed", dir: "asc" } })
          },
        },
      ],
    },
    {
      label: "Customers and reporting",
      items: [
        {
          icon: Download,
          title: "Export orders",
          description: "CSV of everything matching the current filters.",
          run: () => {
            close()
            track({ name: "quick_action_used", action: "export_orders" })
            void exportOrders()
          },
        },
        {
          icon: BarChart3,
          title: "Open insights",
          description: "Revenue, volume, conversion and top products.",
          run: () => {
            close()
            track({ name: "quick_action_used", action: "open_insights" })
            void navigate({ to: "/insights" })
          },
        },
      ],
    },
  ]

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Quick actions"
      description="Everything you start from here."
    >
      {groups.map((group) => (
        <section key={group.label} className="grid gap-1">
          <h3 className="px-2 pt-1 text-xs font-medium text-muted-foreground">{group.label}</h3>
          {group.items.map((item) => (
            <Button
              key={item.title}
              type="button"
              variant="ghost"
              onClick={item.run}
              className="h-auto min-h-14 justify-start gap-3 px-2 py-2 text-left whitespace-normal"
            >
              <item.icon aria-hidden="true" className="text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.title}</span>
                <span className="block font-normal text-muted-foreground">{item.description}</span>
              </span>
              <ChevronRight aria-hidden="true" className="text-muted-foreground" />
            </Button>
          ))}
        </section>
      ))}
    </ResponsiveSheet>
  )
}

export async function exportOrders(): Promise<void> {
  try {
    const exported = await exportOrdersCsv({})
    toast(`Exported ${exported} ${exported === 1 ? "order" : "orders"}`)
  } catch {
    toast("The export couldn't be built. Try again in a moment.")
  }
}

export async function printLists(): Promise<void> {
  try {
    const { printed, more } = await printAwaitingPickLists()
    if (printed === 0) {
      toast("Nothing is waiting to be picked")
      return
    }
    toast(
      more > 0
        ? `${printed} pick lists sent to printer · ${more} more not included`
        : `${printed} ${printed === 1 ? "pick list" : "pick lists"} sent to printer`,
    )
  } catch {
    toast("Pick lists couldn't be printed. Try again in a moment.")
  }
}
