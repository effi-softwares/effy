import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The card and the OTP flow live in @effy/web-kit; here we mock the SDK boundary so this test
// exercises the REAL card wired to THIS surface's telemetry, branding, and `next` handling.
const { signIn, confirmSignIn, navigate } = vi.hoisted(() => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("aws-amplify/auth", () => ({
  signIn,
  confirmSignIn,
  signOut: vi.fn(),
  fetchAuthSession: vi.fn().mockResolvedValue({ tokens: undefined }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

import { SignInScreen } from "./SignInScreen";

function renderScreen(next?: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SignInScreen next={next} />
    </QueryClientProvider>,
  );
}

describe("SignInScreen (shop-web)", () => {
  it("advances from the email step to the OTP step after a code is sent", async () => {
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" } });
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByLabelText(/work email/i), "sam@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(expect.objectContaining({ username: "sam@effy.test" })),
    );
    expect(await screen.findByLabelText(/one-time code/i)).toBeInTheDocument();
  });

  // SC-010: the operator lands where they were headed, not on the dashboard.
  it("returns the operator to the intended destination after authenticating", async () => {
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" } });
    confirmSignIn.mockResolvedValue({ nextStep: { signInStep: "DONE" } });
    const user = userEvent.setup();
    renderScreen("/manager");

    await user.type(screen.getByLabelText(/work email/i), "sam@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));
    await user.type(await screen.findByLabelText(/one-time code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify & sign in/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/manager" }));
  });

  it("falls back to the dashboard when there is no intended destination", async () => {
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" } });
    confirmSignIn.mockResolvedValue({ nextStep: { signInStep: "DONE" } });
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByLabelText(/work email/i), "sam@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));
    await user.type(await screen.findByLabelText(/one-time code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify & sign in/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
  });

  it("carries this surface's brand", () => {
    renderScreen();
    expect(screen.getByText("Effy Shop")).toBeInTheDocument();
  });

  it("never renders a password field (passwordless only)", () => {
    renderScreen();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});
