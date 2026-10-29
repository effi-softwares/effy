import {
  DeleteSuppressedDestinationCommand,
  GetSuppressedDestinationCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2"

import { logger, offsetListPage } from "@effy/edge-shared"

import type { DeliverabilityListRequest } from "./list"
import * as repo from "./repository"
import {
  type DeliveryDetailDTO,
  type DeliveryEvent,
  type DeliveryEventType,
  type DeliveryListDTO,
  DeliverabilityError,
  type EmailDeliveryState,
  REPAIR_NOTE_MAX,
} from "./types"

let client: SESv2Client | undefined
function ses(): SESv2Client {
  client ??= new SESv2Client({})
  return client
}

/** Only a permanent failure locks someone out; `Undetermined` is transient (a false lockout is found by nobody). */
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
      // SES accepted and then refused it (a virus, typically): says nothing about the address.
      return "reachable"
  }
}

/** The status advances only when the event was new. */
export async function recordOutcome(event: DeliveryEvent): Promise<{ recorded: boolean; state: EmailDeliveryState }> {
  const state = stateFor(event)
  const isNew = await repo.insertEvent(event)

  if (isNew && event.eventType !== "reject") {
    await repo.upsertStatus(event, state)
  }

  return { recorded: isNew, state }
}

export async function list(req: DeliverabilityListRequest): Promise<DeliveryListDTO> {
  const r = await repo.listStatuses(req)
  const withSubjects = await Promise.all(r.items.map(async (s) => repo.toListItemDTO(s, await repo.findSubject(s.address))))
  return offsetListPage(withSubjects, req, r)
}

export const viewCounts = (req: DeliverabilityListRequest) => repo.statusViewCounts(req)

export async function detail(address: string): Promise<DeliveryDetailDTO> {
  const status = await repo.getStatus(address)
  if (!status) throw new DeliverabilityError("not_found", "no delivery record for that address")

  const [subject, suppressedInSes] = await Promise.all([
    repo.findSubject(status.address),
    isSuppressed(status.rawAddress),
  ])

  return {
    ...repo.toListItemDTO(status, subject),
    diagnostic: status.diagnostic,
    lastMessageId: status.lastMessageId,
    repairedBy: status.repairedBy,
    suppressedInSes,
  }
}

/** Read live, never stored. null on failure, never false: "not suppressed" would be the worse lie. */
async function isSuppressed(rawAddress: string): Promise<boolean | null> {
  try {
    await ses().send(new GetSuppressedDestinationCommand({ EmailAddress: rawAddress }))
    return true
  } catch (err) {
    if (err instanceof Error && err.name === "NotFoundException") return false
    // The error name only: the rejection text embeds the address.
    logger.warn({ err: err instanceof Error ? err.name : "unknown" }, "suppression lookup failed")
    return null
  }
}

/**
 * Both halves or none: SES suppression first, then the database, so a failed remote call records
 * nothing and "repaired" is never committed while the address is still blocked.
 */
export async function repair(address: string, actorSub: string, note: string): Promise<DeliveryDetailDTO> {
  const trimmed = note.trim()
  if (!trimmed) {
    // A reason is required: this re-enables mail to an address that hard-failed.
    throw new DeliverabilityError("validation", "a note explaining the repair is required")
  }
  if (trimmed.length > REPAIR_NOTE_MAX) {
    throw new DeliverabilityError("validation", `note must be ${REPAIR_NOTE_MAX} characters or fewer`)
  }

  const status = await repo.getStatus(address)
  if (!status) throw new DeliverabilityError("not_found", "no delivery record for that address")

  try {
    // `rawAddress`, case intact: the API is case-sensitive.
    await ses().send(new DeleteSuppressedDestinationCommand({ EmailAddress: status.rawAddress }))
  } catch (err) {
    // "Not found" is success: the platform's half still needs clearing.
    if (!(err instanceof Error && err.name === "NotFoundException")) {
      logger.error({ err: err instanceof Error ? err.name : "unknown" }, "suppression delete failed")
      throw new DeliverabilityError("unavailable", "could not clear the suppression entry")
    }
  }

  await repo.markRepaired(status.address, status.state, actorSub, trimmed)
  return detail(status.address)
}

interface RawRecipient {
  emailAddress?: string
  diagnosticCode?: string
  status?: string
}

/** One event per named recipient. [] rather than a throw on anything unrecognised. */
export function parseOutcome(raw: unknown): DeliveryEvent[] {
  if (typeof raw !== "object" || raw === null) return []
  const msg = raw as Record<string, any>

  const messageId: string | undefined = msg.mail?.messageId
  const eventType = eventTypeFor(msg.eventType)
  if (!messageId || !eventType) return []

  const occurredAt: string = msg.mail?.timestamp ?? new Date().toISOString()

  // `mail.tags` holds one `effy-template` value; absent for Cognito-sent mail.
  const templateId: string | null = msg.mail?.tags?.["effy-template"]?.[0] ?? null

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
      templateId,
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
      return null
  }
}
