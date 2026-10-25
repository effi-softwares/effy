"use client"

import { useRouter } from "next/navigation"

import { select } from "@/components/storefront/kit"
import { cn } from "@/lib/utils"

/** The order history's period. Choosing one navigates: the URL is the state. */
export function PeriodSelect({
  value,
  periods,
  hrefs,
}: {
  value: string
  periods: ReadonlyArray<{ key: string; label: string }>
  /** Where each period leads, built on the server so the other filters ride along. */
  hrefs: Record<string, string>
}) {
  const router = useRouter()
  return (
    <select
      aria-label="Time period"
      value={value}
      onChange={(e) => router.push(hrefs[e.target.value] ?? "/orders")}
      className={cn(select, "w-45")}
    >
      {periods.map((p) => (
        <option key={p.key} value={p.key}>
          {p.label}
        </option>
      ))}
    </select>
  )
}
