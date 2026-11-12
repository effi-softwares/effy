// The automatic-message runner (115 R6; US3, US4). Called at the start of every `messages` pass, so a run's message is
// sent in the same minute by 112's path (due → pages): consent, choices, the night hold, the limits, the largest
// message, stop and the report all apply unchanged. One transaction per automation, the row locked (SKIP LOCKED), so
// two passes never run one twice.
//   - repeat:  creates a message to the automation's audience; waits (records it once, leaves `next_run_at`) while an
//              earlier run's message is still sending; then advances to the first due time AFTER NOW, so a waited run
//              happens once and nothing is doubled (L6). A schedule past its end finishes.
//   - trigger: records this run's people once per occurrence, and creates a message for exactly them (the
//              `automationRun` audience, with the automation's own filter), when any were found.
import type { Queryable, Transactor } from "@effy/edge-shared";
import { countAudience } from "@effy/edge-shared/notifications";
import {
  OPERATING_TZ,
  messageKind,
  nextDailyTriggerAt,
  nextHourlyTriggerAt,
  nextRunAt,
  trigger,
  type AudienceFilter,
  type RepeatSchedule,
} from "@effy/shared-types";

import * as repo from "./repository";
import type { DueAutomation } from "./repository";

export interface AutomationsDeps {
  db: Queryable;
  transact: Transactor;
  now: () => Date;
}

export interface AutomationsSummary {
  runs: number;
  messages: number;
  recipients: number;
  waited: number;
  finished: number;
}

function scheduleOf(a: DueAutomation): RepeatSchedule {
  return { every: a.repeatEvery!, days: a.repeatDays, date: a.repeatDate, time: a.repeatTime!, startsOn: a.startsOn!, endsOn: a.endsOn };
}

const consentCategory = (a: DueAutomation) => (a.kind === "offer" ? "offers" : a.kind === "news" ? "news" : null);

async function runRepeat(tx: Queryable, a: DueAutomation, now: Date, s: AutomationsSummary): Promise<void> {
  if (await repo.runStillSending(tx, a.id)) {
    // The run waits for the earlier one; its next time stays as it is, so it starts as soon as that one is done.
    if ((await repo.latestRun(tx, a.id))?.outcome !== "waited") await repo.insertRun(tx, a.id, now, "waited");
    s.waited += 1;
    return;
  }
  const runId = await repo.insertRun(tx, a.id, now, "nobody");
  const c = await countAudience(tx, a.audience, a.filter, consentCategory(a), now);
  const matched = messageKind(a.kind)?.marketing ? (c.consented ?? 0) : c.matched;
  const messageId = matched > 0 ? await repo.insertAutomationMessage(tx, a, a.filter, now, matched) : null;
  await repo.recordRunResult(tx, runId, matched, messageId);
  s.runs += 1;
  if (messageId) s.messages += 1;
  const next = nextRunAt(scheduleOf(a), now, OPERATING_TZ);
  await repo.setNextRun(tx, a.id, next);
  if (!next) s.finished += 1;
}

async function runTrigger(tx: Queryable, a: DueAutomation, now: Date, s: AutomationsSummary): Promise<void> {
  const runId = await repo.insertRun(tx, a.id, now, "nobody");
  const found = await repo.recordTriggerRecipients(tx, a, runId, now);
  const filter = { ...(a.filter as object), automationRun: runId } as AudienceFilter;
  const messageId = found > 0 ? await repo.insertAutomationMessage(tx, a, filter, now, found) : null;
  await repo.recordRunResult(tx, runId, found, messageId);
  s.runs += 1;
  s.recipients += found;
  if (messageId) s.messages += 1;
  await repo.setNextRun(tx, a.id, trigger(a.triggerKind!).cadence === "daily" ? nextDailyTriggerAt(now, OPERATING_TZ) : nextHourlyTriggerAt(now));
}

/** Every automation due now, triggers and repeats (T026, T031). */
export async function runAutomations(deps: AutomationsDeps): Promise<AutomationsSummary> {
  const s: AutomationsSummary = { runs: 0, messages: 0, recipients: 0, waited: 0, finished: 0 };
  const now = deps.now();
  for (const id of await repo.dueAutomationIds(deps.db, now)) {
    await deps.transact(async (tx) => {
      const a = await repo.lockDueAutomation(tx, id, now);
      if (!a) return;
      if (a.mode === "repeat") await runRepeat(tx, a, now, s);
      else await runTrigger(tx, a, now, s);
    });
  }
  return s;
}
