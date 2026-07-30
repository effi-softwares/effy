import { useState } from "react";

import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button, Input, Label } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { canManagePromotions } from "./access";
import { promotionMutationError } from "./errorText";
import { orderPolicyQuery, useUpdateOrderPolicy } from "./queries";

/**
 * The order rules (027 FR-053) — the minimum spend, and the two ceilings every cart is checked against.
 *
 * ⚠ There is exactly ONE of these, enforced by the schema. So this is a form over a singleton, not a
 * register: a PUT that means the same thing however many times it is sent.
 *
 * ⚠ The ceilings are bounded to what the SCHEMA allows (a line quantity must stay inside `cart_item`'s
 * own CHECK). Setting a rule the tables would reject is not a policy an operator can express — it is a
 * cart that starts failing for shoppers at a number nobody chose.
 */
export function OrderRulesScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManagePromotions(roles);

  const navigate = useNavigate();
  const { data: policy, error, isPending, isError, refetch } = useQuery(orderPolicyQuery());

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/promotions" })}>
          <ArrowLeft />
          Promotions
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Order rules</h1>
        <p className="text-muted-foreground">
          The minimum a shopper must spend to check out, and the limits a single cart may hold.
        </p>
      </div>

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
    </div>
  );
}

function OrderRulesForm({
  canManage,
  initial,
  updatedAt,
  updatedBy,
}: {
  canManage: boolean;
  initial: { minimumSubtotalAmount: string; maxLineQuantity: string; maxDistinctItems: string };
  updatedAt: string;
  updatedBy: string | null;
}) {
  const updatePolicy = useUpdateOrderPolicy();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      setFormError(null);
      setSaved(false);
      try {
        await updatePolicy.mutateAsync({
          minimumSubtotalAmount: value.minimumSubtotalAmount.trim() || "0.00",
          maxLineQuantity: Number(value.maxLineQuantity),
          maxDistinctItems: Number(value.maxDistinctItems),
        });
        setSaved(true);
      } catch (err) {
        setFormError(promotionMutationError(err));
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="max-w-lg space-y-6"
      noValidate
    >
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

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex flex-col">
          <dt className="text-muted-foreground">Last updated</dt>
          <dd>{formatTime(updatedAt)}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-muted-foreground">By</dt>
          <dd className="font-mono text-xs">{updatedBy ?? "—"}</dd>
        </div>
      </dl>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
      {saved && !formError ? <p className="text-sm text-muted-foreground">Saved.</p> : null}

      {canManage ? (
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save rules"}
            </Button>
          )}
        </form.Subscribe>
      ) : (
        <p className="text-sm text-muted-foreground">
          You have read-only access to the order rules.
        </p>
      )}
    </form>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
