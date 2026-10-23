/**
 * The catalogue: every email the platform can send. `TemplateId` is a closed union derived from it, so
 * an unknown template or the wrong variables fail to compile.
 */

import type { Audience, AudienceProfile } from "./audience.js";

// Variable schemas: a tiny declarative spec, not a schema library. This runs inside a Cognito trigger
// with a 5-second limit, so no runtime dependency beyond Handlebars.

/** A leaf value's type. Anything a Handlebars expression renders directly. */
export type ScalarSpec = "string" | "number" | "boolean";

/**
 * A variable's shape: scalars, a list of strings, or `{ of: {...} }`, a list of records with scalar
 * fields (a receipt's line items). Money, dates and quantities arrive pre-formatted as strings:
 * formatting is the caller's (locale, currency).
 */
export type ObjectArraySpec = { readonly of: Readonly<Record<string, ScalarSpec>> };

export type VarSpec = ScalarSpec | "string[]" | ObjectArraySpec;

export type VarShape = Readonly<Record<string, VarSpec>>;

type FromScalar<S extends ScalarSpec> = S extends "string"
  ? string
  : S extends "number"
    ? number
    : boolean;

type FromSpec<S extends VarSpec> = S extends "string"
  ? string
  : S extends "number"
    ? number
    : S extends "boolean"
      ? boolean
      : S extends "string[]"
        ? readonly string[]
        : S extends { of: infer R extends Readonly<Record<string, ScalarSpec>> }
          ? readonly { readonly [K in keyof R]: FromScalar<R[K]> }[]
          : never;

export type VarsOf<S extends VarShape> = { readonly [K in keyof S]: FromSpec<S[K]> };

// Category: a discriminated union, not a flag.

/**
 * The wrong combination does not compile: `transactional` has no unsubscribe field and `lifecycle`
 * cannot omit one. Unsubscribing from `auth-sign-in-code` would lock out an audience with no other
 * credential. `lifecycle` ships unused so the rule holds from the first campaign.
 */
export type Category =
  | { readonly category: "transactional" }
  | { readonly category: "lifecycle"; readonly unsubscribeUrl: (vars: never) => string };

/**
 * Declared per message, because neither default is right:
 * `throw` a code that was never sent is a sign-in that cannot complete; the caller refuses opaquely.
 * `swallow` the change has already happened and cannot be unwound, so failing would be a lie. Log it
 *  loudly: a missing security notice is how a takeover goes unnoticed.
 */
export type FailurePolicy = "throw" | "swallow";

/**
 * Who puts the message on the wire. `cognito` means Cognito sends it, so no message tag, configuration
 * set or header can be attached, and a much tighter size budget applies.
 */
export type SentBy = "platform" | "cognito";

export interface MessageDefinition<S extends VarShape = VarShape> {
  readonly vars: S;
  /** May carry the code: reading it from a lock-screen notification is useful. */
  readonly subject: (vars: VarsOf<S>, profile: AudienceProfile) => string;
  /** Must not repeat the subject or restate a code or an amount. */
  readonly preheader: (vars: VarsOf<S>, profile: AudienceProfile) => string;
  readonly audiences: readonly Audience[];
  readonly sentBy: SentBy;
  readonly onSendFailure: FailurePolicy;
}

export type MessageEntry<S extends VarShape = VarShape> = MessageDefinition<S> & Category;

const ALL_AUDIENCES: readonly Audience[] = ["customer", "driver", "shop", "back-office"];
const CUSTOMER_ONLY: readonly Audience[] = ["customer"];

// The catalogue.

/**
 * Id grammar `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`: SES tag values allow only `[A-Za-z0-9_-]`, so an id is
 * its own tag with no sanitiser that could merge two. An id is permanent once shipped (delivery records
 * carry it); a message that changes meaning gets a new id.
 */
export const TEMPLATE_ID_GRAMMAR = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const CATALOG = {
  "auth-sign-in-code": {
    vars: { code: "string", expiryMinutes: "number", isInternal: "boolean" },
    subject: (v, p) => `${v.code} is your ${p.productName} sign-in code`,
    // States the purpose; does not repeat the subject or restate the code.
    preheader: (v) => `Enter this code to sign in. It expires in ${v.expiryMinutes} minutes.`,
    audiences: ALL_AUDIENCES,
    sentBy: "platform",
    category: "transactional",
    // Throw: three of four audiences have no password, so an unsent code is a lockout.
    onSendFailure: "throw",
  },

  // Cognito-sent messages, rendered by the CustomMessage interceptor and sent by Cognito: `sentBy:
  // "cognito"` (the ~20,000-character budget), no `code` variable (Cognito substitutes `{####}`), and
  // an inert failure policy (the interceptor's fail-safe returns the event unmodified).

  "auth-sign-up-code": {
    vars: {},
    subject: (_v, p) => `Confirm your email for ${p.productName}`,
    preheader: () => "Enter this code to finish setting up your account.",
    audiences: CUSTOMER_ONLY,
    sentBy: "cognito",
    category: "transactional",
    onSendFailure: "throw",
  },

  "auth-password-reset-code": {
    vars: {},
    subject: (_v, p) => `Reset your ${p.productName} password`,
    preheader: () => "Enter this code to choose a new password.",
    audiences: CUSTOMER_ONLY,
    sentBy: "cognito",
    category: "transactional",
    onSendFailure: "throw",
  },

  "auth-email-verification-code": {
    vars: {},
    subject: (_v, p) => `Verify your email for ${p.productName}`,
    preheader: () => "Enter this code to confirm this email address.",
    audiences: ALL_AUDIENCES,
    sentBy: "cognito",
    category: "transactional",
    onSendFailure: "throw",
  },

  "auth-step-up-code": {
    vars: {},
    // Not the passwordless sign-in code, which is the custom challenge's `auth-sign-in-code`.
    subject: (_v, p) => `Your ${p.productName} verification code`,
    preheader: () => "Enter this code to continue.",
    audiences: ALL_AUDIENCES,
    sentBy: "cognito",
    category: "transactional",
    onSendFailure: "throw",
  },

  "account-password-changed": {
    vars: { isFirstPassword: "boolean" },
    subject: (v, p) =>
      v.isFirstPassword
        ? `A password was added to your ${p.productName} account`
        : `Your ${p.productName} password was changed`,
    preheader: () => "If this wasn't you, contact support straight away.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    category: "transactional",
    // Swallow: the password is already changed.
    onSendFailure: "swallow",
  },

  /** Sent when an order becomes paid, and again on the customer's request. */
  "order-confirmation": {
    vars: {
      orderNumber: "string",
      placedAt: "string",
      /** The small label over the delivery line: "Arriving" (Effy) or "Courier delivery". */
      deliveryLabel: "string",
      /**
       * When it arrives, in the words the data supports: a window, a day, or "a date we'll confirm". For
       * a courier order, `courierLines`' two sentences (who delivers, and the estimate as an estimate).
       */
      deliveryEstimate: "string",
      /** "Same-day" / "Standard" / "Multiple deliveries"; empty for a courier order. */
      deliveryMethod: "string",
      /** The inbox preview line: "Arriving today, 5 pm – 7 pm." or the courier estimate. */
      deliveryPreheader: "string",
      /** Pre-formatted. */
      items: {
        of: { name: "string", quantity: "string", unitPrice: "string", lineTotal: "string" },
      },
      subtotal: "string",
      /** `hasDiscount` gates the row; a zero discount is omitted. */
      hasDiscount: "boolean",
      discountLabel: "string",
      discountAmount: "string",
      hasDeliveryFee: "boolean",
      deliveryFee: "string",
      /**
       * The delivery charge as sold, in `DELIVERY_FEE_LINE_LABEL`'s words ("Delivery", "Window surcharge",
       * "Small-order fee", "Free delivery" as a negative amount), printed instead of `deliveryFee` and
       * summing to it. A free delivery is printed: it is a claim the customer was sold.
       */
      hasDeliveryLines: "boolean",
      deliveryLines: {
        of: { label: "string", amount: "string" },
      },
      total: "string",
      /** Absent where the post-commit capture failed. */
      hasPaymentMethod: "boolean",
      paymentMethod: "string",
      /**
       * Points used to pay: "1,250 Effy points ($12.50)", shown after the total like the card, never as
       * a discount. `paymentMethod` then carries the card's amount, so the two add up to the total.
       */
      hasPoints: "boolean",
      pointsPaid: "string",
      deliveryAddress: "string",
      billingSameAsDelivery: "boolean",
      billingAddress: "string",
      orderUrl: "string",
    },
    subject: (v, p) => `Your ${p.productName} order ${v.orderNumber} is confirmed`,
    // Does not repeat the subject or restate the amount.
    preheader: (v) => String(v.deliveryPreheader),
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",

    /** Transactional: nobody may opt out of their own proof of purchase. */
    category: "transactional",

    /**
     * Swallow: the order is already paid. The failure is recorded on the dispatch row
     * (`receipt_dispatch.status = 'failed'`), where an operator looks.
     */
    onSendFailure: "swallow",
  },

  // The order arrived.

  /**
   * The only delivery message a web-only shopper gets. Names no shop and no package count (there is no
   * `items` var), and does not restate the receipt.
   */
  "order-delivered": {
    vars: {
      orderNumber: "string",
      /** The arrival date. */
      deliveredOn: "string",
      orderUrl: "string",
    },
    subject: (v, p) => `Your ${p.productName} order ${v.orderNumber} has arrived`,
    // Does not repeat the subject, and claims nothing about condition: only that it was handed over.
    preheader: () => "Everything in your order has been delivered.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",

    /** Transactional: the completion of a purchase. */
    category: "transactional",

    /** Swallow: the arrival is committed; the notification row records the failure (`status = 'failed'`, `last_error`). */
    onSendFailure: "swallow",
  },

  /**
   * A parcel was handed to a courier, one per consignment. No count and no shop; the courier's name,
   * reference and tracking link are the operator's entries, resolved at send.
   */
  "order-with-courier": {
    vars: {
      orderNumber: "string",
      courierName: "string",
      hasReference: "boolean",
      reference: "string",
      hasTracking: "boolean",
      trackingUrl: "string",
      orderUrl: "string",
    },
    subject: (v, p) => `Your ${p.productName} order ${v.orderNumber} is with the courier`,
    preheader: (v) => `A parcel from your order is on its way with ${v.courierName}.`,
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    category: "transactional",
    // Swallow: the handover is committed.
    onSendFailure: "swallow",
  },

  /**
   * Back-office moved the order to courier delivery, or back to Effy. No reason, fee or cost var; the
   * lines are worded by `@effy/shared-types` delivery-type.ts and passed whole.
   */
  "order-delivery-changed": {
    vars: {
      orderNumber: "string",
      movedLine: "string",
      arrivalLine: "string",
      hasCompensation: "boolean",
      compensationLine: "string",
      orderUrl: "string",
    },
    subject: (v, p) => `Your ${p.productName} order ${v.orderNumber}: a change to its delivery`,
    preheader: (v) => String(v.movedLine),
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    category: "transactional",
    // Swallow: the move is committed.
    onSendFailure: "swallow",
  },

  /**
   * A refund was issued: sent when the money is on its way, not when it arrives, so the copy never says
   * "complete". No shop, provider, failure reason or refund kind.
   */
  "order-refunded": {
    vars: {
      orderNumber: "string",
      /** A 2-dp decimal string with no currency symbol. */
      refundAmount: "string",
      orderUrl: "string",
    },
    subject: (v) => `Your refund for order ${v.orderNumber} is on its way`,
    // Does not repeat the subject, and does not say "refunded".
    preheader: () => "We've sent the money back to your original payment method.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",

    /** Transactional: money leaving Effy for a purchase. */
    category: "transactional",

    /** Swallow: the refund is submitted, and a retry could issue it again. */
    onSendFailure: "swallow",
  },

  // Customer points: store credit, never "money back" (no refund word, reason code or note).

  /** Effy added points. `reasonWords` is a sentence from a closed vocabulary; there is no var for the staff note. */
  "points-credited": {
    vars: {
      /** A whole number, already formatted ("1,250"). */
      points: "string",
      /** A 2-dp decimal string with no currency symbol. */
      valueAmount: "string",
      reasonWords: "string",
      /** The last day the points can be used, written out. */
      expiresOn: "string",
      pointsUrl: "string",
    },
    subject: (v, p) => `You've received ${v.points} ${p.productName} points`,
    preheader: (v) => `They're worth $${v.valueAmount} off your next order.`,
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    /** Transactional: a change to the customer's own balance. */
    category: "transactional",
    /** Swallow: the credit is committed. */
    onSendFailure: "swallow",
  },

  /**
   * Some points are about to expire, sent once per expiry date. Transactional: it warns of a loss to
   * something the customer holds.
   */
  "points-expiring": {
    vars: {
      points: "string",
      valueAmount: "string",
      expiresOn: "string",
      pointsUrl: "string",
      shopUrl: "string",
    },
    subject: (v, p) => `${v.points} of your ${p.productName} points expire on ${v.expiresOn}`,
    preheader: (v) => `Use them before then — they're worth $${v.valueAmount}.`,
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    category: "transactional",
    onSendFailure: "swallow",
  },

  // Newsletter double opt-in.

  "newsletter-confirmation": {
    vars: { confirmUrl: "string", expiresIn: "string" },
    subject: (_v, p) => `Confirm your ${p.productName} subscription`,
    // Does not repeat the subject; the token is in the URL only.
    preheader: () => "One tap to confirm, and we'll keep you posted.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",

    /**
     * Transactional, though newsletter-shaped: nobody is subscribed until the link is followed, so an
     * unsubscribe link would leave a subscription that does not exist. A real campaign is `lifecycle`.
     */
    category: "transactional",

    /**
     * Throw: the subscription row is written before the send, so a swallowed failure would leave a
     * pending row nobody can confirm. The caller shows a retryable error while the input is on screen.
     */
    onSendFailure: "throw",
  },

  // Customer feedback: two messages with opposite failure policies.

  "feedback-received": {
    vars: { referenceCode: "string", category: "string" },
    subject: (_v, p) => `We got your feedback — ${p.productName}`,
    // States the purpose; does not repeat the subject.
    preheader: () => "Thanks for taking the time. Here's your reference.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    category: "transactional",

    /** Swallow: the submission is stored and the shopper was already told "received". */
    onSendFailure: "swallow",
  },

  "feedback-reply": {
    vars: {
      replyBody: "string",
      originalMessage: "string",
      category: "string",
      referenceCode: "string",
    },
    subject: (v, p) => `Re: your ${p.productName} feedback (${v.referenceCode})`,
    preheader: () => "A reply from the Effy team.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    category: "transactional",

    /**
     * Throw: the point is that the shopper receives it. The service writes the reply and flips the
     * status only after this send succeeds.
     */
    onSendFailure: "throw",
  },
} as const satisfies Record<string, MessageEntry>;

export type TemplateId = keyof typeof CATALOG;

export type VarsFor<T extends TemplateId> = VarsOf<(typeof CATALOG)[T]["vars"]>;

export function entryFor<T extends TemplateId>(id: T): (typeof CATALOG)[T] {
  return CATALOG[id];
}

export function templateIds(): readonly TemplateId[] {
  return Object.keys(CATALOG) as TemplateId[];
}

export function isTemplateId(value: string): value is TemplateId {
  return Object.prototype.hasOwnProperty.call(CATALOG, value);
}

/** The SES message tag value: the id itself, tag-safe by its grammar. */
export function messageTagFor(id: TemplateId): string {
  return id;
}

// Runtime validation.

/**
 * Validates at every boundary the compiler did not check (a Cognito event, a queue message). Reports
 * every problem with the template id, never just the first.
 */
export function validateVars(id: TemplateId, vars: unknown): string[] {
  const shape = CATALOG[id].vars as VarShape;
  if (typeof vars !== "object" || vars === null || Array.isArray(vars)) {
    return [`${id}: variables must be an object, got ${vars === null ? "null" : typeof vars}`];
  }
  const bag = vars as Record<string, unknown>;
  const errors: string[] = [];

  for (const [key, spec] of Object.entries(shape)) {
    const value = bag[key];
    if (value === undefined) {
      errors.push(`${id}: missing required variable '${key}' (${describeSpec(spec)})`);
      continue;
    }
    errors.push(...validateOne(id, key, spec, value));
  }
  return errors;
}

function describeSpec(spec: VarSpec): string {
  return typeof spec === "string" ? spec : `array of { ${Object.keys(spec.of).join(", ")} }`;
}

function scalarOk(spec: ScalarSpec, value: unknown): boolean {
  return spec === "string"
    ? typeof value === "string"
    : spec === "number"
      ? typeof value === "number" && Number.isFinite(value)
      : typeof value === "boolean";
}

function validateOne(id: TemplateId, key: string, spec: VarSpec, value: unknown): string[] {
  if (spec === "string" || spec === "number" || spec === "boolean") {
    return scalarOk(spec, value) ? [] : [`${id}: variable '${key}' must be ${spec}, got ${typeof value}`];
  }
  if (spec === "string[]") {
    return Array.isArray(value) && value.every((v) => typeof v === "string")
      ? []
      : [`${id}: variable '${key}' must be string[], got ${typeof value}`];
  }
  // ObjectArraySpec — a list of records with scalar fields (e.g. line items).
  if (!Array.isArray(value)) {
    return [`${id}: variable '${key}' must be an array of objects, got ${typeof value}`];
  }
  const errors: string[] = [];
  value.forEach((element, i) => {
    if (typeof element !== "object" || element === null || Array.isArray(element)) {
      errors.push(`${id}: '${key}[${i}]' must be an object`);
      return;
    }
    const row = element as Record<string, unknown>;
    for (const [field, fieldSpec] of Object.entries(spec.of)) {
      if (row[field] === undefined) {
        errors.push(`${id}: '${key}[${i}]' is missing field '${field}' (${fieldSpec})`);
      } else if (!scalarOk(fieldSpec, row[field])) {
        errors.push(`${id}: '${key}[${i}].${field}' must be ${fieldSpec}, got ${typeof row[field]}`);
      }
    }
  });
  return errors;
}
