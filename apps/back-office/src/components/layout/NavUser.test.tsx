import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// NavUser reads sign-out via router navigation; stub the router hook (no RouterProvider in unit
// tests). Everything else is real (SidebarProvider supplies the sidebar context).
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
}));

import { SidebarProvider } from "@/components/ui/sidebar";
import type { Session } from "@/features/auth/model";
import { sessionQuery } from "@/features/auth/queries";

import { NavUser } from "./NavUser";

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Seed the session cache directly (server-state SSOT) rather than hitting Amplify.
  const session: Session = {
    status: "signed-in",
    identity: { subject: "sub-1", email: "ops@effy.test", roles: [] },
  };
  qc.setQueryData(sessionQuery.queryKey, session);
  return render(
    <QueryClientProvider client={qc}>
      <SidebarProvider>{children}</SidebarProvider>
    </QueryClientProvider>,
  );
}

describe("NavUser (sidebar footer)", () => {
  it("renders the verified identity from the session", () => {
    wrap(<NavUser />);
    expect(screen.getByText("ops@effy.test")).toBeInTheDocument();
  });
});
