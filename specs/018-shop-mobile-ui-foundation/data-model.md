# Data Model: Shop Mobile UI Foundation

This feature owns no database and changes no server entity. Its models are presentation state, navigation
state, one local preference, and platform capability signals. Existing Operator, SessionState, AuthStep,
ManagerAccess, catalog domain models, and generated DTOs remain authoritative.

## 1. Authentication UI state

```text
AuthStage = Email | Code

AuthSubmission = Idle | SendingCode | ConfirmingCode | ResendingCode

AuthFieldError = InvalidEmail | MissingCode | InvalidCode | ExpiredCode

AuthUiState {
  stage: Email|Code
  emailInput: String
  codeInput: String
  maskedDestination: String?
  submission: AuthSubmission
  fieldError: AuthFieldError?
  message: String?
  resendRemainingSeconds: Int
  canSubmit: Boolean              # derived
  canResend: Boolean              # derived: Code + Idle + remaining == 0
}
```

Validation:

- Email is trimmed for submission, required, and must have a minimally valid email shape.
- Code is normalized as one value; spaces/separators are removed; only the channel's allowed code
  characters are retained; current EMAIL_OTP length is enforced before submit.
- Input remains in state after recoverable errors.
- Any non-Idle submission rejects duplicate primary/resend actions.
- Destination display is masked; the raw OTP is never logged or persisted.
- Resend cooldown starts only after a successful code request/resend and is not a live accessibility region.

Transitions:

| From | Event | To |
|---|---|---|
| Email/Idle | valid Send | Email/SendingCode |
| Email/SendingCode | NeedsOtp(destination) | Code/Idle + masked destination + cooldown |
| Email/SendingCode | Failed | Email/Idle + mapped message |
| Code/Idle | valid Confirm | Code/ConfirmingCode |
| Code/ConfirmingCode | Done | SessionManager loads record; root becomes SignedIn/Refused |
| Code/ConfirmingCode | incorrect/expired/network | Code/Idle + preserved code/message |
| Code/Idle | Resend after cooldown | Code/ResendingCode → Code/Idle + reset cooldown |
| Code/* | Use different email | Email/Idle; clear code/destination, preserve email |

## 2. Root session presentation

Existing authority:

```text
SessionState = Restoring | SignedOut | SignedIn(Operator) | Refused
```

Presentation mapping:

| Session | Reachable presentation | Back behavior |
|---|---|---|
| Restoring | themed progress/brand state | no protected graph |
| SignedOut | authentication graph only | system exit from Email; Code returns to Email |
| SignedIn | responsive shop shell | current tab pops; non-Home root returns Home; Home root delegates system |
| Refused | refusal explanation + local sign-out | no protected graph |

Transition content animates, but session authority remains `SessionManager`. Signing out resets every tab
stack to root before the session becomes SignedOut.

## 3. Responsive navigation state

```text
ShopTab = Home | Catalog | Orders | Account

NavigationPresentation = BottomBar | SideRail

NavigationEnvironment {
  usableWidthDp: Dp
  usableHeightDp: Dp
  presentation: usableWidthDp < 600 ? BottomBar : SideRail
  reducedMotion: Boolean
}

ShopNavigationState {
  currentTab: ShopTab
  stacks: Map<ShopTab, List<AppNavKey>>
  currentRoute: AppNavKey
}
```

Routes retained: `HomeRoot`, `CatalogRoot`, `OrdersRoot`, `AccountRoot`, `ManagerArea`.
`CatalogProductRoute` is removed. Catalog and Orders roots render new placeholders.

Invariants:

- Four tabs and their ordering are identical in both navigation forms.
- A chrome-form change does not replace `ShopNavigationState`.
- Re-select current tab returns that tab to root; selecting another retains both stacks.
- Selected state is icon + label + indicator/contrast, never color alone.
- Each navigation item is one semantic target of at least 48dp.

## 4. Appearance preference

Existing enum:

```text
AppearanceMode = Light | Dark | System
storage key = "appearance.mode"
storage values = "light" | "dark" | "system"
default/unknown = System
```

```text
AppearanceUiState {
  selectedMode: AppearanceMode
  systemIsDark: Boolean
  resolvedIsDark: Boolean
}
```

Mode is non-sensitive, local to the device, read on app start, persisted immediately, and applied without
session reset. System follows live OS changes. The resolved mode is also sent to the platform UI controller
so status/navigation icons remain legible.

## 5. Platform UI capability

```text
PlatformUiState {
  reducedMotion: Boolean
}

PlatformUiController {
  state: StateFlow<PlatformUiState>
  applyAppearance(isDark: Boolean)
  dispose()
}
```

Android resolves reduced motion through the system animation scale and controls visible system-bar icon
contrast. iOS observes UIKit Reduce Motion and updates its hosting-controller interface/status style.
This is a platform driver: no business/domain layer depends on it.

## 6. Motion policy

```text
MotionLevel = None | Reduced | Full

MotionRole = Press | Selection | PeerDestination | Forward | Back | RootState | Visibility
```

- Full uses centralized fast/standard/emphasized durations and interruptible specs.
- Reduced removes translation/scale; state updates immediately or with minimal opacity feedback.
- None is used in deterministic tests.
- Motion never owns navigation or session truth; it only visualizes state changes.

## 7. Retained vs retired model boundary

Retained: Operator/roles/status/shop, ManagerAccess, SessionState, AuthStep/AuthError, catalog repository and
domain entities/use cases, DraftStore, AppConfig, AuthDriver, serialized tab-stack mechanism.

Retired from presentation: catalog list/detail/create ViewModels/UI state, product draft UI steps, focused
edit sheet state, selected tablet product route/state. Their underlying catalog domain concepts remain.
