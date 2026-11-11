import { useEffect, useRef, useState, type ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"
import { Upload } from "lucide-react"

import {
  MESSAGE_AUDIENCE_WORDS,
  audiencesFor,
  messageKind,
  peopleWords,
  type AudienceFilter,
  type CustomerAudienceFilter,
  type DriverAudienceFilter,
  type MessageAudienceCountDTO,
  type NotificationAudience,
  type ShopAudienceFilter,
} from "@effy/shared-types"
import {
  Button,
  Checkbox,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@effy/design-system/ui"

import { zonesQuery } from "@/features/drivers/queries"

import { type MessageDraft } from "../draft"
import { countAudience } from "../repo"
import { AUDIENCE_WORD } from "../words"
import { PeoplePicker } from "./PeoplePicker"

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** The live count (FR-009): how many people the chosen filters match now, and, for offers and news, said yes. */
export function useAudienceCount(draft: MessageDraft) {
  const audiences = audiencesFor(draft.kind)
    .filter((a) => draft.audiences[a].on)
    .map((a) => ({ audience: a, filter: draft.audiences[a].filter }))
  const body = useDebounced({ kind: draft.kind, audiences }, 300)
  return useQuery({
    queryKey: ["back-office", "messages", "count", body],
    queryFn: () => countAudience(body),
    enabled: body.audiences.length > 0,
    placeholderData: (prev) => prev,
  })
}

function Flag({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  )
}

/** A filter object with one key set or removed. */
function patch<F extends AudienceFilter>(f: F, key: keyof F, value: unknown): F {
  const next = { ...f } as Record<string, unknown>
  if (value === undefined || value === false || (Array.isArray(value) && value.length === 0)) delete next[key as string]
  else next[key as string] = value
  return next as F
}

function CustomerFilters({
  filter,
  onChange,
}: {
  filter: CustomerAudienceFilter
  onChange: (f: CustomerAudienceFilter) => void
}) {
  const zones = useQuery(zonesQuery())
  const [postcodes, setPostcodes] = useState((filter.postcodes ?? []).join(", "))
  const [file, setFile] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ordered = filter.neverOrdered ? "never" : filter.orderedWithinDays ? "recent" : "any"
  const fileInput = useRef<HTMLInputElement>(null)

  async function readFile(f: File) {
    setBusy(true)
    try {
      const text = await f.text()
      const emails = [...text.matchAll(/[^\s,;"'<>]+@[^\s,;"'<>]+/g)].map((m) => m[0])
      const res = await countAudience({ kind: "important", audiences: [], resolve: { emails } })
      const r = res.resolved ?? { ids: [], notFound: 0, repeated: 0 }
      onChange(patch(filter, "people", [...new Set([...(filter.people ?? []), ...r.ids])]))
      setFile(
        `${r.ids.length.toLocaleString("en-AU")} found` +
          (r.notFound ? `, ${r.notFound.toLocaleString("en-AU")} not found` : "") +
          (r.repeated ? `, ${r.repeated.toLocaleString("en-AU")} repeated` : ""),
      )
    } catch {
      setFile("That file couldn't be read. Use a CSV or text file of email addresses.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="aud-customer-postcodes">Delivery postcodes</Label>
        <Input
          id="aud-customer-postcodes"
          value={postcodes}
          placeholder="3101, 3102"
          onChange={(e) => setPostcodes(e.target.value)}
          onBlur={() => {
            const list = [...new Set(postcodes.split(/[\s,;]+/).filter((p) => /^\d{4}$/.test(p)))]
            setPostcodes(list.join(", "))
            onChange(patch(filter, "postcodes", list))
          }}
        />
        <p className="text-sm text-muted-foreground">Customers with a saved address in one of these postcodes.</p>
      </div>
      {zones.data && zones.data.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Coverage groups</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {zones.data.map((z) => (
              <Flag
                key={z.id}
                id={`aud-group-${z.id}`}
                label={z.name}
                checked={(filter.groups ?? []).includes(z.id)}
                onChange={(on) =>
                  onChange(
                    patch(
                      filter,
                      "groups",
                      on ? [...(filter.groups ?? []), z.id] : (filter.groups ?? []).filter((x) => x !== z.id),
                    ),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
      ) : null}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Orders</legend>
        <RadioGroup
          value={ordered}
          onValueChange={(v) => {
            if (v === "any") onChange(patch(patch(filter, "neverOrdered", undefined), "orderedWithinDays", undefined))
            if (v === "never") onChange(patch(patch(filter, "orderedWithinDays", undefined), "neverOrdered", true))
            if (v === "recent")
              onChange(
                patch(patch(filter, "neverOrdered", undefined), "orderedWithinDays", filter.orderedWithinDays ?? 30),
              )
          }}
          className="space-y-1"
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="any" />
            Any
          </label>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <RadioGroupItem value="recent" />
            Ordered in the last
            <Input
              aria-label="Days"
              type="number"
              min={1}
              max={365}
              className="w-20"
              value={filter.orderedWithinDays ?? 30}
              disabled={ordered !== "recent"}
              onChange={(e) => {
                const n = Math.max(1, Math.min(365, Math.floor(Number(e.target.value) || 1)))
                onChange(patch(filter, "orderedWithinDays", n))
              }}
            />
            days
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="never" />
            Never ordered
          </label>
        </RadioGroup>
      </fieldset>
      <div className="space-y-2">
        <Flag
          id="aud-customer-points"
          label="Have points to spend"
          checked={Boolean(filter.hasPoints)}
          onChange={(on) => onChange(patch(filter, "hasPoints", on || undefined))}
        />
        <Flag
          id="aud-customer-app"
          label="Use the app"
          checked={Boolean(filter.appUsers)}
          onChange={(on) => onChange(patch(filter, "appUsers", on || undefined))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="aud-customer-people">Chosen customers</Label>
        <PeoplePicker
          id="aud-customer-people"
          audience="customer"
          value={filter.people ?? []}
          onChange={(ids) => onChange(patch(filter, "people", ids))}
          max={5000}
        />
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void readFile(f)
            e.target.value = ""
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden="true" />
            Add from a file of emails
          </Button>
          {file ? <span className="text-sm text-muted-foreground">{file}</span> : null}
        </div>
      </div>
    </div>
  )
}

function DriverFilters({
  filter,
  onChange,
}: {
  filter: DriverAudienceFilter
  onChange: (f: DriverAudienceFilter) => void
}) {
  const zones = useQuery(zonesQuery())
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Flag
          id="aud-driver-duty"
          label="On duty now"
          checked={Boolean(filter.onDuty)}
          onChange={(on) => onChange(patch(filter, "onDuty", on || undefined))}
        />
        <Flag
          id="aud-driver-work"
          label="With work today"
          checked={Boolean(filter.workToday)}
          onChange={(on) => onChange(patch(filter, "workToday", on || undefined))}
        />
        <Flag
          id="aud-driver-collection"
          label="On a collection run today"
          checked={Boolean(filter.collectionToday)}
          onChange={(on) => onChange(patch(filter, "collectionToday", on || undefined))}
        />
        <Flag
          id="aud-driver-delivery"
          label="On a delivery round today"
          checked={Boolean(filter.deliveryToday)}
          onChange={(on) => onChange(patch(filter, "deliveryToday", on || undefined))}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Cleared for</legend>
        <div className="flex flex-wrap gap-3">
          <Select
            value={filter.clearance?.function ?? "any"}
            onValueChange={(v) =>
              onChange(
                patch(
                  filter,
                  "clearance",
                  v === "any"
                    ? undefined
                    : { function: v as "collection" | "delivery", zoneId: filter.clearance?.zoneId ?? null },
                ),
              )
            }
          >
            <SelectTrigger aria-label="Work" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any work</SelectItem>
              <SelectItem value="collection">Collection</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filter.clearance?.zoneId ?? "everywhere"}
            disabled={!filter.clearance}
            onValueChange={(v) =>
              filter.clearance &&
              onChange(patch(filter, "clearance", { ...filter.clearance, zoneId: v === "everywhere" ? null : v }))
            }
          >
            <SelectTrigger aria-label="Area" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="everywhere">Everywhere</SelectItem>
              {(zones.data ?? []).map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="aud-driver-people">Chosen drivers</Label>
        <PeoplePicker
          id="aud-driver-people"
          audience="driver"
          value={filter.people ?? []}
          onChange={(ids) => onChange(patch(filter, "people", ids))}
        />
      </div>
    </div>
  )
}

function ShopFilters({
  filter,
  onChange,
  one,
}: {
  filter: ShopAudienceFilter
  onChange: (f: ShopAudienceFilter) => void
  one?: boolean
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="aud-shop-shops">{one ? "The shop" : "Chosen shops"}</Label>
        <PeoplePicker
          id="aud-shop-shops"
          audience="shop"
          value={filter.shops ?? []}
          onChange={(ids) => onChange(patch(filter, "shops", ids))}
          max={one ? 1 : undefined}
        />
        {one ? null : <p className="text-sm text-muted-foreground">None chosen: every active shop.</p>}
      </div>
      <Flag
        id="aud-shop-managers"
        label="Shop managers only"
        checked={Boolean(filter.managersOnly)}
        onChange={(on) => onChange(patch(filter, "managersOnly", on || undefined))}
      />
    </div>
  )
}

export function FiltersFor({
  audience,
  filter,
  onChange,
}: {
  audience: NotificationAudience
  filter: AudienceFilter
  onChange: (f: AudienceFilter) => void
}): ReactNode {
  if (audience === "customer") return <CustomerFilters filter={filter as CustomerAudienceFilter} onChange={onChange} />
  if (audience === "driver") return <DriverFilters filter={filter as DriverAudienceFilter} onChange={onChange} />
  return <ShopFilters filter={filter as ShopAudienceFilter} onChange={onChange} />
}

export { ShopFilters }

function countLine(
  c: MessageAudienceCountDTO["audiences"][number] | undefined,
  marketing: boolean,
  audience: NotificationAudience,
): string {
  if (!c) return "Counting…"
  if (marketing)
    return `${c.matched.toLocaleString("en-AU")} match · ${(c.consented ?? 0).toLocaleString("en-AU")} said yes`
  return peopleWords(audience, c.matched)
}

/**
 * Who gets it (FR-008, FR-009): each audience the kind allows, on or off, with its fixed filters and a live count.
 * Filters within an audience combine: "drivers on duty AND on a delivery round today".
 */
export function AudienceBuilder({
  draft,
  onChange,
  count,
}: {
  draft: MessageDraft
  onChange: (d: MessageDraft) => void
  count: MessageAudienceCountDTO | undefined
}) {
  const allowed = audiencesFor(draft.kind)
  const marketing = messageKind(draft.kind)?.marketing ?? false
  return (
    <div className="space-y-6" data-tour="messages.audience">
      {allowed.map((a) => {
        const ad = draft.audiences[a]
        const c = count?.audiences.find((x) => x.audience === a)
        return (
          <section key={a} aria-labelledby={`aud-${a}`} className="space-y-4 border-b pb-6 last:border-b-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label id={`aud-${a}`} className="flex items-center gap-3 text-base font-medium">
                {allowed.length > 1 ? (
                  <Switch
                    checked={ad.on}
                    onCheckedChange={(on) =>
                      onChange({ ...draft, audiences: { ...draft.audiences, [a]: { ...ad, on } } })
                    }
                  />
                ) : null}
                {AUDIENCE_WORD[a]}
              </label>
              {ad.on ? (
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {countLine(c, marketing, a)}
                </span>
              ) : null}
            </div>
            {ad.on ? (
              <FiltersFor
                audience={a}
                filter={ad.filter}
                onChange={(filter) => onChange({ ...draft, audiences: { ...draft.audiences, [a]: { ...ad, filter } } })}
              />
            ) : null}
          </section>
        )
      })}
      {count && allowed.filter((a) => draft.audiences[a].on).length > 1 ? (
        <p className="text-sm font-medium">In all: {peopleWords(null, count.total)}</p>
      ) : null}
      {marketing ? (
        <p className="text-sm text-muted-foreground">
          Only {MESSAGE_AUDIENCE_WORDS.customer.many} who said yes to {draft.kind === "offer" ? "offers" : "news"} get
          it. Their phone choices, the daily and weekly limits, and the night hold (21:00–08:00) apply.
        </p>
      ) : null}
    </div>
  )
}
