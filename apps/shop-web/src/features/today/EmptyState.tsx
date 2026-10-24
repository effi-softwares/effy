import { CircleCheck } from "lucide-react"

/**
 * The steady state: it says "NOTHING NEEDS YOU", not "NO RESULTS", so a caught-up shop never looks like a
 * broken console. No retry button: this is success (errors are `ErrorState`).
 */
export function TodayEmptyState() {
  return (
    <div className="bo-empty border-0 py-10">
      <span aria-hidden="true" className="bo-empty__icon bg-success-soft text-success">
        <CircleCheck />
      </span>
      <h3>Nothing needs you right now</h3>
      <p>No orders waiting and nothing running low. New orders appear here automatically.</p>
    </div>
  )
}
