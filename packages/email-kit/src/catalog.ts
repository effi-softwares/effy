import type { Audience, AudienceProfile } from "./audience.js";

type ScalarSpec = "string" | "number" | "boolean";

type VarSpec = ScalarSpec | { readonly of: Readonly<Record<string, ScalarSpec>> };

type VarShape = Readonly<Record<string, VarSpec>>;

type FromScalar<S extends ScalarSpec> = S extends "string" ? string : S extends "number" ? number : boolean;

type FromSpec<S extends VarSpec> = S extends ScalarSpec
  ? FromScalar<S>
  : S extends { of: infer R extends Readonly<Record<string, ScalarSpec>> }
    ? readonly { readonly [K in keyof R]: FromScalar<R[K]> }[]
    : never;

type VarsOf<S extends VarShape> = { readonly [K in keyof S]: FromSpec<S[K]> };

export type SentBy = "platform" | "cognito";

export interface MessageEntry<S extends VarShape = VarShape> {
  readonly vars: S;
  readonly subject: (vars: VarsOf<S>, profile: AudienceProfile) => string;
  readonly preheader: (vars: VarsOf<S>, profile: AudienceProfile) => string;
  readonly audiences: readonly Audience[];
  readonly sentBy: SentBy;
  readonly onSendFailure: "throw" | "swallow";
}

const ALL_AUDIENCES: readonly Audience[] = ["customer", "driver", "shop", "back-office"];
const CUSTOMER_ONLY: readonly Audience[] = ["customer"];

export const TEMPLATE_ID_GRAMMAR = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const CATALOG = {
  "auth-sign-in-code": {
    vars: { code: "string", expiryMinutes: "number", isInternal: "boolean" },
    subject: (v, p) => `${v.code} is your ${p.productName} sign-in code`,
    preheader: (v) => `Enter this code to sign in. It expires in ${v.expiryMinutes} minutes.`,
    audiences: ALL_AUDIENCES,
    sentBy: "platform",
    onSendFailure: "throw",
  },

  "auth-sign-up-code": {
    vars: {},
    subject: (_v, p) => `Confirm your email for ${p.productName}`,
    preheader: () => "Enter this code to finish setting up your account.",
    audiences: CUSTOMER_ONLY,
    sentBy: "cognito",
    onSendFailure: "throw",
  },

  "auth-password-reset-code": {
    vars: {},
    subject: (_v, p) => `Reset your ${p.productName} password`,
    preheader: () => "Enter this code to choose a new password.",
    audiences: CUSTOMER_ONLY,
    sentBy: "cognito",
    onSendFailure: "throw",
  },

  "auth-email-verification-code": {
    vars: {},
    subject: (_v, p) => `Verify your email for ${p.productName}`,
    preheader: () => "Enter this code to confirm this email address.",
    audiences: ALL_AUDIENCES,
    sentBy: "cognito",
    onSendFailure: "throw",
  },

  "auth-step-up-code": {
    vars: {},
    subject: (_v, p) => `Your ${p.productName} verification code`,
    preheader: () => "Enter this code to continue.",
    audiences: ALL_AUDIENCES,
    sentBy: "cognito",
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
    onSendFailure: "swallow",
  },

  "order-confirmation": {
    vars: {
      orderNumber: "string",
      placedAt: "string",
      deliveryLabel: "string",
      deliveryEstimate: "string",
      deliveryMethod: "string",
      deliveryPreheader: "string",
      items: {
        of: { name: "string", quantity: "string", unitPrice: "string", lineTotal: "string" },
      },
      subtotal: "string",
      hasDiscount: "boolean",
      discountLabel: "string",
      discountAmount: "string",
      hasDeliveryFee: "boolean",
      deliveryFee: "string",
      hasDeliveryLines: "boolean",
      deliveryLines: {
        of: { label: "string", amount: "string" },
      },
      total: "string",
      hasPaymentMethod: "boolean",
      paymentMethod: "string",
      hasPoints: "boolean",
      pointsPaid: "string",
      deliveryAddress: "string",
      billingSameAsDelivery: "boolean",
      billingAddress: "string",
      orderUrl: "string",
    },
    subject: (v, p) => `Your ${p.productName} order ${v.orderNumber} is confirmed`,
    preheader: (v) => String(v.deliveryPreheader),
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    onSendFailure: "swallow",
  },

  "order-delivered": {
    vars: {
      orderNumber: "string",
      deliveredOn: "string",
      orderUrl: "string",
    },
    subject: (v, p) => `Your ${p.productName} order ${v.orderNumber} has arrived`,
    preheader: () => "Everything in your order has been delivered.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    onSendFailure: "swallow",
  },

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
    onSendFailure: "swallow",
  },

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
    onSendFailure: "swallow",
  },

  "points-credited": {
    vars: {
      points: "string",
      valueAmount: "string",
      reasonWords: "string",
      expiresOn: "string",
      pointsUrl: "string",
    },
    subject: (v, p) => `You've received ${v.points} ${p.productName} points`,
    preheader: (v) => `They're worth $${v.valueAmount} off your next order.`,
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    onSendFailure: "swallow",
  },

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
    onSendFailure: "swallow",
  },

  "newsletter-confirmation": {
    vars: { confirmUrl: "string", expiresIn: "string" },
    subject: (_v, p) => `Confirm your ${p.productName} subscription`,
    preheader: () => "One tap to confirm, and we'll keep you posted.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
    onSendFailure: "throw",
  },

  "feedback-received": {
    vars: { referenceCode: "string", category: "string" },
    subject: (_v, p) => `We got your feedback — ${p.productName}`,
    preheader: () => "Thanks for taking the time. Here's your reference.",
    audiences: CUSTOMER_ONLY,
    sentBy: "platform",
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
    onSendFailure: "throw",
  },
} as const satisfies Record<string, MessageEntry>;

export type TemplateId = keyof typeof CATALOG;

export type VarsFor<T extends TemplateId> = VarsOf<(typeof CATALOG)[T]["vars"]>;

export function templateIds(): TemplateId[] {
  return Object.keys(CATALOG) as TemplateId[];
}

export function validateVars(id: TemplateId, vars: unknown): string[] {
  if (!isRecord(vars)) {
    return [`${id}: variables must be an object, got ${vars === null ? "null" : typeof vars}`];
  }
  const errors: string[] = [];
  for (const [key, spec] of Object.entries(CATALOG[id].vars as VarShape)) {
    const value = vars[key];
    if (value === undefined) {
      errors.push(`${id}: missing required variable '${key}'`);
    } else if (typeof spec === "string") {
      if (!isScalar(spec, value)) errors.push(`${id}: variable '${key}' must be ${spec}, got ${typeof value}`);
    } else if (!Array.isArray(value)) {
      errors.push(`${id}: variable '${key}' must be an array of objects, got ${typeof value}`);
    } else {
      value.forEach((row, i) => errors.push(...validateRow(id, `${key}[${i}]`, spec.of, row)));
    }
  }
  return errors;
}

function validateRow(id: TemplateId, path: string, fields: Record<string, ScalarSpec>, row: unknown): string[] {
  if (!isRecord(row)) return [`${id}: '${path}' must be an object`];
  return Object.entries(fields).flatMap(([field, spec]) => {
    if (row[field] === undefined) return [`${id}: '${path}' is missing field '${field}' (${spec})`];
    if (!isScalar(spec, row[field])) return [`${id}: '${path}.${field}' must be ${spec}, got ${typeof row[field]}`];
    return [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(spec: ScalarSpec, value: unknown): boolean {
  if (spec === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === spec;
}
