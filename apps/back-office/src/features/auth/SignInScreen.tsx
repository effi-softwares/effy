import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { track } from "@/lib/telemetry";

import { sessionQuery } from "./queries";
import { startSignIn, submitOtp } from "./repo";

type Step = "email" | "otp";

export function SignInScreen({ next }: { next?: string }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function finish() {
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
    // US1 has a single protected route; multi-route `next`-return arrives with US2+.
    void next;
    navigate({ to: "/" });
  }

  const emailForm = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      setFormError(null);
      track({ name: "auth_sign_in_started" });
      try {
        const trimmed = value.email.trim();
        const outcome = await startSignIn(trimmed);
        setEmail(trimmed);
        if (outcome === "otp-required") setStep("otp");
        else await finish();
      } catch {
        // Uniform response — never an account-existence oracle (spec edge case).
        setFormError("We couldn't send a code. Check the email address and try again.");
        track({ name: "auth_sign_in_failed", reason: "start" });
      }
    },
  });

  const otpForm = useForm({
    defaultValues: { code: "" },
    onSubmit: async ({ value }) => {
      setFormError(null);
      track({ name: "auth_otp_submitted" });
      try {
        await submitOtp(value.code.trim());
        await finish();
      } catch (err) {
        setFormError(otpErrorMessage(err));
        track({ name: "auth_sign_in_failed", reason: "otp" });
      }
    },
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-primary">Effy Back-Office</CardTitle>
        <CardDescription>
          {step === "email"
            ? "Sign in with your work email — we'll send a one-time code."
            : `Enter the code we sent to ${email}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "email" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void emailForm.handleSubmit();
            }}
            className="space-y-4"
            noValidate
          >
            <emailForm.Field name="email">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </emailForm.Field>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <emailForm.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Sending…" : "Send code"}
                </Button>
              )}
            </emailForm.Subscribe>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void otpForm.handleSubmit();
            }}
            className="space-y-4"
            noValidate
          >
            <otpForm.Field name="code">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="code">One-time code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </otpForm.Field>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <otpForm.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Verifying…" : "Verify & sign in"}
                </Button>
              )}
            </otpForm.Subscribe>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setFormError(null);
                setStep("email");
              }}
            >
              Use a different email
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function otpErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    case "CodeMismatchException":
      return "That code isn't right. Please try again.";
    case "ExpiredCodeException":
      return "That code expired. Request a new one.";
    case "LimitExceededException":
    case "TooManyRequestsException":
    case "TooManyFailedAttemptsException":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "We couldn't verify that code. Please try again.";
  }
}
