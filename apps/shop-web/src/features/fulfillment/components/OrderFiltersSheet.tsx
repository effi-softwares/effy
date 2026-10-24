import { SHOP_ORDER_DELIVERED_BY, SHOP_ORDER_PAYMENT_STATES, SHOP_ORDER_RANGES } from "@effy/shared-types"
import { Button } from "@effy/design-system/ui"
import { ResponsiveSheet } from "@effy/web-kit/patterns"

import { ChoiceCards } from "@/components/console/ChoiceCards"

import { DELIVERED_BY_FILTER_LABEL, PAYMENT_LABEL, RANGE_LABEL, type OrdersSearch } from "../orderConsole"

/**
 * The Orders list's filters on a portrait tablet or a phone (Orders board 09): a right sheet (a drawer on a
 * phone) of choice cards — the whole card is the target. Selections apply at once (they write the URL);
 * the footer clears them or closes the sheet with the count. Placed; Goes with (Effy driver / Courier);
 * Payment (the states a paid order can be in). No Fulfilment choice: the status tabs do that.
 */
export function OrderFiltersSheet({
  open,
  onOpenChange,
  search,
  countLabel,
  onChange,
  onClearAll,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  search: OrdersSearch
  countLabel: string
  onChange: (patch: Partial<OrdersSearch>) => void
  onClearAll: () => void
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      description="Narrow the list down. Changes apply straight away."
      footer={
        <>
          <Button variant="ghost" onClick={onClearAll}>
            Clear all
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </>
      }
    >
      <ChoiceCards
        label="Placed"
        value={search.range ?? "any"}
        options={SHOP_ORDER_RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
        onChange={(v) => onChange({ range: v === "any" ? undefined : (v as OrdersSearch["range"]) })}
      />
      <ChoiceCards
        label="Goes with"
        value={search.deliveredBy ?? "any"}
        options={SHOP_ORDER_DELIVERED_BY.map((d) => ({ value: d, label: DELIVERED_BY_FILTER_LABEL[d] }))}
        onChange={(v) => onChange({ deliveredBy: v === "any" ? undefined : (v as OrdersSearch["deliveredBy"]) })}
      />
      <ChoiceCards
        label="Payment"
        value={search.payment ?? "any"}
        options={[{ value: "any", label: "Any" }, ...SHOP_ORDER_PAYMENT_STATES.map((p) => ({ value: p, label: PAYMENT_LABEL[p] }))]}
        onChange={(v) => onChange({ payment: v === "any" ? undefined : (v as OrdersSearch["payment"]) })}
      />
      <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {countLabel}
      </p>
    </ResponsiveSheet>
  )
}
