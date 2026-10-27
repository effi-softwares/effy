import type { FieldError } from "@effy/edge-shared";

export type ProductAdminErrorKind = "validation" | "not_found" | "conflict";

/** Why a conflict was refused; the message starts with it, so a console maps it to its own sentence. */
export type ProductConflictCode =
  | "stale"
  | "already_held"
  | "not_held"
  | "archived"
  | "product_held"
  | "last_variant"
  | "not_effy_owned"
  | "shop_not_active"
  | "nothing_ready"
  | "import_state";

export class ProductAdminError extends Error {
  constructor(
    readonly kind: ProductAdminErrorKind,
    message: string,
    readonly fields?: FieldError[],
  ) {
    super(message);
    this.name = "ProductAdminError";
  }

  static conflict(code: ProductConflictCode, sentence: string): ProductAdminError {
    return new ProductAdminError("conflict", `${code}: ${sentence}`);
  }
}
