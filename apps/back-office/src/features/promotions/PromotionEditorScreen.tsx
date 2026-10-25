import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import type { AdminPromotionWriteDTO, PromotionAudience, PromotionKind, PromotionTrigger } from "@effy/shared-types";
import { cn } from "@effy/design-system";
import { Button, Checkbox, Input, Label, Skeleton, Switch, Textarea } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@effy/web-kit/patterns";
import { Panel } from "@effy/web-kit/patterns";
import { Callout } from "@effy/web-kit/patterns";
import { useHeaderDetail } from "@effy/web-kit/console";
import { useSessionRoles } from "@/features/auth/useSessionRoles";
import { promotionGroupsQuery } from "@/features/promotion-groups/queries";

import { canManagePromotions } from "./access";
import { type AppliesTo, type Targets, TargetPicker } from "./components/TargetPicker";
import { promotionMutationError, refusedFields } from "./errorText";
import type { Promotion } from "./model";
import { promotionQuery, useCreatePromotion, useUpdatePromotion } from "./queries";

/**
 * Create or edit a promotion, as a page: the definition in sections on the left, and the promotion read
 * back in words on the right as it is typed. Once used, what it gives and who it is for are locked, with the
 * reason.
 */
const KINDS_OFFERED: readonly PromotionKind[] = ["cart", "item", "bxgy", "delivery"];
const KIND_LABEL: Record<PromotionKind, string> = { cart: "Off the cart", item: "Off items", bxgy: "Buy X get Y", delivery: "Off delivery" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const AUDIENCE_LABEL: Record<PromotionAudience, string> = {
  everyone: "Everyone",
  first_order: "First order",
  new_customers: "New customers",
  chosen: "Chosen customers",
};

interface Draft {
  name: string;
  kind: PromotionKind;
  trigger: PromotionTrigger;
  codeMode: "shared" | "single_use";
  sharedCode: string;
  valueType: "percent" | "amount" | "free";
  percentOff: string;
  amountOff: string;
  maxDiscount: string;
  minSubtotal: string;
  minQuantity: string;
  appliesTo: AppliesTo;
  targets: Targets;
  bxgyBuy: string;
  bxgyGet: string;
  bxgyMax: string;
  deliveryTypes: ("effy" | "courier")[];
  audience: PromotionAudience;
  daysOfWeek: number[];
  timeFrom: string;
  timeTo: string;
  startsAt: string;
  endsAt: string;
  maxUses: string;
  maxUsesPerCustomer: string;
  budget: string;
  combinable: boolean;
  headline: string;
  supportingLine: string;
  label: string;
  groupIds: string[];
}

const EMPTY: Draft = {
  name: "",
  kind: "cart",
  trigger: "code",
  codeMode: "shared",
  sharedCode: "",
  valueType: "percent",
  percentOff: "",
  amountOff: "",
  maxDiscount: "",
  minSubtotal: "0.00",
  minQuantity: "",
  appliesTo: "products",
  targets: { products: [], categoryIds: [], brands: [] },
  bxgyBuy: "2",
  bxgyGet: "1",
  bxgyMax: "",
  deliveryTypes: ["effy", "courier"],
  audience: "everyone",
  daysOfWeek: [],
  timeFrom: "",
  timeTo: "",
  startsAt: "",
  endsAt: "",
  maxUses: "",
  maxUsesPerCustomer: "",
  budget: "",
  combinable: false,
  headline: "",
  supportingLine: "",
  label: "",
  groupIds: [],
};

/** `<input type="datetime-local">` holds local time; the wire is ISO. */
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const intOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const moneyOrNull = (v: string) => (v.trim() === "" ? null : Number(v).toFixed(2));

function draftOf(p: Promotion): Draft {
  return {
    name: p.name,
    kind: p.kind,
    trigger: p.trigger,
    codeMode: p.trigger === "code" && !p.sharedCode && p.singleUseCodeCount > 0 ? "single_use" : "shared",
    sharedCode: p.sharedCode ?? "",
    valueType: p.valueType,
    percentOff: p.percentOff?.toString() ?? "",
    amountOff: p.amountOff ?? "",
    maxDiscount: p.maxDiscount ?? "",
    minSubtotal: p.minSubtotal,
    minQuantity: p.minQuantity?.toString() ?? "",
    appliesTo: p.appliesTo === "cart" ? "products" : p.appliesTo,
    targets: { products: p.targets.products, categoryIds: p.targets.categories.map((c) => c.id), brands: p.targets.brands },
    bxgyBuy: p.bxgy?.buy.toString() ?? "2",
    bxgyGet: p.bxgy?.get.toString() ?? "1",
    bxgyMax: p.bxgy?.maxPerOrder?.toString() ?? "",
    deliveryTypes: p.deliveryTypes,
    audience: p.audience,
    daysOfWeek: p.daysOfWeek ?? [],
    timeFrom: p.timeFrom ?? "",
    timeTo: p.timeTo ?? "",
    startsAt: toLocal(p.startsAt),
    endsAt: toLocal(p.endsAt),
    maxUses: p.maxUses?.toString() ?? "",
    maxUsesPerCustomer: p.maxUsesPerCustomer?.toString() ?? "",
    budget: p.budget ?? "",
    combinable: p.combinable,
    headline: p.headline ?? "",
    supportingLine: p.supportingLine ?? "",
    label: p.label ?? "",
    groupIds: p.groups.map((g) => g.id),
  };
}

function bodyOf(d: Draft, used: boolean): Partial<AdminPromotionWriteDTO> {
  const fixed: Partial<AdminPromotionWriteDTO> = used
    ? {}
    : {
        kind: d.kind,
        trigger: d.trigger,
        valueType: d.valueType,
        ...(d.valueType === "percent" ? { percentOff: Number(d.percentOff), maxDiscount: moneyOrNull(d.maxDiscount) } : {}),
        ...(d.valueType === "amount" ? { amountOff: Number(d.amountOff || "0").toFixed(2) } : {}),
        minSubtotal: Number(d.minSubtotal || "0").toFixed(2),
        minQuantity: intOrNull(d.minQuantity),
        audience: d.audience,
        deliveryTypes: d.deliveryTypes,
        ...(d.kind === "item" || d.kind === "bxgy"
          ? {
              appliesTo: d.appliesTo,
              targets: { productIds: d.targets.products.map((p) => p.id), categoryIds: d.targets.categoryIds, brands: d.targets.brands },
            }
          : { appliesTo: "cart" as const }),
        ...(d.kind === "bxgy" ? { bxgy: { buy: Number(d.bxgyBuy), get: Number(d.bxgyGet), maxPerOrder: intOrNull(d.bxgyMax) } } : { bxgy: null }),
      };
  return {
    name: d.name.trim(),
    ...fixed,
    ...(d.trigger === "code" && d.codeMode === "shared" ? { sharedCode: d.sharedCode.trim() || null } : {}),
    ...(d.trigger === "code" && d.codeMode === "single_use" && !used ? { codeMode: "single_use" as const } : {}),
    daysOfWeek: d.daysOfWeek.length ? [...d.daysOfWeek].sort() : null,
    timeFrom: d.timeFrom || null,
    timeTo: d.timeTo || null,
    startsAt: fromLocal(d.startsAt),
    endsAt: fromLocal(d.endsAt),
    maxUses: intOrNull(d.maxUses),
    maxUsesPerCustomer: intOrNull(d.maxUsesPerCustomer),
    budget: moneyOrNull(d.budget),
    combinable: d.combinable,
    headline: d.headline.trim() || null,
    supportingLine: d.supportingLine.trim() || null,
    label: d.label.trim() || null,
    groupIds: d.groupIds,
  };
}

export function PromotionEditorScreen({ promoId }: { promoId?: string }) {
  const existing = useQuery({ ...promotionQuery(promoId ?? ""), enabled: Boolean(promoId) });
  if (promoId && existing.isError) return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />;
  if (promoId && !existing.data) return <Skeleton className="h-96" aria-busy="true" />;
  return <Editor key={existing.data?.updatedAt ?? "new"} current={existing.data ?? null} />;
}

function Editor({ current }: { current: Promotion | null }) {
  const navigate = useNavigate();
  const canManage = canManagePromotions(useSessionRoles());
  const groups = useQuery(promotionGroupsQuery());
  const create = useCreatePromotion();
  const update = useUpdatePromotion(current?.id ?? "");
  const [d, setD] = useState<Draft>(current ? draftOf(current) : EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [bad, setBad] = useState<Set<string>>(new Set());
  const used = current?.used ?? false;
  const busy = create.isPending || update.isPending;
  useHeaderDetail(current ? current.name : "New promotion");

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  async function save(publish: boolean) {
    setError(null);
    setBad(new Set());
    try {
      const body = bodyOf(d, used);
      const saved = current
        ? await update.mutateAsync({ ...body, expectedUpdatedAt: current.updatedAt })
        : await create.mutateAsync({ ...(body as AdminPromotionWriteDTO), publish });
      await navigate({ to: "/promotions/$promoId", params: { promoId: saved.id } });
    } catch (err) {
      setError(promotionMutationError(err));
      setBad(refusedFields(err));
    }
  }

  if (!canManage) {
    return (
      <>
        <PageHeader back={{ label: "Promotions", link: { to: "/promotions" } }} title={current ? "Edit promotion" : "Create promotion"} />
        <p className="text-sm text-muted-foreground">Creating or changing a promotion needs a manager or an administrator.</p>
      </>
    );
  }

  const field = (id: string, label: string, hint: string | null, input: React.ReactNode, key = id) => (
    <div className="space-y-2">
      <Label htmlFor={id} className={cn(bad.has(key) && "text-foreground underline decoration-2")}>
        {label}
      </Label>
      {input}
      {hint ? <p className="bo-sub">{hint}</p> : null}
    </div>
  );
  const locked = used ? <Lock aria-label="Fixed once used" className="size-3.5 text-muted-foreground" /> : null;

  return (
    <>
      <PageHeader
        back={{ label: current ? current.name : "Promotions", link: current ? { to: "/promotions/$promoId", params: { promoId: current.id } } : { to: "/promotions" } }}
        title={current ? "Edit promotion" : "Create promotion"}
        description="Set the offer, who can use it, when it runs, and its limits."
      />
      {used ? (
        <Callout tone="info" title="This promotion has been used.">
          What it gives and who it is for are fixed, so every order keeps explaining its discount. Its name, dates, limits, words and groups can
          still change.
        </Callout>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
        className="bo-detail"
        noValidate
      >
        <div className="bo-detail__main">
          <Panel title="Basics">
            <div className="space-y-5">
              {field(
                "promo-name",
                "Name",
                "For staff only — shoppers read the words below.",
                <Input id="promo-name" value={d.name} onChange={(e) => set("name", e.target.value)} className="max-w-md" autoFocus={!current} />,
                "name",
              )}
              <div className="space-y-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">How it applies {locked}</span>
                <div role="group" aria-label="How it applies" className="bo-seg">
                  {(["code", "automatic"] as const).map((t) => (
                    <button key={t} type="button" disabled={used} className={cn(d.trigger === t && "is-active")} aria-pressed={d.trigger === t} onClick={() => set("trigger", t)}>
                      {t === "code" ? "With a code" : "Automatically"}
                    </button>
                  ))}
                </div>
                <p className="bo-sub">
                  {d.trigger === "code" ? "Shoppers type the code in their cart." : "It applies by itself to every cart that qualifies."}
                </p>
              </div>
              {d.trigger === "code" ? (
                <div role="group" aria-label="Codes" className="bo-seg">
                  {(["shared", "single_use"] as const).map((m) => (
                    <button key={m} type="button" disabled={used} className={cn(d.codeMode === m && "is-active")} aria-pressed={d.codeMode === m} onClick={() => set("codeMode", m)}>
                      {m === "shared" ? "One code shoppers share" : "Single-use codes"}
                    </button>
                  ))}
                </div>
              ) : null}
              {d.trigger === "code" && d.codeMode === "single_use" ? <p className="bo-sub">Generate the codes on the promotion's page once it is saved.</p> : null}
              {d.trigger === "code" && d.codeMode === "shared"
                ? field(
                    "promo-code",
                    "Code",
                    "Shoppers may type it in any case, with or without spaces.",
                    <Input id="promo-code" value={d.sharedCode} onChange={(e) => set("sharedCode", e.target.value.toUpperCase())} placeholder="SPRING20" className="max-w-xs font-mono" />,
                    "sharedCode",
                  )
                : null}
            </div>
          </Panel>

          <Panel title={<span className="flex items-center gap-1.5">What it gives {locked}</span>}>
            <div className="space-y-5">
              <div role="group" aria-label="Kind" className="bo-seg">
                {KINDS_OFFERED.map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={used}
                    className={cn(d.kind === k && "is-active")}
                    aria-pressed={d.kind === k}
                    onClick={() => setD((x) => ({ ...x, kind: k, valueType: k === "delivery" || k === "bxgy" ? "free" : x.valueType === "free" ? "percent" : x.valueType }))}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              {d.kind === "item" || d.kind === "bxgy" ? (
                <TargetPicker appliesTo={d.appliesTo} onAppliesTo={(a) => set("appliesTo", a)} value={d.targets} onChange={(t) => set("targets", t)} disabled={used} />
              ) : null}
              {d.kind === "bxgy" ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  {field("bx-buy", "Buy", null, <Input id="bx-buy" type="number" min={1} disabled={used} value={d.bxgyBuy} onChange={(e) => set("bxgyBuy", e.target.value)} />, "bxgy.buy")}
                  {field("bx-get", "Get", "The cheapest ones.", <Input id="bx-get" type="number" min={1} disabled={used} value={d.bxgyGet} onChange={(e) => set("bxgyGet", e.target.value)} />, "bxgy.get")}
                  {field("bx-max", "Times per order", "Empty for no limit.", <Input id="bx-max" type="number" min={1} disabled={used} value={d.bxgyMax} onChange={(e) => set("bxgyMax", e.target.value)} />, "bxgy.maxPerOrder")}
                </div>
              ) : null}
              <div role="group" aria-label="Takes off" className="bo-seg">
                {(d.kind === "delivery" || d.kind === "bxgy" ? (["free", "percent", "amount"] as const) : (["percent", "amount"] as const)).map((v) => (
                  <button key={v} type="button" disabled={used} className={cn(d.valueType === v && "is-active")} aria-pressed={d.valueType === v} onClick={() => set("valueType", v)}>
                    {v === "free" ? (d.kind === "delivery" ? "Free delivery" : "Free") : v === "percent" ? "A percentage" : "A fixed amount"}
                  </button>
                ))}
              </div>
              {d.valueType === "percent" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {field(
                    "promo-percent",
                    "Percent off",
                    "Up to 100.",
                    <div className="flex items-center gap-2">
                      <Input id="promo-percent" type="number" min={0.01} max={100} step="0.01" disabled={used} value={d.percentOff} onChange={(e) => set("percentOff", e.target.value)} />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>,
                    "percentOff",
                  )}
                  {field(
                    "promo-cap",
                    "Up to (optional)",
                    "The most it takes off one order.",
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">$</span>
                      <Input id="promo-cap" inputMode="decimal" disabled={used} value={d.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} placeholder="No cap" />
                    </div>,
                    "maxDiscount",
                  )}
                </div>
              ) : d.valueType === "free" ? null : (
                field(
                  "promo-amount",
                  "Amount off",
                  "Never takes a cart below zero.",
                  <div className="flex max-w-48 items-center gap-2">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input id="promo-amount" inputMode="decimal" disabled={used} value={d.amountOff} onChange={(e) => set("amountOff", e.target.value)} placeholder="10.00" />
                  </div>,
                  "amountOff",
                )
              )}
              {field(
                "promo-min",
                "Minimum spend",
                "0.00 for no minimum.",
                <div className="flex max-w-48 items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input id="promo-min" inputMode="decimal" disabled={used} value={d.minSubtotal} onChange={(e) => set("minSubtotal", e.target.value)} />
                </div>,
                "minSubtotal",
              )}
              {d.kind === "item" || d.kind === "bxgy"
                ? field("promo-minq", "Minimum quantity (optional)", "Qualifying items in the cart.", <Input id="promo-minq" type="number" min={1} disabled={used} value={d.minQuantity} onChange={(e) => set("minQuantity", e.target.value)} className="max-w-32" />, "minQuantity")
                : null}
            </div>
          </Panel>

          <Panel title={<span className="flex items-center gap-1.5">Who {locked}</span>}>
            <div className="space-y-5">
              <div role="group" aria-label="Who" className="bo-seg flex-wrap">
                {(Object.keys(AUDIENCE_LABEL) as PromotionAudience[]).map((a) => (
                  <button key={a} type="button" disabled={used} className={cn(d.audience === a && "is-active")} aria-pressed={d.audience === a} onClick={() => set("audience", a)}>
                    {AUDIENCE_LABEL[a]}
                  </button>
                ))}
              </div>
              {d.audience === "chosen" ? <p className="bo-sub">Add the customers on the promotion's page once it is saved.</p> : null}
              {d.audience === "new_customers" ? <p className="bo-sub">Customers whose account was created on or after the start date.</p> : null}
              <div className="space-y-2">
                <span className="text-sm font-medium">Delivery</span>
                <div className="flex flex-wrap gap-4">
                  {(["effy", "courier"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        disabled={used}
                        checked={d.deliveryTypes.includes(t)}
                        onCheckedChange={(v) => set("deliveryTypes", v === true ? [...d.deliveryTypes, t] : d.deliveryTypes.filter((x) => x !== t))}
                      />
                      {t === "effy" ? "Delivered by Effy" : "Courier delivery"}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="When" description="Melbourne time. Leave a date empty for no bound; no days chosen means every day.">
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {field("promo-starts", "Starts", null, <Input id="promo-starts" type="datetime-local" value={d.startsAt} onChange={(e) => set("startsAt", e.target.value)} />, "startsAt")}
                {field("promo-ends", "Ends", null, <Input id="promo-ends" type="datetime-local" value={d.endsAt} onChange={(e) => set("endsAt", e.target.value)} />, "endsAt")}
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">Days</span>
                <div className="flex flex-wrap gap-3">
                  {DAYS.map((day, i) => (
                    <label key={day} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={d.daysOfWeek.includes(i + 1)}
                        onCheckedChange={(v) => set("daysOfWeek", v === true ? [...d.daysOfWeek, i + 1] : d.daysOfWeek.filter((x) => x !== i + 1))}
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid max-w-md gap-4 sm:grid-cols-2">
                {field("promo-from", "From (optional)", null, <Input id="promo-from" type="time" value={d.timeFrom} onChange={(e) => set("timeFrom", e.target.value)} />, "timeFrom")}
                {field("promo-to", "Until", null, <Input id="promo-to" type="time" value={d.timeTo} onChange={(e) => set("timeTo", e.target.value)} />, "timeTo")}
              </div>
            </div>
          </Panel>

          <Panel title="Limits" description="Leave empty for no limit. A promotion that reaches one stops at once.">
            <div className="grid gap-4 sm:grid-cols-3">
              {field("promo-max", "Total uses", null, <Input id="promo-max" type="number" min={1} value={d.maxUses} onChange={(e) => set("maxUses", e.target.value)} placeholder="Unlimited" />, "maxUses")}
              {field(
                "promo-per",
                "Uses per customer",
                null,
                <Input id="promo-per" type="number" min={1} value={d.maxUsesPerCustomer} onChange={(e) => set("maxUsesPerCustomer", e.target.value)} placeholder="Unlimited" />,
                "maxUsesPerCustomer",
              )}
              {field(
                "promo-budget",
                "Budget",
                "Total discount it may give.",
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input id="promo-budget" inputMode="decimal" value={d.budget} onChange={(e) => set("budget", e.target.value)} placeholder="No budget" />
                </div>,
                "budget",
              )}
            </div>
            <label className="mt-5 flex items-start gap-3 text-sm">
              <Switch checked={d.combinable} onCheckedChange={(v) => set("combinable", v)} aria-label="Combines with other promotions" />
              <span>
                <span className="font-medium">Combines with other promotions</span>
                <span className="bo-sub block">Off: when another offer gives the shopper more, that one applies instead of this.</span>
              </span>
            </label>
          </Panel>

          <Panel title="What shoppers read" description="Shown wherever the promotion is shown. The code and conditions are added for you.">
            <div className="space-y-5">
              {field("promo-headline", "Headline", "Needed to show it in a group. Up to 80 characters.", <Input id="promo-headline" value={d.headline} maxLength={80} onChange={(e) => set("headline", e.target.value)} placeholder="20% off your first grocery order" />, "headline")}
              {field("promo-support", "Supporting line (optional)", null, <Textarea id="promo-support" rows={2} maxLength={160} value={d.supportingLine} onChange={(e) => set("supportingLine", e.target.value)} />, "supportingLine")}
              {field("promo-label", "Label (optional)", "A short tag above the headline, like “This week's offer”.", <Input id="promo-label" value={d.label} maxLength={24} onChange={(e) => set("label", e.target.value)} className="max-w-xs" />, "label")}
            </div>
          </Panel>

          <Panel title="Where it's shown" description="A promotion can be in several groups. Reorder a group from its own page.">
            {groups.data && groups.data.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {groups.data.map((g) => (
                  <li key={g.id}>
                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={d.groupIds.includes(g.id)}
                        onCheckedChange={(v) => set("groupIds", v === true ? [...d.groupIds, g.id] : d.groupIds.filter((x) => x !== g.id))}
                      />
                      <span>
                        <span className="font-medium">{g.name}</span>
                        <span className="bo-sub block font-mono">{g.key}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="bo-sub">No display groups yet.</p>
            )}
          </Panel>

          {error ? (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          ) : null}

          <div className="bo-panel bo-panel__foot bo-panel__foot--between rounded-lg">
            <span className="bo-sub">{current ? "Unsaved changes" : "Saved as a draft until you publish it."}</span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void navigate(current ? { to: "/promotions/$promoId", params: { promoId: current.id } } : { to: "/promotions" })}>
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

        <aside className="bo-detail__aside">
          <Summary d={d} />
        </aside>
      </form>
    </>
  );
}

/** The promotion read back as it will behave. The server's own sentence appears on its page once saved. */
function Summary({ d }: { d: Draft }) {
  const off = d.valueType === "free" ? "free" : d.valueType === "percent" ? `${d.percentOff || "…"}% off` : `$${d.amountOff || "…"} off`;
  const value =
    d.kind === "delivery"
      ? d.valueType === "free" ? "Free delivery" : `${off} delivery`
      : d.kind === "bxgy"
        ? `Buy ${d.bxgyBuy || "…"} get ${d.bxgyGet || "…"} ${off}`
        : d.kind === "item"
          ? `${off} chosen ${d.appliesTo}`
          : `${off} the cart${d.valueType === "percent" && d.maxDiscount ? `, up to $${d.maxDiscount}` : ""}`;
  const min = Number(d.minSubtotal) > 0 ? `On orders over $${Number(d.minSubtotal).toFixed(2)}` : "On any order";
  const limits = [d.maxUses && `${d.maxUses} uses in total`, d.maxUsesPerCustomer && `${d.maxUsesPerCustomer} per customer`, d.budget && `budget $${d.budget}`].filter(Boolean);
  return (
    <Panel title="Summary">
      <div className="space-y-4">
        {d.label ? <div className="bo-sub font-semibold uppercase tracking-wide">{d.label}</div> : null}
        <div className="text-base font-semibold">{d.headline || d.name || "Untitled promotion"}</div>
        {d.supportingLine ? <p className="bo-sub">{d.supportingLine}</p> : null}
        <ul className="space-y-1.5 text-sm">
          <li>{value}</li>
          <li>{min}</li>
          <li>{AUDIENCE_LABEL[d.audience]}{d.deliveryTypes.length === 1 ? ` · ${d.deliveryTypes[0] === "effy" ? "Delivered by Effy only" : "Courier only"}` : ""}</li>
          {d.daysOfWeek.length || d.timeFrom ? (
            <li>
              {d.daysOfWeek.length ? [...d.daysOfWeek].sort().map((x) => DAYS[x - 1]).join(", ") : "Every day"}
              {d.timeFrom && d.timeTo ? ` ${d.timeFrom}–${d.timeTo}` : ""}
            </li>
          ) : null}
          <li>{d.trigger === "code" ? <>With the code <span className="bo-code">{d.sharedCode || "…"}</span></> : "Applies automatically"}</li>
          <li>{limits.length ? limits.join(" · ") : "No limits"}</li>
          <li className="text-muted-foreground">{d.combinable ? "Combines with other offers" : "Doesn't combine with other offers"}</li>
        </ul>
        <p className="bo-sub">Never takes delivery or a cart below zero. Once it is used, what it gives and who it is for are fixed.</p>
      </div>
    </Panel>
  );
}
