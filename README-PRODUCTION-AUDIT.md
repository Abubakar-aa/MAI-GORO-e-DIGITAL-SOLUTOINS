# MAI GORO production audit and upgrade status

## Confirmed architecture

- Public pages are static HTML/CSS/JavaScript. Customer pages load Supabase JS directly; `js/shop-config.js` and `js/slider-config.js` hold the public Supabase client configuration.
- A separate Express 5 API in `server/index.js` uses SQLite (`server/maigoro.db`), bcrypt, and JWT. It also stores private-vault uploads on disk.
- Supabase SQL files define the customer wallet, funding transactions, service catalogs, verification requests, and admin review policies. The Node SQLite users are a separate identity store from Supabase Auth users.
- The retired standalone `verify.html` originally called a browser-accessible `charge_wallet` RPC. `fund-wallet.html` submits manual transfer references for admin review. The admin panel reviews `verify_requests` and wallet funding records.

## Confirmed issues addressed in this upgrade

- Open API registration assigned every new account the `admin` role. New signups now receive `customer`; privileged contact, activity, and vault routes require an admin JWT.
- The API used a hard-coded fallback JWT secret, and seeded a public, known default admin credential. The fallback and default credential are removed. An API now requires a configured 32+ character JWT secret; a first administrator can be provisioned with environment settings.
- A verification provider key was embedded in source as a fallback and exposed in a public status response. The source fallback and key disclosure are removed. Rotate/revoke the previously exposed key before production use; removing it from the current file does not invalidate copies or Git history.
- The NIN route returned invented “verified” data on provider errors and was unauthenticated. It now requires a server JWT and returns an unavailable/error response unless the configured upstream returns structured success.
- The virtual-account endpoint and customer portal generated a Wema-style account number locally from a phone number/BVN, then represented it as bank-issued and payment-enabled. The fabricated flow is removed; the page reports that no account is assigned, and the old API route returns 503.
- The verification page showed a fallback success when the wallet RPC was missing, and submitted browser-provided prices/results to a function that marked requests completed. It now submits pending requests to the existing review workflow, loads prices/names from the active Supabase service catalog, confirms the quote, and states that submission does not charge the wallet.
- Funding page copy claimed instant credit and no admin approval despite manual review. It now explains the current manual review behavior and disables the request form when no real bank details are configured.

## Files changed

- `server/index.js` — JWT configuration, customer registration, admin-only routes, provider failure handling, and disabled fabricated account generation.
- `server/db.js` — safe customer role defaults for new SQLite records.
- `portal-services.html` and `js/portal-pages.js` — portal-based catalog, service request forms, and pending status.
- `portal.html` — removed browser-generated bank details and unsupported security/verification claims.
- `fund-wallet.html` — corrected funding instructions and unconfigured-state handling.
- `server/.env.example` — documents required secret/admin configuration without a provider key placeholder.
- `sql/phase4-disable-unverified-checkout.sql` — optional Supabase ACL migration disabling the unsafe browser-callable checkout RPC until a trusted provider backend exists.

## Responsive audit

The project uses shared `style.css` plus page-specific inline styles; verification, wallet, portal, and admin pages each have their own responsive rules. The main stylesheet has breakpoints at 980px, 760px, and 420px, and the verification/funding pages add narrower breakpoints. This change reduced the verification hero decoration and ensured catalog-hidden cards do not remain visible. Browser checks at 320, 360, 375, 390, 414, 768, 1024, 1280, and 1440px found no document-width overflow on the public homepage, about, services, contact, login, registration, password reset, and admin login pages. Wallet, portal, funding, and verification routes redirected to login without an authenticated customer, so those protected layouts were not visually tested.

## Payment and database status

- Paystack Dedicated Virtual Accounts are the best next provider candidate because its current documentation describes customer-linked Nigerian virtual accounts and `charge.success` notifications. Eligibility requires a Nigerian registered business that has completed Paystack go-live; certain business categories also require customer identity validation. This project has no server-side integration, webhook, provider-customer mapping, or confirmation of merchant eligibility, so no live virtual account or automatic crediting is enabled.
- The existing Supabase wallet remains the source of balance/history. No wallet, user, or transaction data was reset or migrated.
- The SQL migration is a reviewed file only; it has **not** been applied to Supabase. Apply it only after the service-role backend replacement is ready, since it intentionally disables direct `charge_wallet` execution.
- Sensitive identity values remain in the existing Supabase request schema. At-rest encryption, retention limits, and a server-only request intake path still need a coordinated migration and key management plan.

## Remaining blockers / release status

- **Not production-ready.** The local UI/API changes have not been deployed or run against the live website.
- The separate SQLite and Supabase identity systems need an explicit migration/integration design before a customer-specific provider account can be safely assigned to the same authenticated customer.
- Obtain and confirm a Nigerian registered merchant account, Paystack DVA activation, settlement configuration, webhook URL/secret, and the permitted customer data collection flow. Paystack’s docs require explicit customer consent for DVA assignment.
- Implement provider customer/account persistence, raw-body webhook signature verification, event idempotency, transaction reconciliation, and server-only atomic wallet crediting before enabling automated funding.
- Review existing SQLite role assignments before any role migration. The local database has two `admin` records; their identities and intended privileges were not changed.
- Confirm all Supabase scripts/policies currently deployed, then test all auth, wallet, admin, and verification flows against a staging project.
- Responsive browser testing, payment sandbox tests, and end-to-end regression tests remain outstanding.
- A Node process started on October 19 is still serving `localhost:5000`; during smoke testing, its contact and activity endpoints returned records without authentication. The patched API on a separate local test port correctly returned 401 for contact, activity, vault, and sensitive operations. Restart the existing process from the updated source before relying on local smoke results. Avoid exposing port 5000 until it has been restarted.
