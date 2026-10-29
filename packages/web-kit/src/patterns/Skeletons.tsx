import type { CSSProperties, ReactNode } from "react";

import { cn } from "@effy/design-system";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui";

import type { HeaderBack } from "../console/StaffHeader";
import { PageHeader } from "./Page";
import { DetailRows, Panel } from "./Panel";

/**
 * Loading shapes (Patterns board, "States"). A page that is still reading is drawn with the SAME pattern
 * components the loaded page uses — `PageHeader`, `Panel`, `DetailRows`, the tabs bar, a table's own head —
 * with a `Bone` where a value will be, and with every label the page already knows (a panel's title, a
 * tab's name, a column head) written out. A skeleton has the page's structure by construction; there is no
 * free-standing grey slab (`skeletons.guard.test.ts` keeps `Skeleton` out of the screens).
 *
 * A page's skeleton goes inside `Loading`: one "Loading" announcement for assistive tech, the bones hidden
 * from it, and no box of its own, so the page's own gaps apply. Bones wait 120ms before they show, so a
 * quick read never flashes grey.
 */

/** The bar widths a run of bones cycles through, so a list reads as text rather than as stripes. */
const WIDTHS = ["w-3/5", "w-2/5", "w-1/2", "w-3/4", "w-1/3", "w-2/3"] as const;
export const boneWidth = (i: number): string => WIDTHS[i % WIDTHS.length]!;

const BONE = {
  /** A line of body text (14–16px). */
  text: "h-4",
  /** A line of small print (12px). */
  small: "h-3",
  /** A page title (24/32). */
  title: "h-7",
  /** A panel or section title (16/24). */
  heading: "h-5",
  /** A button, an input or a select. */
  control: "h-10 rounded-lg",
  /** A badge or a status pill. */
  chip: "h-6 w-16",
  avatar: "size-8 shrink-0 rounded-full",
  /** A product picture in a row. */
  thumb: "size-11 shrink-0 rounded-lg",
  /** A row's leading icon tile. */
  icon: "size-9 shrink-0 rounded-lg",
  /** A figure, a chart, a picture: the caller gives the height. */
  block: "w-full rounded-lg",
} as const;
export type BoneKind = keyof typeof BONE;

/** One placeholder where a value will be. Width (and a block's height) from `className`. */
export function Bone({
  kind = "text",
  className,
  style,
}: {
  kind?: BoneKind;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      data-slot="skeleton"
      className={cn("ef-bone", BONE[kind], className)}
      style={style}
    />
  );
}

/** A paragraph: `count` lines, the last one short. */
export function BoneLines({
  count = 2,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <span className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: count }, (_, i) => (
        <Bone
          key={i}
          className={i === count - 1 && count > 1 ? "w-2/5" : "w-full"}
        />
      ))}
    </span>
  );
}

/** The live region a skeleton is drawn in. No box: it takes its parent's layout. */
export function Loading({
  label = "Loading",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className="contents">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** The page head while it reads: the back link is real, the title and its line are bones. */
export function PageHeaderSkeleton({
  back,
  title,
  description = true,
  meta = 0,
  actions = 0,
}: {
  back?: HeaderBack;
  /** The title, when the page knows it before it reads (a settings page, a report). */
  title?: ReactNode;
  description?: boolean;
  /** How many meta items sit under the title. */
  meta?: number;
  /** How many buttons sit on the right. */
  actions?: number;
}) {
  return (
    <PageHeader
      back={back}
      title={title ?? <Bone kind="title" className="w-64 max-w-full" />}
      description={
        description ? <Bone className="mt-1 w-96 max-w-full" /> : undefined
      }
      meta={
        meta > 0
          ? Array.from({ length: meta }, (_, i) => (
              <Bone key={i} className={i % 2 ? "w-36" : "w-28"} />
            ))
          : undefined
      }
      actions={
        actions > 0
          ? Array.from({ length: actions }, (_, i) => (
              <Bone
                key={i}
                kind="control"
                className={i === actions - 1 ? "w-10" : "w-36"}
              />
            ))
          : undefined
      }
    />
  );
}

/** The tabs bar with its real tab names; the first is the one shown. Inert: nothing to switch to yet. */
export function TabsSkeleton({ tabs }: { tabs: readonly ReactNode[] }) {
  return (
    <div className="ef-tabsbar" inert>
      <div className="ef-tabsbar__list">
        <Tabs value="0">
          <TabsList>
            {tabs.map((t, i) => (
              <TabsTrigger key={i} value={String(i)} tabIndex={-1}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}

/** Label / value rows: the labels the page knows (or bones), a bone for each value. */
export function DetailRowsSkeleton({
  labels,
  rows = 4,
  tight,
}: {
  labels?: readonly ReactNode[];
  rows?: number;
  tight?: boolean;
}) {
  const n = labels?.length ?? rows;
  return (
    <DetailRows
      tight={tight}
      rows={Array.from({ length: n }, (_, i) => ({
        key: String(i),
        label: labels?.[i] ?? <Bone className="w-20" />,
        value: <Bone className={boneWidth(i)} />,
      }))}
    />
  );
}

/**
 * Rows of a list (people, packages, shops): an optional picture, one or two lines, an optional thing on the
 * right. `inset` pads the rows to a flush panel's edge.
 */
export function ListSkeleton({
  rows = 4,
  media,
  lines = 2,
  trailing,
  inset = false,
}: {
  rows?: number;
  media?: "avatar" | "thumb" | "icon";
  lines?: 1 | 2;
  trailing?: "chip" | "control" | "text";
  inset?: boolean;
}) {
  return (
    <div className="flex flex-col divide-y">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cn(
            "flex min-h-14 items-center gap-3 py-3",
            inset && "px-5",
          )}
        >
          {media ? <Bone kind={media} /> : null}
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <Bone className={cn("max-w-64", boneWidth(i))} />
            {lines === 2 ? (
              <Bone kind="small" className={cn("max-w-48", boneWidth(i + 3))} />
            ) : null}
          </span>
          {trailing === "chip" ? <Bone kind="chip" /> : null}
          {trailing === "control" ? (
            <Bone kind="control" className="w-24" />
          ) : null}
          {trailing === "text" ? <Bone className="w-16" /> : null}
        </div>
      ))}
    </div>
  );
}

/** Label-over-control fields, then the form's button. */
export function FormSkeleton({
  labels,
  fields = 4,
  submit = true,
  className,
}: {
  labels?: readonly ReactNode[];
  fields?: number;
  submit?: boolean;
  className?: string;
}) {
  const n = labels?.length ?? fields;
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          {labels?.[i] ? (
            <span className="text-sm font-medium">{labels[i]}</span>
          ) : (
            <Bone className="w-28" />
          )}
          <Bone kind="control" className="w-full" />
        </div>
      ))}
      {submit ? <Bone kind="control" className="w-28" /> : null}
    </div>
  );
}

/** A panel while it reads: the real panel, its title when known, rows inside by default. */
export function PanelSkeleton({
  title,
  description = false,
  icon,
  flush = false,
  rows = 4,
  footer = false,
  className,
  children,
}: {
  /** The panel's title when it is fixed text; else a bone. */
  title?: ReactNode;
  /** Its fixed description, or `true` for a bone line. */
  description?: ReactNode;
  icon?: ReactNode;
  flush?: boolean;
  rows?: number;
  /** The panel has a foot with its own Save. */
  footer?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Panel
      footer={footer ? <Bone kind="control" className="w-28" /> : undefined}
      title={title ?? <Bone kind="heading" className="w-40" />}
      description={
        description === true ? (
          <Bone kind="small" className="mt-1 w-72 max-w-full" />
        ) : (
          description || undefined
        )
      }
      icon={icon}
      flush={flush}
      className={className}
    >
      {children ??
        (flush ? (
          <ListSkeleton rows={rows} inset />
        ) : (
          <DetailRowsSkeleton rows={rows} />
        ))}
    </Panel>
  );
}

/** The body rows of a table while it reads — one bone per cell. Shared by `TableSkeleton` and the data tables. */
export function SkeletonRows({
  rows,
  columns,
  cellClassName,
}: {
  rows: number;
  columns: number;
  /** Each column's own classes (its priority), so a bone column hides where the real one does. */
  cellClassName?: readonly (string | undefined)[];
}) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <TableRow
          key={`s${i}`}
          className="hover:bg-transparent"
          aria-hidden="true"
        >
          {Array.from({ length: columns }, (_, j) => (
            <TableCell
              key={j}
              className={cellClassName?.[j]}
              {...(j === 0 ? { "data-m": "primary" } : { "data-m": "meta" })}
            >
              <Bone
                className={
                  j === 0
                    ? cn("max-w-40", boneWidth(i))
                    : cn("max-w-24", boneWidth(i + j))
                }
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** A board's raw table while it reads: its real column heads, bone rows. */
export function TableSkeleton({
  columns,
  rows = 5,
  framed = false,
}: {
  columns: readonly ReactNode[];
  rows?: number;
  framed?: boolean;
}) {
  return (
    <div className={cn(framed && "overflow-hidden rounded-lg border bg-card")}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c, i) => (
              <TableHead key={i}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <SkeletonRows rows={rows} columns={columns.length} />
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * A record page (an order, a shop, a driver): the head, then the `ef-detail` main column and its aside.
 * The defaults are a tabs bar (when named), one panel of rows, and two short panels beside it.
 */
export function DetailPageSkeleton({
  back,
  title,
  description = false,
  meta = 2,
  actions = 1,
  tabs,
  main,
  aside,
  asideFirst = false,
  label,
}: {
  back?: HeaderBack;
  title?: ReactNode;
  /** A line under the title (most record pages have meta instead). */
  description?: boolean;
  meta?: number;
  actions?: number;
  tabs?: readonly ReactNode[];
  main?: ReactNode;
  /** `null` for a page with no aside. */
  aside?: ReactNode | null;
  /** The aside comes first on a phone, as on the loaded page. */
  asideFirst?: boolean;
  label?: string;
}) {
  return (
    <Loading label={label}>
      <PageHeaderSkeleton
        back={back}
        title={title}
        description={description}
        meta={meta}
        actions={actions}
      />
      <div className="ef-detail">
        <div className="ef-detail__main">
          {tabs ? <TabsSkeleton tabs={tabs} /> : null}
          {main ?? <PanelSkeleton rows={6} />}
        </div>
        {aside === null ? null : (
          <aside className={cn("ef-detail__aside", asideFirst && "is-first")}>
            {aside ?? (
              <>
                <PanelSkeleton rows={3} />
                <PanelSkeleton rows={3} />
              </>
            )}
          </aside>
        )}
      </div>
    </Loading>
  );
}
