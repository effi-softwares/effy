import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The card and the OTP flow live in @effy/web-kit; here we mock the SDK boundary so this test
// exercises the REAL card wired to THIS surface's telemetry and branding. (The card's own
// two-step/error behavior is tested in @effy/web-kit.)
const { signIn, confirmSignIn } = vi.hoisted(() => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
}));

vi.mock("aws-amplify/auth", () => ({
  signIn,
  confirmSignIn,
  signOut: vi.fn(),
  fetchAuthSession: vi.fn().mockResolvedValue({ tokens: undefined }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

import { SignInScreen } from "./SignInScreen";

function renderScreen() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SignInScreen />
    </QueryClientProvider>,
  );
}

describe("SignInScreen", () => {
  it("advances from the email step to the OTP step after a code is sent", async () => {
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" } });
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByLabelText(/work email/i), "op@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        expect.objectContaining({ username: "op@effy.test" }),
      ),
    );
    expect(await screen.findByLabelText(/one-time code/i)).toBeInTheDocument();
  });

  it("carries this surface's brand", () => {
    renderScreen();
    expect(screen.getByText("Effy Back-Office")).toBeInTheDocument();
  });

  it("never renders a password field (passwordless only)", () => {
    renderScreen();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});
