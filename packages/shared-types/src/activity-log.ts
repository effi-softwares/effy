// Activity logs (104): ONE wire shape for every log in back-office and shop-web, read through ONE server helper
// (`@effy/edge-shared` `lib/activity.ts`) and shown in ONE drawer (`@effy/web-kit/activity-log`).
// A log is a record of what happened to one thing, written by the platform, never edited.
// Spec: specs/104-activity-log-drawer/spec.md.

import type { ListPage } from "./list";

/** How an entry's mark is coloured: progress, a finish, a fault, or neither (the Timeline's tones). */
export type ActivityTone = "default" | "primary" | "done" | "problem";

export interface ActivityEntryDTO {
  /** Unique within its log (sources that union several tables prefix it: `fe:…`, `ph:…`). */
  id: string;
  at: string;
  /** One of the log's `ACTIVITY_LOGS[log].kinds` - the Type filter. */
  kind: string;
  /** What happened, in words. Composed on the server so search and export say what the drawer says. */
  title: string;
  /** Any further words: a reason, a note, what changed. */
  detail: string | null;
  /** What it was on, where a log covers several things: a package and bag, a size. */
  subject: string | null;
  /** A person's name, or "Effy", "Effy driver", "Customer", "System". Never an identifier. */
  actor: string | null;
  tone: ActivityTone;
}

/** One page of a log: 103's keyset envelope. */
export type ActivityPage = ListPage<ActivityEntryDTO>;

/** `?export=csv` on a log's route: every entry matching the drawer's search and filters. */
export interface ActivityExportDTO {
  csv: string;
  rows: number;
}

/** The most entries one export writes. More is refused, never cut (FR-004). */
export const ACTIVITY_EXPORT_CAP = 10_000;
export const ACTIVITY_EXPORT_TOO_MANY = `More than ${ACTIVITY_EXPORT_CAP.toLocaleString("en-AU")} entries match. Narrow the dates to export.`;

/** The query parameters every log understands beside 103's (`q`, `dir`, `pageSize`, `cursor`). */
export const ACTIVITY_FILTERS = ["kind", "from", "to", "sub"] as const;

/** The columns of an exported log, in order. */
export const ACTIVITY_CSV_HEADER = ["When", "Type", "What", "Detail", "On", "Who"] as const;

/** Every log, its kinds in words (the Type filter and the export's Type column), and what its "On" column names. */
export const ACTIVITY_LOGS = {
  "bo-order": {
    kinds: {
      packing: "Packing",
      handover: "Hand-overs",
      delivery: "Delivery",
      courier: "Courier",
      refund: "Refunds",
    },
    subject: "Package",
  },
  "bo-shop": {
    kinds: { shop: "Shop details", status: "Status", team: "Team" },
    subject: null,
  },
  "bo-driver": {
    kinds: {
      profile: "Profile",
      status: "Status",
      work: "Duty and work",
      clearance: "Clearances",
      proof: "Proof viewed",
    },
    subject: null,
  },
  "bo-vehicle": {
    kinds: {
      vehicle: "Vehicle details",
      status: "Status and checks",
      holding: "Issued and returned",
    },
    subject: null,
  },
  "bo-product": {
    kinds: {
      content: "Content",
      review: "Review",
      margin: "Margin",
      sale: "On and off sale",
    },
    subject: null,
  },
  "bo-promotion": {
    kinds: {
      promotion: "Promotion",
      status: "Status",
      pictures: "Pictures",
      audience: "Customers",
      codes: "Codes",
    },
    subject: null,
  },
  "bo-points": {
    kinds: {
      credit: "Added",
      spent: "Spent",
      debit: "Taken off",
      expired: "Expired",
    },
    subject: "Order",
  },
  "bo-points-settings": { kinds: { rules: "Rules" }, subject: null },
  "bo-email": {
    kinds: {
      delivery: "Delivered",
      delay: "Delayed",
      bounce: "Bounced",
      complaint: "Complaints",
      reject: "Rejected",
    },
    subject: "Email",
  },
  "shop-team": {
    kinds: {
      orders: "Orders",
      picking: "Picking",
      notes: "Notes and tags",
      stock: "Stock",
      refund: "Refunds",
    },
    subject: "On",
  },
  "shop-order": {
    kinds: {
      status: "Status",
      picking: "Picking",
      notes: "Notes and tags",
      refund: "Refunds",
      delivery: "Delivery",
    },
    subject: null,
  },
  "shop-stock": {
    kinds: {
      received: "Received",
      sold: "Sales and returns",
      correction: "Corrections",
      loss: "Damaged and expired",
      tracking: "Tracking",
    },
    subject: "Size",
  },
} as const satisfies Record<string, { kinds: Record<string, string>; subject: string | null }>;

export type ActivityLogId = keyof typeof ACTIVITY_LOGS;
export type ActivityKind<L extends ActivityLogId> = keyof (typeof ACTIVITY_LOGS)[L]["kinds"] & string;

/** A log's kinds as filter options, in the order declared. */
export function activityKindOptions(log: ActivityLogId): { value: string; label: string }[] {
  return Object.entries(ACTIVITY_LOGS[log].kinds as Record<string, string>).map(([value, label]) => ({ value, label }));
}

/** Who acted, when the platform rather than a person did. One set of words for every log. */
export const ACTIVITY_ACTOR_WORDS = {
  effy: "Effy",
  driver: "Effy driver",
  customer: "Customer",
  system: "System",
  formerStaff: "Former staff",
  formerTeam: "A former team member",
} as const;
