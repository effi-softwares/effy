import { Moon, Sun } from "lucide-react";

import { Button } from "@effy/design-system/ui";

import type { Theme } from "../runtime/ui-store";

/**
 * The console header's appearance toggle — a 30px square bordered icon button, in the same place on
 * every screen (theme-adoption-prompt.md, Phase 1 §Theme mechanics).
 *
 * ⚠ WHY THIS EXISTS ALONGSIDE THE USER MENU'S APPEARANCE LIST, AND WHY THAT IS NOT TWO SOURCES FOR
 * ONE FACT. Both call the same `onSetTheme` against the same store; there is one value and one
 * writer. They answer different questions: this button flips light↔dark in one click, which is what
 * someone does when the light changes in the room, while the menu offers the three-way choice the
 * constitution requires — Light / Dark / Follow-System — which a two-state square cannot express.
 * Removing the menu would drop "follow the system"; removing this would bury a one-click action two
 * levels deep on every screen.
 *
 * ⚠ IT RESOLVES `system` BEFORE FLIPPING. Toggling from `system` sets the OPPOSITE of what is
 * currently on screen, not a fixed value — otherwise an operator whose OS is dark presses the button
 * and nothing appears to happen, because `system` and `dark` render identically.
 */
export interface ThemeToggleProps {
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
}

export function ThemeToggle({ theme, onSetTheme }: ThemeToggleProps) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={dark ? "Switch to light appearance" : "Switch to dark appearance"}
      title={dark ? "Light appearance" : "Dark appearance"}
      onClick={() => onSetTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun className="size-[15px]" /> : <Moon className="size-[15px]" />}
    </Button>
  );
}
