/**
 * The data-type / sub-processor inventory — the ONE spine that keeps the Privacy Policy, the Apple
 * App Privacy details mapping, and the Google Data safety mapping mutually consistent (SC-004).
 *
 * ⚠ Every entry MUST be TRUE of the platform as built (SC-002 / research R10). A provider not
 * actually integrated does not appear; a data type not actually collected is not declared. Derived
 * from the codebase (Cognito auth, Stripe payments, AWS SES/RDS/S3, PostHog, Crashlytics, FCM/APNs,
 * Google federated sign-in) and the closure service's RETAINED set.
 */

export interface SubProcessor {
  name: string
  purpose: string
  dataCategories: string[]
  overseasDisclosure: boolean // APP 8 — processed outside Australia
}

export interface DataType {
  /** Human label used in the Privacy Policy and both store forms. */
  label: string
  collected: boolean
  purposes: string[]
  linkedToIdentity: boolean
  usedForTracking: boolean
  subProcessors: string[] // names into `subProcessors`
  retention: string
}

export const subProcessors: SubProcessor[] = [
  {
    name: "Amazon Web Services (Cognito, RDS, S3, SES)",
    purpose: "Account/identity, application database, media storage, and transactional/sign-in email.",
    dataCategories: ["Account identity", "Contact details", "Addresses", "Orders", "Email content"],
    overseasDisclosure: true,
  },
  {
    name: "Stripe",
    purpose: "Payment processing. Card details are entered into Stripe directly; Effy never stores card numbers.",
    dataCategories: ["Payment details", "Order amounts", "Contact details"],
    overseasDisclosure: true,
  },
  {
    name: "PostHog",
    purpose: "Product analytics and web error tracking.",
    dataCategories: ["Product-interaction data", "Device/technical data"],
    overseasDisclosure: true,
  },
  {
    name: "Google (Firebase Crashlytics, Cloud Messaging)",
    purpose: "Mobile crash reporting and push notification delivery.",
    dataCategories: ["Crash/diagnostic data", "Device/push token"],
    overseasDisclosure: true,
  },
  {
    name: "Apple (APNs)",
    purpose: "Push notification delivery on iOS.",
    dataCategories: ["Device/push token"],
    overseasDisclosure: true,
  },
  {
    name: "Google (federated sign-in)",
    purpose: "Optional 'Sign in with Google'. Linked to one account on a provider-asserted verified email.",
    dataCategories: ["Account identity", "Contact details"],
    overseasDisclosure: true,
  },
]

export const dataTypes: DataType[] = [
  {
    label: "Account identity (name, email)",
    collected: true,
    purposes: ["Account management", "App functionality"],
    linkedToIdentity: true,
    usedForTracking: false,
    subProcessors: ["Amazon Web Services (Cognito, RDS, S3, SES)", "Google (federated sign-in)"],
    retention: "For the life of the account; certain records retained after deletion (see below).",
  },
  {
    label: "Delivery addresses",
    collected: true,
    purposes: ["App functionality (delivery)"],
    linkedToIdentity: true,
    usedForTracking: false,
    subProcessors: ["Amazon Web Services (Cognito, RDS, S3, SES)"],
    retention: "Until deleted by the customer or on account deletion.",
  },
  {
    label: "Order & purchase history",
    collected: true,
    purposes: ["App functionality", "Account management", "Legal/accounting"],
    linkedToIdentity: true,
    usedForTracking: false,
    subProcessors: ["Amazon Web Services (Cognito, RDS, S3, SES)"],
    retention: "Completed orders are retained after account deletion for tax and accounting obligations.",
  },
  {
    label: "Payment records",
    collected: true,
    purposes: ["App functionality (payment)", "Legal/accounting", "Fraud prevention"],
    linkedToIdentity: true,
    usedForTracking: false,
    subProcessors: ["Stripe"],
    retention: "Retained after account deletion for tax, accounting and fraud obligations. Card numbers are never stored by Effy.",
  },
  {
    label: "Saved items & cart",
    collected: true,
    purposes: ["App functionality"],
    linkedToIdentity: true,
    usedForTracking: false,
    subProcessors: ["Amazon Web Services (Cognito, RDS, S3, SES)"],
    retention: "Until deleted by the customer or on account deletion.",
  },
  {
    label: "Device & push token",
    collected: true,
    purposes: ["Notifications"],
    linkedToIdentity: true,
    usedForTracking: false,
    subProcessors: ["Google (Firebase Crashlytics, Cloud Messaging)", "Apple (APNs)"],
    retention: "Until the device is unregistered or the account is deleted.",
  },
  {
    label: "Product-interaction & usage data",
    collected: true,
    purposes: ["Analytics", "App functionality"],
    linkedToIdentity: true,
    usedForTracking: false,
    subProcessors: ["PostHog"],
    retention: "Retained in aggregate for product analytics; associated with the subject id only.",
  },
  {
    label: "Crash & diagnostic data",
    collected: true,
    purposes: ["Analytics (stability)"],
    linkedToIdentity: false,
    usedForTracking: false,
    subProcessors: ["Google (Firebase Crashlytics, Cloud Messaging)"],
    retention: "Retained for a limited diagnostic window.",
  },
  {
    label: "Support communications",
    collected: true,
    purposes: ["Customer support"],
    linkedToIdentity: true,
    usedForTracking: false,
    subProcessors: ["Amazon Web Services (Cognito, RDS, S3, SES)"],
    retention: "Retained while needed to handle the enquiry and for a reasonable period after.",
  },
]

/** The categories retained AFTER account deletion — mirrors edge-api/customer closure `RETAINED`. */
export const retainedAfterDeletion = [
  "Completed orders (tax & accounting)",
  "Payment records (tax, accounting & fraud)",
  "Fraud & security signals (protecting other customers)",
]

/** No data type is used for cross-app/cross-site tracking — drives the 'no ATT prompt' posture. */
export const usedForTrackingAnywhere = dataTypes.some((d) => d.usedForTracking)
