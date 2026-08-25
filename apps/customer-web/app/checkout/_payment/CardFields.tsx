"use client"

import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
} from "@stripe/react-stripe-js"
import type { StripeElementStyle } from "@stripe/stripe-js"
import { useMemo, useState } from "react"

import { paymentAppearanceLight } from "@effy/design-system/stripe-appearance"

import { AcceptedNetworks } from "./BrandMarks"
import { Field } from "./Field"

/**
 * The card form (051 T034) — three provider-owned inputs inside Effy's own shells.
 *
 * ⚠ THREE FIELDS, NOT SIX. No country, no postcode, no name on card. The provider only ever asked for
 * those because `fields.billingDetails` defaults to `auto`, under which it decides what to collect and
 * guesses a country from the shopper's IP — which is where "Country: Sri Lanka" on an Australia-only
 * storefront came from (research R4). The split card elements have no billing fields at all, so there is
 * nothing to switch off here; the details Effy already holds ride in the confirm call instead
 * (see `confirm.ts`).
 *
 * ⚠ Removing those fields does NOT weaken authorization. The same address still reaches the bank — it is
 * sourced from Effy's record rather than from the shopper's keyboard.
 */
export type CardFieldState = {
  complete: boolean
  error: string | null
}

const EMPTY: CardFieldState = { complete: false, error: null }

export function useCardFieldState() {
  const [number, setNumber] = useState<CardFieldState>(EMPTY)
  const [expiry, setExpiry] = useState<CardFieldState>(EMPTY)
  const [cvc, setCvc] = useState<CardFieldState>(EMPTY)
  return {
    number,
    expiry,
    cvc,
    setNumber,
    setExpiry,
    setCvc,
    /** Every field filled and none complaining — the gate the pay control reads (FR-041). */
    complete: number.complete && expiry.complete && cvc.complete,
  }
}

export type CardFieldsController = ReturnType<typeof useCardFieldState>

export function CardFields({ state }: { state: CardFieldsController }) {
  // ⚠ Derived from the GENERATED appearance, not typed out here. The generator reads tokens.css, so a
  // brand change reaches these iframes with no hand edit (Principle II). Light only: this surface is
  // light-only by operator decision and ships no appearance switcher (research R16).
  const style = useMemo<StripeElementStyle>(() => {
    const v = paymentAppearanceLight.variables
    return {
      base: {
        color: v.colorText,
        fontFamily: v.fontFamily,
        // 16px on mobile is not a preference — anything smaller makes iOS Safari zoom the page when the
        // field is focused, which throws the shopper out of the layout mid-payment.
        fontSize: "16px",
        fontSmoothing: "antialiased",
        "::placeholder": { color: v.colorTextPlaceholder },
      },
      invalid: { color: v.colorText, iconColor: v.colorDanger },
    }
  }, [])

  return (
    <div className="flex flex-col gap-3.5 sm:grid sm:grid-cols-[2fr_1fr_1fr] sm:gap-3.5">
      <Field
        label="Card number"
        error={state.number.error}
        className="sm:col-span-1"
      >
        <div className="min-w-0 flex-1">
          <CardNumberElement
            options={{ style, showIcon: false, placeholder: "1234 1234 1234 1234" }}
            onChange={(e) =>
              state.setNumber({ complete: e.complete, error: e.error?.message ?? null })
            }
          />
        </div>
        {/* Our marks, not the element's built-in icon — hence `showIcon: false`. */}
        <AcceptedNetworks className="ml-auto" />
      </Field>

      <Field label="Expiry" error={state.expiry.error}>
        <div className="min-w-0 flex-1">
          <CardExpiryElement
            options={{ style, placeholder: "MM / YY" }}
            onChange={(e) =>
              state.setExpiry({ complete: e.complete, error: e.error?.message ?? null })
            }
          />
        </div>
      </Field>

      <Field label="Security code" error={state.cvc.error}>
        <div className="min-w-0 flex-1">
          <CardCvcElement
            options={{ style, placeholder: "CVC" }}
            onChange={(e) =>
              state.setCvc({ complete: e.complete, error: e.error?.message ?? null })
            }
          />
        </div>
      </Field>
    </div>
  )
}
