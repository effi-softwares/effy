import type { ShopLifecycleStatus, ShopStaffStatus } from "@effy/shared-types"

import { StatusWord } from "@effy/web-kit/patterns"

const SHOP_WORD: Record<ShopLifecycleStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  disabled: "Disabled",
}
const SHOP_TONE = { active: "done", suspended: "waiting", disabled: "quiet" } as const

export function ShopStatusBadge({ status }: { status: ShopLifecycleStatus }) {
  return <StatusWord tone={SHOP_TONE[status]}>{SHOP_WORD[status]}</StatusWord>
}

export function StaffStatusBadge({ status }: { status: ShopStaffStatus }) {
  return (
    <StatusWord tone={status === "active" ? "done" : "quiet"}>{status === "active" ? "Active" : "Disabled"}</StatusWord>
  )
}
