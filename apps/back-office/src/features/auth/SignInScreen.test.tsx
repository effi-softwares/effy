import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { startSignIn, submitOtp } = vi.hoisted(() => ({
  startSignIn: vi.fn(),
  submitOtp: vi.fn(),
}));

vi.mock("./repo", () => ({
  startSignIn,
  submitOtp,
  loadSession: vi.fn().mockResolvedValue({ status: "signed-out" }),
  signOutUser: vi.fn(),
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
    startSignIn.mockResolvedValue("otp-required");
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByLabelText(/work email/i), "op@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));

    await waitFor(() => expect(startSignIn).toHaveBeenCalledWith("op@effy.test"));
    expect(await screen.findByLabelText(/one-time code/i)).toBeInTheDocument();
  });

  it("never renders a password field (passwordless only)", () => {
    renderScreen();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});
