import { CircleCheck } from "lucide-react"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@effy/design-system/ui"

export function TodayEmptyState() {
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-success-soft text-success">
          <CircleCheck aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Nothing needs you right now</EmptyTitle>
        <EmptyDescription>
          No orders waiting and nothing running low. New orders appear here automatically.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
