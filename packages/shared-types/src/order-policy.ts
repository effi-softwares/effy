/**
 * The order rules row (GET/PUT /admin/v1/order-policy): the minimum spend and the two cart ceilings.
 * The commerce service reads it on every cart read, so the rule enforced and the number shown agree.
 */
export interface OrderPolicyDTO {
  /** "0.00" means no minimum is in force, and the cart shows nothing at all. */
  minimumSubtotalAmount: string;
  currency: string;
  maxLineQuantity: number;
  maxDistinctItems: number;
  updatedBy: string | null;
  updatedAt: string;
}

/** PUT /admin/v1/order-policy. */
export interface UpdateOrderPolicyRequest {
  minimumSubtotalAmount: string;
  maxLineQuantity: number;
  maxDistinctItems: number;
}
