import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@effy/design-system/ui";

import { ConsoleUserMenu } from "./ConsoleUserMenu";

function wrap(email: string) {
  return render(
    <SidebarProvider>
      <ConsoleUserMenu
        email={email}
        theme="light"
        onToggleTheme={vi.fn()}
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
});
