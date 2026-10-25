import { useState, type ComponentProps, type ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Lock } from "lucide-react"

import type { AdminPromotionWriteDTO, PromotionAudience } from "@effy/shared-types"
import { cn } from "@effy/design-system"
import { Button, Checkbox, Input, Label, Skeleton, Switch, Textarea } from "@effy/design-system/ui"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"
import { Callout, PageHeader, Panel } from "@effy/web-kit/patterns"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { promotionGroupsQuery } from "@/features/promotion-groups/queries"

import { canManagePromotions } from "./access"
import { PromotionSummary } from "./components/PromotionSummary"
import { TargetPicker } from "./components/TargetPicker"
import { promotionMutationError, refusedFields } from "./errorText"
import type { Promotion } from "./model"
import {
  AUDIENCE_LABEL,
  bodyOf,
  DAYS,
  draftOf,
  EMPTY_DRAFT,
  KIND_LABEL,
  KINDS_OFFERED,
  type Draft,
} from "./promotionDraft"
import { promotionQuery, useCreatePromotion, useUpdatePromotion } from "./queries"

const toggleIn = <T,>(list: T[], item: T, on: boolean): T[] => (on ? [...list, item] : list.filter((x) => x !== item))

export function PromotionEditorScreen({ promoId }: { promoId?: string }) {
  const existing = useQuery({ ...promotionQuery(promoId ?? ""), enabled: Boolean(promoId) })
  if (promoId && existing.isError) return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
  if (promoId && !existing.data) return <Skeleton className="h-96" aria-busy="true" />
  return <Editor key={existing.data?.updatedAt ?? "new"} current={existing.data ?? null} />
}

function Editor({ current }: { current: Promotion | null }) {
  const navigate = useNavigate()
  const canManage = canManagePromotions(useSessionRoles())
  const groups = useQuery(promotionGroupsQuery())
  const create = useCreatePromotion()
  const update = useUpdatePromotion(current?.id ?? "")
  const [d, setD] = useState<Draft>(current ? draftOf(current) : EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [bad, setBad] = useState<Set<string>>(new Set())
  const used = current?.used ?? false
  const busy = create.isPending || update.isPending
  useHeaderDetail(current ? current.name : "New promotion")

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const backTo = current
    ? { to: "/promotions/$promoId" as const, params: { promoId: current.id } }
    : { to: "/promotions" as const }

  async function save(publish: boolean) {
    setError(null)
    setBad(new Set())
    try {
      const body = bodyOf(d, used)
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
        <PageHeader
          back={{ label: "Promotions", link: { to: "/promotions" } }}
          title={current ? "Edit promotion" : "Create promotion"}
        />
        <p className="text-sm text-muted-foreground">
          Creating or changing a promotion needs a manager or an administrator.
        </p>
      </>
    )
  }

  const locked = used ? <Lock aria-label="Fixed once used" className="size-4 text-muted-foreground" /> : null
  const targeted = d.kind === "item" || d.kind === "bxgy"
  const freeAllowed = d.kind === "delivery" || d.kind === "bxgy"

  return (
    <>
      <PageHeader
        back={{ label: current ? current.name : "Promotions", link: backTo }}
        title={current ? "Edit promotion" : "Create promotion"}
        description="Set the offer, who can use it, when it runs, and its limits."
      />
      {used ? (
        <Callout tone="info" title="This promotion has been used.">
          What it gives and who it is for are fixed, so every order keeps explaining its discount. Its name, dates,
          limits, words and groups can still change.
        </Callout>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save(false)
        }}
        className="ef-detail"
        noValidate
      >
        <div className="ef-detail__main">
          <Panel title="Basics">
            <div className="space-y-5">
              <Field
                id="promo-name"
                label="Name"
                hint="For staff only — shoppers read the words below."
                invalid={bad.has("name")}
              >
                <Input
                  id="promo-name"
                  value={d.name}
                  onChange={(e) => set("name", e.target.value)}
                  className="max-w-md"
                  autoFocus={!current}
                />
              </Field>
              <div className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-medium">How it applies {locked}</span>
                <Choice
                  label="How it applies"
                  value={d.trigger}
                  disabled={used}
                  onChange={(t) => set("trigger", t)}
                  options={[
                    { value: "code", label: "With a code" },
                    { value: "automatic", label: "Automatically" },
                  ]}
                />
                <p className="ef-sub">
                  {d.trigger === "code"
                    ? "Shoppers type the code in their cart."
                    : "It applies by itself to every cart that qualifies."}
                </p>
              </div>
              {d.trigger === "code" ? (
                <>
                  <Choice
                    label="Codes"
                    value={d.codeMode}
                    disabled={used}
                    onChange={(m) => set("codeMode", m)}
                    options={[
                      { value: "shared", label: "One code shoppers share" },
                      { value: "single_use", label: "Single-use codes" },
                    ]}
                  />
                  {d.codeMode === "single_use" ? (
                    <p className="ef-sub">Generate the codes on the promotion's page once it is saved.</p>
                  ) : (
                    <Field
                      id="promo-code"
                      label="Code"
                      hint="Shoppers may type it in any case, with or without spaces."
                      invalid={bad.has("sharedCode")}
                    >
                      <Input
                        id="promo-code"
                        value={d.sharedCode}
                        onChange={(e) => set("sharedCode", e.target.value.toUpperCase())}
                        placeholder="SPRING20"
                        className="max-w-xs font-mono"
                      />
                    </Field>
                  )}
                </>
              ) : null}
            </div>
          </Panel>

          <Panel title={<span className="flex items-center gap-2">What it gives {locked}</span>}>
            <div className="space-y-5">
              <Choice
                label="Kind"
                value={d.kind}
                disabled={used}
                options={KINDS_OFFERED.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                onChange={(k) =>
                  setD((x) => ({
                    ...x,
                    kind: k,
                    valueType:
                      k === "delivery" || k === "bxgy" ? "free" : x.valueType === "free" ? "percent" : x.valueType,
                  }))
                }
              />
              {targeted ? (
                <TargetPicker
                  appliesTo={d.appliesTo}
                  onAppliesTo={(a) => set("appliesTo", a)}
                  value={d.targets}
                  onChange={(t) => set("targets", t)}
                  disabled={used}
                />
              ) : null}
              {d.kind === "bxgy" ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field id="bx-buy" label="Buy" invalid={bad.has("bxgy.buy")}>
                    <Input
                      id="bx-buy"
                      type="number"
                      min={1}
                      disabled={used}
                      value={d.bxgyBuy}
                      onChange={(e) => set("bxgyBuy", e.target.value)}
                    />
                  </Field>
                  <Field id="bx-get" label="Get" hint="The cheapest ones." invalid={bad.has("bxgy.get")}>
                    <Input
                      id="bx-get"
                      type="number"
                      min={1}
                      disabled={used}
                      value={d.bxgyGet}
                      onChange={(e) => set("bxgyGet", e.target.value)}
                    />
                  </Field>
                  <Field
                    id="bx-max"
                    label="Times per order"
                    hint="Empty for no limit."
                    invalid={bad.has("bxgy.maxPerOrder")}
                  >
                    <Input
                      id="bx-max"
                      type="number"
                      min={1}
                      disabled={used}
                      value={d.bxgyMax}
                      onChange={(e) => set("bxgyMax", e.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
              <Choice
                label="Takes off"
                value={d.valueType}
                disabled={used}
                onChange={(v) => set("valueType", v)}
                options={[
                  ...(freeAllowed
                    ? [{ value: "free" as const, label: d.kind === "delivery" ? "Free delivery" : "Free" }]
                    : []),
                  { value: "percent" as const, label: "A percentage" },
                  { value: "amount" as const, label: "A fixed amount" },
                ]}
              />
              {d.valueType === "percent" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="promo-percent" label="Percent off" hint="Up to 100." invalid={bad.has("percentOff")}>
                    <div className="flex items-center gap-2">
                      <Input
                        id="promo-percent"
                        type="number"
                        min={0.01}
                        max={100}
                        step="0.01"
                        disabled={used}
                        value={d.percentOff}
                        onChange={(e) => set("percentOff", e.target.value)}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </Field>
                  <Field
                    id="promo-cap"
                    label="Up to (optional)"
                    hint="The most it takes off one order."
                    invalid={bad.has("maxDiscount")}
                  >
                    <MoneyInput
                      id="promo-cap"
                      disabled={used}
                      value={d.maxDiscount}
                      onChange={(e) => set("maxDiscount", e.target.value)}
                      placeholder="No cap"
                    />
                  </Field>
                </div>
              ) : d.valueType === "amount" ? (
                <Field
                  id="promo-amount"
                  label="Amount off"
                  hint="Never takes a cart below zero."
                  invalid={bad.has("amountOff")}
                >
                  <MoneyInput
                    id="promo-amount"
                    className="max-w-48"
                    disabled={used}
                    value={d.amountOff}
                    onChange={(e) => set("amountOff", e.target.value)}
                    placeholder="10.00"
                  />
                </Field>
              ) : null}
              <Field id="promo-min" label="Minimum spend" hint="0.00 for no minimum." invalid={bad.has("minSubtotal")}>
                <MoneyInput
                  id="promo-min"
                  className="max-w-48"
                  disabled={used}
                  value={d.minSubtotal}
                  onChange={(e) => set("minSubtotal", e.target.value)}
                />
              </Field>
              {targeted ? (
                <Field
                  id="promo-minq"
                  label="Minimum quantity (optional)"
                  hint="Qualifying items in the cart."
                  invalid={bad.has("minQuantity")}
                >
                  <Input
                    id="promo-minq"
                    type="number"
                    min={1}
                    disabled={used}
                    value={d.minQuantity}
                    onChange={(e) => set("minQuantity", e.target.value)}
                    className="max-w-32"
                  />
                </Field>
              ) : null}
            </div>
          </Panel>

          <Panel title={<span className="flex items-center gap-2">Who {locked}</span>}>
            <div className="space-y-5">
              <Choice
                label="Who"
                className="flex-wrap"
                value={d.audience}
                disabled={used}
                onChange={(a) => set("audience", a)}
                options={(Object.keys(AUDIENCE_LABEL) as PromotionAudience[]).map((a) => ({
                  value: a,
                  label: AUDIENCE_LABEL[a],
                }))}
              />
              {d.audience === "chosen" ? (
                <p className="ef-sub">Add the customers on the promotion's page once it is saved.</p>
              ) : null}
              {d.audience === "new_customers" ? (
                <p className="ef-sub">Customers whose account was created on or after the start date.</p>
              ) : null}
              <div className="space-y-2">
                <span className="text-sm font-medium">Delivery</span>
                <div className="flex flex-wrap gap-4">
                  {(["effy", "courier"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        disabled={used}
                        checked={d.deliveryTypes.includes(t)}
                        onCheckedChange={(v) => set("deliveryTypes", toggleIn(d.deliveryTypes, t, v === true))}
                      />
                      {t === "effy" ? "Delivered by Effy" : "Courier delivery"}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="When"
            description="Melbourne time. Leave a date empty for no bound; no days chosen means every day."
          >
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="promo-starts" label="Starts" invalid={bad.has("startsAt")}>
                  <Input
                    id="promo-starts"
                    type="datetime-local"
                    value={d.startsAt}
                    onChange={(e) => set("startsAt", e.target.value)}
                  />
                </Field>
                <Field id="promo-ends" label="Ends" invalid={bad.has("endsAt")}>
                  <Input
                    id="promo-ends"
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
                <Field id="promo-from" label="From (optional)" invalid={bad.has("timeFrom")}>
                  <Input
                    id="promo-from"
                    type="time"
                    value={d.timeFrom}
                    onChange={(e) => set("timeFrom", e.target.value)}
                  />
                </Field>
                <Field id="promo-to" label="Until" invalid={bad.has("timeTo")}>
                  <Input id="promo-to" type="time" value={d.timeTo} onChange={(e) => set("timeTo", e.target.value)} />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title="Limits" description="Leave empty for no limit. A promotion that reaches one stops at once.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="promo-max" label="Total uses" invalid={bad.has("maxUses")}>
                <Input
                  id="promo-max"
                  type="number"
                  min={1}
                  value={d.maxUses}
                  onChange={(e) => set("maxUses", e.target.value)}
                  placeholder="Unlimited"
                />
              </Field>
              <Field id="promo-per" label="Uses per customer" invalid={bad.has("maxUsesPerCustomer")}>
                <Input
                  id="promo-per"
                  type="number"
                  min={1}
                  value={d.maxUsesPerCustomer}
                  onChange={(e) => set("maxUsesPerCustomer", e.target.value)}
                  placeholder="Unlimited"
                />
              </Field>
              <Field id="promo-budget" label="Budget" hint="Total discount it may give." invalid={bad.has("budget")}>
                <MoneyInput
                  id="promo-budget"
                  value={d.budget}
                  onChange={(e) => set("budget", e.target.value)}
                  placeholder="No budget"
                />
              </Field>
            </div>
            <label className="mt-5 flex items-start gap-3 text-sm">
              <Switch
                checked={d.combinable}
                onCheckedChange={(v) => set("combinable", v)}
                aria-label="Combines with other promotions"
              />
              <span>
                <span className="font-medium">Combines with other promotions</span>
                <span className="ef-sub block">
                  Off: when another offer gives the shopper more, that one applies instead of this.
                </span>
              </span>
            </label>
          </Panel>

          <Panel
            title="What shoppers read"
            description="Shown wherever the promotion is shown. The code and conditions are added for you."
          >
            <div className="space-y-5">
              <Field
                id="promo-headline"
                label="Headline"
                hint="Needed to show it in a group. Up to 80 characters."
                invalid={bad.has("headline")}
              >
                <Input
                  id="promo-headline"
                  value={d.headline}
                  maxLength={80}
                  onChange={(e) => set("headline", e.target.value)}
                  placeholder="20% off your first grocery order"
                />
              </Field>
              <Field id="promo-support" label="Supporting line (optional)" invalid={bad.has("supportingLine")}>
                <Textarea
                  id="promo-support"
                  rows={2}
                  maxLength={160}
                  value={d.supportingLine}
                  onChange={(e) => set("supportingLine", e.target.value)}
                />
              </Field>
              <Field
                id="promo-label"
                label="Label (optional)"
                hint="A short tag above the headline, like “This week's offer”."
                invalid={bad.has("label")}
              >
                <Input
                  id="promo-label"
                  value={d.label}
                  maxLength={24}
                  onChange={(e) => set("label", e.target.value)}
                  className="max-w-xs"
                />
              </Field>
            </div>
          </Panel>

          <Panel
            title="Where it's shown"
            description="A promotion can be in several groups. Reorder a group from its own page."
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
                        <span className="ef-sub block font-mono">{g.key}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ef-sub">No display groups yet.</p>
            )}
          </Panel>

          {error ? (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          ) : null}

          <div className="ef-panel ef-panel__foot ef-panel__foot--between rounded-lg">
            <span className="ef-sub">{current ? "Unsaved changes" : "Saved as a draft until you publish it."}</span>
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

        <aside className="ef-detail__aside">
          <PromotionSummary d={d} />
        </aside>
      </form>
    </>
  )
}

function Field({
  id,
  label,
  hint,
  invalid,
  children,
}: {
  id: string
  label: string
  hint?: string
  invalid?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={cn(invalid && "text-foreground underline decoration-2")}>
        {label}
      </Label>
      {children}
      {hint ? <p className="ef-sub">{hint}</p> : null}
    </div>
  )
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn("ef-seg", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          className={cn(value === o.value && "is-active")}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function MoneyInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-sm text-muted-foreground">$</span>
      <Input inputMode="decimal" {...props} />
    </div>
  )
}
