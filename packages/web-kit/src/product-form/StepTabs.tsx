import { Check } from "lucide-react";

import { cn } from "@effy/design-system";

import { STEPS } from "./steps";

interface Props {
  step: number;
  disabled: boolean;
  onStep: (step: number) => void;
}

export function StepTabs({ step, disabled, onStep }: Props) {
  return (
    <nav aria-label="Steps" className="ef-tabs">
      {STEPS.map(({ title }, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <button
            key={title}
            type="button"
            disabled={i > step || disabled}
            onClick={() => onStep(i)}
            aria-current={active ? "step" : undefined}
            className={cn(
              "ef-tabs__tab disabled:cursor-default",
              active && "is-active",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "ef-tabs__count",
                done && "ef-tabs__count--primary",
              )}
            >
              {done ? <Check className="size-4" /> : i + 1}
            </span>
            {title}
            <span className="sr-only">
              {done ? " (done)" : active ? " (now)" : ""}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
