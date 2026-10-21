# MAI GORO — Verification System & User Portal

Scope of this document: `verify.html` (Verification System) and `portal.html`
(User Portal), plus the funding page `fund-wallet.html` that the portal links to.

## 1. What the two screens are

**`verify.html`** is a dashboard shell in the 9jaTrust Verifier style, restyled in
MAI GORO colours:

| Area | Behaviour |
|---|---|
| Account rail | Identity block (initials, name, email, wallet balance), then Dashboard / Fund Wallet / History / Profile. Collapses into a drawer under 700 px. |
| Services | `SERVICES` heading with a live count, category panels (NIN, BVN, IPE, CAC, Exam) that drill down into individual service cards, each with a unit-cost badge. A shortcut rail on the left jumps straight to a service on a phone. |
| Request panel | One panel that always sits in the same place. It shows the empty state, then the form for the selected service (only the fields that service needs), then the success state with the request reference. |
| Wallet | Balance shown in three places (rail, dashboard card, side card) from one load, so the three numbers can never disagree. |

**`portal.html`** is the customer dashboard:

| Section | Behaviour |
|---|---|
| Wallet card | Balance, plus the **Dedicated Funding Account** card. |
| Funding account | Reads `payment_accounts`. With no row it says **"Not assigned yet"** and routes to the funding page — it never invents an account number. |
| Verification Services | An accordion built from the same `verify_services` table the verification page reads, so the two screens can never offer different services. Groups with nothing live are hidden. |
| Verification History | The customer's own verification requests, with result and admin note. |
| All My Recent Transactions | The wallet ledger. On a phone each row becomes a labelled card instead of a sideways-scrolling table. |
| Account Settings | Name, email, phone, address. Support/WhatsApp moved here. |

## 2. The database is the price authority

`verify_services` decides what a customer may buy and what it costs. The page
holds its own catalog only as a *map* of which form fields a service needs.

- A service that is not in the table (or is not `active`) is hidden and cannot be
  selected — the panel says *"This service is not available right now"*.
- The price always comes from the row, never from the page. A row with
  `price = 0` renders as **"Price on request"**.
- Category panels with no live service left are removed instead of leaving an
  empty heading behind.

### Columns the pages need, and what happens without them

The pages were written to work against the schema as it is *today*, and to pick up
the new columns automatically once `sql/phase8-run-this-migration.sql` has been run.

| Table | Columns used | If a column is missing |
|---|---|---|
| `verify_services` | `code, name, price, description, active` | required — the page falls back to `code, name` |
| `verify_services` | `category` | optional — the category is derived from the service code (`nin_*`, `bvn_*`, `ipe_*`, `cac_*`, `jamb_*`, `pin_*`) until the migration adds it |
| `verify_requests` | `extra_details` | optional — the field is dropped from the insert payload automatically, and the insert is retried once if the server rejects it |
| `wallet_transactions` | `provider, provider_reference, credited` | optional — the ledger falls back to `reference, amount, status, created_at` |
| `payment_accounts` | `provider, bank_name, account_number, account_name, status, assigned_at` | optional — the portal and the funding page keep the honest "Not assigned yet" state |

## 3. Deep links

| Link | Result |
|---|---|
| `verify.html?cat=nin` | Opens the NIN category panel (only if it has live services). |
| `verify.html?service=nin_by_phone` | Selects the service. The **database code** is accepted. |
| `verify.html?service=nin-by-phone` | Still accepted — the older page key works too. |
| `verify.html?cat=ipe&service=ipe` | The IPE service is not live, so the panel says *"This service is not available right now"* and points the customer back to the list. |

The portal builds its service links with the database code, so the menu can never
advertise a service the verification page will refuse.

## 4. What was actually tested

All of it against the live database (read-only) with the real page code:

| Test | Result |
|---|---|
| Service list, prices, categories | 5 live services loaded, correct prices, empty categories hidden |
| Verification form, valid input | The exact insert payload was captured: `request_code, user_id, user_email, service_id, lookup_value, customer_name, customer_phone, status='pending'`. No column the live schema does not have. Success state shows the reference. |
| Verification form, invalid phone number | *"Enter a valid Nigerian phone number."* — rejected before anything is written. |
| Deep link with a database code | Correct service, price and fields loaded. |
| Deep link to a service that is not live | Clear "not available" message, no broken panel. |
| Portal service menu | Built from the live catalog; NIN (2) and BVN (3) listed, IPE and CAC hidden because nothing is live for them. |
| Portal funding card | "Not assigned yet", no fabricated account number anywhere on the page. |
| Responsive layout | 320 / 360 / 375 / 414 / 480 / 600 / 768 / 834 / 1024 / 1280 / 1440 px, on all three pages, with real device emulation. Zero page overflow, zero clipped text, zero overlapping panels, zero undersized tap targets. |

**Not tested:** a real signed-in customer session end to end. Supabase's signup
email is rate-limited on this project (`over_email_send_rate_limit`), so no test
account could be created. The form was exercised against the live schema with the
insert captured instead of written, and the same payload was sent to the live API
to confirm the schema accepts it.

## 5. Still blocked (needs a human)

1. **Run `sql/phase8-run-this-migration.sql`** in the Supabase SQL Editor. Until
   that runs: the catalog holds 5 services instead of 25, `payment_accounts` does
   not exist, `credit_wallet` is still callable by an anonymous visitor, and the
   admin panel's *"Confirm payment & credit wallet"* cannot credit a wallet
   because the `admins` allowlist is empty.
2. **Monnify KYC and API credentials** — see `README-PAYMENT-AUTOMATION.md`.
3. **Google OAuth client ID/secret and redirect-URL allow-listing.**
4. **Move the Naijaverify provider key** into Edge Function secrets.
