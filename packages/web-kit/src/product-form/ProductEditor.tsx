import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import {
  Progress,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
  useSidebar,
} from "@effy/design-system/ui";

import { Bone, FormSkeleton, Loading, SidebarEdgeToggle } from "../patterns";

import { StepRail } from "./StepRail";
import type { StepState } from "./steps";

/** The preview sidebar's width, and the window width below which it is a drawer instead. */
const PREVIEW_WIDTH = "360px";
const PREVIEW_DOCKED_FROM = 1280;

interface Props {
  steps: readonly StepState[];
  current: number;
  onStep: (index: number) => void;
  /** The step's own heading: the page's heading. */
  stepTitle: string;
  stepHint?: string;
  preview: ReactNode;
  /** The bar's left end: Back, Discard. */
  start: ReactNode;
  /** The bar's right end: the next action. */
  end: ReactNode;
  /** Beside the next action: when the draft was saved, what happens on send. */
  note?: ReactNode;
  /** Raise to bring the first field that needs attention into view and focus it. */
  reveal?: number;
  busy?: boolean;
  children: ReactNode;
}

/**
 * The product editor, filling the console's content area: the steps on the left, the step in the middle with its
 * button bar fixed along the column's bottom, and how shoppers will see the product in a right sidebar (shadcn's
 * Sidebar: open to start, hidden and shown by the circle on its edge; a drawer on a narrower screen).
 */
export function ProductEditor(props: Props) {
  return (
    <SidebarProvider
      className="ef-editor min-h-0"
      style={{ "--sidebar-width": PREVIEW_WIDTH } as CSSProperties}
      mobileBreakpoint={PREVIEW_DOCKED_FROM}
      keyboardShortcut={null}
    >
      <Editor {...props} />
    </SidebarProvider>
  );
}

function Editor({
  steps,
  current,
  onStep,
  stepTitle,
  stepHint,
  preview,
  start,
  end,
  note,
  reveal = 0,
  busy,
  children,
}: Props) {
  const scroll = useRef<HTMLDivElement>(null);
  const { setOpenMobile } = useSidebar();

  // A new step starts at its top, with the preview drawer out of the way.
  useEffect(() => {
    scroll.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    setOpenMobile(false);
  }, [current]);

  // "Next" with something missing: bring the first field that says so into view.
  useEffect(() => {
    if (reveal === 0) return;
    const id = requestAnimationFrame(() => {
      setOpenMobile(false);
      const bad = scroll.current?.querySelector<HTMLElement>(
        '[aria-invalid="true"], [data-invalid="true"]',
      );
      if (!bad) return;
      bad.scrollIntoView({ block: "center" });
      const target = bad.matches("input, textarea, select, button, [tabindex]")
        ? bad
        : bad.querySelector<HTMLElement>("input, textarea, select, button");
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [reveal]);

  const done = steps.filter((s) => s.status === "done").length;

  return (
    <>
      <aside className="ef-editor__rail">
        <StepRail steps={steps} onStep={onStep} disabled={busy} />
      </aside>

      <section className="ef-editor__main" aria-labelledby="ef-editor-title">
        <div ref={scroll} className="ef-editor__scroll">
          <div className="ef-editor__compact">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                Step {current + 1} of {steps.length}
              </span>
              <span className="text-muted-foreground">
                {done} of {steps.length - 1} done
              </span>
            </div>
            <Progress
              value={((current + 1) / steps.length) * 100}
              tone="brand"
              height={4}
              label="Steps"
            />
          </div>
          <div key={current} className="ef-editor__step">
            <div className="ef-editor__head">
              <span className="ef-editor__eyebrow">
                Step {current + 1} of {steps.length}
              </span>
              <h1 id="ef-editor-title" className="ef-editor__title">
                {stepTitle}
              </h1>
              {stepHint ? <p className="ef-editor__hint">{stepHint}</p> : null}
            </div>
            {children}
          </div>
        </div>
        <div className="ef-editor__bar">
          {start}
          <span className="ef-editor__note">{note}</span>
          {end}
        </div>
      </section>

      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="top-(--header-h) h-auto"
        aria-label="Preview"
      >
        <SidebarHeader className="mt-5 h-11 flex-row items-center py-0 pr-5 pl-8">
          <h2 className="text-sm font-semibold">How shoppers see it</h2>
        </SidebarHeader>
        <SidebarContent className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{preview}</SidebarContent>
      </Sidebar>
      <SidebarEdgeToggle showLabel="Show the preview" hideLabel="Hide the preview" />
    </>
  );
}

/** The editor while it reads: the same rail, step, bar and preview, with bones where values will be. */
export function ProductEditorSkeleton({ steps }: { steps: readonly string[] }) {
  return (
    <Loading label="Loading the product form">
      <div className="ef-editor" inert>
        <aside className="ef-editor__rail">
          <ol className="ef-steps">
            {steps.map((title, i) => (
              <li key={title} className="ef-steps__item" data-status={i === 0 ? "current" : "todo"}>
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <span className="ef-steps__dot">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="ef-steps__title">{title}</span>
                    <Bone className="mt-1.5 w-24" />
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </aside>
        <section className="ef-editor__main">
          <div className="ef-editor__scroll">
            <div className="ef-editor__step">
              <div className="ef-editor__head">
                <Bone className="w-20" />
                <Bone kind="heading" className="w-56" />
                <Bone className="w-80" />
              </div>
              <FormSkeleton fields={4} submit={false} />
            </div>
          </div>
          <div className="ef-editor__bar">
            <Bone kind="control" className="w-24" />
            <Bone kind="control" className="ml-auto w-44" />
          </div>
        </section>
        <aside className="ef-editor__preview-bones">
          <Bone className="w-36" />
          <Bone kind="control" className="mt-4 w-full" />
          <Bone kind="block" className="mt-4 h-72" />
        </aside>
      </div>
    </Loading>
  );
}
