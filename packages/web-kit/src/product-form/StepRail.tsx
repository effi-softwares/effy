import { Check } from "lucide-react";

import { Button } from "@effy/design-system/ui";

import type { StepState } from "./steps";

interface Props {
  steps: readonly StepState[];
  onStep: (index: number) => void;
  disabled?: boolean;
}

/**
 * The editor's steps, top to bottom. Every step can be opened; each says what it holds so far, or what still
 * needs doing once you have been there.
 */
export function StepRail({ steps, onStep, disabled }: Props) {
  return (
    <nav aria-label="Steps">
      <ol className="ef-steps">
        {steps.map((s, i) => {
          const next = steps[i + 1];
          return (
            <li
              key={s.key}
              className="ef-steps__item"
              data-status={s.status}
              data-line={
                s.status === "done" && next && next.status !== "todo"
                  ? "done"
                  : undefined
              }
            >
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                aria-current={s.status === "current" ? "step" : undefined}
                onClick={() => onStep(i)}
                className="h-auto w-full items-start justify-start gap-3 px-3 py-2.5 text-left whitespace-normal aria-[current=step]:bg-accent"
              >
                <span className="ef-steps__dot" aria-hidden="true">
                  {s.status === "done" ? (
                    <Check className="size-4" />
                  ) : s.status === "issue" ? (
                    "!"
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="ef-steps__title">{s.title}</span>
                  <span className="ef-steps__sub">{s.summary}</span>
                </span>
                <span className="sr-only">
                  {s.status === "done"
                    ? " (done)"
                    : s.status === "issue"
                      ? " (needs attention)"
                      : s.status === "current"
                        ? " (now)"
                        : ""}
                </span>
              </Button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
