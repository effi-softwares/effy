import { Link } from "@tanstack/react-router";

import { ExceptionsList } from "./components/ExceptionsList";
import { ReadinessPanel } from "./components/ReadinessPanel";

/**
 * Everything that has gone wrong out on the road, plus the gaps that are about to cause more
 * (US3 + US6).
 *
 * ⚠ The two live on one screen deliberately. Exceptions are what already went wrong; readiness is
 * what is about to. Splitting them into separate destinations would mean an operator has to think to
 * look at the second one, and the whole point of readiness is that it is seen without being sought.
 */
export function ExceptionsScreen() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link to="/drivers" className="text-sm text-primary hover:underline">
          ← All drivers
        </Link>
        <h1 className="text-xl font-semibold">Reports from the road</h1>
        <p className="text-muted-foreground">
          Deliveries that could not be completed, and packages that were missing or short at a shop.
          Drivers file these from the app; each one is a customer who is still waiting for an answer.
        </p>
      </div>

      <ExceptionsList />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Fleet readiness</h2>
        <p className="text-sm text-muted-foreground">
          Gaps that stop work being assigned — found here rather than by an order that quietly fails
          to move.
        </p>
        <ReadinessPanel />
      </section>
    </div>
  );
}
