/**
 * 057-shop-console-redesign — a shop manager manages their own team.
 *
 * ⚠ THESE WRITE THE SAME RECORDS BACK-OFFICE ALREADY OWNS (`public.shop_staff` /
 * `public.shop_staff_role`, 007/009). There is no shop-local roster and there must never be one —
 * FR-019 forbids a second system of record, and 009's provisioning path is reused rather than
 * reimplemented (research R5).
 *
 * ⚠ NO `shopId` CROSSES THIS CONTRACT. Scope is resolved from the caller's own record server-side.
 * A manager who could name a shop is a manager who could name someone else's.
 */

// ⚠ ShopStaffStatus is REUSED from ./shop, not redeclared. 007 already defines the shop
// operator's lifecycle; a second copy here would be two unions free to drift apart.
import type { ShopRole, ShopStaffStatus } from "./shop"

export interface ShopTeamMemberDTO {
  staffId: string
  /** ⚠ The staff member's own work email. Managers already know it — they invited them. */
  email: string | null
  name: string | null
  roles: ShopRole[]
  status: ShopStaffStatus
  createdAt: string
  lastSeenAt: string | null
  /**
   * ⚠ TRUE for the caller's own row. The UI uses it to withhold the deactivate control from someone
   * about to lock themselves out — a courtesy, not the gate. The backend refuses it regardless.
   */
  isSelf: boolean
}

export interface InviteShopStaffRequest {
  email: string
  name: string
  role: ShopRole
}

export interface UpdateShopStaffRoleRequest {
  role: ShopRole
}
