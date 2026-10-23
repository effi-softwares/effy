/**
 * The payment provider behind a port: services depend on `PaymentGateway`, Stripe implements it, tests
 * fake it. The only place the SDK is imported, reachable only as `@effy/edge-shared/payments`. The
 * secret is fetched by ARN and held in memory only.
 */
import Stripe from "stripe";

import { getSecretString, invalidateSecret } from "../lib/secrets";

/** Our normalised PaymentIntent status. */
export type IntentStatus = "requires_payment" | "requires_action" | "succeeded" | "failed" | "canceled";

/** `amountMinor` is integer cents; `idempotencyKey` is deterministic so a retry returns the same intent. */
export interface CreateIntentInput {
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  orderId: string;
  orderNumber: string;
  /** The provider customer id. No `setup_future_usage`: keeping a card is the shopper's choice at confirmation. */
  customerId?: string;
}

export interface PaymentIntent {
  id: string;
  clientSecret: string;
  status: IntentStatus;
  /** What the provider says can be used for this intent (amount, currency, account state). */
  availableMethods: string[];
}

/** How an order was paid, as a receipt may show it. No card data beyond `last4`. */
export interface PaymentMethodSummary {
  /** Effy's own family, not the provider's type string. */
  type: "card" | "wallet" | "pay_over_time" | "other" | "";
  brand: string;
  last4: string;
}

/** The provider's refund lifecycle: accepted means submitted; the bank can still reject it later. */
export type RefundStatus = "pending" | "succeeded" | "failed" | "canceled" | "requires_action";

/** The verified, provider-neutral event the webhook handler acts on. */
export interface WebhookEvent {
  id: string;
  type: string;
  paymentIntentId: string;
  intentStatus?: IntentStatus;
  // Refund events only.
  /** May name a refund this platform has no record of (issued in the dashboard). */
  refundId?: string;
  refundStatus?: RefundStatus;
  failureReason?: string;
  /** Integer cents; only the event knows the amount of an unattributed refund. */
  refundAmountCents?: number;
  /** The intent the refund was taken against. */
  refundPaymentIntentId?: string;
}

export const EVENT_PAYMENT_SUCCEEDED = "payment_intent.succeeded";
export const EVENT_PAYMENT_FAILED = "payment_intent.payment_failed";
export const EVENT_REFUND_CREATED = "refund.created";
export const EVENT_REFUND_UPDATED = "refund.updated";
/** How the platform learns a refund it made did not happen. */
export const EVENT_REFUND_FAILED = "refund.failed";

export interface CreateRefundInput {
  paymentIntentId: string;
  amountCents: number;
  /** `requested_by_customer` or empty: `fraudulent` blocklists the payer, `duplicate` cannot be substantiated. */
  reason?: "requested_by_customer";
  /** The key the platform stored, so an ambiguous retry cannot create a second refund. */
  idempotencyKey: string;
  /** Low-cardinality routing only; never PII. */
  metadata?: Record<string, string>;
}

export interface Refund {
  id: string;
  status: RefundStatus;
  failureReason: string;
  amountCents: number;
  metadata: Record<string, string>;
}

/**
 * A refusal the provider will never accept. A timeout leaves the refund unknown and is retried under
 * the same key; a refusal is a decision and is never retried.
 */
export class RefusedError extends Error {
  constructor(readonly reason: string) {
    super(`refund refused: ${reason}`);
    this.name = "RefusedError";
  }
}

/** The webhook signature did not verify. The only webhook failure answered as the caller's error. */
export class WebhookSignatureError extends Error {
  constructor() {
    super("webhook signature verification failed");
    this.name = "WebhookSignatureError";
  }
}

/** A card the shopper chose to keep: the only fields that leave the provider. Never persisted. */
export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export interface EnsureCustomerInput {
  /** Already stored against the customer: non-empty means no create. */
  existing?: string | null;
  /** The platform's own record, never client-supplied. */
  email?: string | null;
  name?: string | null;
  /** Effy's customer id as provider metadata (not the Cognito subject). */
  customerId: string;
}

export interface PaymentGateway {
  /** Creates (or re-returns, by the key) one intent. */
  createPaymentIntent(input: CreateIntentInput): Promise<PaymentIntent>;
  /** Re-fetches an intent's status. */
  retrievePaymentIntent(intentId: string): Promise<PaymentIntent>;
  /**
   * Withdraws an intent nobody will pay (a checkout switched to points only). Returns the status after
   * the attempt, so "too late, it was paid" is not an error.
   */
  cancelPaymentIntent(intentId: string): Promise<IntentStatus>;
  /** Verifies the signature over the raw body. */
  constructWebhookEvent(rawBody: string | Buffer, signatureHeader: string): Promise<WebhookEvent>;

  /**
   * Returns money, whole or part. Success means submitted. A `RefusedError` is never retried; anything
   * else is retried under the same key.
   */
  createRefund(input: CreateRefundInput): Promise<Refund>;
  /** The refunds the provider holds against a payment: how an uncertain refund is resolved. */
  listRefunds(paymentIntentId: string): Promise<Refund[]>;

  /** How an intent was actually paid. A round trip: keep it out of the payment transaction; a failure is not an error. */
  describePaymentMethod(intentId: string): Promise<PaymentMethodSummary>;

  /** The provider customer id, created only when the platform holds none. */
  ensureCustomer(input: EnsureCustomerInput): Promise<string>;
  /** A short-lived customer session for the provider's payment-method list (mobile). */
  createCustomerSession(providerCustomerId: string): Promise<{ clientSecret: string }>;
  /** Kept cards. Throws, never returns empty, when the provider cannot be reached. */
  listSavedCards(providerCustomerId: string): Promise<SavedCard[]>;
  /** Removes a kept card. The caller must have verified ownership. */
  detachPaymentMethod(paymentMethodId: string): Promise<void>;
}

/** Pinned API version, so the shapes this adapter was proven against do not change. */
export const STRIPE_API_VERSION = "2025-08-27.basil";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`payments: required environment variable ${name} is not set`);
  return v;
}

let client: Stripe | undefined;

async function stripe(): Promise<Stripe> {
  if (client) return client;
  const key = (await getSecretString(requiredEnv("STRIPE_SECRET_KEY_ARN"))).trim();
  client = new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    // Inside the 25 s function timeout; the sdk's 80 s default could leave an outcome unknown.
    timeout: 8_000,
  });
  return client;
}

export function mapIntentStatus(s: string): IntentStatus {
  switch (s) {
    case "succeeded":
      return "succeeded";
    case "requires_action":
    case "requires_confirmation":
      return "requires_action";
    case "canceled":
      return "canceled";
    default:
      // requires_payment_method, processing, requires_capture: still pending.
      return "requires_payment";
  }
}

const toIntent = (pi: Stripe.PaymentIntent): PaymentIntent => ({
  id: pi.id,
  clientSecret: pi.client_secret ?? "",
  status: mapIntentStatus(pi.status),
  availableMethods: pi.payment_method_types ?? [],
});

const toRefund = (r: Stripe.Refund): Refund => ({
  id: r.id,
  status: (r.status ?? "pending") as RefundStatus,
  failureReason: r.failure_reason ?? "",
  amountCents: r.amount,
  metadata: r.metadata ?? {},
});

const idOf = (v: string | { id: string } | null | undefined): string => (typeof v === "string" ? v : (v?.id ?? ""));

/** Reduces an already-verified provider event to what the platform acts on. */
export function toWebhookEvent(event: { id: string; type: string; data: { object: unknown } }): WebhookEvent {
  const out: WebhookEvent = { id: event.id, type: event.type, paymentIntentId: "" };

  switch (event.type) {
    case EVENT_PAYMENT_SUCCEEDED:
    case EVENT_PAYMENT_FAILED: {
      const pi = event.data.object as { id: string };
      out.paymentIntentId = pi.id;
      out.intentStatus = event.type === EVENT_PAYMENT_FAILED ? "failed" : "succeeded";
      break;
    }
    case EVENT_REFUND_CREATED:
    case EVENT_REFUND_UPDATED:
    case EVENT_REFUND_FAILED: {
      // Keyed on the refund's own id, not the intent: an order can have several refunds.
      const r = event.data.object as Stripe.Refund;
      out.refundId = r.id;
      out.refundStatus = (r.status ?? "pending") as RefundStatus;
      out.refundAmountCents = r.amount;
      out.failureReason = r.failure_reason ?? "";
      out.refundPaymentIntentId = idOf(r.payment_intent);
      out.paymentIntentId = out.refundPaymentIntentId;
      break;
    }
  }
  return out;
}

/** Reduces a charge's method details to a receipt line. */
export function summarisePaymentMethod(
  d: Stripe.Charge.PaymentMethodDetails | null | undefined,
): PaymentMethodSummary {
  if (!d) return { type: "", brand: "", last4: "" };
  if (d.card) {
    // A wallet payment arrives as `card`, with the wallet named inside.
    if (d.card.wallet?.type) return { type: "wallet", brand: d.card.wallet.type, last4: d.card.last4 ?? "" };
    return { type: "card", brand: d.card.brand ?? "", last4: d.card.last4 ?? "" };
  }
  if (d.klarna) return { type: "pay_over_time", brand: "klarna", last4: "" };
  if (d.afterpay_clearpay) return { type: "pay_over_time", brand: "afterpay", last4: "" };
  if (d.zip) return { type: "pay_over_time", brand: "zip", last4: "" };
  // `other` rather than a guess: no invented brand on a financial record.
  return { type: "other", brand: d.type ?? "", last4: "" };
}

export const stripeGateway: PaymentGateway = {
  async createPaymentIntent(input) {
    const pi = await (await stripe()).paymentIntents.create(
      {
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        capture_method: "automatic",
        automatic_payment_methods: { enabled: true },
        ...(input.customerId ? { customer: input.customerId } : {}),
        metadata: { order_id: input.orderId, order_number: input.orderNumber },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return toIntent(pi);
  },

  async retrievePaymentIntent(intentId) {
    return toIntent(await (await stripe()).paymentIntents.retrieve(intentId));
  },

  async cancelPaymentIntent(intentId) {
    const sdk = await stripe();
    try {
      return toIntent(await sdk.paymentIntents.cancel(intentId)).status;
    } catch (err) {
      // An intent that succeeded or is processing cannot be cancelled: report its status.
      if (err instanceof Stripe.errors.StripeInvalidRequestError) return toIntent(await sdk.paymentIntents.retrieve(intentId)).status;
      throw err;
    }
  },

  async constructWebhookEvent(rawBody, signatureHeader) {
    const arn = requiredEnv("STRIPE_WEBHOOK_SECRET_ARN");
    const sdk = await stripe();
    const verify = async () =>
      sdk.webhooks.constructEvent(rawBody, signatureHeader, (await getSecretString(arn)).trim());
    try {
      return toWebhookEvent(await verify());
    } catch {
      // Once more against a freshly fetched secret, in case it was replaced while this container was warm.
      invalidateSecret(arn);
      try {
        return toWebhookEvent(await verify());
      } catch {
        throw new WebhookSignatureError();
      }
    }
  },

  async createRefund(input) {
    try {
      const r = await (await stripe()).refunds.create(
        {
          payment_intent: input.paymentIntentId,
          amount: input.amountCents,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
        // The refund row's key: the whole of the retry safety.
        { idempotencyKey: input.idempotencyKey },
      );
      return toRefund(r);
    } catch (err) {
      // Card or invalid-request errors are refusals; API, rate-limit and transport errors are ambiguous.
      if (err instanceof Stripe.errors.StripeCardError || err instanceof Stripe.errors.StripeInvalidRequestError) {
        throw new RefusedError(err.message);
      }
      throw err;
    }
  },

  async listRefunds(paymentIntentId) {
    const out: Refund[] = [];
    for await (const r of (await stripe()).refunds.list({ payment_intent: paymentIntentId, limit: 100 })) {
      out.push(toRefund(r));
    }
    return out;
  },

  async describePaymentMethod(intentId) {
    // `latest_charge` is only an id unless expanded.
    const pi = await (await stripe()).paymentIntents.retrieve(intentId, {
      expand: ["latest_charge.payment_method_details"],
    });
    const charge = typeof pi.latest_charge === "string" ? null : pi.latest_charge;
    return summarisePaymentMethod(charge?.payment_method_details);
  },

  async ensureCustomer(input) {
    // An existing reference short-circuits before any provider call.
    if (input.existing) return input.existing;
    const c = await (await stripe()).customers.create({
      ...(input.email ? { email: input.email } : {}),
      ...(input.name ? { name: input.name } : {}),
      metadata: { effy_customer_id: input.customerId },
    });
    return c.id;
  },

  async createCustomerSession(providerCustomerId) {
    // Shows kept cards, renders the save checkbox and lets the provider record what was ticked.
    const s = await (await stripe()).customerSessions.create({
      customer: providerCustomerId,
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_redisplay: "enabled",
            payment_method_save: "enabled",
            payment_method_remove: "enabled",
          },
        },
      },
    });
    return { clientSecret: s.client_secret };
  },

  async listSavedCards(providerCustomerId) {
    const sdk = await stripe();
    const cust = await sdk.customers.retrieve(providerCustomerId);
    const defaultPm = cust.deleted ? "" : idOf(cust.invoice_settings?.default_payment_method);

    const out: SavedCard[] = [];
    for await (const pm of sdk.paymentMethods.list({ customer: providerCustomerId, type: "card" })) {
      if (!pm.card) continue;
      // Consent is on the card: `always` = kept, `limited` = left unticked, `unspecified` = attached
      // without asking. Only `always` is shown.
      if (pm.allow_redisplay !== "always") continue;
      out.push({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
        isDefault: pm.id === defaultPm,
      });
    }
    return out;
  },

  async detachPaymentMethod(paymentMethodId) {
    await (await stripe()).paymentMethods.detach(paymentMethodId);
  },
};
