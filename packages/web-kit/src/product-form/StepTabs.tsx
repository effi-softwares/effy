import { Check } from "lucide-react";

import { Tabs, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui";

import { STEPS } from "./steps";

interface Props {
  step: number;
  disabled: boolean;
  onStep: (step: number) => void;
}

export function StepTabs({ step, disabled, onStep }: Props) {
  return (
    <Tabs
      value={String(step)}
      onValueChange={(v) => onStep(Number(v))}
      activationMode="manual"
    >
      <TabsList aria-label="Steps">
        {STEPS.map(({ title }, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <TabsTrigger
              key={title}
              value={String(i)}
              disabled={i > step || disabled}
              aria-current={active ? "step" : undefined}
            >
              <TabsCount aria-hidden="true" tone={done ? "primary" : undefined}>
                {done ? <Check className="size-4" /> : i + 1}
              </TabsCount>
              {title}
              <span className="sr-only">
                {done ? " (done)" : active ? " (now)" : ""}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
