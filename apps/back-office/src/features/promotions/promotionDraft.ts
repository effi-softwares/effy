import type { AdminPromotionWriteDTO, PromotionAudience, PromotionKind, PromotionTrigger } from "@effy/shared-types"

import type { AppliesTo, Targets } from "./components/TargetPicker"
import type { Promotion } from "./model"

export const KINDS_OFFERED: readonly PromotionKind[] = ["cart", "item", "bxgy", "delivery"]
export const KIND_LABEL: Record<PromotionKind, string> = {
  cart: "Off the cart",
  item: "Off items",
  bxgy: "Buy X get Y",
  delivery: "Off delivery",
}
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
export const AUDIENCE_LABEL: Record<PromotionAudience, string> = {
  everyone: "Everyone",
  first_order: "First order",
  new_customers: "New customers",
  chosen: "Chosen customers",
}

export interface Draft {
  name: string
  kind: PromotionKind
  trigger: PromotionTrigger
  codeMode: "shared" | "single_use"
  sharedCode: string
  valueType: "percent" | "amount" | "free"
  percentOff: string
  amountOff: string
  maxDiscount: string
  minSubtotal: string
  minQuantity: string
  appliesTo: AppliesTo
  targets: Targets
  bxgyBuy: string
  bxgyGet: string
  bxgyMax: string
  deliveryTypes: ("effy" | "courier")[]
  audience: PromotionAudience
  daysOfWeek: number[]
  timeFrom: string
  timeTo: string
  startsAt: string
  endsAt: string
  maxUses: string
  maxUsesPerCustomer: string
  budget: string
  combinable: boolean
  headline: string
  supportingLine: string
  label: string
  groupIds: string[]
}

export const EMPTY_DRAFT: Draft = {
  name: "",
  kind: "cart",
  trigger: "code",
  codeMode: "shared",
  sharedCode: "",
  valueType: "percent",
  percentOff: "",
  amountOff: "",
  maxDiscount: "",
  minSubtotal: "0.00",
  minQuantity: "",
  appliesTo: "products",
  targets: { products: [], categoryIds: [], brands: [] },
  bxgyBuy: "2",
  bxgyGet: "1",
  bxgyMax: "",
  deliveryTypes: ["effy", "courier"],
  audience: "everyone",
  daysOfWeek: [],
  timeFrom: "",
  timeTo: "",
  startsAt: "",
  endsAt: "",
  maxUses: "",
  maxUsesPerCustomer: "",
  budget: "",
  combinable: false,
  headline: "",
  supportingLine: "",
  label: "",
  groupIds: [],
}

const toLocal = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null)
const intOrNull = (v: string) => (v.trim() === "" ? null : Number(v))
const moneyOrNull = (v: string) => (v.trim() === "" ? null : Number(v).toFixed(2))

export function draftOf(p: Promotion): Draft {
  return {
    name: p.name,
    kind: p.kind,
    trigger: p.trigger,
    codeMode: p.trigger === "code" && !p.sharedCode && p.singleUseCodeCount > 0 ? "single_use" : "shared",
    sharedCode: p.sharedCode ?? "",
    valueType: p.valueType,
    percentOff: p.percentOff?.toString() ?? "",
    amountOff: p.amountOff ?? "",
    maxDiscount: p.maxDiscount ?? "",
    minSubtotal: p.minSubtotal,
    minQuantity: p.minQuantity?.toString() ?? "",
    appliesTo: p.appliesTo === "cart" ? "products" : p.appliesTo,
    targets: {
      products: p.targets.products,
      categoryIds: p.targets.categories.map((c) => c.id),
      brands: p.targets.brands,
    },
    bxgyBuy: p.bxgy?.buy.toString() ?? "2",
    bxgyGet: p.bxgy?.get.toString() ?? "1",
    bxgyMax: p.bxgy?.maxPerOrder?.toString() ?? "",
    deliveryTypes: p.deliveryTypes,
    audience: p.audience,
    daysOfWeek: p.daysOfWeek ?? [],
    timeFrom: p.timeFrom ?? "",
    timeTo: p.timeTo ?? "",
    startsAt: toLocal(p.startsAt),
    endsAt: toLocal(p.endsAt),
    maxUses: p.maxUses?.toString() ?? "",
    maxUsesPerCustomer: p.maxUsesPerCustomer?.toString() ?? "",
    budget: p.budget ?? "",
    combinable: p.combinable,
    headline: p.headline ?? "",
    supportingLine: p.supportingLine ?? "",
    label: p.label ?? "",
    groupIds: p.groups.map((g) => g.id),
  }
}

export function bodyOf(d: Draft, used: boolean): Partial<AdminPromotionWriteDTO> {
  const fixed: Partial<AdminPromotionWriteDTO> = used
    ? {}
    : {
        kind: d.kind,
        trigger: d.trigger,
        valueType: d.valueType,
        ...(d.valueType === "percent"
          ? { percentOff: Number(d.percentOff), maxDiscount: moneyOrNull(d.maxDiscount) }
          : {}),
        ...(d.valueType === "amount" ? { amountOff: Number(d.amountOff || "0").toFixed(2) } : {}),
        minSubtotal: Number(d.minSubtotal || "0").toFixed(2),
        minQuantity: intOrNull(d.minQuantity),
        audience: d.audience,
        deliveryTypes: d.deliveryTypes,
        ...(d.kind === "item" || d.kind === "bxgy"
          ? {
              appliesTo: d.appliesTo,
              targets: {
                productIds: d.targets.products.map((p) => p.id),
                categoryIds: d.targets.categoryIds,
                brands: d.targets.brands,
              },
            }
          : { appliesTo: "cart" as const }),
        ...(d.kind === "bxgy"
          ? { bxgy: { buy: Number(d.bxgyBuy), get: Number(d.bxgyGet), maxPerOrder: intOrNull(d.bxgyMax) } }
          : { bxgy: null }),
      }
  return {
    name: d.name.trim(),
    ...fixed,
    ...(d.trigger === "code" && d.codeMode === "shared" ? { sharedCode: d.sharedCode.trim() || null } : {}),
    ...(d.trigger === "code" && d.codeMode === "single_use" && !used ? { codeMode: "single_use" as const } : {}),
    daysOfWeek: d.daysOfWeek.length ? [...d.daysOfWeek].sort() : null,
    timeFrom: d.timeFrom || null,
    timeTo: d.timeTo || null,
    startsAt: fromLocal(d.startsAt),
    endsAt: fromLocal(d.endsAt),
    maxUses: intOrNull(d.maxUses),
    maxUsesPerCustomer: intOrNull(d.maxUsesPerCustomer),
    budget: moneyOrNull(d.budget),
    combinable: d.combinable,
    headline: d.headline.trim() || null,
    supportingLine: d.supportingLine.trim() || null,
    label: d.label.trim() || null,
    groupIds: d.groupIds,
  }
}
