import { useState } from "react"

import type { CustomerDestination, MessageDestination, NotificationAudience } from "@effy/shared-types"
import { Label, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"

import { LinkPicker, type LinkChoice } from "@/components/link-picker/LinkPicker"

/** A storefront link (108's picker) as a customer destination (109's list), or null until it names what it needs. */
export function toCustomerDestination(link: LinkChoice): CustomerDestination | null {
  switch (link.kind) {
    case "search":
      return { kind: "search" }
    case "sale":
      return { kind: "sale" }
    case "category":
      return link.category?.key
        ? { kind: "aisle", aisleKey: link.category.key, title: link.category.name.split(" › ").pop() }
        : null
    case "product":
      return link.product ? { kind: "product", productId: link.product.id } : null
    default:
      return null
  }
}

/** The picker's view of a saved customer destination. */
export function linkOf(d: CustomerDestination): LinkChoice {
  if (d.kind === "aisle")
    return {
      kind: "category",
      category: { id: d.aisleKey, name: d.title ?? d.aisleKey, key: d.aisleKey },
      product: null,
    }
  if (d.kind === "product")
    return { kind: "product", category: null, product: { id: d.productId, name: "The chosen product" } }
  if (d.kind === "sale") return { kind: "sale", category: null, product: null }
  return { kind: "search", category: null, product: null }
}

const FIXED: Record<NotificationAudience, { value: string; label: string; to: MessageDestination }[]> = {
  customer: [
    { value: "home", label: "Home", to: { kind: "home" } },
    { value: "orders", label: "Their orders", to: { kind: "orders" } },
    { value: "points", label: "Their points", to: { kind: "points" } },
  ],
  driver: [
    { value: "today", label: "Today", to: { kind: "today" } },
    { value: "account", label: "Account", to: { kind: "account" } },
  ],
  shop: [
    { value: "queue", label: "Order queue", to: { kind: "queue" } },
    { value: "catalog", label: "Catalogue", to: { kind: "catalog" } },
  ],
}

const STOREFRONT = new Set(["search", "sale", "aisle", "product"])

/**
 * Where a tap leads, per audience (112 R10): the audience's own screens, and for customers anywhere in the storefront
 * through information banners' picker. `extra` adds choices of the caller's (one customer's orders).
 */
export function DestinationPicker({
  audience,
  value,
  onChange,
  extra = [],
}: {
  audience: NotificationAudience
  value: MessageDestination
  onChange: (d: MessageDestination) => void
  extra?: { value: string; label: string; to: MessageDestination }[]
}) {
  const fixed = [...FIXED[audience], ...extra]
  const inStorefront = audience === "customer" && STOREFRONT.has(value.kind)
  const [link, setLink] = useState<LinkChoice>(() =>
    inStorefront ? linkOf(value as CustomerDestination) : { kind: "sale", category: null, product: null },
  )
  const selected = inStorefront
    ? "storefront"
    : (fixed.find((f) => JSON.stringify(f.to) === JSON.stringify(value))?.value ?? fixed[0]!.value)

  return (
    <div className="space-y-4" data-tour="messages.destination">
      <Label className="sr-only">Where a tap leads</Label>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="Where a tap leads"
        value={selected}
        onValueChange={(v) => {
          if (!v) return
          if (v === "storefront") {
            const d = toCustomerDestination(link)
            onChange(d ?? { kind: "sale" })
            return
          }
          const f = fixed.find((x) => x.value === v)
          if (f) onChange(f.to)
        }}
        className="flex-wrap"
      >
        {fixed.map((f) => (
          <ToggleGroupItem key={f.value} value={f.value} className="px-3">
            {f.label}
          </ToggleGroupItem>
        ))}
        {audience === "customer" ? (
          <ToggleGroupItem value="storefront" className="px-3">
            Somewhere in the shop
          </ToggleGroupItem>
        ) : null}
      </ToggleGroup>
      {selected === "storefront" ? (
        <LinkPicker
          value={link}
          onChange={(l) => {
            setLink(l)
            const d = toCustomerDestination(l)
            if (d) onChange(d)
          }}
        />
      ) : null}
    </div>
  )
}
