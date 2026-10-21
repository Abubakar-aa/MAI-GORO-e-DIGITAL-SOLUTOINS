-- ═══════════════════════════════════════════════════════════════════════════
-- MAI GORO — PHASE 6: complete verify_services catalog
-- Run this in Supabase → SQL Editor. Safe to run multiple times (idempotent).
--
-- What it does:
--   1. Adds the `category` and `badge` columns (needed by your phase5 draft).
--   2. Guarantees a unique index on `code` (required for the upsert below).
--   3. Backfills `category` for the rows that already exist.
--   4. Inserts the remaining service rows so every entry on verify.html has a
--      database-backed price. New rows are seeded with the retail prices from
--      your own page catalog; existing row PRICES ARE NOT OVERWRITTEN — the
--      database stays the price authority. Edit prices here any time.
--
-- After running: refresh verify.html — NIN variants, IPE, CAC and Exam
-- categories light up automatically (active=true rows only).
--
-- NOTE: your sql/phase5-naijatrust-nin-services.sql becomes unnecessary after
-- this file (these inserts cover those codes and fix its column references),
-- so do not run both phase5 and phase6.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.verify_services add column if not exists category text;
alter table public.verify_services add column if not exists badge text;

create unique index if not exists verify_services_code_key
  on public.verify_services (code);

-- Backfill category/badge on rows that already exist.
update public.verify_services set category = 'nin', badge = 'LOOKUP'
  where code in ('nin_search','nin_search_v3','nin_search_v4','nin_search_v5')
    and category is null;
update public.verify_services set category = 'nin', badge = 'PHONE LOOKUP'
  where code in ('nin_by_phone','nin_by_phone_v3') and category is null;
update public.verify_services set category = 'bvn', badge = 'LOOKUP'
  where code in ('bvn_search','bvn_premium_slip','bvn_modification') and category is null;
update public.verify_services set category = 'bvn', badge = 'PHONE LOOKUP'
  where code in ('bvn_by_phone') and category is null;
update public.verify_services set category = 'bvn', badge = 'PRO'
  where code = 'bvn_pro' and category is null;

-- ── Insert the remaining catalog rows (prices = the prices already displayed
--    on your own verify page) ──────────────────────────────────────────────
insert into public.verify_services (code, category, badge, name, description, field_kind, price, active)
values
  -- NIN variants (slip-type families)
  ('nin_search_v3',        'nin', 'LOOKUP V3',    'NIN Verification V3', 'NIN record lookup. Available for Improved Slip and Premium Slip only.', 'nin', 300,  true),
  ('nin_search_v4',        'nin', 'LOOKUP V4',    'NIN Search V4',       'NIN record lookup. Available for Regular, Improved, Premium and vNIN Verification slips.', 'nin', 300,  true),
  ('nin_search_v5',        'nin', 'LOOKUP V5',    'NIN Verification V5', 'NIN record lookup. Available for Regular, Improved, Premium and vNIN slips.', 'nin', 300,  true),
  ('nin_by_phone_v3',      'nin', 'PHONE LOOKUP V3', 'Phone Number Search V3', 'NIN lookup using the registered phone number. Available for Improved Slip and Premium Slip only.', 'nin', 450,  true),
  ('nin_standard_slip',    'nin', 'SLIP',         'NIN Standard Slip',   'Print a standard NIN slip.', 'nin', 400,  true),
  ('nin_premium_slip',     'nin', 'SLIP',         'NIN Premium Slip',    'Print the premium NIN slip.', 'nin', 600,  true),
  ('nin_validation',       'nin', 'VALIDATION',   'NIN Validation',      'Validate a NIN record and its status.', 'nin', 800,  true),
  ('nin_demographics',     'nin', 'SEARCH',       'Demographic Search',  'Search NIN records by name, date of birth and state.', 'nin', 1200, true),
  ('nin_modification',     'nin', 'MODIFICATION', 'NIN Modification',    'Request correction on NIN records.', 'nin', 5000, true),
  -- BVN additions
  ('bvn_premium_slip',     'bvn', 'SLIP',         'BVN Premium Slip',    'Print the BVN premium slip.', 'bvn', 500,  true),
  ('bvn_modification',     'bvn', 'MODIFICATION', 'BVN Modification Support', 'Request BVN record modification support.', 'bvn', 2500, true),
  -- IPE
  ('nin_ipe_clearance',    'ipe', 'CLEARANCE',    'IPE Clearance',       'Clear stuck NIN enrolment tracking IDs.', 'ipe', 4500, true),
  ('ipe_modification',     'ipe', 'CLEARANCE',    'MOD IPE Clearance',   'MOD category IPE clearance.', 'ipe', 1500, true),
  -- CAC
  ('cac_business_name',    'cac', 'REGISTRATION', 'CAC Business Name Registration', 'Register a business name with the Corporate Affairs Commission.', 'cac', 18000, true),
  ('cac_company_ltd',      'cac', 'REGISTRATION', 'CAC Limited Company Registration', 'Register a limited liability company with the CAC.', 'cac', 45000, true),
  -- A zero price intentionally means "price on request"; the page shows
  -- "Price on request" instead of a number until you set a real price here.
  ('cac_organization_registration', 'cac', 'REGISTRATION', 'CAC Organization Registration', 'Register an organization or trustee body with the CAC. Final price is confirmed by our team.', 'cac', 0, true),
  -- Exam
  ('jamb_pin_profile',     'exam', 'JAMB',        'JAMB Profile & PIN',  'Generate a JAMB profile code and ePIN.', 'exam', 8500, true),
  ('neco_token',           'exam', 'TOKEN',       'NECO Token',          'Get your NECO result checker token.', 'exam', 3500, true),
  ('waec_result_checker',  'exam', 'TOKEN',       'WAEC Result Checker', 'Get your WAEC result checker token.', 'exam', 5500, true),
  ('nabteb_token',         'exam', 'TOKEN',       'NABTEB Token',        'Get your NABTEB result checker token.', 'exam', 2500, true),
  ('nbais_token',          'exam', 'TOKEN',       'NBAIS Token',         'Get your NBAIS result checker token.', 'exam', 2500, true)
on conflict (code) do update
  set category = excluded.category,
      badge    = excluded.badge,
      active   = true;
-- existing rows keep their own name/description/price (DB is the price authority)

-- Sanity check after running:
-- select code, category, badge, price, active from public.verify_services order by category, code;
-- Expected: 26 rows, active = true.
