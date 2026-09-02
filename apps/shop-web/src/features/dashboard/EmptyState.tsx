import { CheckCircle2 } from "lucide-react"

/**
 * The steady state (US1, FR-008).
 *
 * ⚠ IT SAYS "NOTHING NEEDS YOU", NOT "NO RESULTS". This screen is read many times a day by someone
 * checking whether they are behind. An empty-results treatment — a shrug, a dashed box, "no data" —
 * makes a shop that is fully caught up look like a shop whose console is broken, and the two must
 * never be confusable. The wording states the fact positively and says what will happen next.
 *
 * ⚠ NO RETRY AFFORDANCE. There is nothing to retry: this is success. An error state is a different
 * component (`ErrorState`), and offering a button here would invite an operator to keep pressing it.
 */
export function DashboardEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border px-6 py-12 text-center">
      <span
        aria-hidden="true"
        className="text-muted-foreground flex size-10 items-center justify-center rounded-full border"
      >
        <CheckCircle2 className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">Nothing needs you right now</p>
        <p className="text-muted-foreground text-sm">
          No orders waiting and nothing running low. New orders appear here automatically.
        </p>
      </div>
    </div>
  )
}
