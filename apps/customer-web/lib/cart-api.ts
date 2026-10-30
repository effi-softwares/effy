"use client"

/**
 * The typed client over `app/api/cart/*`: `fetch` only (the guest bundle has a measured budget), and
 * always through a Next route handler, so the session is read server-side and no client module imports
 * `aws-amplify`. Every mutation returns the complete re-priced cart and carries a `changeId` minted once
 * per shopper action, so a retry cannot apply twice. A line is a variant; per-line calls name its
 * `variantId`.
 */
import type { CartDTO, CartPolicyDTO, ReorderResultDTO } from "@effy/shared-types"

/** Raised when the platform refuses a cart call. `status` lets the caller distinguish 401 from 422. */
export class CartApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "CartApiError"
  }
}

/** A change id: one per shopper action, reused by every retry of it (never per attempt - see FR-018). */
export function newChangeId(): string {
  return crypto.randomUUID()
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new CartApiError(res.status, body.error ?? "cart request failed")
  }
  return (await res.json()) as T
}

const q = (changeId: string) => `?changeId=${encodeURIComponent(changeId)}`
const seg = (variantId: string) => encodeURIComponent(variantId)

export interface CartLineInputJson {
  variantId: string
  quantity: number
}

export const cartApi = {
  get: () => call<CartDTO>("/api/cart"),

  /** Add or increment - the only non-idempotent write, so `changeId` is not optional. */
  add: (variantId: string, quantity: number, changeId: string) =>
    call<CartDTO>("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ variantId, quantity, changeId }),
    }),

  /** Set an absolute quantity; 0 removes. */
  setQuantity: (variantId: string, quantity: number, changeId: string) =>
    call<CartDTO>(`/api/cart/items/${seg(variantId)}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity, changeId }),
    }),

  remove: (variantId: string, changeId: string) =>
    call<CartDTO>(`/api/cart/items/${seg(variantId)}${q(changeId)}`, { method: "DELETE" }),

  /** Empty the payable cart; set-aside items survive. */
  clear: (changeId: string) => call<CartDTO>(`/api/cart${q(changeId)}`, { method: "DELETE" }),

  /** Sign-in adoption: union with maximum quantity, idempotent. */
  merge: (lines: CartLineInputJson[], changeId: string) =>
    call<CartDTO>("/api/cart/merge", { method: "POST", body: JSON.stringify({ lines, changeId }) }),

  reorder: (orderId: string, changeId: string) =>
    call<ReorderResultDTO>("/api/cart/reorder", {
      method: "POST",
      body: JSON.stringify({ orderId, changeId }),
    }),

  setAside: (variantId: string, changeId: string) =>
    call<CartDTO>(`/api/cart/items/${seg(variantId)}/set-aside${q(changeId)}`, { method: "POST" }),

  restoreSaved: (variantId: string, changeId: string) =>
    call<CartDTO>(`/api/cart/saved/${seg(variantId)}/restore${q(changeId)}`, { method: "POST" }),

  deleteSaved: (variantId: string, changeId: string) =>
    call<CartDTO>(`/api/cart/saved/${seg(variantId)}${q(changeId)}`, { method: "DELETE" }),

  /** Apply a promotional code. The platform decides validity and worth - never this client. */
  applyPromo: (code: string) => call<CartDTO>("/api/cart/promo", { method: "POST", body: JSON.stringify({ code }) }),

  removePromo: () => call<CartDTO>("/api/cart/promo", { method: "DELETE" }),

  /** Guest path: re-price device lines with zero writes (FR-004 applies to guests too). */
  preview: (lines: CartLineInputJson[]) =>
    call<CartDTO>("/api/cart/preview", { method: "POST", body: JSON.stringify({ lines }) }),

  /** Guest path: the minimum and the ceilings, so a guest cart gates from the platform's own numbers. */
  policy: () => call<CartPolicyDTO>("/api/cart/policy"),
}
