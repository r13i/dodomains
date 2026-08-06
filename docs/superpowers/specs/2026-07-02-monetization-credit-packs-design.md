# Monetization: Credit Packs + Magic-Link Auth — Design

**Date:** 2026-07-02
**Status:** ⛔ **SUPERSEDED — do not implement.** Killed on 2026-08-06 by
`2026-08-06-byo-llm-key-design.md`. Bringing your own LLM key removes the operator's
per-generation cost, which was the entire premise of metering. Nothing in this document
was ever built. Kept for the reasoning only.
**Scope:** Monetization subsystem only. The broader UI/UX redesign is a **separate spec** and is out of scope here.

---

## 1. Goal & positioning

Turn dodomains.dev from a fully free tool into a **pay-per-use credit product**, while protecting the existing organic traffic and GoDaddy/Namecheap affiliate income.

- Each "Generate" run costs the operator one OpenAI call — credits align price with real marginal cost.
- Anonymous visitors get a small free trial so SEO landings still convert and still click affiliate links.
- After the trial, continued use requires an account **and** a purchased credit balance.

**Positioning change:** the "100% free" branding is retired. New framing: **"Free to try — credits to go further."** This is an explicit, owned change (README, page copy, meta description), not an accident.

---

## 2. Monetization model (decided)

| Aspect | Decision |
|---|---|
| Free access | **3 free generation runs** for anonymous visitors, then a wall. No recurring free tier after that. |
| Trial enforcement | Signed cookie id **+ hashed IP** counter, enforced server-side (cookie-only is trivially reset). |
| Unit of value | **1 credit = 1 Generate run** (a run returns 5–10 domains + availability). |
| Products | **Credit packs only.** Starting packs (tunable before launch): **20 credits / $5**, **60 / $12**, **200 / $30**. |
| Credit expiry | None — credits never expire. |
| Auth | **Better Auth** with the `magicLink` plugin, using the existing `pg` Pool. Passwordless email login. |
| Email delivery | **Hail.so REST API** (API key), called from Better Auth's `sendMagicLink`. |
| Payments | **Stripe Checkout** (one-time `mode: payment`) + webhook that grants credits idempotently. |
| Affiliate links | **Kept and stacked** — paying users clicking GoDaddy/Namecheap still earn commission. No change to affiliate logic. |

### User flow

```
Anonymous visitor
  └─ runs 1–3: generate freely (counter incremented server-side)
  └─ run 4: 402 → wall
        ├─ "Sign in" (magic link via Hail) → creates account
        └─ "Buy credits" (Stripe Checkout) → webhook grants balance
Logged-in visitor
  └─ each run: atomically spend 1 credit
  └─ balance 0: 402 → buy-credits modal
```

---

## 3. Architecture

Next.js 15 App Router (existing). Additions are server-side route handlers + Better Auth + a small credit layer. No framework change.

### 3.1 Auth (Better Auth)

- Deps: `better-auth` + its `magicLink` plugin.
- `database`: the existing `src/lib/db.ts` `pg` Pool is passed directly (Better Auth's built-in Kysely adapter).
- Schema: generated via `npx @better-auth/cli generate`, which emits SQL for **only** Better Auth's own tables (`user`, `session`, `account`, `verification`). It does **not** touch the existing `domains` table. The SQL is committed to the repo and run against the DB as a migration.
- `sendMagicLink({ email, url })` → POSTs to the Hail.so REST API with `HAIL_API_KEY`. Implementation lives behind a thin `sendEmail()` helper in `src/lib/email.ts` so the provider is swappable.
- Session: Better Auth HTTP-only cookie. A server helper `getSession()` reads it in route handlers.
- Better Auth mounted at `src/app/api/auth/[...all]/route.ts`.

### 3.2 Credit layer

New module `src/lib/credits.ts` exposing:

- `getBalance(userId): number`
- `spendOne(userId): { ok: boolean; remaining: number }` — atomic decrement (see §4.3).
- `grantCredits(userId, amount, stripeSessionId, reason)` — idempotent add (see §4.4).

### 3.3 Anonymous trial

New module `src/lib/anonTrial.ts`:

- On first anonymous request, set a signed cookie `anon_id` (random UUID, HMAC-signed with `AUTH_SECRET`).
- Server keeps a per-`anon_id` counter in `anon_usage`, also stamping `ip_hash = sha256(ip + AUTH_SECRET)` and `day`.
- `consumeAnonRun(anonId, ip): { ok, remaining }` — increments; denies past the limit (default **3**, a constant `ANON_FREE_RUNS`).
- IP hash is a secondary signal to blunt cookie-clearing abuse; not a hard block on shared IPs (soft cap logged for review). Exact abuse-hardening beyond this is out of scope.

### 3.4 Payments (Stripe)

- Deps: `stripe`.
- Three Stripe Prices created in the Stripe dashboard; their IDs are env vars.
- `POST /api/checkout` (auth required): body `{ pack: '20' | '60' | '200' }` → creates a Checkout Session with `mode: 'payment'`, `metadata: { userId, credits }`, `success_url`/`cancel_url`. Returns the session URL; client redirects.
- `POST /api/webhooks/stripe`: verifies signature with `STRIPE_WEBHOOK_SECRET`; on `checkout.session.completed`, calls `grantCredits(userId, credits, session.id, 'stripe')`. Idempotent on `session.id`.
- `/success` and `/cancel` pages (minimal).

---

## 4. Data model

All in the existing Postgres, alongside `domains`.

### 4.1 Better Auth tables
`user`, `session`, `account`, `verification` — created by the Better Auth CLI SQL. Not hand-authored.

### 4.2 `user_credits`
```sql
CREATE TABLE user_credits (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Fast single-row read for the header balance chip.

### 4.3 `credit_ledger` (append-only audit)
```sql
CREATE TABLE credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,             -- +N on purchase, -1 on spend
  reason TEXT NOT NULL,               -- 'stripe' | 'spend' | 'grant'
  stripe_session_id TEXT UNIQUE,      -- NULL for spends; unique → idempotency
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Spend** is atomic and race-free:
```sql
UPDATE user_credits
   SET balance = balance - 1, updated_at = now()
 WHERE user_id = $1 AND balance > 0
RETURNING balance;
```
0 rows returned → out of credits (402). On success, also insert a `-1` ledger row (same transaction).

### 4.4 Purchase idempotency
`grantCredits` runs in a transaction: `INSERT INTO credit_ledger (... stripe_session_id) ... ON CONFLICT (stripe_session_id) DO NOTHING`. Only if a row was inserted does it `UPDATE user_credits SET balance = balance + $amount`. This makes duplicate Stripe webhook deliveries safe.

### 4.5 `anon_usage`
```sql
CREATE TABLE anon_usage (
  anon_id TEXT PRIMARY KEY,           -- from signed cookie
  ip_hash TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  day DATE NOT NULL DEFAULT current_date,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5. Generation enforcement (`/api/generate` changes)

Current handler validates input, calls OpenAI, checks availability, returns results. Wrap it with an entitlement gate **before** the OpenAI call:

```
1. session = getSession()
2. if session:
     spend = spendOne(session.userId)
     if !spend.ok → 402 { error: 'out_of_credits' }
     remaining = spend.remaining
   else:
     trial = consumeAnonRun(anonId, ip)
     if !trial.ok → 402 { error: 'trial_exhausted' }
     remaining = trial.remaining
3. ... existing generation + availability logic ...
4. return { results, remaining, authed: !!session }
```

- The credit/trial is spent **only when generation is attempted**. If OpenAI itself errors (500), refund the spent credit/decrement in a `finally`/catch so users aren't charged for our failures. (Refund = insert compensating ledger row + balance bump, or decrement anon counter.)
- `402` responses carry a machine-readable `error` so the client shows the right wall (sign-in vs buy).

---

## 6. UI surface (minimal — full redesign is spec #2)

Just enough to sell; visual polish deferred.

- **Header:** auth state (email / "Sign in") + a **credit-balance chip** + **"Buy credits"** button. Chip updates live from the `remaining` field in generate responses.
- **Wall modal** (on `402`):
  - `trial_exhausted` → "You've used your free tries. Sign in to continue," email input for magic link, plus the pack options.
  - `out_of_credits` → "You're out of credits," the 3 packs.
- **Pricing:** the 3 packs rendered from a shared `PACKS` constant, reused by the wall modal and a standalone "Buy credits" modal.
- **Affiliate result buttons:** unchanged.

---

## 7. Files touched / added

**Added**
- `src/lib/auth.ts` — Better Auth server instance (magicLink plugin, pg Pool).
- `src/lib/authClient.ts` — Better Auth client for the React app.
- `src/lib/email.ts` — `sendEmail()` → Hail.so REST API.
- `src/lib/credits.ts` — balance / spend / grant.
- `src/lib/anonTrial.ts` — anon cookie + counter.
- `src/lib/packs.ts` — `PACKS` constant (id, credits, price, Stripe price env key).
- `src/app/api/auth/[...all]/route.ts` — Better Auth handler.
- `src/app/api/checkout/route.ts` — Stripe Checkout session.
- `src/app/api/webhooks/stripe/route.ts` — Stripe webhook.
- `src/app/success/page.tsx`, `src/app/cancel/page.tsx`.
- `migrations/` — Better Auth SQL + credit/anon tables SQL.
- UI: header component, wall/pricing modal, balance chip.

**Modified**
- `src/app/api/generate/route.ts` — entitlement gate + `remaining` in response.
- `src/app/page.tsx` — header/chip, wall trigger on 402, copy changes.
- `src/app/layout.tsx` — drop "100% free" from meta description.
- `README.md` — positioning copy.
- `.env` / env docs — new vars.

**New env vars**
`AUTH_SECRET`, `HAIL_API_KEY` (+ endpoint/from-address as needed), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_20`, `STRIPE_PRICE_60`, `STRIPE_PRICE_200`, `NEXT_PUBLIC_APP_URL`. (`DATABASE_URL` already exists.)

---

## 8. Error handling & edge cases

- **Duplicate webhooks** → idempotent via `stripe_session_id UNIQUE` (§4.4).
- **Concurrent spends** → atomic conditional `UPDATE ... WHERE balance > 0` (§4.3); no double-spend.
- **OpenAI failure after spend** → compensating refund so users aren't charged for our errors (§5).
- **Webhook signature invalid** → 400, no credit granted.
- **Race: purchase lands before `user_credits` row exists** → `grantCredits` upserts the row (`INSERT ... ON CONFLICT`).
- **Cookie cleared to reset trial** → `ip_hash` soft signal; accepted residual risk, logged.
- **Magic link email fails to send** → surface a "try again" state; login simply not established.

---

## 9. Testing

- **Credit ledger unit tests:** spend at balance 0 (denied), concurrent spend (no double-spend), grant idempotency (duplicate `stripe_session_id` adds once).
- **Anon trial:** run 4 after 3 → `402 trial_exhausted`; new `anon_id` resets (expected); same IP different cookie logged.
- **Webhook:** valid event grants once; replayed event no-ops; bad signature rejected.
- **Generate gate:** authed with credits decrements + returns `remaining`; authed at 0 → 402; OpenAI error refunds.
- **Stripe** exercised with test keys + Stripe CLI `stripe listen` for the webhook.

---

## 10. Out of scope (explicit)

- Full UI/UX redesign → **separate spec** (spec #2).
- Subscriptions / recurring billing.
- Refunds & dispute handling beyond the OpenAI-failure auto-refund.
- Team/multi-seat accounts.
- Credit expiry.
- Advanced anti-abuse (device fingerprinting, rate limiting beyond the trial counter).
- Google / social login (trivially addable later as another Better Auth plugin, but not now).

---

## 11. Rollout order (for the plan)

1. Better Auth + magic-link (Hail) → login works, tables created.
2. Credit layer + `user_credits`/`credit_ledger` + `anon_usage`.
3. Gate `/api/generate` on entitlement.
4. Stripe Checkout + webhook → credits actually purchasable.
5. Minimal UI (header chip, wall/pricing modal).
6. Copy changes (retire "100% free").
