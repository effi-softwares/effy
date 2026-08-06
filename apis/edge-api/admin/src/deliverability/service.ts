// Deliverability service: turns raw delivery outcomes into the platform's conclusion, and owns the
// three-part repair. Pure decisions live here; SQL lives in repository.ts (Principle VI).
import {
  DeleteSuppressedDestinationCommand,
  GetSuppressedDestinationCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2"

import { logger } from "@effy/edge-shared"

import * as repo from "./repository"
import {
  type DeliveryDetailDTO,
  type DeliveryEvent,
  type DeliveryEventType,
  type DeliveryListDTO,
  type DeliveryListParams,
  DeliverabilityError,
  type EmailDeliveryState,
  REPAIR_NOTE_MAX,
} from "./types"

let client: SESv2Client | undefined
function ses(): SESv2Client {
  client ??= new SESv2Client({})
  return client
}

/** Test seam, matching the mailer convention in edge-auth. */
export function resetSesForTests(): void {
  client = undefined
}

// ── Outcome → conclusion ─────────────────────────────────────────────────────────────────────

/**
 * ⚠ THE ONE DECISION THAT LOCKS SOMEONE OUT. Only a PERMANENT failure reaches `undeliverable`.
 *
 * `Undetermined` — an outcome the mail service itself could not classify — is treated as TRANSIENT.
 * The bias is deliberately toward under-reporting: a missed lockout is found when the person
 * contacts support, while a FALSE lockout is found by nobody, because the person simply leaves.
 */
export function stateFor(event: DeliveryEvent): EmailDeliveryState {
  switch (event.eventType) {
    case "bounce":
      return event.subType?.startsWith("Permanent") ? "undeliverable" : "soft_failing"
    case "complaint":
      return "complained"
    case "delivery":
      return "reachable"
    case "delivery_delay":
      return "soft_failing"
    case "reject":
      // Recorded for diagnosis; SES accepted the message and then refused it (a virus, typically).
      // It says nothing about whether the address works, so it must not move the conclusion.
      return "reachable"
  }
}

/**
 * Record one outcome.
 *
 * ⚠ The status row is advanced ONLY when the event was NEW. See repository.insertEvent.
 */
export async function recordOutcome(event: DeliveryEvent): Promise<{ recorded: boolean; state: EmailDeliveryState }> {
  const state = stateFor(event)
  const isNew = await repo.insertEvent(event)

  if (isNew && event.eventType !== "reject") {
    await repo.upsertStatus(event, state)
  }

  return { recorded: isNew, state }
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────

export async function list(params: DeliveryListParams): Promise<DeliveryListDTO> {
  const { items, total } = await repo.listStatuses(params)

  const withSubjects = await Promise.all(
    items.map(async (s) => repo.toListItemDTO(s, await repo.findSubject(s.address))),
  )

  return { items: withSubjects, total }
}

export async function detail(address: string): Promise<DeliveryDetailDTO> {
  const status = await repo.getStatus(address)
  if (!status) throw new DeliverabilityError("not_found", "no delivery record for that address")

  const [subject, events, suppressedInSes] = await Promise.all([
    repo.findSubject(status.address),
    repo.listEvents(status.address),
    isSuppressed(status.rawAddress),
  ])

  return {
    ...repo.toListItemDTO(status, subject),
    diagnostic: status.diagnostic,
    lastMessageId: status.lastMessageId,
    repairedBy: status.repairedBy,
    suppressedInSes,
    events,
  }
}

/**
 * Is this address on the mail service's own block list?
 *
 * ⚠ READ LIVE, NEVER STORED. Two stored sources of truth for one fact disagree eventually, and at
 * that moment nobody can tell which is lying — the reasoning that made 027 count redemptions rather
 * than keep a counter.
 *
 * ⚠ RETURNS null ON FAILURE, never false. `false` reads as "not suppressed", which is the more
 * dangerous of the two lies: an operator would conclude the address is fine and stop looking.
 */
async function isSuppressed(rawAddress: string): Promise<boolean | null> {
  try {
    await ses().send(new GetSuppressedDestinationCommand({ EmailAddress: rawAddress }))
    return true
  } catch (err) {
    if (err instanceof Error && err.name === "NotFoundException") return false
    // ⚠ Log the ERROR NAME only. The rejection text embeds the address (035's rule).
    logger.warn({ err: err instanceof Error ? err.name : "unknown" }, "suppression lookup failed")
    return null
  }
}

// ── Repair ───────────────────────────────────────────────────────────────────────────────────

/**
 * Restore a person's ability to receive mail (FR-034).
 *
 * ⚠ TWO HALVES, AND HALF A REPAIR IS A FAILED REPAIR. Clearing only the platform's record leaves the
 * mail service still accepting-and-dropping every send; clearing only the mail service's entry
 * leaves the console and the account page still reporting the person as unreachable.
 *
 * ⚠ MAIL SERVICE FIRST, DATABASE SECOND. If the remote call fails, the transaction never opens and
 * nothing is recorded — which leaves a TRUE state. The reverse order could commit "repaired" while
 * the address is still blocked, which is the worst outcome available because it LOOKS fixed.
 */
export async function repair(address: string, actorSub: string, note: string): Promise<DeliveryDetailDTO> {
  const trimmed = note.trim()
  if (!trimmed) {
    // Required on purpose: a repair with no stated reason is indistinguishable from a mistake six
    // months later, and this action re-enables mail to an address that previously hard-failed.
    throw new DeliverabilityError("validation", "a note explaining the repair is required")
  }
  if (trimmed.length > REPAIR_NOTE_MAX) {
    throw new DeliverabilityError("validation", `note must be ${REPAIR_NOTE_MAX} characters or fewer`)
  }

  const status = await repo.getStatus(address)
  if (!status) throw new DeliverabilityError("not_found", "no delivery record for that address")

  try {
    // ⚠ `rawAddress` — the stored bytes, case intact. NOT the path parameter and NOT a lowercased
    // form: this API is case-sensitive, and a normalising delete silently fails to remove an entry
    // that demonstrably exists, leaving the operator certain they fixed something they did not
    // (FR-035).
    await ses().send(new DeleteSuppressedDestinationCommand({ EmailAddress: status.rawAddress }))
  } catch (err) {
    // ⚠ "Not found" IS SUCCESS. It means the address was never suppressed, or was cleared already —
    // and the platform's own half still needs clearing. Treating it as an error would make the
    // common case (a soft_failing address with no entry at all) permanently unrepairable.
    if (!(err instanceof Error && err.name === "NotFoundException")) {
      logger.error({ err: err instanceof Error ? err.name : "unknown" }, "suppression delete failed")
      throw new DeliverabilityError("unavailable", "could not clear the suppression entry")
    }
  }

  await repo.markRepaired(status.address, status.state, actorSub, trimmed)
  return detail(status.address)
}

// ── Parsing the raw outcome payload ──────────────────────────────────────────────────────────

interface RawRecipient {
  emailAddress?: string
  diagnosticCode?: string
  status?: string
}

/**
 * Normalise one outcome message into zero or more events — one per named recipient.
 *
 * ⚠ ONE MESSAGE CAN NAME SEVERAL RECIPIENTS. This platform sends one code to one address, but the
 * contract does not guarantee that and the consumer must not assume it.
 *
 * ⚠ RETURNS [] RATHER THAN THROWING on anything unrecognised. Throwing makes the delivery retry
 * forever, turning one unparseable message into an outage of the whole consumer — and the consumer
 * is the only thing that can see a person being locked out.
 */
export function parseOutcome(raw: unknown): DeliveryEvent[] {
  if (typeof raw !== "object" || raw === null) return []
  const msg = raw as Record<string, any>

  const messageId: string | undefined = msg.mail?.messageId
  const eventType = eventTypeFor(msg.eventType)
  if (!messageId || !eventType) return []

  const occurredAt: string = msg.mail?.timestamp ?? new Date().toISOString()

  let recipients: RawRecipient[] = []
  let subType: string | null = null
  let reason: string | null = null

  switch (eventType) {
    case "bounce":
      recipients = msg.bounce?.bouncedRecipients ?? []
      subType = joinSubType(msg.bounce?.bounceType, msg.bounce?.bounceSubType)
      break
    case "complaint":
      recipients = msg.complaint?.complainedRecipients ?? []
      subType = msg.complaint?.complaintFeedbackType ?? null
      break
    case "delivery":
      recipients = (msg.delivery?.recipients ?? []).map((a: string) => ({ emailAddress: a }))
      break
    case "delivery_delay":
      recipients = msg.deliveryDelay?.delayedRecipients ?? []
      subType = msg.deliveryDelay?.delayType ?? null
      break
    case "reject":
      recipients = (msg.mail?.destination ?? []).map((a: string) => ({ emailAddress: a }))
      reason = msg.reject?.reason ?? null
      break
  }

  const events: DeliveryEvent[] = []
  for (const r of recipients) {
    const rawAddress = typeof r === "string" ? r : r?.emailAddress
    if (!rawAddress) continue

    events.push({
      address: rawAddress.toLowerCase(),
      rawAddress,
      eventType,
      subType,
      reason: reason ?? r?.status ?? null,
      diagnostic: r?.diagnosticCode ?? null,
      messageId,
      occurredAt,
    })
  }

  return events
}

function joinSubType(a?: string, b?: string): string | null {
  if (!a) return null
  return b ? `${a}/${b}` : a
}

function eventTypeFor(raw: unknown): DeliveryEventType | null {
  switch (raw) {
    case "Bounce":
      return "bounce"
    case "Complaint":
      return "complaint"
    case "Delivery":
      return "delivery"
    case "Reject":
      return "reject"
    case "DeliveryDelay":
      return "delivery_delay"
    default:
      // Unknown types are ignored, not thrown — see parseOutcome's header.
      return null
  }
}
