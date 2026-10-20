// Domain types for order rules management (027 US10) and the errors promotions share. Money is a decimal string here, as
// everywhere on the wire; the commerce service converts to integer cents when it computes a discount.
//
// ⚠ These are the OPERATOR's view. The customer half of a promotional code — applying it, and the
// discount — lives in the commerce service, with the cart and the charge it applies to.

export interface OrderPolicy {
  minimumSubtotalAmount: string;
  currency: string;
  maxLineQuantity: number;
  maxDistinctItems: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditEntry {
  id: string;
  actorSub: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface FieldIssue {
  field: string;
  message: string;
}

/**
 * A refusal the operator must be able to act on. `code` is the wire reason (contract §5) — each is a
 * different fix: a duplicate needs a new code, an inverted window needs different dates, and an attempt
 * to rewrite a USED code needs the operator to understand why that is refused at all.
 */
export class PromoError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldIssue[] = [],
  ) {
    super(message);
    this.name = "PromoError";
  }
}

export function isPromoError(err: unknown): err is PromoError {
  return err instanceof PromoError || (err as PromoError)?.name === "PromoError";
}
