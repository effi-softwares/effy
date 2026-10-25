import { Panel } from "@effy/web-kit/patterns"

import { AUDIENCE_LABEL, DAYS, type Draft } from "../promotionDraft"

export function PromotionSummary({ d }: { d: Draft }) {
  const off =
    d.valueType === "free"
      ? "free"
      : d.valueType === "percent"
        ? `${d.percentOff || "…"}% off`
        : `$${d.amountOff || "…"} off`
  const value =
    d.kind === "delivery"
      ? d.valueType === "free"
        ? "Free delivery"
        : `${off} delivery`
      : d.kind === "bxgy"
        ? `Buy ${d.bxgyBuy || "…"} get ${d.bxgyGet || "…"} ${off}`
        : d.kind === "item"
          ? `${off} chosen ${d.appliesTo}`
          : `${off} the cart${d.valueType === "percent" && d.maxDiscount ? `, up to $${d.maxDiscount}` : ""}`
  const min = Number(d.minSubtotal) > 0 ? `On orders over $${Number(d.minSubtotal).toFixed(2)}` : "On any order"
  const limits = [
    d.maxUses && `${d.maxUses} uses in total`,
    d.maxUsesPerCustomer && `${d.maxUsesPerCustomer} per customer`,
    d.budget && `budget $${d.budget}`,
  ].filter(Boolean)
  return (
    <Panel title="Summary">
      <div className="space-y-4">
        {d.label ? <div className="ef-sub font-semibold uppercase tracking-wide">{d.label}</div> : null}
        <div className="text-base font-semibold">{d.headline || d.name || "Untitled promotion"}</div>
        {d.supportingLine ? <p className="ef-sub">{d.supportingLine}</p> : null}
        <ul className="space-y-1.5 text-sm">
          <li>{value}</li>
          <li>{min}</li>
          <li>
            {AUDIENCE_LABEL[d.audience]}
            {d.deliveryTypes.length === 1
              ? ` · ${d.deliveryTypes[0] === "effy" ? "Delivered by Effy only" : "Courier only"}`
              : ""}
          </li>
          {d.daysOfWeek.length || d.timeFrom ? (
            <li>
              {d.daysOfWeek.length
                ? [...d.daysOfWeek]
                    .sort()
                    .map((x) => DAYS[x - 1])
                    .join(", ")
                : "Every day"}
              {d.timeFrom && d.timeTo ? ` ${d.timeFrom}–${d.timeTo}` : ""}
            </li>
          ) : null}
          <li>
            {d.trigger === "code" ? (
              <>
                With the code <span className="ef-code">{d.sharedCode || "…"}</span>
              </>
            ) : (
              "Applies automatically"
            )}
          </li>
          <li>{limits.length ? limits.join(" · ") : "No limits"}</li>
          <li className="text-muted-foreground">
            {d.combinable ? "Combines with other offers" : "Doesn't combine with other offers"}
          </li>
        </ul>
        <p className="ef-sub">
          Never takes delivery or a cart below zero. Once it is used, what it gives and who it is for are fixed.
        </p>
      </div>
    </Panel>
  )
}
