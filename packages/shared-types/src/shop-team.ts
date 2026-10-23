/**
 * A shop manager manages their own team, writing the same records back-office owns (`public.shop_staff`,
 * `public.shop_staff_role`). No `shopId` crosses: scope comes from the caller's own record.
 */

// `ShopStaffStatus` comes from./shop.
import type { ShopRole, ShopStaffStatus } from "./shop"

export interface ShopTeamMemberDTO {
  staffId: string
  /** The staff member's work email (the manager invited them). */
  email: string | null
  name: string | null
  roles: ShopRole[]
  status: ShopStaffStatus
  createdAt: string
  lastSeenAt: string | null
  /** True for the caller's own row, so the UI withholds deactivating yourself (the backend refuses it regardless). */
  isSelf: boolean
}

export interface InviteShopStaffRequest {
  email: string
  name: string
  role: ShopRole
}

