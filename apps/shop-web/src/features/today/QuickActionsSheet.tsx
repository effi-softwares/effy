import { useNavigate } from "@tanstack/react-router"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  toast,
} from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"

import { exportOrdersCsv } from "@/features/fulfillment/exportOrders"

import { printAwaitingPickLists } from "./printPickLists"

/**
 * "Quick actions" — everything an operator starts from the console (058, US4/FR-010).
 *
 * ⚠ SIX ROWS, NOT NINE. The imported design also offered `New order`, `Discount code` and
 * `Message a customer`. None of the three is a styling decision:
 *
 *   • NEW ORDER — a shop cannot create one. Customers buy from Effy; a shop is a hidden fulfilment
 *     node that receives portions of orders the platform has already taken payment for (057 FR-013).
 *   • DISCOUNT CODE — promotion codes are platform-wide and apply to a whole basket (027). A code
 *     created here would discount other shops' items on orders this shop never sees.
 *   • MESSAGE A CUSTOMER — a shop is never given the customer's email address (023 FR-018), and the
 *     design's own copy names a mailbox (`orders@effy.shop`) that does not exist on this platform.
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
    items: Array<{ glyph: string; title: string; description: string; run: () => void }>
  }> = [
    {
      label: "Create",
      items: [
        {
          glyph: "◻",
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
          glyph: "⎙",
          title: "Print pick lists",
          description: `${awaitingPick} ${awaitingPick === 1 ? "order is" : "orders are"} waiting to be picked.`,
          run: () => {
            close()
            track({ name: "quick_action_used", action: "print_pick_lists" })
            void printLists()
          },
        },
        {
          glyph: "↓",
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
          glyph: "!",
          title: "Open the attention queue",
          description: "Flagged and high-risk orders, oldest first.",
          run: () => {
            close()
            track({ name: "quick_action_used", action: "attention_queue" })
            // URL state, not a saved view: 057 removed the saved-views row on purpose (FR-026).
            void navigate({ to: "/orders", search: { attention: "at_risk", sort: "placed", dir: "asc" } })
          },
        },
      ],
    },
    {
      label: "Customers and reporting",
      items: [
        {
          glyph: "↧",
          title: "Export orders",
          description: "CSV of everything matching the current filters.",
          run: () => {
            close()
            track({ name: "quick_action_used", action: "export_orders" })
            // ⚠ It exports HERE rather than navigating with an "export=1" flag: a URL that performs
            // an action on arrival fires again on refresh and on a shared link. The Orders list's own
            // export function is called directly, so both routes produce the identical CSV.
            void exportOrders()
          },
        },
        {
          glyph: "◫",
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 rounded-none sm:max-w-[440px]">
        <SheetHeader className="border-border gap-1 border-b px-5 pt-[18px] pb-3.5 pr-12">
          <SheetTitle className="text-[15.5px] tracking-[-.015em]">Quick actions</SheetTitle>
          <SheetDescription className="text-[13px] leading-[1.55]">
            Everything you start from here.
          </SheetDescription>
        </SheetHeader>

        <div className="overflow-y-auto px-5 py-4">
          {groups.map((group) => (
            <section key={group.label} className="mb-5 last:mb-0">
              <h3 className="text-muted-foreground mb-1 text-[11.5px] font-medium tracking-wide uppercase">
                {group.label}
              </h3>
              {group.items.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={item.run}
                  className="hover:bg-accent flex w-full items-center gap-3 border-t px-1 py-3 text-left"
                >
                  <span
                    aria-hidden="true"
                    className="bg-muted text-muted-foreground grid size-[26px] shrink-0 place-items-center rounded-md font-mono text-xs"
                  >
                    {item.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium">{item.title}</span>
                    <span className="text-muted-foreground block text-[12.5px]">
                      {item.description}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ›
                  </span>
                </button>
              ))}
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
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
 * ⚠ "0 pick lists sent to printer" is not a success message, and a blocked popup is not a print. Each
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
