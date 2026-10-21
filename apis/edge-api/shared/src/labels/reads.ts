// Every read of a bag label — scanned or typed, accepted or refused, on every surface (096, research R7).
//
// ⚠ ONE WRITER. `reads.guard.test.ts` fails any other INSERT into `label_read`, and the table refuses
// UPDATE and DELETE itself (a trigger): a correction is a new row. Until 096 a refused scan (the wrong
// shop's bag, a label for nothing on the run) stopped the driver on screen and was never heard of again —
// the most useful exception data there is.
//
// The client JUDGES a read with the shared scan rule (so it works with no signal) and REPORTS it; the
// server records that outcome AND its own, re-judged against the database. When they differ — a bag
// voided while the driver was offline — the disagreement is data, never a silent overwrite.

import { readCode, type LabelReadDTO, type ReadMethod, type ReadOutcome } from "@effy/shared-types";

import { emitMetric, metricNamespace } from "../lib/metrics";
import type { HandoverActor } from "./handovers";
import { validInstant } from "./handovers";
import { resolveCode, type ResolvedOrder, type ResolvedParcel } from "./resolve";

export type ReadStep = "pack" | "collect" | "checkin" | "load" | "deliver" | "return" | "lookup";
export type ReadSurface = "driver_app" | "shop_web" | "back_office";

const OUTCOMES: ReadonlySet<string> = new Set<ReadOutcome>([
  "accepted", "already_counted", "belongs_elsewhere", "not_on_this_work", "voided", "cancelled", "not_a_label", "not_found",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecordReadsInput {
  actor: HandoverActor;
  surface: ReadSurface;
  step: ReadStep;
  roundId?: string | null;
  reads: ReadonlyArray<Partial<LabelReadDTO>> | undefined;
  /**
   * The step's own judgement of a bag that exists, is live and is not cancelled (expected here? counted
   * already? someone else's?). Without one the client's outcome stands for those cases.
   */
  judge?: (bag: ResolvedParcel, method: ReadMethod) => ReadOutcome;
}

export interface RecordedRead {
  clientReadId: string;
  raw: string;
  serverOutcome: ReadOutcome;
  resolved: ResolvedParcel | ResolvedOrder | null;
}

/** Record each well-formed read once (`client_read_id`), with the server's own outcome. */
export async function recordReads(tx: { query: (t: string, v?: unknown[]) => Promise<any> }, input: RecordReadsInput): Promise<RecordedRead[]> {
  const out: RecordedRead[] = [];
  for (const r of input.reads ?? []) {
    if (typeof r?.clientReadId !== "string" || !UUID.test(r.clientReadId)) continue;
    if (typeof r.raw !== "string" || r.raw.trim() === "") continue;
    const method: ReadMethod = r.method === "typed" ? "typed" : "scan";
    const raw = r.raw.trim().slice(0, 64);
    const resolved = await resolveCode(tx, raw);
    const serverOutcome = judgeOnServer(raw, resolved, method, input, r.outcome);
    const a = input.actor;
    await tx.query(
      `INSERT INTO public.label_read
              (client_read_id, actor_kind, driver_id, shop_staff_id, admin_sub, surface, step, raw, read_method,
               client_outcome, server_outcome, parcel_id, round_id, device_id, app_version, device_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (client_read_id) DO NOTHING`,
      [
        r.clientReadId, a.kind,
        a.kind === "driver" ? a.driverId : null,
        a.kind === "shop_staff" ? a.staffId : null,
        a.kind === "admin_staff" ? a.sub : null,
        input.surface, input.step, raw, method,
        typeof r.outcome === "string" && OUTCOMES.has(r.outcome) ? r.outcome : null,
        serverOutcome,
        resolved?.kind === "parcel" ? resolved.parcelId : null,
        input.roundId ?? null,
        typeof r.deviceId === "string" ? r.deviceId.slice(0, 64) : null,
        typeof r.appVersion === "string" ? r.appVersion.slice(0, 32) : null,
        validInstant(r.deviceAt),
      ],
    );
    if (serverOutcome !== "accepted") {
      emitMetric(metricNamespace(), "ReadRefused", 1, { outcome: serverOutcome, surface: input.surface });
    }
    out.push({ clientReadId: r.clientReadId, raw, serverOutcome, resolved });
  }
  return out;
}

function judgeOnServer(
  raw: string,
  resolved: ResolvedParcel | ResolvedOrder | null,
  method: ReadMethod,
  input: RecordReadsInput,
  clientOutcome: unknown,
): ReadOutcome {
  if (resolved === null) {
    // A code-shaped read naming no bag is "not found"; anything else is not a label.
    return readCode(raw, "typed") ? "not_found" : "not_a_label";
  }
  if (resolved.kind === "order") return input.step === "lookup" ? "accepted" : "not_a_label";
  if (resolved.voided) return "voided";
  if (resolved.cancelled) return "cancelled";
  if (input.judge) return input.judge(resolved, method);
  return typeof clientOutcome === "string" && OUTCOMES.has(clientOutcome) && clientOutcome !== "not_found"
    ? (clientOutcome as ReadOutcome)
    : "accepted";
}
