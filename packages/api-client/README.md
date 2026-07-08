# `@effy/api-client`

One authed fetch wrapper for every web surface: attaches the Bearer **access** token (via an
injected token provider — no dependency on the auth library), parses RFC 9457 problem+json, and
rejects with a typed `DomainError` on non-2xx. Consumes `@effy/shared-types`.

```ts
import { ApiClient } from "@effy/api-client";

const api = new ApiClient({ baseUrl, getToken: () => getAccessToken() });
const record = await api.get<StaffRecordDTO>("/v1/back-office/me"); // throws DomainError on failure
```

`DomainError.kind` (`unauthenticated | forbidden | not-found | unsupported-version | unavailable |
unknown`) is what screens key their human-readable states off — raw `detail`/stack/token is never
surfaced to the user (FR-008). Internal package: exports TypeScript source.
