import { useNavigate } from "@tanstack/react-router"

import { BarChart3, ChevronRight, Download, Inbox, PackagePlus, Plus, Printer, type LucideIcon } from "lucide-react"

import { toast } from "@effy/design-system/ui"
import { ResponsiveSheet } from "@effy/web-kit/patterns"

import { track } from "@/lib/telemetry"

import { exportOrdersCsv } from "@/features/fulfillment/exportOrders"

import { printAwaitingPickLists } from "./printPickLists"

/**
 * "Quick actions" — everything an operator starts from the console.
 *
 * Six rows, not nine. The imported design also offered `New order`, `Discount code` and
 * `Message a customer`. None of the three is a styling decision:
 *
 *  • New order — a shop cannot create one. Customers buy from Effy; a shop is a hidden fulfilment
 *  node that receives portions of orders the platform has already taken payment for.
 *  • Discount code — promotion codes are platform-wide and apply to a whole basket. A code
 *  created here would discount other shops' items on orders this shop never sees.
 *  • Message a customer — a shop is never given the customer's email address, and the
 *  design's own copy names a mailbox (`orders@effy.shop`) that does not exist on this platform.
 *
 * Each would have to be faked to be shown, and a control that looks real and does nothing — or does
 * something subtly wrong — is worse than its absence. `today-refusals.guard.test.ts` fails if any of
 * them reappears.
 */
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
            // URL state, not a saved view: 057 removed the saved-views row on purpose.
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
            // It exports here rather than navigating with an "export=1" flag: a URL that performs
            // an action on arrival fires again on refresh and on a shared link. The Orders list's own
            // export function is called directly, so both routes produce the identical CSV.
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
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Quick actions" description="Everything you start from here.">
      {groups.map((group) => (
        <section key={group.label} className="grid gap-1">
          <h3 className="bo-eyebrow px-2 pt-1">{group.label}</h3>
          {group.items.map((item) => (
            <button key={item.title} type="button" onClick={item.run} className="bo-cmd-item h-auto! min-h-14 py-2">
              <item.icon aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.title}</span>
                <span className="block text-sm text-muted-foreground">{item.description}</span>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          ))}
        </section>
      ))}
    </ResponsiveSheet>
  )
}

/** Export every order in the list's default view — the same CSV the Orders screen builds. */
export async function exportOrders(): Promise<void> {
  try {
    // The list's default view — every order, newest-relevant first — because Today has no filter
    // state of its own to honour.
    const exported = await exportOrdersCsv({})
    toast(`Exported ${exported} ${exported === 1 ? "order" : "orders"}`)
  } catch {
    toast("The export couldn't be built. Try again in a moment.")
  }
}

/**
 * Print, then say what happened — truthfully.
 *
 * "0 pick lists sent to printer" is not a success message, and a blocked popup is not a print. Each
 * gets its own sentence, because an operator who thinks paper is coming will stand at the printer.
 */
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
