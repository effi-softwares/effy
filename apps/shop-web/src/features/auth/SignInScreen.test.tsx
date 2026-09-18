import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

// The card and the OTP flow live in @effy/web-kit; here we mock the SDK boundary so this test
// exercises the REAL card wired to THIS surface's telemetry, branding, and `next` handling.
const { signIn, confirmSignIn, navigate, fetchAuthSession } = vi.hoisted(() => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  navigate: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

vi.mock("aws-amplify/auth", () => ({
  signIn,
  confirmSignIn,
  signOut: vi.fn(),
  fetchAuthSession,
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

import { sessionQuery } from "./queries";
import { SignInScreen } from "./SignInScreen";

function renderScreen(next?: string, client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <SignInScreen next={next} />
    </QueryClientProvider>,
  );
}

describe("SignInScreen (shop-web)", () => {
  beforeEach(() => {
    fetchAuthSession.mockReset().mockResolvedValue({ tokens: undefined });
  });

  // ⚠ The live defect: sign-out (or the guard that sent the operator here) leaves `signed-out` in the
  // cache, and nothing on this page observes the session. Reading it back without a forced fetch gave
  // the guard that stale answer, so a correct code bounced the operator back to sign-in.
  it("replaces a cached signed-out session with the fresh one after authenticating", async () => {
    const client = new QueryClient();
    client.setQueryData(sessionQuery.queryKey, { status: "signed-out" });
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE" } });
    confirmSignIn.mockImplementation(async () => {
      fetchAuthSession.mockResolvedValue({
        tokens: { accessToken: { payload: { sub: "sub-1", "cognito:groups": [] } } },
      });
      return { nextStep: { signInStep: "DONE" } };
    });
    const user = userEvent.setup();
    renderScreen(undefined, client);

    await user.type(screen.getByLabelText(/work email/i), "sam@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));
    await user.type(await screen.findByLabelText(/one-time code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify & sign in/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));
    expect(client.getQueryData(sessionQuery.queryKey)).toMatchObject({ status: "signed-in" });
  });

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

  /**
   * ⚠ 057 MOVED THE BRAND LOCKUP UP INTO THE AUTH LAYOUT, which is where the imported design puts it
   * — above the heading, not inside the form. This test renders the SCREEN alone, so it can no longer
   * see it. Rather than delete the guarantee, the assertion splits in two: the screen must still say
   * which surface this is in words an operator reads, and the layout must still render the lockup
   * (checked from source, since the route component is not independently renderable here).
   */
  it("says which surface this is", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/access your shop/i)).toBeInTheDocument();
  });

  it("keeps the brand lockup on the sign-in route", () => {
    const layout = readFileSync(resolve(__dirname, "../../routes/auth.tsx"), "utf8");
    expect(layout).toContain("Effy Shop Console");
  });

  it("never renders a password field (passwordless only)", () => {
    renderScreen();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});
