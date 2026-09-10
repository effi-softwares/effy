// Service for the shop ORDER CONSOLE (057 Amendment A3): parsing, validation, and the wording of the
// activity log. No HTTP, no SQL (Principle VI). The repository owns shop scoping.

import * as fulfillmentsRepo from "../fulfillments/repository";
import type { Actor } from "../fulfillments/service";
import { FulfillmentError } from "../fulfillments/types";
import * as repo from "./repository";
import type { ActivityRecord } from "./repository";
import {
  ATTENTIONS,
  METHODS,
  ORDER_TABS,
  PAYMENT_STATES,
  RANGES,
  SHOP_ORDER_NOTE_MAX_LENGTH,
  SHOP_ORDER_TAG_MAX,
  SHOP_ORDER_TAG_MAX_LENGTH,
  SORT_KEYS,
  type ActivityEntry,
  type OrderDetail,
  type OrderList,
  type OrderListQuery,
} from "./types";

export const PAGE_SIZE = 25;

/** Pick `raw` if it is one of `allowed`, otherwise the default — never "match everything differently". */
function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return raw !== undefined && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/**
 * Parse the list query string. Every field is optional on the wire and fully defaulted here.
 *
 * ⚠ THE DEFAULT SORT IS OLDEST FIRST. The queue this screen replaced was strict FIFO by construction
 * (020 FR-001b, SC-020) — the order that has waited longest is the one to pick next — so a console
 * that opened newest-first would quietly bury the most urgent work below the fold. The operator can
 * re-sort by any column; the default is the one that keeps the floor honest.
 */
export function parseListQuery(qs: Record<string, string | undefined> | null): OrderListQuery {
  const p = qs ?? {};
  const page = Number.parseInt(p.page ?? "1", 10);
  return {
    tab: oneOf(p.tab, ORDER_TABS, "all"),
    q: (p.q ?? "").slice(0, 100),
    attention: oneOf(p.attention, ATTENTIONS, "any"),
    payment: oneOf(p.payment, [...PAYMENT_STATES, "any"] as const, "any"),
    method: oneOf(p.method, METHODS, "any"),
    range: oneOf(p.range, RANGES, "any"),
    sort: oneOf(p.sort, SORT_KEYS, "placed"),
    dir: p.dir === "desc" ? "desc" : "asc",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
    pageSize: PAGE_SIZE,
  };
}

export function listOrders(actor: Actor, q: OrderListQuery): Promise<OrderList> {
  return repo.listOrders(actor.shopId, q);
}

/**
 * Open an order in the console.
 *
 * ⚠ OPENING IT IS THE ACKNOWLEDGEMENT, HERE TOO (020 FR-011a). The pick screen and this one are two
 * ways into the same portion; if only one acknowledged, an order the console had shown someone would
 * still read "New" on the tablet beside them.
 */
export async function getOrder(actor: Actor, fulfillmentId: string): Promise<OrderDetail> {
  await fulfillmentsRepo.acknowledge(fulfillmentId, actor.shopId, actor.staffId);
  return repo.readOrder(fulfillmentId, actor.shopId);
}

export async function getActivity(actor: Actor, fulfillmentId: string): Promise<ActivityEntry[]> {
  const rows = await repo.readActivity(fulfillmentId, actor.shopId);
  if (rows === null) throw notFound();
  return rows.map(toEntry);
}

/**
 * Replace the tag set. Tags are trimmed, lower-cased and de-duplicated here, so "Fragile" and
 * "fragile " are one tag and the table's uniqueness agrees with what the operator meant.
 */
export async function setTags(
  actor: Actor,
  fulfillmentId: string,
  body: Record<string, unknown>,
): Promise<OrderDetail> {
  const raw = body.tags;
  if (!Array.isArray(raw) || raw.some((t) => typeof t !== "string")) {
    throw new FulfillmentError("validation", "tags must be a list of words", [
      { field: "tags", message: "must be an array of strings" },
    ]);
  }
  const tags = [...new Set((raw as string[]).map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (tags.length > SHOP_ORDER_TAG_MAX) {
    throw new FulfillmentError("validation", `an order can carry at most ${SHOP_ORDER_TAG_MAX} tags`, [
      { field: "tags", message: `at most ${SHOP_ORDER_TAG_MAX}` },
    ]);
  }
  const tooLong = tags.find((t) => t.length > SHOP_ORDER_TAG_MAX_LENGTH);
  if (tooLong) {
    throw new FulfillmentError(
      "validation",
      `"${tooLong.slice(0, 12)}…" is longer than ${SHOP_ORDER_TAG_MAX_LENGTH} characters`,
      [{ field: "tags", message: `each tag at most ${SHOP_ORDER_TAG_MAX_LENGTH} characters` }],
    );
  }

  const changed = await repo.replaceTags(fulfillmentId, actor.shopId, tags, actor.staffId);
  if (changed === null) throw notFound();
  return repo.readOrder(fulfillmentId, actor.shopId);
}

export async function addNote(
  actor: Actor,
  fulfillmentId: string,
  body: Record<string, unknown>,
): Promise<OrderDetail> {
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) {
    throw new FulfillmentError("validation", "write the note first", [
      { field: "body", message: "must not be empty" },
    ]);
  }
  if (text.length > SHOP_ORDER_NOTE_MAX_LENGTH) {
    throw new FulfillmentError(
      "validation",
      `a note can be at most ${SHOP_ORDER_NOTE_MAX_LENGTH} characters`,
      [{ field: "body", message: `at most ${SHOP_ORDER_NOTE_MAX_LENGTH} characters` }],
    );
  }
  const id = await repo.addNote(fulfillmentId, actor.shopId, text, actor.staffId);
  if (id === null) throw notFound();
  return repo.readOrder(fulfillmentId, actor.shopId);
}

/**
 * Item-level picking (A3 revision 2) — "tick the line", "Select all", or "Adjust this line".
 *
 * ⚠ TICKING A LINE ON A RECEIVED ORDER STARTS PICKING. Picking is only recordable in `picking` (020),
 * and the console has no separate "start" step before the first tick: the tick IS the start. The
 * transition goes through the same guarded state machine as the header's button, so a portion that
 * moved on meanwhile refuses rather than being dragged back.
 */
export async function setPicks(
  actor: Actor,
  fulfillmentId: string,
  body: Record<string, unknown>,
): Promise<OrderDetail> {
  const picks = parsePicks(body);

  const current = await fulfillmentsRepo.readStatus(fulfillmentId, actor.shopId);
  if (current === null) throw notFound();
  if (current === "received") {
    const started = await fulfillmentsRepo.transition(fulfillmentId, actor.shopId, "received", "picking", actor.staffId);
    if (!started) {
      const now = await fulfillmentsRepo.readStatus(fulfillmentId, actor.shopId);
      if (now !== "picking") throw new FulfillmentError("conflict", `items can only be picked while picking (is ${now})`);
    }
  } else if (current !== "picking") {
    throw new FulfillmentError("conflict", `items can only be picked while picking (is ${current})`);
  }

  const done = await repo.applyPicks(fulfillmentId, actor.shopId, picks, actor.staffId);
  if (done === null) throw notFound();
  return repo.readOrder(fulfillmentId, actor.shopId);
}

const PICK_MODES = ["full", "part", "unavailable", "none"] as const;

function parsePicks(body: Record<string, unknown>): repo.PickWrite[] {
  const raw = body.lines;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) {
    throw new FulfillmentError("validation", "say which lines were picked", [
      { field: "lines", message: "must be a non-empty array" },
    ]);
  }
  const seen = new Set<string>();
  return raw.map((l): repo.PickWrite => {
    const line = (l ?? {}) as Record<string, unknown>;
    const id = typeof line.orderItemId === "string" ? line.orderItemId : "";
    const mode = PICK_MODES.find((m) => m === line.mode);
    if (!id || !mode || seen.has(id)) {
      throw new FulfillmentError("validation", "each line needs an item and a pick state", [
        { field: "lines", message: "orderItemId and mode (full|part|unavailable|none), each line once" },
      ]);
    }
    seen.add(id);
    const units = line.units === undefined ? 0 : Number(line.units);
    if (mode === "part" && (!Number.isInteger(units) || units < 1)) {
      throw new FulfillmentError("validation", "use Unavailable instead of 0", [
        { field: "units", message: "a part pick needs at least 1 unit" },
      ]);
    }
    const noteRaw = typeof line.note === "string" ? line.note.trim() : "";
    if (noteRaw.length > 500) {
      throw new FulfillmentError("validation", "a line note can be at most 500 characters", [
        { field: "note", message: "at most 500 characters" },
      ]);
    }
    return { orderItemId: id, mode, units: mode === "part" ? units : 0, note: noteRaw || null };
  });
}

// ── The log's wording ───────────────────────────────────────────────────────────────────────────

/** Operator copy for each state — the same words the console's badges use. */
const STATE_WORDS: Record<string, string> = {
  pending: "new",
  received: "received",
  picking: "picking",
  ready_for_pickup: "ready for pickup",
  collected: "collected",
  delivered: "delivered",
  unfulfillable: "can't supply",
  withdrawn: "cancelled",
};

const REFUND_WORDS: Record<string, string> = {
  submitting: "being sent",
  submitted: "sent — waiting for the bank",
  succeeded: "returned",
  failed: "failed",
  refused: "refused by the provider",
};

/**
 * One log entry's words.
 *
 * ⚠ THE LOG NEVER COPIES A NOTE'S BODY. "Note added" says that something was written and by whom; the
 * words stay in the Notes section, where they can be read in full and are not truncated mid-thought.
 *
 * ⚠ Three tones for the dot. `negative` is something the customer will not get (an unavailable line,
 * can't-supply, a cancellation, a refund that bounced) — the design's destructive dot. `strong` took a
 * decision (money, a reversal). Routine progress is `quiet`.
 */
export function toEntry(r: ActivityRecord): ActivityEntry {
  const base = { id: `${r.source}:${r.id}`, at: r.at, actorLabel: actor(r) };
  switch (r.source) {
    case "refund": {
      const what = r.refund_kind === "cancellation" ? "Cancellation refund" : "Refund";
      return {
        ...base,
        title: `${what} of $${r.amount ?? "0.00"} ${REFUND_WORDS[r.refund_status ?? ""] ?? r.refund_status}`,
        tone: r.refund_status === "failed" || r.refund_status === "refused" ? "negative" : "strong",
      };
    }
    case "collection":
      return {
        ...base,
        title: r.to_status === "short" ? "Collected by an Effy driver — reported short" : "Collected by an Effy driver",
        tone: r.to_status === "short" ? "negative" : "quiet",
      };
    case "arrival":
      return { ...base, title: "Delivered to the customer", tone: "quiet" };
    case "event":
      return { ...base, ...eventWords(r) };
  }
}

function eventWords(r: ActivityRecord): { title: string; tone: ActivityEntry["tone"] } {
  const item = r.item_name ?? "an item";
  const qty = r.quantity ?? 0;
  // A picker's note rides on the item events (A3 revision 2: "Adjust this line").
  const note = r.detail ? ` · ${r.detail}` : "";
  switch (r.event_type) {
    case "state_changed": {
      // The dev pickup stub writes `collected:placeholder:<ref>`; only the state word is operator copy.
      const to = (r.to_status ?? "").split(":")[0] ?? "";
      if (r.from_status === "pending" && to === "received") {
        return { title: "Order opened — acknowledged", tone: "quiet" };
      }
      if (r.from_status === "ready_for_pickup" && to === "picking") {
        return { title: "Picking reopened", tone: "strong" };
      }
      const words = STATE_WORDS[to] ?? to;
      return {
        title: `Marked ${words}`,
        tone: to === "unfulfillable" || to === "withdrawn" ? "negative" : "quiet",
      };
    }
    // ⚠ THE DESIGN'S WORDS: "{item} — picked in full" / "{n} of {m} picked" / "marked unavailable",
    // plus the note. The ordered quantity comes from the line so a partial pick reads against it.
    case "item_gathered": {
      const ordered = r.item_ordered;
      if (qty === 0) return { title: `${item} — picking cleared${note}`, tone: "quiet" };
      if (ordered !== null && qty >= ordered) return { title: `${item} — picked in full${note}`, tone: "quiet" };
      return {
        title: ordered !== null ? `${item} — ${qty} of ${ordered} picked${note}` : `${item} — ${qty} picked${note}`,
        tone: "quiet",
      };
    }
    case "item_unavailable":
      return { title: `${item} — marked unavailable${note}`, tone: "negative" };
    case "item_restored":
      return { title: `${item} — found, no longer unavailable${note}`, tone: "quiet" };
    case "note_added":
      return { title: "Internal note added", tone: "quiet" };
    case "tags_changed":
      return {
        title: r.detail ? `Tags set to ${r.detail}` : "Tags cleared",
        tone: "quiet",
      };
    default:
      // ⚠ An event type this code does not know yet still appears — as its wire value — rather than
      // vanishing. A log that silently drops entries is worse than one with an ugly line.
      return { title: r.event_type ?? "Updated", tone: "quiet" };
  }
}

function actor(r: ActivityRecord): string | null {
  switch (r.actor_kind) {
    case "shop":
      return r.actor_name ?? (r.source === "event" ? null : "Your shop");
    case "back_office":
      return "Effy";
    case "customer":
      return "Customer";
    case "system":
      return "Payment provider";
    case "driver":
      return "Effy driver";
    case "effy":
      return "Effy";
    default:
      return null;
  }
}

function notFound(): FulfillmentError {
  return new FulfillmentError("not_found", "order not found");
}
