# MAI GORO — Payment Automation Runbook (Monnify virtual accounts → auto wallet credit)

**Status: NOT deployed. Nothing in this runbook is live.** The customer site remains
on the honest manual flow (fund-wallet.html request → admin review) until every step
below is completed. The portal and the funding page both show **"Not assigned yet"**
plus a WhatsApp route to the support desk until then. No account number is ever
invented.

## What already exists in the repo (prepared, waiting for your credentials)

| File | Role |
|---|---|
| `sql/phase8-run-this-migration.sql` | **The only SQL file you need to run.** It supersedes `phase3-security-fixes.sql`, `phase6-…` and `phase7-…`: closes the anonymous wallet-crediting hole, seeds the `admins` allowlist, adds the missing `verify_requests`/`verify_services` columns, widens the status CHECK constraints, seeds the full service catalog, creates `payment_accounts` (RLS: owner-read, service-role-write only), adds `provider`/`provider_reference` + `credited` columns on `wallet_transactions`, and creates the `credit_wallet_verified` atomic credit function (service-role only). |
| `supabase/functions/create-reserved-account/index.ts` | Assigns each signed-in customer a Monnify dedicated account; idempotent; stores only the real returned account. |
| `supabase/functions/fund-webhook/index.ts` | HMAC-SHA512-verified webhook; credits wallet exactly once via `credit_wallet_verified` (double-credit protected at DB level). |
| `portal.html` / `fund-wallet.html` | Already read `payment_accounts` and render the real bank / account number / account name with a Copy button the moment a row exists. Until then they keep the honest empty state. |

## Gate 1 — Monnify business account (unblocks everything)

1. Register at monnify.com → **verify the business** (KYC). Business name:
   MAI GORO E-DIGITAL SOLUTIONS. Fees: ~0.5 % (min ₦50, cap ₦500) per collection.
2. Dashboard → API Keys: copy **API key, secret key, contract code**.
   (Sandbox keys first; live keys after configuration approval.)

## Gate 2 — Deploy the backend pieces

```bash
# Run FIRST, in Supabase → SQL Editor (one file, order inside it matters):
#   sql/phase8-run-this-migration.sql
#
# Then (Supabase CLI, you need: supabase login + project ojulosctgnieeepaiomz):
supabase functions deploy create-reserved-account
supabase functions deploy fund-webhook --no-verify-jwt
supabase secrets set MONNIFY_API_KEY=*** MONNIFY_SECRET_KEY=*** \
  MONNIFY_CONTRACT_CODE=*** \
  MONNIFY_BASE_URL=https://sandbox.monnify.com   # switch to https://api.monnify.com on go-live
```

In the Monnify dashboard → Settings → Webhook URL:
`https://ojulosctgnieeepaiomz.supabase.co/functions/v1/fund-webhook`

## Gate 3 — Testing checklist (sandbox, then live)

- [ ] `/create-reserved-account` with a real signed-in test user → returns a REAL bank account; the portal "Dedicated Funding Account" card and the funding page show those exact details (replacing the "Not assigned yet" state — both pages are already wired to read `payment_accounts`).
- [ ] Transfer ₦100 to the assigned account from another bank.
- [ ] Webhook arrives → wallet balance increases by exactly ₦100 → one `wallet_transactions` row with `provider='monnify'` and `credited=true`.
- [ ] **Replay the webhook** (same body) → response "duplicate", balance unchanged.
- [ ] Transfer again → second credit. Sign wrong-body request via curl → 401, no ledger row.
- [ ] Admin panel ledger shows the funding; customer portal "All My Recent Transactions" shows: +₦100 · ₦0 → ₦100 · Verified.

## Gate 4 — Live switch of the customer flow (I do this with you)

1. `MONNIFY_BASE_URL` → live, secrets → live keys.
2. Portal: the honest "Not assigned yet" card automatically turns into the real
   account card + Copy button as soon as the first `payment_accounts` row is
   written — nothing to replace by hand.
3. Keep the manual fund-wallet form active for a week as fallback, then retire it.

## Verify-before-go-live items (before spending live money)

- [ ] Confirm current Monnify webhook event names + `x-monnify-signature` (SHA512) against docs.monnify.com — the function logs and ignores unknown events, but confirm names so successful events are not "ignored" by mistake.
- [ ] Confirm `resend` behavior/retry policy so our 500-on-credit-failure path is safe (it is — DB idempotency holds across retries).
- [ ] Decide whether Monnify's per-transaction fee is absorbed (as agreed: customer transfers get credited in full; fees are an operator cost).

## Why this is safe to keep un-deployed

Every CTA customers can reach today says automated funding is being set up.
No fabricated account numbers, no credits without a verified webhook. The admin
review path keeps working exactly as now.
