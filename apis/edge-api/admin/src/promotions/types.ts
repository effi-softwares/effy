// Order-rule types and the errors promotions share. Money is a decimal string, as on the wire.

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

export interface FieldIssue {
  field: string;
  message: string;
}

/** `code` is the wire reason; each needs a different fix. */
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
