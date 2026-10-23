import { cache } from "react"

import type { BannerTarget, PromotionGroupsDTO, ShopperPromotionDTO, ShopperSkinDTO } from "@effy/shared-types"

import { edgeApi, uncached } from "@/lib/api/edge"
import { getSession } from "@/lib/session"

import { readPublicGroups } from "./promotion-groups-public"

/**
 * 094 — display groups, by key. The places promotions are shown (Home hero, the cards beside it, the
 * offers between Home's sections, the Offers page) each read their group, so back-office decides what
 * appears where and in what order.
 *
 * Signed out: the storefront's public answer, shared for up to a minute (the listing tier). Signed in:
 * commerce's personal answer — first-order and chosen-customer offers included — never cached.
 */
/** What a promotion component draws. */
export interface Banner {
  key: string
  title: string
  subtitle: string | null
  imageUrl: string | null
  imageWidths?: number[]
  href: string | null
  code?: string | null
  terms?: string | null
  target?: BannerTarget | null
}

export type GroupBanner = Banner & { label: string | null; skin?: ShopperSkinDTO }

/** What a promotion component draws: a banner, perhaps with a label and (095) the skin of its place. */
export type PlacedBanner = Banner & { label?: string | null; skin?: ShopperSkinDTO }

/** A group's promotion in the shape the existing banner components draw. */
export function toGroupBanner(p: ShopperPromotionDTO): GroupBanner {
  return {
    key: p.id,
    title: p.headline,
    subtitle: p.supportingLine,
    imageUrl: null,
    href: `/promotions/${p.id}`,
    code: p.code,
    terms: p.terms,
    target: p.target,
    label: p.label,
    // 095 — the skin this place wears; absent from a server before 095.
    ...(p.skin ? { skin: p.skin } : {}),
  }
}

export const getPromotionGroups = cache(async (...keys: string[]): Promise<Record<string, GroupBanner[]>> => {
  const joined = keys.join(",")
  const session = await getSession()
  const dto = session
    ? await edgeApi(session).get<PromotionGroupsDTO>(`/commerce/v1/promotion-groups?keys=${encodeURIComponent(joined)}`, uncached())
    : await readPublicGroups(joined)
  return Object.fromEntries(dto.groups.map((g) => [g.key, g.promotions.map(toGroupBanner)]))
})
