import { SHOP_ORDER_METHODS, SHOP_ORDER_PAYMENT_STATES, SHOP_ORDER_RANGES } from "@effy/shared-types"
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@effy/design-system/ui"

import { METHOD_LABEL, PAYMENT_LABEL, RANGE_LABEL, type OrdersSearch } from "../orderConsole"

/**
 * The Orders list's filters (057 A3 revision 3) — the design's `orderFilters` side sheet: right-hand,
 * full height, ~440px, a close button in its header, NO footer. Selections apply straight away (they
 * write the URL, which re-queries), so there is no Apply button. The result count and "Clear all" sit
 * under a rule at the end of the body.
 *
 * ⚠ THE DESIGN'S THREE SELECTS, IN EFFY'S TERMS:
 *   • Date — as designed.
 *   • Payment — the states a paid Effy order can be in. The design's "Authorized" does not exist:
 *     capture is automatic at checkout (055 R3).
 *   • Channel → Delivery (same-day / standard). Effy sells through one channel, so the design's Online
 *     store / Instagram / Point of sale would be a select with one meaningful answer.
 * ⚠ No Fulfilment select — the status tabs on the page already do that job.
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 rounded-none sm:max-w-[440px]">
        <SheetHeader className="border-border gap-1 border-b px-5 pt-[18px] pb-3.5 pr-12">
          <SheetTitle className="text-[15.5px] tracking-[-.015em]">Filters</SheetTitle>
          <SheetDescription className="text-[13px] leading-[1.55]">
            Narrow the list down. Changes apply straight away.
          </SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 content-start gap-[18px] overflow-y-auto px-5 py-[18px]">
          <LabelledSelect
            id="filter-date"
            label="Date"
            value={search.range ?? "any"}
            options={SHOP_ORDER_RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
            onChange={(v) => onChange({ range: v as OrdersSearch["range"] })}
          />
          <LabelledSelect
            id="filter-payment"
            label="Payment"
            value={search.payment ?? "any"}
            options={[
              { value: "any", label: "Any" },
              ...SHOP_ORDER_PAYMENT_STATES.map((p) => ({ value: p, label: PAYMENT_LABEL[p] })),
            ]}
            onChange={(v) => onChange({ payment: v === "any" ? undefined : (v as OrdersSearch["payment"]) })}
          />
          <LabelledSelect
            id="filter-delivery"
            label="Delivery"
            value={search.method ?? "any"}
            options={SHOP_ORDER_METHODS.map((m) => ({ value: m, label: m === "any" ? "Any" : METHOD_LABEL[m] }))}
            onChange={(v) => onChange({ method: v as OrdersSearch["method"] })}
          />

          <div className="border-border flex items-center justify-between gap-2.5 border-t pt-4">
            <div className="text-muted-foreground text-[13px] tabular-nums" aria-live="polite">
              {countLabel}
            </div>
            <Button variant="outline" className="h-8 px-[11px] text-[13px]" onClick={onClearAll}>
              Clear all
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function LabelledSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-9 w-full px-[9px] text-[13.5px] shadow-none" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
