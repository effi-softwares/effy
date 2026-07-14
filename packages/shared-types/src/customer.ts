/**
 * Customer audience contracts (011-customer-storefront-web).
 *
 * The single source of truth for the customer wire shapes (Principle II). `customer-web` and
 * `apis/edge-api/customer` both import these; neither redefines them. The forthcoming customer
 * mobile app (KMP) mirrors them.
 */

/** A customer's standing with Effy. PLATFORM-OWNED — never derived from a token claim. */
export type CustomerStatus = "active" | "barred";

/**
 * The platform's own record of a customer — distinct from their Cognito credential, and
 * authoritative for the access decision (FR-025).
 *
 * A `barred` customer is refused no matter how valid their credential is. That is the whole
 * point of holding our own record: the claim is the ORIGIN of identity, the record is the
 * AUTHORITY on access.
 *
 * Note there is no `role` here, and none is coming: the customer pool defines no RBAC groups
 * (constitution Principle IV). That is also a token-size safety measure — id + access + refresh
 * cookies already run to ~4.5 KB against a ~4 KB browser limit, and a fattened claim set would
 * silently truncate the session.
 */
export interface CustomerDTO {
  id: string;
  /** The verified email. It is the identity key across every credential route. */
  email: string;

  /**
   * First and last name, captured AT REGISTRATION (FR-009a) and mapped 1:1 onto Cognito's standard
   * `given_name` / `family_name` attributes — so they ride on the ID token with no custom claim.
   *
   * Two fields, not one: a delivery label, an order confirmation and a support conversation all need
   * the parts, and a single free-text name cannot be split back into them reliably (ask anyone with
   * two surnames, or one name). Captured at source; never inferred.
   *
   * Nullable because the FEDERATED route supplies whatever the provider asserts, and may assert
   * neither. The platform must not invent a name it was never given.
   */
  givenName: string | null;
  familyName: string | null;

  status: CustomerStatus;
  createdAt: string;
}

/**
 * What a customer may change about themselves (FR-026).
 *
 * `email` is deliberately absent: changing it is an identity operation, and a customer who can
 * rewrite their own email can walk onto another customer's record (the well-known Cognito
 * takeover). `status` is absent because it is platform-owned.
 */
export interface UpdateCustomerDTO {
  givenName: string | null;
  familyName: string | null;
}

/** How a customer proved who they are. Telemetry + UI only — never an authorization input. */
export type CredentialRoute = "password" | "otp" | "google";
