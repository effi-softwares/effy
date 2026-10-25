import { CircleCheck } from "lucide-react"

export function TodayEmptyState() {
  return (
    <div className="ef-empty border-0 py-10">
      <span aria-hidden="true" className="ef-empty__icon bg-success-soft text-success">
        <CircleCheck />
      </span>
      <h3>Nothing needs you right now</h3>
      <p>No orders waiting and nothing running low. New orders appear here automatically.</p>
    </div>
  )
}
