import { useState } from "react";

import { useForm, useStore } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";

import type { PromoKind } from "@effy/shared-types";
import { cn } from "@effy/design-system";
import { Button, Input, Label } from "@effy/design-system/ui";

import { PageHeader } from "@/components/patterns/Page";
import { Panel } from "@/components/patterns/Panel";
import { StatusWord } from "@/components/patterns/StatusWord";
import { useSessionRoles } from "@/features/auth/useSessionRoles";
import { money } from "@/lib/format";

import { canManagePromotions } from "./access";
import { DUPLICATE_CODE_CONFLICT, promotionMutationError } from "./errorText";
import { useCreatePromo } from "./queries";

/**
 * Create a code (027 US10; redesign, board "Create a code"): a page, not a dialog — the definition on
 * the left in four sections, and on the right a summary that reads the code back in words as it is
 * typed, so what will be created is what the operator meant.
 *
 * Empty strings mean "no bound" / "uncapped" and are sent as `null`.
 */

/** An <input type="datetime-local"> holds local time; the wire is ISO/UTC. */
function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
function optionalInt(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

const when = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

interface Draft {
  code: string;
  kind: PromoKind;
  percentOff: string;
  amountOff: string;
  minimumSubtotalAmount: string;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
  maxPerCustomer: string;
}

const EMPTY: Draft = {
  code: "",
  kind: "percentage",
  percentOff: "",
  amountOff: "",
  minimumSubtotalAmount: "0.00",
  startsAt: "",
  endsAt: "",
  maxRedemptions: "",
  maxPerCustomer: "",
};

export function CreatePromoScreen() {
  const navigate = useNavigate();
  const canManage = canManagePromotions(useSessionRoles());
  const createPromo = useCreatePromo();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: EMPTY,
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        const created = await createPromo.mutateAsync({
          code: value.code.trim(),
          kind: value.kind,
          ...(value.kind === "percentage" ? { percentOff: Number(value.percentOff) } : { amountOff: value.amountOff.trim() }),
          minimumSubtotalAmount: value.minimumSubtotalAmount.trim() || "0.00",
          startsAt: fromLocalInput(value.startsAt),
          endsAt: fromLocalInput(value.endsAt),
          maxRedemptions: optionalInt(value.maxRedemptions),
          maxPerCustomer: optionalInt(value.maxPerCustomer),
        });
        await navigate({ to: "/promotions/$promoId", params: { promoId: created.id } });
      } catch (err) {
        setFormError(promotionMutationError(err, DUPLICATE_CODE_CONFLICT));
      }
    },
  });
  const draft = useStore(form.store, (s) => s.values);

  if (!canManage) {
    return (
      <>
        <PageHeader back={{ label: "All codes", link: { to: "/promotions" } }} title="Create code" />
        <p className="text-sm text-muted-foreground">Creating a code needs a manager or an administrator.</p>
      </>
    );
  }

  const field = (id: string, label: string, hint: string | null, input: React.ReactNode) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {input}
      {hint ? <p className="bo-sub">{hint}</p> : null}
    </div>
  );

  return (
    <>
      <PageHeader
        back={{ label: "All codes", link: { to: "/promotions" } }}
        title="Create code"
        description="Define what the code takes off, when it runs, and how often it can be used."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
        noValidate
        className="bo-detail"
      >
        <div className="bo-detail__main">
          <Panel title="Code">
            <form.Field name="code">
              {(f) =>
                field(
                  "promo-code",
                  "Code",
                  "Shoppers may type it in any case — it is matched without regard to case.",
                  <Input
                    id="promo-code"
                    autoFocus
                    required
                    placeholder="SPRING20"
                    className="max-w-xs font-mono"
                    value={f.state.value}
                    onChange={(e) => f.handleChange(e.target.value.toUpperCase())}
                    onBlur={f.handleBlur}
                  />,
                )
              }
            </form.Field>
          </Panel>

          <Panel title="Value">
            <div className="space-y-5">
              <form.Field name="kind">
                {(f) => (
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Takes off</span>
                    <div role="group" aria-label="Takes off" className="bo-seg">
                      {(
                        [
                          ["percentage", "A percentage"],
                          ["fixed", "A fixed amount"],
                        ] as const
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          className={cn(f.state.value === k && "is-active")}
                          aria-pressed={f.state.value === k}
                          onClick={() => f.handleChange(k)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </form.Field>
              {draft.kind === "percentage" ? (
                <form.Field name="percentOff">
                  {(f) =>
                    field(
                      "promo-percent",
                      "Percent off",
                      "1 to 100.",
                      <div className="flex max-w-40 items-center gap-2">
                        <Input
                          id="promo-percent"
                          type="number"
                          min={1}
                          max={100}
                          required
                          value={f.state.value}
                          onChange={(e) => f.handleChange(e.target.value)}
                          onBlur={f.handleBlur}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>,
                    )
                  }
                </form.Field>
              ) : (
                <form.Field name="amountOff">
                  {(f) =>
                    field(
                      "promo-amount",
                      "Amount off",
                      "Never takes a cart below zero — a larger amount simply zeroes the items.",
                      <div className="flex max-w-48 items-center gap-2">
                        <span className="text-sm text-muted-foreground">$</span>
                        <Input
                          id="promo-amount"
                          inputMode="decimal"
                          placeholder="10.00"
                          required
                          value={f.state.value}
                          onChange={(e) => f.handleChange(e.target.value)}
                          onBlur={f.handleBlur}
                        />
                      </div>,
                    )
                  }
                </form.Field>
              )}
              <form.Field name="minimumSubtotalAmount">
                {(f) =>
                  field(
                    "promo-minimum",
                    "Minimum spend",
                    "0.00 for no minimum.",
                    <div className="flex max-w-48 items-center gap-2">
                      <span className="text-sm text-muted-foreground">$</span>
                      <Input
                        id="promo-minimum"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={f.state.value}
                        onChange={(e) => f.handleChange(e.target.value)}
                        onBlur={f.handleBlur}
                      />
                    </div>,
                  )
                }
              </form.Field>
            </div>
          </Panel>

          <Panel title="Active dates" description="Melbourne time. Leave a date empty for no bound.">
            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="startsAt">
                {(f) =>
                  field(
                    "promo-starts",
                    "Starts",
                    null,
                    <Input id="promo-starts" type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />,
                  )
                }
              </form.Field>
              <form.Field name="endsAt">
                {(f) =>
                  field(
                    "promo-ends",
                    "Ends",
                    null,
                    <Input id="promo-ends" type="datetime-local" value={f.state.value} onChange={(e) => f.handleChange(e.target.value)} />,
                  )
                }
              </form.Field>
            </div>
          </Panel>

          <Panel title="Usage limits" description="Leave empty for uncapped.">
            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="maxRedemptions">
                {(f) =>
                  field(
                    "promo-max",
                    "Total uses",
                    null,
                    <Input
                      id="promo-max"
                      type="number"
                      min={1}
                      placeholder="Uncapped"
                      value={f.state.value}
                      onChange={(e) => f.handleChange(e.target.value)}
                    />,
                  )
                }
              </form.Field>
              <form.Field name="maxPerCustomer">
                {(f) =>
                  field(
                    "promo-per-customer",
                    "Uses per shopper",
                    null,
                    <Input
                      id="promo-per-customer"
                      type="number"
                      min={1}
                      placeholder="Uncapped"
                      value={f.state.value}
                      onChange={(e) => f.handleChange(e.target.value)}
                    />,
                  )
                }
              </form.Field>
            </div>
          </Panel>

          {formError ? (
            <p role="alert" className="text-sm font-medium">
              {formError}
            </p>
          ) : null}

          <div className="bo-panel bo-panel__foot bo-panel__foot--between rounded-lg">
            <span className="bo-sub">Unsaved code</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => void navigate({ to: "/promotions" })}>
                Cancel
              </Button>
              <form.Subscribe selector={(s) => s.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating…" : "Create code"}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          </div>
        </div>

        <aside className="bo-detail__aside">
          <Summary draft={draft} />
        </aside>
      </form>
    </>
  );
}

/** The code read back in words, as it will behave. */
function Summary({ draft }: { draft: Draft }) {
  const starts = draft.startsAt ? new Date(draft.startsAt) : null;
  const ends = draft.endsAt ? new Date(draft.endsAt) : null;
  const scheduled = starts !== null && starts.getTime() > Date.now();
  const value =
    draft.kind === "percentage"
      ? draft.percentOff
        ? `${draft.percentOff}% off the items in the cart`
        : "A percentage off the items in the cart"
      : draft.amountOff
        ? `${money(draft.amountOff)} off the items in the cart`
        : "A fixed amount off the items in the cart";
  const minimum = Number(draft.minimumSubtotalAmount) > 0 ? `On carts of ${money(draft.minimumSubtotalAmount)} or more` : "On any cart";
  const dates =
    starts && ends
      ? `From ${when.format(starts)} to ${when.format(ends)} (Melbourne)`
      : starts
        ? `From ${when.format(starts)} (Melbourne), no end`
        : ends
          ? `From now until ${when.format(ends)} (Melbourne)`
          : "From now, no end";
  const total = draft.maxRedemptions ? `${Number(draft.maxRedemptions).toLocaleString("en-AU")} uses in total` : "Uncapped in total";
  const per =
    draft.maxPerCustomer === "1" ? "once per shopper" : draft.maxPerCustomer ? `${draft.maxPerCustomer} times per shopper` : "no limit per shopper";

  return (
    <Panel title="Summary" actions={<StatusWord tone={scheduled ? "info" : "done"}>{scheduled ? "Scheduled" : "Active"}</StatusWord>}>
      <div className="space-y-4">
        <div>
          <div className="bo-code text-lg font-semibold">{draft.code || "CODE"}</div>
          <div className="bo-sub">Code typed at checkout</div>
        </div>
        <ul className="space-y-2 text-sm">
          <li>{value}</li>
          <li>{minimum}, after other promotions</li>
          <li>{dates}</li>
          <li>
            {total} · {per}
          </li>
          <li className="text-muted-foreground">Never takes delivery or a cart below zero</li>
        </ul>
        <div className="border-t border-border pt-3">
          <div className="text-sm font-medium">Once it is redeemed</div>
          <p className="bo-sub">Its value and minimum are fixed for good. Dates, caps and status can still change.</p>
        </div>
        <p className="bo-sub">Advertise it on the storefront from the code's page after creating it.</p>
      </div>
    </Panel>
  );
}
