/**
 * 113 - the one writer of `housekeeping_run`, and the abandon time. Every clean-up (commerce `unpaidOrders`, customer
 * `accountErasure`, the notifications purge's phone registrations) runs inside `recordRun`, which records what it did
 * for Settings › Clean-ups and tells back-office it changed. `housekeeping.guard.test.ts` keeps the table's writes here.
 *
 * ⚠ A problem is fixed words or an error's class name, never a message: messages can carry an email or an address,
 * and this table is shown to every back-office role.
 */

import { ABANDON_LIMITS, type HousekeepingJob, type HousekeepingOutcome } from "@effy/shared-types";

import { announce as liveAnnounce, type LiveChange } from "../live";
import { query, type Queryable } from "./db";
import { emitMetric } from "./metrics";

/** One namespace for every clean-up, whichever service runs it, so one set of alarms watches them all. */
export const HOUSEKEEPING_METRIC_NAMESPACE = "Effy/Housekeeping";

export interface RunResult {
  counts: Record<string, number>;
  /** One short line each ("cognito: TooManyRequestsException"); any problem makes the run `partial`. */
  problems: string[];
}

export interface RecordRunDeps {
  q?: Queryable;
  now?: () => Date;
  announce?: (changes: readonly LiveChange[]) => Promise<void>;
  emit?: typeof emitMetric;
}

const PROBLEM_MAX = 500;

/** "TypeError", or the class a provider SDK names. Never `err.message`. */
export function problemOf(step: string, err: unknown): string {
  const name =
    err && typeof err === "object" && "name" in err && typeof (err as { name: unknown }).name === "string"
      ? (err as { name: string }).name
      : err instanceof Error
        ? err.constructor.name
        : "Error";
  return `${step}: ${name}`;
}

async function insertRun(
  q: Queryable,
  job: HousekeepingJob,
  startedAt: Date,
  finishedAt: Date,
  outcome: HousekeepingOutcome,
  counts: Record<string, number>,
  problem: string | null,
): Promise<void> {
  await q.query(
    `INSERT INTO public.housekeeping_run (job, started_at, finished_at, outcome, counts, problem)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [job, startedAt, finishedAt, outcome, JSON.stringify(counts), problem],
  );
}

/**
 * Runs one clean-up and records it. A throw is recorded as `failed` (with the error's class name) and rethrown, so the
 * function's own error alarm still fires. Returns what `fn` returned.
 */
export async function recordRun(
  job: HousekeepingJob,
  fn: () => Promise<RunResult>,
  deps: RecordRunDeps = {},
): Promise<RunResult> {
  const q = deps.q ?? { query };
  const now = deps.now ?? (() => new Date());
  const emit = deps.emit ?? emitMetric;
  const announce = deps.announce ?? liveAnnounce;
  const startedAt = now();

  let result: RunResult;
  try {
    result = await fn();
  } catch (err) {
    try {
      await insertRun(q, job, startedAt, now(), "failed", {}, problemOf("run", err));
    } finally {
      emit(HOUSEKEEPING_METRIC_NAMESPACE, "HousekeepingFailed", 1, { job });
      await announce([{ scope: "ops", kind: "housekeeping" }]);
    }
    throw err;
  }

  const outcome: HousekeepingOutcome = result.problems.length > 0 ? "partial" : "ok";
  const problem = result.problems.length > 0 ? result.problems.join("; ").slice(0, PROBLEM_MAX) : null;
  await insertRun(q, job, startedAt, now(), outcome, result.counts, problem);
  // The staleness alarm watches this metric per job: a missing datapoint is a clean-up that didn't run.
  emit(HOUSEKEEPING_METRIC_NAMESPACE, "HousekeepingRan", 1, { job });
  if (outcome === "partial") emit(HOUSEKEEPING_METRIC_NAMESPACE, "HousekeepingPartial", 1, { job });
  await announce([{ scope: "ops", kind: "housekeeping" }]);
  return result;
}

/** The abandon time in minutes (Settings › Clean-ups). The seeded row always exists; the default is a safety net. */
export async function readAbandonAfterMinutes(q: Queryable = { query }): Promise<number> {
  const r = await q.query<{ m: number }>(`SELECT abandon_after_min AS m FROM public.housekeeping_settings WHERE id = 1`);
  return r.rows[0]?.m ?? ABANDON_LIMITS.default;
}
