import type { AdminPromotionWriteDTO, BannerLinkKind } from "@effy/shared-types"

import type { Promotion } from "./model"
import { fromLocal, toLocal } from "./promotionDraft"

/**
 * An information banner as the editor holds it (108): words, where a tap leads, when, where it's shown. It has none
 * of an offer's settings, so the body never sends one (the server refuses each by name).
 */
export interface BannerDraft {
  name: string
  headline: string
  supportingLine: string
  label: string
  link: {
    kind: BannerLinkKind
    category: { id: string; name: string } | null
    product: { id: string; name: string } | null
  }
  startsAt: string
  endsAt: string
  daysOfWeek: number[]
  timeFrom: string
  timeTo: string
  groupIds: string[]
}

export const EMPTY_BANNER: BannerDraft = {
  name: "",
  headline: "",
  supportingLine: "",
  label: "",
  link: { kind: "search", category: null, product: null },
  startsAt: "",
  endsAt: "",
  daysOfWeek: [],
  timeFrom: "",
  timeTo: "",
  groupIds: [],
}

export function bannerDraftOf(p: Promotion): BannerDraft {
  return {
    name: p.name,
    headline: p.headline ?? "",
    supportingLine: p.supportingLine ?? "",
    label: p.label ?? "",
    link: {
      kind: p.link?.kind ?? "search",
      category: p.link?.category ?? null,
      product: p.link?.product ?? null,
    },
    startsAt: toLocal(p.startsAt),
    endsAt: toLocal(p.endsAt),
    daysOfWeek: p.daysOfWeek ?? [],
    timeFrom: p.timeFrom ?? "",
    timeTo: p.timeTo ?? "",
    groupIds: p.groups.map((g) => g.id),
  }
}

export function bannerBodyOf(d: BannerDraft, isNew: boolean): Partial<AdminPromotionWriteDTO> {
  return {
    name: d.name.trim(),
    ...(isNew ? { kind: "banner" as const } : {}),
    headline: d.headline.trim() || null,
    supportingLine: d.supportingLine.trim() || null,
    label: d.label.trim() || null,
    link: {
      kind: d.link.kind,
      categoryId: d.link.kind === "category" ? (d.link.category?.id ?? null) : null,
      productId: d.link.kind === "product" ? (d.link.product?.id ?? null) : null,
    },
    daysOfWeek: d.daysOfWeek.length ? [...d.daysOfWeek].sort() : null,
    timeFrom: d.timeFrom || null,
    timeTo: d.timeTo || null,
    startsAt: fromLocal(d.startsAt),
    endsAt: fromLocal(d.endsAt),
    groupIds: d.groupIds,
  }
}

/**
 * The words with each live value shown as it reads now, for the editor's preview only: the server fills what
 * shoppers see. A value with nothing to show stays as its token so the gap is visible.
 */
export function previewText(text: string, values: readonly { token: string; reads: string | null }[]): string {
  return values.reduce((t, v) => (v.reads === null ? t : t.split(v.token).join(v.reads)), text)
}

/** A typed dollar amount beside "free delivery": the free-delivery amount is a live value and should be one. */
export function typedFreeDeliveryAmount(text: string): boolean {
  return /free delivery/i.test(text) && /\$\s?\d/.test(text)
}
