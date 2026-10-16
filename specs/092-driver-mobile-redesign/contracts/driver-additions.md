# Contract additions (092) — all optional

| Read | Field |
|---|---|
| `GET /driver/v1/delivery/drops/{dropId}` | `customerPhone?: string \| null` — open drops of the caller's round only |
| `POST /driver/v1/hub/checkin` (response) | `nextCourierPickupLabel?: string \| null` |

Everything else the screens need is already on the wire (088–090).
