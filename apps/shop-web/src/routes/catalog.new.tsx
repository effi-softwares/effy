import { createRoute, useNavigate } from "@tanstack/react-router";

import { ProductCreateFlow } from "@/features/catalog/ProductCreateFlow";

import { appRoute } from "./app";

/**
 * Adding a product (057).
 *
 * ⚠ IT IS A ROUTE, NOT A DIALOG, AND THAT IS THE IMPORTED DESIGN'S DOING. The flow was a 75vw modal;
 * the mockup makes it a full page with a progress rail and a live preview beside the form. A modal has
 * nowhere to put either — the preview would steal room from the fields, and the rail would have to
 * collapse to the one-line "Step 2 of 5" the page replaces.
 *
 * ⚠ AND A ROUTE IS RECOVERABLE. The draft already persists per (shop, operator); as a modal, a
 * refresh or a mis-click on the overlay dropped the operator back to the catalog with no way to return
 * to where they were. A URL survives both.
 */
export const catalogNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog/new",
  component: NewProductRoute,
});

function NewProductRoute() {
  const navigate = useNavigate();
  return (
    <ProductCreateFlow
      onCancel={() => void navigate({ to: "/catalog" })}
      // Straight to the product that was just created — the operator's next question is almost always
      // "is it right?", and dropping them back on a list of 300 makes them search for their own work.
      onCreated={(productId) => void navigate({ to: "/catalog/$productId", params: { productId } })}
    />
  );
}
