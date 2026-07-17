import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@effy/design-system/ui";

import type { Theme } from "../runtime/ui-store";
import { ConsoleUserMenu } from "./ConsoleUserMenu";

function wrap(email: string, opts: { theme?: Theme; onSetTheme?: (t: Theme) => void } = {}) {
  return render(
    <SidebarProvider>
      <ConsoleUserMenu
        email={email}
        theme={opts.theme ?? "system"}
        onSetTheme={opts.onSetTheme ?? vi.fn()}
        onSignOut={vi.fn()}
      />
    </SidebarProvider>,
  );
}

describe("ConsoleUserMenu (sidebar footer)", () => {
  it("renders the verified identity", () => {
    wrap("ops@effy.test");
    expect(screen.getByText("ops@effy.test")).toBeInTheDocument();
  });

  it("derives a display name from the email's local part", () => {
    wrap("ops@effy.test");
    expect(screen.getByText("ops")).toBeInTheDocument();
  });

  it("degrades gracefully when the session carries no email", () => {
    wrap("");
    expect(screen.getByText("Signed in")).toBeInTheDocument();
  });

  // The 3-way appearance menu (Light/Dark/System) lives in the Radix DropdownMenu content, which
  // does not open under jsdom's fireEvent — the open/select path is validated live (quickstart §3)
  // and the mode logic is unit-tested in runtime/ui-store.test.ts. Here we only assert the menu
  // accepts the tri-state contract and renders.
  it("accepts a tri-state appearance mode without error", () => {
    const onSetTheme = vi.fn();
    for (const theme of ["light", "dark", "system"] as const) {
      const { unmount } = wrap("ops@effy.test", { theme, onSetTheme });
      expect(screen.getByText("ops@effy.test")).toBeInTheDocument();
      unmount();
    }
  });
});
