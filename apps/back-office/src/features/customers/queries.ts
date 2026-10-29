import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { PointsCreditRequest, PointsDebitRequest, PointsSettingsDTO } from "@effy/shared-types"

import {
  creditPoints,
  debitPoints,
  getCustomer,
  getPointsSettings,
  searchCustomers,
  updatePointsSettings,
} from "./repo"

export const customersKeys = {
  all: ["customers"] as const,
  search: (q: string) => ["customers", "search", q] as const,
  detail: (id: string) => ["customers", "detail", id] as const,
  settings: ["customers", "points-settings"] as const,
}

export const customerSearchQuery = (q: string) =>
  queryOptions({
    queryKey: customersKeys.search(q),
    queryFn: () => searchCustomers(q),
    enabled: q.trim().length >= 3,
    placeholderData: keepPreviousData,
  })

export const customerDetailQuery = (id: string) =>
  queryOptions({ queryKey: customersKeys.detail(id), queryFn: () => getCustomer(id) })

export const pointsSettingsQuery = queryOptions({ queryKey: customersKeys.settings, queryFn: getPointsSettings })

export function useCreditPoints(customerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PointsCreditRequest) => creditPoints(customerId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: customersKeys.all }),
  })
}

export function useDebitPoints(customerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PointsDebitRequest) => debitPoints(customerId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: customersKeys.all }),
  })
}

export function useUpdatePointsSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<PointsSettingsDTO>) => updatePointsSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: customersKeys.settings }),
  })
}
