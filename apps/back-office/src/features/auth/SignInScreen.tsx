import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { MapPinned, Package, Truck, type LucideIcon } from "lucide-react";

import { OtpSignInCard } from "@effy/web-kit/console";

import { track } from "@/lib/telemetry";

import { sessionQuery } from "./queries";

// The passwordless card (two-step email → code, uniform error copy, no password field) is shared;
// navigation and this surface's analytics taxonomy are not.
export function SignInScreen({ next }: { next?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function finish() {
    // ⚠ A FORCED FETCH, NOT invalidate. Nothing on the sign-in page observes the session, so
    // `invalidateQueries` refetches nothing; the guard's `ensureQueryData` then returned the cached
    // "signed-out" and bounced a freshly-authenticated operator back to sign-in.
    await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 });
    // US1 has a single protected route; multi-route `next`-return arrives with US2+.
    void next;
    navigate({ to: "/" });
  }

  // The redesign's sign-in (boards "Sign in — work email" / "— one-time code"): the form in the left
  // column under the mark, and on a wide screen a muted aside saying what the console is for.
  return (
    <div className="grid min-h-dvh grid-cols-[repeat(auto-fit,minmax(min(100%,480px),1fr))] bg-background">
      <section className="flex min-h-dvh flex-col p-8 max-sm:p-5">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="bo-logo">
            e<b>.</b>
          </span>
          <span className="font-semibold">Effy</span>
          <span className="text-muted-foreground">Back-Office</span>
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <OtpSignInCard
            title="Effy Back-Office"
            chrome="page"
            onAuthenticated={finish}
            onSignInStarted={() => track({ name: "auth_sign_in_started" })}
            onOtpSubmitted={() => track({ name: "auth_otp_submitted" })}
            onSignInFailed={(reason) => track({ name: "auth_sign_in_failed", reason })}
          />
        </div>
        <p className="text-xs text-muted-foreground">For Effy staff only. Every action is recorded against your account.</p>
      </section>
      <aside className="flex min-h-dvh flex-col justify-between border-l border-border bg-muted p-12 max-md:hidden">
        <span className="text-[40px] leading-none font-bold tracking-[-0.04em]">
          effy<b className="text-success">.</b>
        </span>
        <ul className="max-w-[440px] space-y-4">
          {ASIDE.map((a) => (
            <li key={a.title} className="flex gap-3">
              <span className="bo-icon-tile bo-icon-tile--primary">
                <a.icon aria-hidden="true" />
              </span>
              <div>
                <div className="font-medium">{a.title}</div>
                <div className="text-sm text-muted-foreground">{a.body}</div>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Effy Back-Office</p>
      </aside>
    </div>
  );
}

const ASIDE: readonly { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Package, title: "Orders and dispatch", body: "Where every order is, who has it, and what needs a person." },
  { icon: Truck, title: "Drivers, vehicles and shops", body: "The people and places that move Effy's deliveries." },
  { icon: MapPinned, title: "Delivery, pricing and the catalogue", body: "Where Effy delivers, what it costs, and what is on sale." },
];
