import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ChangeShopStatusRequest,
  CreateShopRequest,
  CreateShopUserRequest,
  UpdateShopRequest,
  UpdateShopUserRequest,
} from "@effy/shared-types";

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
} from "./repo";
import type { ShopListParams } from "./model";

// Server state lives ONLY in the TanStack Query cache (Principle VI). The list query is keyed on
// its params so each page/filter/search combination caches independently; mutations invalidate the
// affected keys (copying the useSignOut pattern) rather than hand-patching cached data.

const SHOPS_ROOT = ["back-office", "shops"] as const;

export const shopListQuery = (params: ShopListParams) =>
  queryOptions({
    queryKey: [...SHOPS_ROOT, "list", params] as const,
    queryFn: () => listShops(params),
  });

export const shopDetailQuery = (id: string) =>
  queryOptions({
    queryKey: [...SHOPS_ROOT, "detail", id] as const,
    queryFn: () => getShop(id),
  });

export const shopHistoryQuery = (id: string, page: number, pageSize: number) =>
  queryOptions({
    queryKey: [...SHOPS_ROOT, "history", id, page, pageSize] as const,
    queryFn: () => getShopHistory(id, page, pageSize),
  });

// Invalidate everything under the shops root — the list counts and the detail roster both move
// after any write, so a coarse invalidation is correct and cheap here.
function invalidateShops(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  void queryClient.invalidateQueries({ queryKey: SHOPS_ROOT });
  if (id) void queryClient.invalidateQueries({ queryKey: [...SHOPS_ROOT, "detail", id] });
}

export function useCreateShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateShopRequest) => createShop(body),
    onSuccess: () => invalidateShops(queryClient),
  });
}

export function useUpdateShop(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateShopRequest) => updateShop(id, body),
    onSuccess: () => invalidateShops(queryClient, id),
  });
}

export function useChangeShopStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangeShopStatusRequest) => changeShopStatus(id, body),
    onSuccess: () => invalidateShops(queryClient, id),
  });
}

export function useDeleteShop(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteShop(id),
    onSuccess: () => invalidateShops(queryClient, id),
  });
}

export function useAddShopUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateShopUserRequest) => addShopUser(id, body),
    onSuccess: () => invalidateShops(queryClient, id),
  });
}

export function useUpdateShopUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: UpdateShopUserRequest }) =>
      updateShopUser(id, userId, body),
    onSuccess: () => invalidateShops(queryClient, id),
  });
}
