import { useState } from "react"

import { Link, type LinkProps } from "@tanstack/react-router"
import {
  Check,
  ChevronDown,
  CircleCheck,
  ClipboardCheck,
  Hourglass,
  MailWarning,
  MessageSquareText,
  PackageX,
  ReceiptText,
  ShieldAlert,
  Truck,
  UserX,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@effy/design-system"
import { Bone } from "@effy/web-kit/patterns"

import { TIER_WORDS, tiersOf, type AttentionRow } from "./model"
import { Section } from "./Section"

const ROW: Record<string, { icon: LucideIcon; link: LinkProps }> = {
  unsafe: { icon: ShieldAlert, link: { to: "/exceptions" } },
  driver: { icon: UserX, link: { to: "/orders/assignments" } },
  runs: { icon: Hourglass, link: { to: "/exceptions" } },
  failed: { icon: PackageX, link: { to: "/exceptions" } },
  refund: { icon: ReceiptText, link: { to: "/orders", search: { view: "refund" } } as LinkProps },
  courier: { icon: Truck, link: { to: "/orders/handover", search: { view: "hub_late" } } as LinkProps },
  review: { icon: ClipboardCheck, link: { to: "/product-review" } },
  feedback: { icon: MessageSquareText, link: { to: "/feedback" } },
  email: { icon: MailWarning, link: { to: "/deliverability" } },
}

/** Most urgent first, in three tiers. Rows at zero fold into one quiet "all clear" line. */
export function NeedsAttention({ rows }: { rows: readonly AttentionRow[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const tiers = tiersOf(rows)
  return (
    <Section
      id="ov-q-t"
      tour="overview.attention"
      order={1}
      title="Needs attention"
      description="Most urgent first. Each count opens the list it comes from."
    >
      {tiers.map((t) => {
        const clearLine = t.clear.length ? (
          <p className="flex items-start gap-2 pt-1 pb-2.5 text-[13px] leading-[18px] text-muted-foreground">
            <Check aria-hidden="true" className="mt-0.5 size-3.5 flex-none text-success" />
            <span>{t.clear.map((c) => c.title).join(" · ")}: all clear</span>
          </p>
        ) : null
        if (t.tier === "stop" && t.live.length === 0 && t.loading.length === 0) {
          return (
            <div key={t.tier}>
              <p className="flex items-center gap-2.5 border-t py-3 font-medium">
                <CircleCheck aria-hidden="true" className="size-4 text-success" />
                Nothing is stopping work
              </p>
              <div className="pl-6">{clearLine}</div>
            </div>
          )
        }
        return (
          <div key={t.tier}>
            <h3 className="border-t pt-3 pb-1.5 text-[12.5px] font-medium text-muted-foreground">
              {TIER_WORDS[t.tier]}
            </h3>
            {t.live.map((r) => (
              <Row
                key={r.id}
                row={r}
                open={open[r.id] === true}
                onToggle={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
              />
            ))}
            {t.loading.map((r) => (
              <Row key={r.id} row={r} open={false} onToggle={() => {}} />
            ))}
            {clearLine}
          </div>
        )
      })}
    </Section>
  )
}

function Row({ row: r, open, onToggle }: { row: AttentionRow; open: boolean; onToggle: () => void }) {
  const { icon: Icon, link } = ROW[r.id]!
  const foldable = !r.failed && r.items.length > 0
  return (
    <div className="relative">
      <Link
        {...link}
        className="-mx-2 grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-md p-2 no-underline hover:bg-row-hover"
      >
        <span
          className={cn(
            "grid size-8 place-items-center rounded-lg bg-muted [&_svg]:size-4",
            r.tier === "stop" && "bg-destructive-soft text-destructive",
            r.tier === "soon" && "bg-primary-muted text-primary",
          )}
        >
          <Icon aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{r.title}</span>
          <span
            className={cn(
              "mt-px block text-[13px] leading-[18px] text-muted-foreground",
              r.tier === "later" && "truncate",
            )}
          >
            {r.failed ? "Couldn’t check. It comes back when the service answers." : r.desc}
          </span>
          {!r.failed && r.age && !foldable ? <Age row={r} /> : null}
        </span>
        <span className="min-w-[26px] text-right text-xl leading-7 font-semibold tracking-[-0.02em] tabular-nums">
          {r.failed ? (
            <span className="text-[13px] leading-5 font-medium tracking-normal whitespace-nowrap text-muted-foreground">
              Couldn’t check
            </span>
          ) : r.n === undefined ? (
            <Bone kind="heading" className="ml-auto h-6 w-7" />
          ) : (
            r.n
          )}
        </span>
      </Link>
      {foldable ? (
        <>
          <div className="-mt-2 mb-1.5 ml-[42px] flex min-h-[26px] items-center gap-1.5">
            {r.age ? <Age row={r} inline /> : null}
            <button
              type="button"
              aria-expanded={open}
              onClick={onToggle}
              className="ml-auto inline-flex h-[26px] items-center gap-1 rounded-sm px-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {open ? "Hide" : r.items.length === 1 ? "Show it" : `Show these ${r.items.length}`}
              <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            </button>
          </div>
          {open ? (
            <ul className="mb-2 ml-[42px] border-l">
              {r.items.map((it, i) => (
                <li key={i}>
                  <Link
                    {...link}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 py-1.5 pl-2.5 text-[13px] leading-[18px] no-underline hover:bg-row-hover"
                  >
                    <b className="font-medium tabular-nums">{it.primary}</b>
                    {it.age ? (
                      <time className="row-span-2 self-center text-[12.5px] text-muted-foreground tabular-nums">
                        {it.age}
                      </time>
                    ) : null}
                    <small className="col-start-1 text-[12.5px] text-muted-foreground">{it.secondary}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function Age({ row, inline = false }: { row: AttentionRow; inline?: boolean }) {
  return (
    <span
      className={cn(
        "block text-[12.5px] text-muted-foreground",
        !inline && "mt-0.5",
        row.old && "font-medium text-accent2",
      )}
    >
      {row.age}
    </span>
  )
}
