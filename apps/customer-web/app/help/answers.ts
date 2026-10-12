/**
 * Help answers — authored content (084 research D10).
 *
 * ⚠ OPERATOR REVIEW REQUIRED BEFORE LAUNCH, like other authored prose (045). These were written from
 * how the platform behaves, and each says only what the platform can be seen to do:
 *   - who delivers is said in the pinned words ("Delivered by Effy", "Courier delivery");
 *   - a courier arrival is always "an estimate", never a date;
 *   - points are "a way of paying", never a discount;
 *   - nothing promises a timeframe, a fee amount, or a refund outcome — those are in the linked
 *     policies and on the order itself.
 * An answer that needs a number or a promise belongs in a legal document, not here.
 */
export type HelpTopic = "Orders & delivery" | "Payments & refunds" | "Effy points" | "Your account"

export interface HelpAnswer {
  id: string
  topic: HelpTopic
  question: string
  answer: string
  /** An optional place to go for the detail. */
  link?: { label: string; href: string }
}

export const HELP_TOPICS: readonly HelpTopic[] = ["Orders & delivery", "Payments & refunds", "Effy points", "Your account"]

export const HELP_ANSWERS: readonly HelpAnswer[] = [
  {
    id: "who-delivers",
    topic: "Orders & delivery",
    question: "Who delivers my order?",
    answer:
      "It depends on your address. Where Effy delivers, your order is Delivered by Effy and you choose a delivery window. Elsewhere it goes by Courier delivery. Your address book and checkout both show which applies to each address.",
    link: { label: "Address book", href: "/addresses" },
  },
  {
    id: "when-arrive",
    topic: "Orders & delivery",
    question: "When will my order arrive?",
    answer:
      "Effy deliveries arrive in the window you chose at checkout. Courier deliveries show how long they usually take — that is an estimate, not a guaranteed date. Your order page shows where your order is up to and updates on its own.",
    link: { label: "Your orders", href: "/orders" },
  },
  {
    id: "delivery-fee",
    topic: "Orders & delivery",
    question: "How is delivery priced?",
    answer:
      "There is one delivery fee for the whole order. Checkout shows it, line by line, before you pay — including any window surcharge, and free delivery when your order qualifies. The amount you are shown is the amount you are charged.",
    link: { label: "Delivery policy", href: "/legal/delivery-policy" },
  },
  {
    id: "track",
    topic: "Orders & delivery",
    question: "How do I track my order?",
    answer:
      "Open the order from Your orders. For a courier delivery you will see a tracking link there once the parcel is with the courier, or tracking is sent to you by email.",
    link: { label: "Your orders", href: "/orders" },
  },
  {
    id: "unavailable-item",
    topic: "Orders & delivery",
    question: "What happens if something I ordered is out of stock?",
    answer:
      "The item is left out and you are not charged for it — it is refunded to your original payment method. Your order page lists anything that could not be included.",
  },
  {
    id: "how-to-pay",
    topic: "Payments & refunds",
    question: "How can I pay?",
    answer:
      "By card, and with the wallets and pay-later options your device and bank support — checkout shows the ones available to you. You can also pay with Effy points. Card details are entered with our payment provider; Effy never sees or stores your card number.",
  },
  {
    id: "cancel",
    topic: "Payments & refunds",
    question: "Can I cancel an order?",
    answer:
      "While an order can still be cancelled, its page shows a Cancel option. Once it has moved too far along, that option is no longer shown — get in touch below and we will help.",
    link: { label: "Your orders", href: "/orders" },
  },
  {
    id: "refund",
    topic: "Payments & refunds",
    question: "Something was wrong with my order. How do I ask for a refund?",
    answer:
      "Open the order and choose Report a problem. Tell us which items and what happened. Refunds go back to the card or payment method you paid with; how quickly it appears depends on your bank.",
    link: { label: "Refunds & returns", href: "/legal/refunds-returns" },
  },
  {
    id: "saved-cards",
    topic: "Payments & refunds",
    question: "How do I add or remove a saved card?",
    answer:
      "Cards are added when you pay — tick the box to save one at checkout. You can remove a saved card at any time from Payment methods in your account.",
    link: { label: "Payment methods", href: "/account/payment" },
  },
  {
    id: "points-what",
    topic: "Effy points",
    question: "What are Effy points?",
    answer:
      "Points are credit from Effy. They are a way of paying: using them does not change your order total, it lowers what you pay by card. Points have no cash value.",
    link: { label: "Effy points", href: "/account/points" },
  },
  {
    id: "points-use",
    topic: "Effy points",
    question: "How do I use my points?",
    answer:
      "At checkout, switch on Pay with Effy points and choose how many to use. The summary shows what is paid with points and what is left to pay by card.",
  },
  {
    id: "points-expire",
    topic: "Effy points",
    question: "Do points expire?",
    answer:
      "Points can have a last date to be used. Your Effy points page shows your balance, anything due to expire next, and the history of what you have received and used.",
    link: { label: "Effy points", href: "/account/points" },
  },
  {
    id: "sign-in",
    topic: "Your account",
    question: "How do I sign in?",
    answer:
      "With a code we email you, with a password, or with Google — all three reach the same account. You can browse and fill your cart without signing in; we ask only when you check out.",
    link: { label: "Sign in", href: "/sign-in" },
  },
  {
    id: "password",
    topic: "Your account",
    question: "How do I set or change my password?",
    answer:
      "From Security in your account. If you have forgotten it, use Reset your password on the sign-in page, or simply sign in with an emailed code instead.",
    link: { label: "Security", href: "/account/security" },
  },
  {
    id: "delete",
    topic: "Your account",
    question: "How do I delete my account?",
    answer:
      "From Privacy & data in your account. We confirm it is you with an emailed code. If you have an order in progress you will be asked to wait until it is complete. Some records are kept for the time the law requires.",
    link: { label: "Deleting your account", href: "/delete-account" },
  },
]
