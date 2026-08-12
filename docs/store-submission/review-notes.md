# App Store / Play — Reviewer Notes (customer-mobile)

Paste the relevant note into App Store Connect "App Review Information → Notes" and, where useful, the
Play Console review notes.

## ⚠ Account deletion test — register a throwaway account first

Effy supports in-app account deletion (Apple 5.1.1(v); Google User Data policy). **Please register a
new test account before testing deletion**, rather than deleting the demo account provided.

Deleting the demo account will close it permanently, and the **next** submission's sign-in will then
fail — a repeatedly reported false "login bug" rejection. There is intentionally **no special-cased or
undeletable account** in the app (that would be a weaker, second authorization path), so the demo
account deletes like any other.

**To test deletion:**
1. Register a new account with any email you control (a one-time code is emailed to confirm sign-in).
2. Go to **Account → Privacy & data → Delete account**.
3. Confirm with the emailed code. The account is closed immediately.

A public web deletion path is also available at `https://effyshopping.com/delete-account`.

## Demo credentials

- Provided in App Store Connect / Play Console credentials fields (operator to supply).
- Sign-in is passwordless: enter the email, then the one-time code emailed to it.

## Privacy policy & data

- In-app: **Account → Privacy & data → Privacy policy** and **Terms of service**.
- Public: `https://effyshopping.com/legal/privacy-policy`.
- The app does not track users across other apps/sites for advertising; there is no ATT prompt.
