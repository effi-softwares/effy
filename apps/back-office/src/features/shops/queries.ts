import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type {
  ChangeShopStatusRequest,
  CreateShopRequest,
  CreateShopUserRequest,
  UpdateShopRequest,
  UpdateShopUserRequest,
} from "@effy/shared-types"

import {
  addShopUser,
  changeShopStatus,
  createShop,
  deleteShop,
  getShop,
  getShopHistory,
  listShops,
  updateShop,
  updateShopUser,
  setPackScanning,
} from "./repo"
import type { ShopListParams } from "./model"

const SHOPS_ROOT = ["back-office", "shops"] as const

export const shopListQuery = (params: ShopListParams) =>
  queryOptions({
    queryKey: [...SHOPS_ROOT, "list", params] as const,
    queryFn: () => listShops(params),
  })

export const shopDetailQuery = (id: string) =>
  queryOptions({
    queryKey: [...SHOPS_ROOT, "detail", id] as const,
    queryFn: () => getShop(id),
  })

export const shopHistoryQuery = (id: string, page: number, pageSize: number) =>
  queryOptions({
    queryKey: [...SHOPS_ROOT, "history", id, page, pageSize] as const,
    queryFn: () => getShopHistory(id, page, pageSize),
  })

function invalidateShops(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  void queryClient.invalidateQueries({ queryKey: SHOPS_ROOT })
  if (id) void queryClient.invalidateQueries({ queryKey: [...SHOPS_ROOT, "detail", id] })
}

export function useCreateShop() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateShopRequest) => createShop(body),
    onSuccess: () => invalidateShops(queryClient),
  })
}

export function useUpdateShop(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateShopRequest) => updateShop(id, body),
    onSuccess: () => invalidateShops(queryClient, id),
  })
}

export function useChangeShopStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ChangeShopStatusRequest) => changeShopStatus(id, body),
    onSuccess: () => invalidateShops(queryClient, id),
  })
}

export function useSetPackScanning(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (required: boolean) => setPackScanning(id, required),
    onSuccess: () => invalidateShops(queryClient, id),
  })
}

export function useDeleteShop(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deleteShop(id),
    onSuccess: () => invalidateShops(queryClient, id),
  })
}

export function useAddShopUser(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateShopUserRequest) => addShopUser(id, body),
    onSuccess: () => invalidateShops(queryClient, id),
  })
}

export function useUpdateShopUser(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: UpdateShopUserRequest }) => updateShopUser(id, userId, body),
    onSuccess: () => invalidateShops(queryClient, id),
  })
}
