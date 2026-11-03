import { useState, type ComponentType, type ReactNode } from "react";

import { Link, useBlocker, useRouter, type LinkProps } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { cn } from "@effy/design-system";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  buttonVariants,
} from "@effy/design-system/ui";

import { ActionBarButton, useActionBar } from "../action-bar";

/**
 * THE consoles' settings layout (shop-web and back-office): each section is a ruled band - its title and a sentence on
 * the left, its controls on the right (stacked below 1024px). Rows inside a `SettingsList` share one border, so a page
 * reads as a few lists, not a stack of boxes. Unsaved changes are said on the console's one action bar
 * (`SettingsSaveBar`, Discard · Save), and leaving the page with them asks first (`useLeaveGuard`).
 */
export function SettingsPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 gap-0", className)}>{children}</div>;
}

export function SettingsSection({
  title,
  description,
  children,
  tour,
  id,
}: {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  /** A guided-tour key (106/107). */
  tour?: string;
  /** An anchor, so a link can open the page at this section. */
  id?: string;
}) {
  return (
    <section
      id={id}
      data-tour={tour}
      className="grid scroll-mt-24 gap-x-10 gap-y-4 border-t py-8 first:border-t-0 first:pt-2 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"
    >
      <div className="grid content-start gap-1">
        <h2 className="text-base leading-6 font-semibold">{title}</h2>
        <div className="text-sm text-pretty text-muted-foreground">{description}</div>
      </div>
      <div className="grid min-w-0 content-start gap-3">{children}</div>
    </section>
  );
}

export function SettingsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("divide-y overflow-hidden rounded-lg border bg-card text-card-foreground", className)}>
      {children}
    </div>
  );
}

/** A row: what it is (and a line of help), the control on the right; below 640px the control drops under. */
export function SettingsRow({
  label,
  hint,
  htmlFor,
  leading,
  children,
  className,
  tour,
  error,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  leading?: ReactNode;
  children?: ReactNode;
  className?: string;
  tour?: string;
  /** The server's refusal of this row's value; replaces the hint, said in the problem colour. */
  error?: string | null;
}) {
  const Title = htmlFor ? "label" : "div";
  return (
    <div
      data-tour={tour}
      className={cn("flex min-h-16 flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3", className)}
    >
      {leading}
      <div className="grid min-w-0 flex-[1_1_16rem] gap-0.5">
        <Title htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Title>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : hint ? (
          <p className="text-sm text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** A small heading inside a list, naming the rows under it. */
export function SettingsListHeading({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/50 px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </div>
  );
}

/** The square icon tile a row leads with. */
export function SettingsIcon({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "on" | "off" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5",
        tone === "on" && "bg-success-soft text-success",
        tone === "off" && "bg-destructive-soft text-destructive",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** A row that opens another settings page: its icon, name and sentence, and a chevron. The whole row is the link. */
export function SettingsLinkRow({
  link,
  icon: Icon,
  label,
  hint,
  tour,
}: {
  link: LinkProps;
  icon: ComponentType<{ className?: string }>;
  label: ReactNode;
  hint: ReactNode;
  tour?: string;
}) {
  return (
    <Link
      {...link}
      data-tour={tour}
      className="flex min-h-16 items-center gap-4 px-4 py-3 text-foreground no-underline outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <SettingsIcon>
        <Icon />
      </SettingsIcon>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** Read-only: said once at the top of a page the viewer may read but not change. */
export function SettingsReadOnly({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="mb-2 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * The page's unsaved changes, on the console's one action bar: "Unsaved changes", Discard and Save (Shopify's
 * contextual save bar - strong verbs, no nouns). It shows only while the page is dirty; the page keeps room for it at
 * its end. Leaving the page while dirty asks first.
 */
export function SettingsSaveBar({
  dirty,
  saving,
  canSave = true,
  onSave,
  onDiscard,
  message,
}: {
  dirty: boolean;
  saving: boolean;
  /** False while a value is not yet valid: Save stays off. */
  canSave?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** Replaces "Unsaved changes", e.g. with why Save is off. */
  message?: string | null;
}) {
  const bar = useActionBar({
    open: dirty,
    label: "Unsaved changes",
    busy: saving,
    children: (
      <>
        <span className="min-w-0 truncate text-sm font-medium">{message ?? "Unsaved changes"}</span>
        <ActionBarButton onClick={onDiscard} disabled={saving}>
          Discard
        </ActionBarButton>
        <ActionBarButton
          onClick={onSave}
          disabled={saving || !canSave}
          className="border-transparent bg-background text-foreground hover:bg-background/90 hover:text-foreground dark:bg-background dark:hover:bg-background/90"
        >
          {saving ? "Saving…" : "Save"}
        </ActionBarButton>
      </>
    ),
  });
  return (
    <>
      <div aria-hidden="true" className="h-24" />
      {bar}
      <LeaveGuard dirty={dirty && !saving} />
    </>
  );
}

/** Asks before the page is left - by a link, Back, or closing the tab - while it has unsaved changes. */
function LeaveGuard({ dirty }: { dirty: boolean }) {
  // A screen rendered on its own (a test) has no router to leave.
  return useRouter({ warn: false }) ? <RouterLeaveGuard dirty={dirty} /> : null;
}

function RouterLeaveGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker({ shouldBlockFn: () => dirty, enableBeforeUnload: () => dirty, withResolver: true });
  return (
    <AlertDialog open={blocker.status === "blocked"} onOpenChange={(open) => (open ? null : blocker.reset?.())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          <AlertDialogDescription>The changes on this page haven&apos;t been saved and will be lost.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={() => blocker.proceed?.()}
          >
            Leave
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const same = (a: unknown, b: unknown) => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);

/**
 * A settings page's form: the server's values with the person's edits laid over them. While nothing is edited the
 * page follows the server (a refetch or a live update shows at once); an edit is kept until it is saved or discarded.
 * `dirty` is true only while some edit differs from the server's value, so typing a value back clears the bar.
 */
export function useSettingsDraft<T extends object>(source: T | undefined) {
  const [edits, setEdits] = useState<Partial<T>>({});
  const value = source ? ({ ...source, ...edits } as T) : undefined;
  const changed = source
    ? (Object.keys(edits) as (keyof T)[]).filter((k) => !same(edits[k], source[k]))
    : [];
  return {
    /** The form's values; undefined until the server has answered. */
    value,
    dirty: changed.length > 0,
    /** Which fields differ from the server's values. */
    changed,
    set: <K extends keyof T>(key: K, next: T[K]) => setEdits((e) => ({ ...e, [key]: next })),
    /** Back to the server's values (Discard, or after a save). */
    discard: () => setEdits({}),
  };
}
