import type { Queryable } from "../lib/db";

/**
 * Whether the new delivery model is on at `now` (078 research R1): from that moment a customer
 * chooses ONE window for the order — today's under "Same-day delivery", a later day's under
 * "Standard delivery" — instead of the 047/069 same-day slot or standard day.
 *
 * ⚠ THE ONE READER OF THE SWITCH. It asks `public.delivery_model_v2_at` and nothing reads the
 * column behind it (`windows.guard.test.ts`). Two readers would be two opinions about which
 * checkout a customer is in — one prices a window the other refuses.
 *
 * ⚠ IT HAS ONE WRITER (083): the back-office go-live setter (`admin/src/delivery/go-live.repository.ts`),
 * behind the readiness check. The moment may be in the future — which is why this takes `now`:
 * a quote a second before it is the old checkout, a quote a second after is the new one.
 */
export async function deliveryModelV2At(q: Queryable, now: Date): Promise<boolean> {
  const row = (await q.query<{ on: boolean }>(`SELECT public.delivery_model_v2_at($1::timestamptz) AS "on"`, [now])).rows[0];
  return row?.on === true;
}
