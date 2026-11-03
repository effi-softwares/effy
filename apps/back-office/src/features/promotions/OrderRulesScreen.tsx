import { OPERATING_TZ } from "@effy/shared-types"
import { useState } from "react"

import { useQuery } from "@tanstack/react-query"

import type { OrderPolicyDTO } from "@effy/shared-types"
import { Input, toast } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import {
  Bone,
  Loading,
  PageHeader,
  SettingsList,
  SettingsPage,
  SettingsReadOnly,
  SettingsRow,
  SettingsSaveBar,
  SettingsSection,
  useSettingsDraft,
} from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { allWhole, toWhole, UnitInput } from "@/features/settings/fields"

import { canManagePromotions } from "./access"
import { promotionMutationError } from "./errorText"
import { orderPolicyQuery, useUpdateOrderPolicy } from "./queries"

const SECTION = {
  minimum: {
    title: "Minimum spend",
    description: "A cart below this can't check out. A change applies to the next cart a shopper opens.",
  },
  limits: {
    title: "Cart limits",
    description: "Keeps one order to a size Effy can pack and deliver. Carts already paid are not affected.",
  },
} as const

/** Settings › Checkout › Order rules. */
export function OrderRulesScreen() {
  const canManage = canManagePromotions(useSessionRoles())
  const policy = useQuery(orderPolicyQuery())
  useTourPage("order-rules", { status: tourStatus(policy) })

  if (policy.isError) return <ErrorState error={policy.error} onRetry={() => void policy.refetch()} />
  return (
    <>
      <PageHeader
        title="Order rules"
        description="The minimum spend needed to check out and the limits on a single cart."
        meta={
          policy.data ? (
            <span>
              Last changed {formatTime(policy.data.updatedAt)}
              {policy.data.updatedBy ? (
                <>
                  {" "}
                  by <span className="font-mono">{policy.data.updatedBy}</span>
                </>
              ) : null}
            </span>
          ) : null
        }
      />
      {policy.isPending ? <RulesSkeleton /> : <RulesForm value={policy.data} canManage={canManage} />}
    </>
  )
}

type Draft = { minimum: string; maxLine: string; maxDistinct: string }

function RulesForm({ value, canManage }: { value: OrderPolicyDTO; canManage: boolean }) {
  const save = useUpdateOrderPolicy()
  const form = useSettingsDraft<Draft>({
    minimum: value.minimumSubtotalAmount,
    maxLine: String(value.maxLineQuantity),
    maxDistinct: String(value.maxDistinctItems),
  })
  const d = form.value!
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    try {
      await save.mutateAsync({
        minimumSubtotalAmount: d.minimum.trim() || "0.00",
        maxLineQuantity: toWhole(d.maxLine),
        maxDistinctItems: toWhole(d.maxDistinct),
      })
      form.discard()
      toast.success("Saved. The next cart a shopper opens uses these.")
    } catch (err) {
      setError(promotionMutationError(err))
    }
  }

  return (
    <SettingsPage>
      {canManage ? null : <SettingsReadOnly>You have read-only access to the order rules.</SettingsReadOnly>}
      <SettingsSection {...SECTION.minimum}>
        <SettingsList>
          <SettingsRow
            tour="rules.minimum"
            htmlFor="policy-minimum"
            label="Minimum spend"
            hint="0.00 turns the minimum off entirely - the cart then shows nothing about it at all."
          >
            <span className="inline-flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                id="policy-minimum"
                inputMode="decimal"
                placeholder="0.00"
                className="w-28 text-right tabular-nums"
                disabled={!canManage}
                value={d.minimum}
                onChange={(e) => form.set("minimum", e.target.value)}
              />
            </span>
          </SettingsRow>
        </SettingsList>
      </SettingsSection>

      <SettingsSection {...SECTION.limits}>
        <SettingsList>
          <SettingsRow
            tour="rules.most-one"
            htmlFor="policy-max-line"
            label="Most of any one item"
            hint="Between 1 and 99."
          >
            <UnitInput
              id="policy-max-line"
              unit="each"
              disabled={!canManage}
              value={d.maxLine}
              onChange={(e) => form.set("maxLine", e.target.value)}
            />
          </SettingsRow>
          <SettingsRow
            tour="rules.most-different"
            htmlFor="policy-max-distinct"
            label="Most different items"
            hint="Between 1 and 500."
          >
            <UnitInput
              id="policy-max-distinct"
              unit="items"
              disabled={!canManage}
              value={d.maxDistinct}
              onChange={(e) => form.set("maxDistinct", e.target.value)}
            />
          </SettingsRow>
        </SettingsList>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </SettingsSection>

      {canManage ? (
        <SettingsSaveBar
          dirty={form.dirty}
          saving={save.isPending}
          canSave={allWhole(d.maxLine, d.maxDistinct)}
          onSave={() => void submit()}
          onDiscard={() => {
            form.discard()
            setError(null)
          }}
        />
      ) : null}
    </SettingsPage>
  )
}

function RulesSkeleton() {
  const row = (label: string) => (
    <SettingsRow label={label}>
      <Bone kind="control" className="w-28" />
    </SettingsRow>
  )
  return (
    <Loading>
      <SettingsPage>
        <SettingsSection {...SECTION.minimum}>
          <SettingsList>{row("Minimum spend")}</SettingsList>
        </SettingsSection>
        <SettingsSection {...SECTION.limits}>
          <SettingsList>
            {row("Most of any one item")}
            {row("Most different items")}
          </SettingsList>
        </SettingsSection>
      </SettingsPage>
    </Loading>
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: OPERATING_TZ,
      })
}
