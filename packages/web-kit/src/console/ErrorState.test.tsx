import type { DomainError } from "@effy/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorState } from "./ErrorState";

function domainError(kind: DomainError["kind"], status: number): DomainError {
  return { kind, status, title: "t", detail: "SELECT * FROM public.store_staff failed" };
}

describe("ErrorState", () => {
  it("offers a retry for a degraded backend (cold start is expected, not a bug)", async () => {
    const onRetry = vi.fn();
    render(<ErrorState error={domainError("unavailable", 503)} onRetry={onRetry} />);
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not offer a retry for a denial — a 403 is a correct answer", () => {
    render(<ErrorState error={domainError("forbidden", 403)} onRetry={vi.fn()} />);
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("routes an expired session to sign-in copy, not a retry", () => {
    render(<ErrorState error={domainError("unauthenticated", 401)} onRetry={vi.fn()} />);
    expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  // The whole point of the contract: internal detail never reaches the DOM.
  it("never renders the problem detail, status code, or any internal string", () => {
    const { container } = render(<ErrorState error={domainError("unavailable", 503)} />);
    expect(container.textContent).not.toMatch(/SELECT|store_staff|503/);
  });

  it("treats a non-DomainError throw as a generic failure rather than crashing", () => {
    render(<ErrorState error={new Error("kaboom")} />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.queryByText(/kaboom/)).not.toBeInTheDocument();
  });

  it("accepts screen-specific denial copy", () => {
    render(
      <ErrorState error={domainError("forbidden", 403)} forbiddenMessage="Managers only." />,
    );
    expect(screen.getByText("Managers only.")).toBeInTheDocument();
  });
});
