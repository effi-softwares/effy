import { LIVE_VALUE_KEYS, LIVE_VALUE_WORDS, liveValueToken, type LiveValueDTO, type LiveValueKey } from "@effy/shared-types";

import { loadCartPolicy } from "../cart-policy/policy";
import { loadActivePlan, NoActivePlanError } from "../delivery/plan";
import type { Queryable } from "../lib/db";
import { formatCents } from "../lib/money";

/**
 * Live values (108): a fact owned by a setting, written into an information banner's words as `{key}` and filled from
 * that setting each time the banner is shown, so a changed setting changes every banner at once and no banner holds a
 * typed copy. The one place tokens are parsed, loaded and filled (`promotions.guard.test.ts`).
 */

/** Every `{…}` in a text, known or not. */
const TOKEN = /\{([a-z0-9_]+)\}/g;

const isKey = (k: string): k is LiveValueKey => (LIVE_VALUE_KEYS as readonly string[]).includes(k);

/** The known keys a text names, in order, without repeats. */
export function tokensIn(...texts: readonly (string | null | undefined)[]): LiveValueKey[] {
  const out: LiveValueKey[] = [];
  for (const t of texts) for (const m of (t ?? "").matchAll(TOKEN)) if (isKey(m[1]!) && !out.includes(m[1]!)) out.push(m[1]!);
  return out;
}

/** `{…}` names that are not live values: a typo the form refuses. */
export function unknownTokens(text: string | null | undefined): string[] {
  return [...(text ?? "").matchAll(TOKEN)].map((m) => m[1]!).filter((k) => !isKey(k));
}

/** Whether a text holds any `{…}` at all (an offer's words may not). */
export const hasToken = (text: string | null | undefined): boolean => /\{[a-z0-9_]+\}/.test(text ?? "");

/** "$150", "$20", "$7.50": as the terms composer says money. */
function money(cents: number): string {
  const s = formatCents(cents);
  return `$${s.endsWith(".00") ? s.slice(0, -3) : s}`;
}

/** What each value reads now; null = nothing to show. */
export type LiveValues = Readonly<Record<LiveValueKey, string | null>>;

/** Read from the settings that own them: the active Effy delivery plan and the order rules. */
export async function loadLiveValues(db: Queryable): Promise<LiveValues> {
  const [plan, policy] = await Promise.all([
    loadActivePlan(db, "effy").catch((e: unknown) => {
      if (e instanceof NoActivePlanError) return null;
      throw e;
    }),
    loadCartPolicy(db),
  ]);
  return {
    free_delivery_amount: plan && plan.freeOverCents !== null && plan.freeOverCents > 0 ? money(plan.freeOverCents) : null,
    order_minimum: policy.minimumSubtotalCents > 0 ? money(policy.minimumSubtotalCents) : null,
  };
}

/** For back-office: each value with its name, token, what it reads and why it is empty. */
export function liveValueList(values: LiveValues): LiveValueDTO[] {
  return LIVE_VALUE_KEYS.map((key) => ({
    key,
    name: LIVE_VALUE_WORDS[key].name,
    token: liveValueToken(key),
    reads: values[key],
    why: values[key] === null ? LIVE_VALUE_WORDS[key].empty : null,
  }));
}

/** A text with its tokens filled; `missing` names the values that had nothing to show (the text is then unusable). */
export function fillText(text: string | null, values: LiveValues): { text: string | null; missing: LiveValueKey[] } {
  if (text === null) return { text: null, missing: [] };
  const missing: LiveValueKey[] = [];
  const filled = text.replace(TOKEN, (whole, key: string) => {
    if (!isKey(key)) return whole;
    const v = values[key];
    if (v === null) {
      if (!missing.includes(key)) missing.push(key);
      return whole;
    }
    return v;
  });
  return { text: filled, missing };
}
