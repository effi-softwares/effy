# Quickstart: Suburb-Aware Delivery Location (030)

How to bring this feature up locally, and the walks that decide whether it works. Every step marked
**[operator]** is yours to run — Claude authors, you run anything touching a database or live AWS.

---

## §0 — Prerequisites

| Need | Check |
|---|---|
| Dev DB reachable | `make db-status ENV=dev` |
| `core-api` runnable locally | `make core-run` — ⚠ the hot path has **no cloud deploy**, so everything here is local |
| Delivery zones seeded | at least `MEL-METRO` + `VIC-REGIONAL` with their postcode lists (021 seed) |
| A customer account **with a default address** | needed for §3; create one through the app if you have none |

---

## §1 — The data **[operator]**

The migration is schema only. Rows come from the loader, so `db-up` stays fast and refreshing the
dataset never means a new migration.

```bash
# 1. Commit the migration first — the 003 commit-guard requires it before db-up.
git add db/migrations/202608XXXXXXXX_locality.sql db/reference/
git commit -m "feat(030): locality reference table + dataset"

# 2. Apply the schema.
make db-up ENV=dev

# 3. Load the rows. Idempotent — safe to re-run, and you will re-run it on every dataset refresh.
make load-localities ENV=dev
```

**Expected**: a row count in the **16 000–18 000** range, and a non-zero exit if any row was malformed.

```sql
SELECT count(*) FROM public.locality;                       -- ~16-18k
SELECT count(DISTINCT state) FROM public.locality;          -- 8
SELECT count(*) FROM public.locality WHERE postcode LIKE '08%';  -- ⚠ NT: must be > 0
```

⚠ **That last query is the one that matters.** NT postcodes begin `08xx`. If anything in the pipeline
treated the column as a number, `0800` became `800`, the rows were rejected or mangled, and the entire
Northern Territory is unreachable by name. A zero here is a failed load, not an empty state.

### The coverage gate (SC-002)

```sql
SELECT dzp.postcode
FROM public.delivery_zone_postcode dzp
LEFT JOIN public.locality l ON l.postcode = dzp.postcode
WHERE l.id IS NULL;
```

**Expected: zero rows.** Any postcode listed here is one Effy delivers to that no shopper can reach by
typing a suburb name — SC-002 failing, in the most concrete possible form. The same assertion runs as a
testcontainers test (`-short` skips it); ⚠ that test uses a FIXTURE, so it proves the query is right —
not that the real data is. This manual query is the only thing that proves the data.

### Index sanity — not optional

```sql
EXPLAIN ANALYZE
SELECT name, state, postcode FROM public.locality
WHERE lower(name) LIKE 'richmo%' ORDER BY name, state, postcode LIMIT 8;
```

**Expected**: an **index scan** on `locality_name_prefix_idx`. ⚠ A `Seq Scan` here means the
`text_pattern_ops` operator class is missing or the query does not match the index. The feature will
be correct and quietly scan 18 000 rows on every keystroke, and no test will report it.

---

## §2 — The endpoint

```bash
make core-run   # in another shell
```

```bash
# A name prefix → up to 8 places, each fully identified.
curl -s 'localhost:8080/v1/storefront/localities?q=richmo' | jq

# A postcode → the localities it covers.
curl -s 'localhost:8080/v1/storefront/localities?q=3121' | jq

# ⚠ A name that recurs across states — this is the case FR-008 exists for.
curl -s 'localhost:8080/v1/storefront/localities?q=springfield' | jq '[.[] | .state] | unique'

# Too short → 400 invalid_query. NOT a refusal.
curl -i -s 'localhost:8080/v1/storefront/localities?q=r' | head -1

# Nonsense → 200 with an EMPTY ARRAY. Also NOT a refusal.
curl -s 'localhost:8080/v1/storefront/localities?q=zzzzqqq' | jq

# Cacheable.
curl -sI 'localhost:8080/v1/storefront/localities?q=richmo' | grep -i cache-control
```

**Expected**: `springfield` returns several states. `zzzzqqq` returns `[]` with status `200` — the
distinction between "no match" and "no delivery" is the whole feature, and it starts here.

⚠ **Confirm the serviceability response is unchanged**: still exactly two fields. If it grew any, the
frozen contract was widened and research R4 was overruled without a record.

```bash
curl -s 'localhost:8080/v1/storefront/serviceability?postcode=3121' | jq 'keys'
# ["postcode","serviced"]   ← exactly this
```

---

## §3 — The walks

Nine walks. **Five of them cannot be machine-checked** — they measure whether a person reads the right
meaning, which is the failure this feature exists to prevent.

### W1 — Find a place by name *(SC-001, both surfaces)*

Open the store as a **guest**. Open the delivery affordance. Type three letters of a suburb. Pick it.

**Pass**: a verdict appears **inside** the sheet/panel, in under 20 seconds, without typing a digit.

### W2 — The three answers stay three *(SC-003 — 5 testers, observer test)*

Show each state in turn and ask the tester what it means:

| Set up | Must be read as |
|---|---|
| a served postcode | "they deliver to me" |
| an unserved postcode | "they don't deliver to me **yet**" |
| `core-api` stopped mid-check | "**something went wrong**" — ⚠ **never** "they don't deliver to me" |

⚠ **This is the walk that matters most.** Stop `core-api` for the third row — do not simulate it.

### W3 — Nonsense is never a refusal *(SC-004 — 20 inputs)*

`zzzz`, `1`, `!!!`, `-1000`, `99999`, an emoji, a very long string, a real suburb misspelt…

**Pass**: **zero** of the twenty produce anything a tester reads as "Effy does not deliver to me".

### W4 — The account already knows *(SC-005, both surfaces)*

Sign in as a customer **with a default address**, on a device/browser with **no location set**.

**Pass**: the storefront never shows "Set your delivery location"; the place and its verdict are
present on first view, with no interaction. ⚠ This is 025's FR-013, unmet since 025 shipped.

Then, in order:

1. Set a **different** place explicitly → sign out → sign in. **Pass**: your explicit choice survived.
2. Sign out with an **account-derived** location. **Pass**: it is **cleared** (FR-023).
3. Sign out with an **explicitly set** location. **Pass**: it is **kept**.
4. Check the address book. **Pass**: unchanged — nothing was created or modified (SC-006).

⚠ **On mobile, step 1 will fail across an app restart** and that is expected — see research R12. Test
it *within* one session. Note the outcome honestly at sign-off; do not mark FR-019 unqualified.

### W5 — The display names a place *(SC-008 — 5 testers, observer test)*

Set a location on someone else's behalf, hand them the device, ask: "where is the store answering
about?"

Walk all four rows of the display table (contracts §2), including the bare-postcode-covering-several
case — **no suburb may be invented** — and the lookup-failed case, where the verdict must still be
correct.

### W6 — Reach and keyboard *(SC-009, SC-018)*

- **Mobile**: complete the whole task one-handed, both hands, on a phone. ⚠ Check the soft keyboard
  does not cover the list.
- **Web**: complete it **pointer-free** — Tab to the affordance, Enter, type, arrow-key the list,
  Enter, read the verdict, Escape.

### W7 — Presentation limits *(SC-010)*

⚠ **Pinned values, so two operators walk this the same way:**

| Axis | Value |
|---|---|
| Narrowest phone width | **320 dp** (iPhone SE 1st gen class) |
| Largest system text | iOS **AX5** · Android **200%** font scale |
| Appearance | light **and** dark |
| Tablet | any ≥ 600 dp width, landscape |
| Web narrow viewport | **360 px** wide |

At 360 px the web header must shorten a long suburb predictably and **must not** drop the state —
`Marrickville NSW 2204` and `Marrickville VIC 3xxx` may never shorten to the same string (FR-040).

### W8 — Screen reader *(SC-011, FR-042)*

Complete the whole task with VoiceOver / TalkBack / a desktop reader. ⚠ The announced place must use
**the same words** as the visible display.

### W9 — Both platforms *(SC-014)*

**iOS and Android.** ⚠ Not "iOS, and Android probably works" — that is precisely what 028 and 029 each
recorded, after 028 asked that it not be repeated.

---

## §4 — The machine sweep

```bash
pnpm -r typecheck          # ⚠ vitest does NOT run tsc — 029 shipped green tests over a failing typecheck
pnpm -r test               # ⚠ count the reporting packages; a silently-dropped package reads as success
turbo build                # 3 web surfaces
pnpm --filter @effy/customer-web size       # ⚠ THE GATE — 174 KB, every route
pnpm --filter @effy/customer-web depcruise  # guest-path quarantine
cd apis/core-api && go build ./... && go vet ./... && go test ./... && gofmt -l .
cd apps/customer-mobile && ./gradlew :shared:allTests :androidApp:assembleDebug
make cm-guard && make cm-contract-check     # secrets + generated-Kotlin drift
```

⚠ **`size` is not a formality in this slice.** Baseline measured 2026-08-01 on `02512f2`:

```
/  172.2   /browse  170.1   /search  173.5   /product/[id]  172.3   /cart  173.8   /promotions/[id]  171.0     (KB / 174 KB)
```

**`/cart` has 0.2 KB of headroom and `/search` has 0.5 KB.** Every always-loaded byte this feature
adds has to fit in that. If a route breaches, the response is fixed in advance by FR-045: **reduce the
web presentation** — do not raise the limit, do not add a dependency.

---

## §5 — Sign-off

Do not record a walk as passed because the code looks right. 028 marked six verification tasks
complete on reasoning and **three defects fell out of re-auditing them**.

State plainly at sign-off:

- Which of W1–W9 were actually walked, on which surfaces, on which platforms.
- **Whether Android was run.** If it was not, say so — do not let it pass silently a third time.
- That **FR-019 holds within a session on mobile and cannot hold across a restart** (research R12), and
  that this feature makes that pre-existing gap *more* visible than it was before.
- The measured per-route bundle numbers, not "the gate passed".
