import { CheckCircle2 } from "lucide-react"

/**
 * The steady state: it says "NOTHING NEEDS YOU", not "NO RESULTS", so a caught-up shop never looks like a
 * broken console. No retry button: this is success (errors are `ErrorState`).
 */
export function TodayEmptyState() {
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
