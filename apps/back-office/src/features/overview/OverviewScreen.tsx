import { useQuery } from "@tanstack/react-query";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ChevronRight,
  CircleSlash,
  ClipboardCheck,
  Clock,
  Hourglass,
  MailWarning,
  MessageSquareText,
  Package,
  PackageX,
  ReceiptText,
  Route,
  Search,
  ShieldAlert,
  UserX,
} from "lucide-react";

import { Badge, Button, Skeleton } from "@effy/design-system/ui";
import { leastAdvanced, type DispatchWindowDTO, type DeliverySlotDTO } from "@effy/shared-types";
import { PackageStatusPill } from "@effy/web-kit/console";

import { Kbd } from "@/components/patterns/Kbd";
import { PageHeader } from "@/components/patterns/Page";
import { DetailRows, Panel } from "@/components/patterns/Panel";
import { Callout } from "@/components/patterns/States";
import { DotWord, Meter, StatusWord } from "@/components/patterns/StatusWord";
import { displayName, initialsOf } from "@/components/shell/identity";
import { sessionQuery } from "@/features/auth/queries";
import { deliverabilityListQuery } from "@/features/deliverability/queries";
import { slotGridQuery } from "@/features/delivery/queries";
import { dispatchDayQuery, dispatchWindowsQuery } from "@/features/dispatch/queries";
import { dutyQuery } from "@/features/drivers/queries";
import { exceptionsQuery } from "@/features/exceptions/queries";
import { feedbackListQuery } from "@/features/feedback/queries";
import { orderViewCountsQuery, ordersTodayQuery } from "@/features/orders/queries";
import { reviewQueueQuery } from "@/features/product-review/queries";
import { setCommandPaletteOpen } from "@/lib/ui-store";

/**
 * Overview (redesign, board "Overview — needs attention"): what needs a person right now, and how
 * today's deliveries are going. Replaces the placeholder dashboard and its illustrative figures.
 *
 * Every number is read through the query of the page it links to — the same endpoint and cache tree
 * — so a count here and the list it opens can never disagree, and each refreshes when its page's data
 * does (a live update or a mutation). Nothing here refreshes on a timer.
 */
const TZ = "Australia/Melbourne";
const dateLine = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const hourNow = () => Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(new Date()));
const hhmm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ });
const clock12 = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ });
const money = (amount: string, currency: string) => new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Number(amount));

/** "08:00" → "8:00 am". */
function ampm(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
const at12 = (iso: string) => clock12.format(new Date(iso)).replace(/[  ]/g, " ").toLowerCase();

function greeting(): string {
  const h = hourNow();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function OverviewScreen() {
  const session = useQuery(sessionQuery);
  const email = session.data?.status === "signed-in" ? session.data.identity.email : "";
  const first = displayName(email).split(" ")[0] ?? "";

  const exceptions = useQuery(exceptionsQuery(false));
  const day = useQuery(dispatchDayQuery());
  const views = useQuery(orderViewCountsQuery({}));
  const review = useQuery(reviewQueueQuery({}));
  const feedback = useQuery(feedbackListQuery({ status: "new", limit: 1 }));
  const deliverability = useQuery(deliverabilityListQuery({ limit: 1 }));
  const duty = useQuery(dutyQuery());

  const ex = exceptions.data;
  const open = ex?.exceptions.filter((e) => e.resolvedAt === null) ?? [];
  const withDrivers = open.filter((e) => e.packageLocation === "with_driver").length;
  const unsafe = ex?.vehicleChecks?.filter((c) => c.unsafe && c.clearedAt === null) ?? [];
  const waitingTotal = Number(duty.data?.unassigned.readyToCollect ?? 0) + Number(duty.data?.unassigned.readyToDeliver ?? 0);
  const nobodyOnDuty = duty.data !== undefined && duty.data.onDuty.length === 0 && waitingTotal > 0;

  const attention: AttentionRow[] = [
    {
      n: ex ? open.length : undefined,
      title: "Failed deliveries",
      desc: `${withDrivers} still with drivers · ${open.length - withDrivers} back at the hub, waiting for a decision`,
      icon: PackageX,
      tile: "problem",
      link: { to: "/exceptions" },
    },
    {
      n: ex ? unsafe.length : undefined,
      title: unsafe.length === 1 ? "Vehicle found unsafe" : "Vehicles found unsafe",
      desc: unsafe.length
        ? `${unsafe.map((c) => c.driverName).join(", ")} can’t be given work until it is cleared`
        : "Nothing waiting to be cleared",
      icon: ShieldAlert,
      tile: "problem",
      link: { to: "/exceptions" },
    },
    {
      n: day.data?.unassigned.length,
      title: "Packages need a driver",
      desc: "Ready at a shop or waiting at the hub, and nobody can take them yet",
      icon: UserX,
      tile: "primary",
      link: { to: "/orders/assignments" },
    },
    {
      n: ex ? (ex.overdue?.length ?? 0) + (ex.held?.length ?? 0) : undefined,
      title: "Runs waiting on their next step",
      desc: "Overdue steps, and packages a driver declared missing",
      icon: Hourglass,
      tile: "primary",
      link: { to: "/exceptions" },
    },
    {
      n: views.data?.refundDecision,
      title: "Refund decisions",
      desc: "Customers asked for a refund, or a shop recorded items as not supplied",
      icon: ReceiptText,
      link: { to: "/orders", search: { view: "refund" } } as LinkProps,
    },
    {
      n: review.data?.total,
      title: "Products waiting for review",
      desc: "New products and changes from shops, oldest first",
      icon: ClipboardCheck,
      link: { to: "/product-review" },
    },
    { n: feedback.data?.total, title: "New feedback", desc: "Submitted by customers and not yet looked at", icon: MessageSquareText, link: { to: "/feedback" } },
    {
      n: deliverability.data?.total,
      title: "Undeliverable email addresses",
      desc: "They receive no sign-in codes until someone repairs them",
      icon: MailWarning,
      link: { to: "/deliverability" },
    },
  ];

  return (
    <>
      <PageHeader
        title={first ? `${greeting()}, ${first}` : greeting()}
        description={`${dateLine.format(new Date())} · Melbourne time. What needs a person right now, and how today's deliveries are going.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setCommandPaletteOpen(true)}>
              <Search aria-hidden="true" />
              Find an order
              <Kbd>⌘K</Kbd>
            </Button>
            <Button asChild>
              <Link to="/orders/assignments">
                <Route aria-hidden="true" />
                Open dispatch
              </Link>
            </Button>
          </>
        }
      />

      {nobodyOnDuty ? (
        <Callout tone="destructive" title={`Nobody is on duty, and ${waitingTotal} packages are waiting for a driver.`}>
          Nothing will move until someone goes on duty in the driver app. Back-office can't put a driver on duty.
        </Callout>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Panel
            title="Needs attention"
            description="Each count opens the list it comes from. They update live — nothing here refreshes on a timer."
            actions={
              <span className="bo-tag">
                <span className="bo-live-dot" aria-hidden="true" />
                Live
              </span>
            }
            flush
          >
            <div>
              {attention.map((a) => (
                <Link key={a.title} {...a.link} className="bo-attn">
                  <span className={`bo-icon-tile${a.tile ? ` bo-icon-tile--${a.tile}` : ""}`}>
                    <a.icon aria-hidden="true" />
                  </span>
                  <span className="bo-attn__text">
                    <span className="bo-attn__title">{a.title}</span>
                    <span className="bo-attn__desc block">{a.desc}</span>
                  </span>
                  <span className="bo-attn__n">
                    {a.n === undefined ? <Skeleton className="ml-auto h-6 w-8" /> : a.n}
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </Panel>

          <TodaysWindows />
        </div>

        <div className="min-w-0 space-y-6">
          <OnDuty />
          <Panel title="Shortcuts" flush>
            <ul className="space-y-1 px-5 py-2">
              <li>
                <button type="button" className="bo-cmd-item" onClick={() => setCommandPaletteOpen(true)}>
                  <Search aria-hidden="true" />
                  Find an order or customer
                  <Kbd className="ml-auto">⌘K</Kbd>
                </button>
              </li>
              {SHORTCUTS.map((s) => (
                <li key={s.label}>
                  <Link {...s.link} className="bo-cmd-item">
                    <s.icon aria-hidden="true" />
                    {s.label}
                    <Kbd className="ml-auto">{s.keys}</Kbd>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
          <OrdersToday />
        </div>
      </div>
    </>
  );
}

interface AttentionRow {
  n: number | string | undefined;
  title: string;
  desc: string;
  icon: LucideIcon;
  tile?: "problem" | "primary";
  link: LinkProps;
}

const SHORTCUTS: readonly { label: string; icon: LucideIcon; keys: string; link: LinkProps }[] = [
  { label: "Go to orders", icon: Package, keys: "G O", link: { to: "/orders" } },
  { label: "Go to dispatch", icon: Route, keys: "G D", link: { to: "/orders/assignments" } },
  { label: "Go to exceptions", icon: PackageX, keys: "G E", link: { to: "/exceptions" } },
  { label: "Review products", icon: ClipboardCheck, keys: "G R", link: { to: "/product-review" } },
];

/** Today's delivery windows: booked against each limit, at the hub, who has the round, and the state. */
function TodaysWindows() {
  const grid = useQuery(slotGridQuery());
  const windows = useQuery(dispatchWindowsQuery(null));

  const slots = (grid.data?.items ?? []).filter((s) => s.status === "active");
  const byKey = new Map<string, DispatchWindowDTO>();
  for (const w of windows.data?.windows ?? []) {
    byKey.set(w.anyTime ? "any" : `${hhmm.format(new Date(w.windowStart))}-${hhmm.format(new Date(w.windowEnd))}`, w);
  }
  const keyOf = (s: DeliverySlotDTO) => (s.anyTime ? "any" : `${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}`);

  return (
    <Panel
      title="Today's delivery windows"
      description="Booked against each window's limit, what is at the hub, and who has the round."
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/orders/assignments">
            All of today
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
      flush
    >
      <div className="bo-table-scroll">
        <table className="bo-table bo-rtable bo-table--plain">
          <thead>
            <tr>
              <th>Window</th>
              <th>Booked</th>
              <th className="is-num">At the hub</th>
              <th>Round</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {grid.isPending ? (
              [0, 1, 2].map((i) => (
                <tr key={i}>
                  <td colSpan={5}>
                    <Skeleton className="h-6" />
                  </td>
                </tr>
              ))
            ) : slots.length === 0 ? (
              <tr>
                <td colSpan={5} className="is-muted">
                  No delivery windows are set up. Add them under Delivery › Delivery windows.
                </td>
              </tr>
            ) : (
              slots.map((s) => {
                const w = byKey.get(keyOf(s));
                const atHub = w?.parcels.filter((p) => p.status.status === "at_hub").length ?? 0;
                const round = w?.rounds[0];
                const state = w ? leastAdvanced(w.parcels.map((p) => p.status)) : null;
                const full = s.capacity !== null && s.bookedToday >= s.capacity;
                const pct = s.capacity ? (s.bookedToday / s.capacity) * 100 : 0;
                return (
                  <tr key={s.id}>
                    <td data-m="primary">
                      <span className="bo-code font-medium">
                        {s.startTime.slice(0, 5)} – {s.endTime.slice(0, 5)}
                      </span>
                      {s.anyTime ? (
                        <Badge variant="outline" className="ml-1.5">
                          Any time
                        </Badge>
                      ) : null}
                      <span className="bo-sub">Order by {ampm(s.cutoffTime)}</span>
                    </td>
                    <td data-m="full" className="min-w-[180px]">
                      <Meter booked={pct} label={`${s.bookedToday} booked`} limit={s.capacity === null ? "no limit" : `limit ${s.capacity}`} />
                    </td>
                    <td data-m="meta" data-label="At the hub" className="is-num">
                      {atHub}
                    </td>
                    <td data-m="meta" data-label="Round">
                      {round ? (
                        <>
                          {round.driver.name}
                          {w && w.rounds.length > 1 ? ` +${w.rounds.length - 1}` : ""}
                          {round.opensAt ? <span className="bo-sub">Opens {at12(round.opensAt)}</span> : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">No round yet</span>
                      )}
                    </td>
                    <td data-m="badge">
                      {state ? (
                        <PackageStatusPill view={state} showDetail={false} icons />
                      ) : full ? (
                        <StatusWord tone="waiting" icon={CircleSlash}>
                          Full
                        </StatusWord>
                      ) : (
                        <StatusWord tone="muted" icon={Clock}>
                          Open
                        </StatusWord>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** Who is working right now, and what each is doing (from today's rounds and vehicle checks). */
function OnDuty() {
  const duty = useQuery(dutyQuery());
  const day = useQuery(dispatchDayQuery());
  const exceptions = useQuery(exceptionsQuery(false));

  const blocked = new Set(
    (exceptions.data?.vehicleChecks ?? []).filter((c) => c.unsafe && c.clearedAt === null).map((c) => c.driverName),
  );
  const onDuty = duty.data?.onDuty ?? [];
  const waiting = Number(duty.data?.unassigned.readyToCollect ?? 0) + Number(duty.data?.unassigned.readyToDeliver ?? 0);
  const late = onDuty.find((d) => d.pastExpectedEnd);

  return (
    <Panel
      title="On duty now"
      description={
        duty.data
          ? `${onDuty.length} ${onDuty.length === 1 ? "driver" : "drivers"} · ${waiting} packages waiting for the next assignment pass`
          : undefined
      }
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/drivers">Drivers</Link>
        </Button>
      }
      footer={
        late ? (
          <>
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
              {late.driverName}'s shift is running long
              {late.expectedEndAt ? ` — expected to finish ${at12(late.expectedEndAt)}` : ""}.
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link to="/drivers/$driverId" params={{ driverId: late.driverId }}>
                Review
              </Link>
            </Button>
          </>
        ) : undefined
      }
      footerBetween
      flush
    >
      {duty.isPending ? (
        <div className="space-y-3 px-5 py-4">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
      ) : onDuty.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground">Nobody is on duty. Drivers go on duty in the driver app.</p>
      ) : (
        <ul className="divide-y divide-border">
          {onDuty.map((d) => {
            const round = day.data?.rounds.find((r) => r.driverId === d.driverId);
            const isBlocked = blocked.has(d.driverName);
            const doing = isBlocked
              ? "Vehicle check found it unsafe — no work until cleared"
              : round
                ? `${round.round.kind === "collection" ? "Collection run" : "Delivery round"}${round.stageLabel ? ` · ${round.stageLabel}` : ""} · ${round.stopsRemaining} stops left`
                : "Nothing assigned yet";
            return (
              <li key={d.driverId} className="flex items-center gap-3 px-5 py-3">
                <span className="bo-avatar bo-avatar--sq">{initialsOf(d.driverName)}</span>
                <div className="min-w-0 flex-1">
                  <Link to="/drivers/$driverId" params={{ driverId: d.driverId }} className="bo-link">
                    {d.driverName}
                  </Link>
                  <span className="bo-sub truncate">{doing}</span>
                </div>
                {isBlocked ? (
                  <DotWord tone="alert">Blocked</DotWord>
                ) : d.pastExpectedEnd ? (
                  <DotWord tone="alert">Past finish</DotWord>
                ) : round ? (
                  <DotWord tone="busy">{round.round.kind === "collection" ? "On a run" : "On a round"}</DotWord>
                ) : (
                  <DotWord tone="on">Idle</DotWord>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** Orders placed since midnight Melbourne time, by who delivers them, and refunded today. */
function OrdersToday() {
  const today = useQuery(ordersTodayQuery());
  const t = today.data;
  return (
    <Panel title="Orders today" description="Placed since midnight, by who delivers them.">
      {today.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
        </div>
      ) : today.isError || !t ? (
        <p className="text-sm text-muted-foreground">Couldn't load today's figures. They come back when the orders service answers.</p>
      ) : (
        <DetailRows
          tight
          rows={[
            { label: "Delivered by Effy", value: <span className="tabular-nums">{plural(Number(t.effy), "order")}</span> },
            { label: "Courier delivery", value: <span className="tabular-nums">{plural(Number(t.courier), "order")}</span> },
            {
              label: "Refunded",
              value: (
                <span className="tabular-nums">
                  {plural(Number(t.refunded.orders), "order")}
                  {Number(t.refunded.orders) > 0 ? ` · ${money(t.refunded.amount, t.refunded.currency)}` : ""}
                </span>
              ),
            },
          ]}
        />
      )}
    </Panel>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

