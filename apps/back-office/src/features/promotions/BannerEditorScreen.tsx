import { useRef, useState, type ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import { BANNER_LINK_WORDS, OPERATING_CITY, type AdminPromotionWriteDTO, type LiveValueDTO } from "@effy/shared-types"
import { Button, Checkbox, Input, Textarea, TimeField } from "@effy/design-system/ui"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"
import { Callout, DetailPageSkeleton, FormSkeleton, PageHeader, Panel, PanelSkeleton } from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { promotionGroupsQuery } from "@/features/promotion-groups/queries"

import { LinkPicker } from "@/components/link-picker/LinkPicker"

import { canManagePromotions } from "./access"
import {
  bannerBodyOf,
  bannerDraftOf,
  EMPTY_BANNER,
  previewText,
  typedFreeDeliveryAmount,
  type BannerDraft,
} from "./bannerDraft"
import { LiveValueWords } from "./components/LiveValueWords"
import { promotionMutationError, refusedFields } from "./errorText"
import type { Promotion } from "./model"
import { Field } from "./PromotionEditorScreen"
import { DAYS } from "./promotionDraft"
import { liveValuesQuery, promotionQuery, useCreatePromotion, useUpdatePromotion } from "./queries"

const toggleIn = <T,>(list: T[], item: T, on: boolean): T[] => (on ? [...list, item] : list.filter((x) => x !== item))

/**
 * An information banner (108): something Effy says to shoppers that is not an offer - no discount, no code, no
 * conditions. Written, scheduled and placed like an offer; pictures are added on its page, as for offers.
 */
export function BannerEditorScreen({ promoId, existing }: { promoId?: string; existing?: Promotion }) {
  const loaded = useQuery({ ...promotionQuery(promoId ?? ""), enabled: Boolean(promoId) && !existing })
  const current = existing ?? loaded.data ?? null
  useTourPage("banner-editor", { status: promoId && !existing ? tourStatus(loaded) : "ready" })
  if (promoId && !existing && loaded.isError)
    return <ErrorState error={loaded.error} onRetry={() => void loaded.refetch()} />
  if (promoId && !current) return <BannerSkeleton promoId={promoId} />
  return <Editor key={current?.updatedAt ?? "new"} current={current} />
}

function Editor({ current }: { current: Promotion | null }) {
  const navigate = useNavigate()
  const canManage = canManagePromotions(useSessionRoles())
  const groups = useQuery(promotionGroupsQuery())
  const live = useQuery(liveValuesQuery())
  const create = useCreatePromotion()
  const update = useUpdatePromotion(current?.id ?? "")
  const [d, setD] = useState<BannerDraft>(current ? bannerDraftOf(current) : EMPTY_BANNER)
  const [error, setError] = useState<string | null>(null)
  const [bad, setBad] = useState<Set<string>>(new Set())
  const busy = create.isPending || update.isPending
  useHeaderDetail(current ? current.name : "New information banner")
  const values: LiveValueDTO[] = live.data?.values ?? []

  const set = <K extends keyof BannerDraft>(k: K, v: BannerDraft[K]) => setD((x) => ({ ...x, [k]: v }))
  const backTo = current
    ? { to: "/promotions/$promoId" as const, params: { promoId: current.id } }
    : { to: "/promotions" as const }
  const title = current ? "Edit information banner" : "New information banner"

  async function save(publish: boolean) {
    setError(null)
    setBad(new Set())
    try {
      const body = bannerBodyOf(d, !current)
      const saved = current
        ? await update.mutateAsync({ ...body, expectedUpdatedAt: current.updatedAt })
        : await create.mutateAsync({ ...(body as AdminPromotionWriteDTO), publish })
      await navigate({ to: "/promotions/$promoId", params: { promoId: saved.id } })
    } catch (err) {
      setError(promotionMutationError(err))
      setBad(refusedFields(err))
    }
  }

  if (!canManage) {
    return (
      <>
        <PageHeader back={{ label: "Promotions", link: { to: "/promotions" } }} title={title} />
        <p className="text-sm text-muted-foreground">
          Creating or changing a banner needs a manager or an administrator.
        </p>
      </>
    )
  }

  const words = [d.headline, d.supportingLine, d.label]
  const empty = values.filter((v) => v.reads === null && words.some((w) => w.includes(v.token)))
  const typedCopy = words.some(typedFreeDeliveryAmount) && !words.some((w) => w.includes("{free_delivery_amount}"))

  return (
    <>
      <PageHeader
        back={{ label: current ? current.name : "Promotions", link: backTo }}
        title={title}
        description="Something to tell shoppers that is not an offer: no discount, no code and no conditions."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save(false)
        }}
        className="ef-detail"
        noValidate
      >
        <div className="ef-detail__main">
          <Panel tour="banner.basics" title="Basics">
            <Field
              id="banner-name"
              label="Name"
              hint="For staff only - shoppers read the words below."
              invalid={bad.has("name")}
            >
              <Input
                id="banner-name"
                value={d.name}
                maxLength={120}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Range - home hero"
              />
            </Field>
          </Panel>

          <Panel
            tour="banner.words"
            title="What shoppers read"
            description="A live value is filled from its setting each time the banner is shown, so it never goes out of date."
          >
            <div className="space-y-5">
              <WordsField
                id="banner-headline"
                label="Headline"
                hint="Up to 80 characters."
                value={d.headline}
                max={80}
                invalid={bad.has("headline")}
                values={values}
                onChange={(v) => set("headline", v)}
                placeholder="Groceries to home appliances, from one place"
              />
              <WordsField
                id="banner-support"
                label="Supporting line (optional)"
                value={d.supportingLine}
                max={160}
                multiline
                invalid={bad.has("supportingLine")}
                values={values}
                onChange={(v) => set("supportingLine", v)}
              />
              <WordsField
                id="banner-label"
                label="Label (optional)"
                hint="A short tag above the headline, like “New on Effy”."
                value={d.label}
                max={24}
                invalid={bad.has("label")}
                values={values}
                onChange={(v) => set("label", v)}
              />
              {typedCopy ? (
                <Callout tone="info" title="The free-delivery amount is a live value.">
                  Insert it instead of typing the amount, so the banner changes when the delivery plan does.
                </Callout>
              ) : null}
            </div>
          </Panel>

          <Panel tour="banner.link" title="Where a tap leads">
            <LinkPicker
              value={d.link}
              onChange={(link) => set("link", link)}
              invalid={bad.has("link") || bad.has("link.categoryId") || bad.has("link.productId")}
            />
          </Panel>

          <Panel
            tour="banner.when"
            title="When"
            description={`${OPERATING_CITY} time. Leave a date empty for no bound; no days chosen means every day.`}
          >
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="banner-starts" label="Starts" invalid={bad.has("startsAt")}>
                  <Input
                    id="banner-starts"
                    type="datetime-local"
                    value={d.startsAt}
                    onChange={(e) => set("startsAt", e.target.value)}
                  />
                </Field>
                <Field id="banner-ends" label="Ends" invalid={bad.has("endsAt")}>
                  <Input
                    id="banner-ends"
                    type="datetime-local"
                    value={d.endsAt}
                    onChange={(e) => set("endsAt", e.target.value)}
                  />
                </Field>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">Days</span>
                <div className="flex flex-wrap gap-3">
                  {DAYS.map((day, i) => (
                    <label key={day} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={d.daysOfWeek.includes(i + 1)}
                        onCheckedChange={(v) => set("daysOfWeek", toggleIn(d.daysOfWeek, i + 1, v === true))}
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid max-w-md gap-4 sm:grid-cols-2">
                <Field id="banner-from" label="From (optional)" invalid={bad.has("timeFrom")}>
                  <TimeField id="banner-from" value={d.timeFrom} onChange={(v) => set("timeFrom", v)} />
                </Field>
                <Field id="banner-to" label="Until" invalid={bad.has("timeTo")}>
                  <TimeField id="banner-to" value={d.timeTo} onChange={(v) => set("timeTo", v)} />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel
            tour="banner.groups"
            title="Where it's shown"
            description="A banner can be in several groups, beside offers. Reorder a group and choose its skin from the group's page."
          >
            {groups.data && groups.data.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {groups.data.map((g) => (
                  <li key={g.id}>
                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={d.groupIds.includes(g.id)}
                        onCheckedChange={(v) => set("groupIds", toggleIn(d.groupIds, g.id, v === true))}
                      />
                      <span>
                        <span className="font-medium">{g.name}</span>
                        <span className="mt-0.5 block font-mono text-sm text-muted-foreground">{g.key}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No display groups yet.</p>
            )}
          </Panel>

          {error ? (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-5 py-3">
            <span className="text-sm text-muted-foreground">
              {current ? "Unsaved changes" : "Saved as a draft until you publish it."}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void navigate(backTo)}>
                Cancel
              </Button>
              <Button type="submit" variant={current ? "default" : "outline"} disabled={busy}>
                {current ? "Save changes" : "Save draft"}
              </Button>
              {current ? null : (
                <Button type="button" disabled={busy} onClick={() => void save(true)}>
                  Publish
                </Button>
              )}
            </div>
          </div>
        </div>

        <aside data-tour="banner.preview" className="ef-detail__aside">
          <Panel title="As shoppers read it" description="No code and no conditions are added to a banner.">
            <div className="space-y-2">
              {d.label ? (
                <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {previewText(d.label, values)}
                </div>
              ) : null}
              <div className="text-base font-semibold">
                {d.headline ? (
                  previewText(d.headline, values)
                ) : (
                  <span className="text-muted-foreground">No headline yet</span>
                )}
              </div>
              {d.supportingLine ? (
                <p className="text-sm text-muted-foreground">{previewText(d.supportingLine, values)}</p>
              ) : null}
              <p className="pt-2 text-sm text-muted-foreground">A tap opens {linkWords(d.link)}.</p>
            </div>
            {empty.length > 0 ? (
              <Callout tone="destructive" title="Not shown to shoppers right now.">
                {empty.map((v) => `${v.name}: ${v.why ?? "nothing to show"}`).join(" ")}
              </Callout>
            ) : null}
          </Panel>
        </aside>
      </form>
    </>
  )
}

function linkWords(link: BannerDraft["link"]): string {
  if (link.kind === "category") return link.category ? link.category.name : "an aisle (not chosen yet)"
  if (link.kind === "product") return link.product ? link.product.name : "a product (not chosen yet)"
  return BANNER_LINK_WORDS[link.kind].toLowerCase()
}

/** A words field with the live values that can be inserted at the cursor. */
function WordsField({
  id,
  label,
  hint,
  value,
  max,
  multiline,
  invalid,
  values,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  hint?: string
  value: string
  max: number
  multiline?: boolean
  invalid?: boolean
  values: readonly LiveValueDTO[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const insert = (token: string) => {
    const el = ref.current
    const at = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? at
    onChange(`${value.slice(0, at)}${token}${value.slice(end)}`)
  }
  const control: ReactNode = multiline ? (
    <Textarea
      id={id}
      ref={ref}
      rows={2}
      maxLength={max}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ) : (
    <Input
      id={id}
      ref={ref}
      maxLength={max}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
  return (
    <Field id={id} label={label} hint={hint} invalid={invalid}>
      {control}
      <LiveValueWords values={values} onInsert={insert} label={label.toLowerCase()} />
    </Field>
  )
}

function BannerSkeleton({ promoId }: { promoId: string }) {
  return (
    <DetailPageSkeleton
      back={{ label: "Promotion", link: { to: "/promotions/$promoId", params: { promoId } } }}
      title="Edit information banner"
      description
      meta={0}
      actions={0}
      main={
        <>
          <PanelSkeleton title="Basics">
            <FormSkeleton labels={["Name"]} submit={false} />
          </PanelSkeleton>
          <PanelSkeleton title="What shoppers read">
            <FormSkeleton labels={["Headline", "Supporting line (optional)", "Label (optional)"]} submit={false} />
          </PanelSkeleton>
          <PanelSkeleton title="Where a tap leads">
            <FormSkeleton labels={[]} submit={false} />
          </PanelSkeleton>
        </>
      }
      aside={<PanelSkeleton title="As shoppers read it" rows={3} />}
    />
  )
}
