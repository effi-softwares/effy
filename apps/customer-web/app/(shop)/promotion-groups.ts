import { cache } from "react"

import type { BannerDTO, PromotionGroupsDTO, ShopperPromotionDTO } from "@effy/shared-types"

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
export type GroupBanner = BannerDTO & { label: string | null }

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
