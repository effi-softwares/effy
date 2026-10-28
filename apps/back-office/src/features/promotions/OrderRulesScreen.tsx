import { useState } from "react"

import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"

import { Button, Input, Label, Skeleton } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { PageHeader, Panel } from "@effy/web-kit/patterns"

import { sessionQuery } from "@/features/auth/queries"

import { canManagePromotions } from "./access"
import { promotionMutationError } from "./errorText"
import { orderPolicyQuery, useUpdateOrderPolicy } from "./queries"

export function OrderRulesScreen() {
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const canManage = canManagePromotions(roles)

  const { data: policy, error, isPending, isError, refetch } = useQuery(orderPolicyQuery())

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isPending) return <Skeleton className="h-60" aria-busy="true" />

  return (
    <>
      <PageHeader
        back={{ label: "Promotion codes", link: { to: "/promotions" } }}
        title="Order rules"
        description="The minimum spend needed to check out and the limits on a single cart."
      />

      <OrderRulesForm
        key={policy.updatedAt}
        canManage={canManage}
        initial={{
          minimumSubtotalAmount: policy.minimumSubtotalAmount,
          maxLineQuantity: String(policy.maxLineQuantity),
          maxDistinctItems: String(policy.maxDistinctItems),
        }}
        updatedAt={policy.updatedAt}
        updatedBy={policy.updatedBy}
      />
    </>
  )
}

function OrderRulesForm({
  canManage,
  initial,
  updatedAt,
  updatedBy,
}: {
  canManage: boolean
  initial: { minimumSubtotalAmount: string; maxLineQuantity: string; maxDistinctItems: string }
  updatedAt: string
  updatedBy: string | null
}) {
  const updatePolicy = useUpdateOrderPolicy()
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      setFormError(null)
      setSaved(false)
      try {
        await updatePolicy.mutateAsync({
          minimumSubtotalAmount: value.minimumSubtotalAmount.trim() || "0.00",
          maxLineQuantity: Number(value.maxLineQuantity),
          maxDistinctItems: Number(value.maxDistinctItems),
        })
        setSaved(true)
      } catch (err) {
        setFormError(promotionMutationError(err))
      }
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
      className="max-w-2xl"
      noValidate
    >
      <Panel
        title="Every cart is checked against these"
        description="A change applies to the next cart a shopper opens. Carts already paid are not affected."
        footerBetween
        footer={
          <>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              Last updated {formatTime(updatedAt)}
              {updatedBy ? (
                <>
                  {" "}
                  · by <span className="font-mono">{updatedBy}</span>
                </>
              ) : null}
            </span>
            {canManage ? (
              <form.Subscribe selector={(s) => s.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : "Save rules"}
                  </Button>
                )}
              </form.Subscribe>
            ) : (
              <span className="mt-0.5 block text-sm text-muted-foreground">
                You have read-only access to the order rules.
              </span>
            )}
          </>
        }
      >
        <div className="space-y-6">
          <form.Field name="minimumSubtotalAmount">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="policy-minimum">Minimum spend</Label>
                <Input
                  id="policy-minimum"
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={!canManage}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                <p className="text-xs text-muted-foreground">
                  0.00 turns the minimum off entirely — the cart then shows nothing about it at all.
                </p>
              </div>
            )}
          </form.Field>

          <form.Field name="maxLineQuantity">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="policy-max-line">Most of any one item</Label>
                <Input
                  id="policy-max-line"
                  type="number"
                  min={1}
                  max={99}
                  disabled={!canManage}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                <p className="text-xs text-muted-foreground">Between 1 and 99.</p>
              </div>
            )}
          </form.Field>

          <form.Field name="maxDistinctItems">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor="policy-max-distinct">Most different items</Label>
                <Input
                  id="policy-max-distinct"
                  type="number"
                  min={1}
                  max={500}
                  disabled={!canManage}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                <p className="text-xs text-muted-foreground">Between 1 and 500.</p>
              </div>
            )}
          </form.Field>

          {formError ? (
            <p role="alert" className="text-sm font-medium">
              {formError}
            </p>
          ) : null}
          {saved && !formError ? (
            <p role="status" className="text-sm text-muted-foreground">
              Saved.
            </p>
          ) : null}
        </div>
      </Panel>
    </form>
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
        timeZone: "Australia/Melbourne",
      })
}
