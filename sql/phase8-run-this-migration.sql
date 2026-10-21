-- ═══════════════════════════════════════════════════════════════════════════
--  MAI GORO — PHASE 8: CONSOLIDATED PRODUCTION MIGRATION (RUN THIS ONE FILE)
-- ═══════════════════════════════════════════════════════════════════════════
--  Supabase → SQL Editor → paste this whole file → Run.
--
--  Safe to run more than once (every statement is idempotent).
--  It does NOT delete data, does NOT reset balances, and does NOT change any
--  existing verification request, wallet transaction, or order.
--
--  WHY THIS FILE EXISTS (everything below was confirmed against the LIVE
--  project ojulosctgnieeepaiomz on 2026-10-21):
--
--  1. SECURITY — the live wallet RPCs were callable by ANYONE:
--       • public.credit_wallet(uuid,numeric,text,text) answered an ANONYMOUS
--         call with HTTP 204. It had no admin check, so any visitor could
--         credit any wallet for free. → fixed in section 1.
--       • public.charge_wallet(...) also ran as an anonymous caller.
--         → execute revoked in section 1.
--  2. ADMIN — the public.admins table (what is_admin() reads) was EMPTY, so
--       every admin page refused the signed-in owner with "Your account is not
--       on the admins list" and no admin could ever credit a wallet.
--       → allowlist seeded in section 1.
--  3. SCHEMA — the live verify_requests table is missing `category` and
--     `extra_details`, and verify_services is missing `category` / `badge`.
--     Because of that the verification form submit (verify.html) failed with
--     PGRST204 "Could not find the 'extra_details' column" — confirmed live.
--     → fixed in section 2. (verify.html also detects the missing columns at
--       runtime, so the form works even before this file is run.)
--  4. CATALOG — only 5 of the 26 services existed in the live
--     verify_services table, so the verifier page hid the other 21.
--     → full catalog seeded in section 4.
--  5. LEDGER — wallet_transactions.status and verify_requests.status had
--     narrow CHECK constraints that reject values the admin panel and the
--     payment webhook need ('rejected', 'approved', 'refunded', 'processing').
--     → widened in section 3.
--  6. PAYMENTS — the payment_accounts table and the idempotent
--     credit_wallet_verified() function did not exist, so the portal could
--     not read a real virtual account and the webhook could not credit a
--     wallet. → created in section 5.
--
--  ORDER INSIDE THIS FILE MATTERS: 1 → 2 → 3 → 4 → 5.
--  After running, the site works immediately. The Edge Functions in
--  supabase/functions/ still need Monnify credentials before virtual
--  accounts are actually issued (see README-PAYMENT-AUTOMATION.md).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. SECURITY: close the browser-callable money RPCs ───────────────────
-- The admin panel (mai-goro-admin-panel/admin/wallet-fundings.html) still
-- credits wallets through credit_wallet(), so EXECUTE stays available to
-- signed-in users — but the function body now refuses anybody who is not an
-- administrator. Anonymous callers are removed entirely.

-- The admin allowlist that is_admin() reads is EMPTY on the live project.
-- That is why every admin page currently tells the signed-in owner
-- "Your account (…) is not on the admins list", and why the wallet-credit
-- button could never work. Seed the owner address here; add one more row
-- per additional staff member.
create table if not exists public.admins (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.admins (email)
values ('maigoroedigitalsolution@gmail.com')
on conflict (email) do nothing;

-- Ledger marker: a funding row counts as "credited" only once the money has
-- actually been added to the wallet. The admin panel flips the row to
-- status='completed' BEFORE it calls credit_wallet(), so status alone cannot
-- be used as the idempotency key (that is what made the old check skip the
-- credit entirely).
alter table public.wallet_transactions add column if not exists credited boolean not null default false;
alter table public.wallet_transactions add column if not exists credited_at timestamptz;

create or replace function public.credit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_reference text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance_before numeric;
  v_balance_after  numeric;
  v_row_id uuid;
begin
  -- Only administrators may move money into a wallet.
  -- (Automated provider webhooks use credit_wallet_verified() below, which
  --  is restricted to the service role.)
  if not public.is_admin() then
    raise exception 'Only administrators can credit wallets';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit amount must be positive';
  end if;

  if p_reference is null or btrim(p_reference) = '' then
    raise exception 'A payment reference is required';
  end if;

  -- The funding request this credit belongs to: the customer submitted it
  -- from fund-wallet.html and the admin confirmed it in the panel.
  select id into v_row_id
  from public.wallet_transactions
  where user_id   = p_user_id
    and type      = 'funding'
    and reference = p_reference
  order by created_at desc
  limit 1;

  -- Idempotency: this reference has already moved money — do it once only.
  if v_row_id is not null and exists (
      select 1 from public.wallet_transactions
      where id = v_row_id and credited
  ) then
    return;
  end if;

  select balance into v_balance_before
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_balance_before is null then
    insert into public.wallets (user_id, balance) values (p_user_id, 0);
    select balance into v_balance_before from public.wallets
    where user_id = p_user_id for update;
  end if;

  v_balance_after := v_balance_before + p_amount;

  update public.wallets
  set balance = v_balance_after, updated_at = now()
  where user_id = p_user_id;

  if v_row_id is not null then
    -- Update the customer's own request row instead of adding a second one.
    update public.wallet_transactions
    set status         = 'completed',
        amount         = p_amount,
        balance_before = v_balance_before,
        balance_after  = v_balance_after,
        description    = coalesce(nullif(description, ''), p_description),
        credited       = true,
        credited_at    = now()
    where id = v_row_id;
  else
    insert into public.wallet_transactions (
      user_id, type, amount, balance_before, balance_after,
      reference, status, description, credited, credited_at
    ) values (
      p_user_id, 'funding', p_amount, v_balance_before, v_balance_after,
      p_reference, 'completed', p_description, true, now()
    );
  end if;
end;
$$;

revoke execute on function public.credit_wallet(uuid, numeric, text, text) from public;
revoke execute on function public.credit_wallet(uuid, numeric, text, text) from anon;
grant  execute on function public.credit_wallet(uuid, numeric, text, text) to authenticated;

-- charge_wallet() was a browser-callable checkout that marked work as
-- completed and moved a customer's balance. Only a trusted server may run it.
-- No page on the site calls it any more, so removing it breaks nothing.
do $$
begin
  if to_regprocedure('public.charge_wallet(uuid,numeric,text,text,jsonb,jsonb,text)') is not null then
    execute 'revoke execute on function public.charge_wallet(uuid,numeric,text,text,jsonb,jsonb,text) from public, anon, authenticated';
    execute 'grant execute on function public.charge_wallet(uuid,numeric,text,text,jsonb,jsonb,text) to service_role';
  end if;
end
$$;

-- One credited funding row per (user, reference) — DB-level duplicate guard.
drop index if exists public.wallet_tx_completed_credit_key;
create unique index if not exists wallet_tx_credited_key
  on public.wallet_transactions (user_id, reference)
  where type = 'funding'
    and credited
    and reference is not null;

-- service_requests: customers may not insert priced rows directly any more.
do $$
begin
  if to_regclass('public.service_requests') is not null then
    drop policy if exists "svc req insert" on public.service_requests;
    drop policy if exists "svc req insert (server-side only)" on public.service_requests;
    drop policy if exists "service requests server side only" on public.service_requests;
    create policy "service requests server side only"
      on public.service_requests for insert
      with check (false);
  end if;
end
$$;

-- Admin write access to the service catalogs.
do $$
begin
  if to_regclass('public.service_catalog') is not null then
    drop policy if exists "catalog admin write" on public.service_catalog;
    create policy "catalog admin write"
      on public.service_catalog
      for all
      using (public.is_admin())
      with check (public.is_admin());
  end if;
end
$$;


-- ─── 2. SCHEMA: the columns the pages actually use ────────────────────────
-- verify_requests.extra_details + verify_requests.category were missing, which
-- is why the verification form submit failed with PGRST204.
alter table public.verify_requests add column if not exists category text not null default 'nin';
alter table public.verify_requests add column if not exists extra_details text;

alter table public.verify_services add column if not exists category text not null default 'nin';
alter table public.verify_services add column if not exists badge text default 'INSTANT';

-- Keep field_kind inside the documented set so the pages can rely on it.
update public.verify_services set field_kind = 'nin'
where field_kind is null or field_kind not in ('bvn','nin','phone','tracking_id','demographics','cac','jamb');
alter table public.verify_services drop constraint if exists verify_services_field_kind_check;
alter table public.verify_services add constraint verify_services_field_kind_check
  check (field_kind in ('bvn','nin','phone','tracking_id','demographics','cac','jamb'));

-- Re-install the amount/name trigger with a body that matches the columns
-- that now exist. Prices still come from verify_services (the price authority).
create or replace function public.set_request_amount()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  s_name text;
  s_price numeric;
  s_cat text;
begin
  select name, price, category into s_name, s_price, s_cat
  from public.verify_services where id = new.service_id;

  if s_name is null then
    raise exception 'Unknown verification service';
  end if;

  new.service_name := s_name;
  new.category     := coalesce(s_cat, 'nin');
  new.price        := s_price;
  new.amount       := s_price;
  return new;
end;
$$;

drop trigger if exists verify_requests_set_amount on public.verify_requests;
create trigger verify_requests_set_amount
  before insert or update of service_id on public.verify_requests
  for each row execute function public.set_request_amount();


-- ─── 3. LEDGER: widen status checks so the admin panel and the payment
--         webhook can write every status the portal renders ───────────────
-- The live tables may carry the constraint under a different name, so every
-- existing check on `status` is dropped by inspection first and one clear
-- constraint is put back.
do $$
declare
  c record;
begin
  if to_regclass('public.wallet_transactions') is not null then
    for c in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
      where ns.nspname = 'public'
        and rel.relname = 'wallet_transactions'
        and con.contype = 'c'
        and pg_get_constraintdef(con.oid) ilike '%status%'
    loop
      execute format('alter table public.wallet_transactions drop constraint %I', c.conname);
    end loop;
    alter table public.wallet_transactions
      add constraint wallet_transactions_status_check
      check (status in ('pending','processing','completed','approved','failed','rejected','refunded'));
  end if;

  if to_regclass('public.verify_requests') is not null then
    for c in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
      where ns.nspname = 'public'
        and rel.relname = 'verify_requests'
        and con.contype = 'c'
        and pg_get_constraintdef(con.oid) ilike '%status%'
    loop
      execute format('alter table public.verify_requests drop constraint %I', c.conname);
    end loop;
    alter table public.verify_requests
      add constraint verify_requests_status_check
      check (status in ('pending','processing','approved','rejected','failed','refunded'));
  end if;
end
$$;


-- ─── 4. CATALOG: the full list of services the pages offer ───────────────
-- The database stays the price authority: verify.html reads these rows and
-- hides any service that is not active. A price of 0 renders as
-- "Price on request" in the UI.
--
-- Rows that already exist keep THEIR OWN name/price (the conflict clause
-- never overwrites them) — edit a price here any time and the page follows.
-- Only brand-new services are seeded with the prices from the page catalog.

-- The upsert below needs a unique index on code.
create unique index if not exists verify_services_code_key
  on public.verify_services (code);

insert into public.verify_services (code, category, name, description, badge, field_kind, price, active) values
  -- NIN
  ('nin_search',            'nin',  'NIN Search',            'Returns the full name, date of birth, and other details for a supplied valid NIN.',                                   'INSTANT',      'nin',          300, true),
  ('nin_search_v3',         'nin',  'NIN Verification V3',   'NIN record lookup. Available for Improved Slip and Premium Slip only.',                                        'INSTANT',      'nin',          300, true),
  ('nin_search_v4',         'nin',  'NIN Search V4',         'NIN record lookup. Available for Regular, Improved, Premium and vNIN Verification slips.',                    'INSTANT',      'nin',          300, true),
  ('nin_search_v5',         'nin',  'NIN Verification V5',   'NIN record lookup. Available for Regular, Improved, Premium and vNIN slips.',                               'INSTANT',      'nin',          300, true),
  ('nin_by_phone',          'nin',  'Phone Number Search',   'Returns the full name, date of birth, and other details for the NIN matching the supplied phone number.',  'LOOKUP',       'phone',        450, true),
  ('nin_by_phone_v3',       'nin',  'Phone Number Search V3','NIN lookup using the registered phone number. Available for Improved Slip and Premium Slip only.',          'LOOKUP V3',    'phone',        450, true),
  ('nin_standard_slip',     'nin',  'NIN Standard Slip',     'Print a standard NIN slip.',                                                                                'INSTANT SLIP', 'nin',          400, true),
  ('nin_premium_slip',      'nin',  'NIN Premium Slip',      'Print the premium NIN slip.',                                                                                 'PREMIUM CARD','nin',          600, true),
  ('nin_validation',        'nin',  'NIN Validation',        'Validate a NIN record and its status.',                                                                       'VALIDATION',   'nin',          800, true),
  ('nin_demographics',      'nin',  'Demographic Search',    'Search NIN records by name, date of birth and state.',                                                       'ADVANCED',     'demographics', 1200, true),
  ('nin_modification',      'nin',  'NIN Modification',      'Request correction on NIN records.',                                                                         'ASSISTANCE',   'nin',         5000, true),
  -- BVN
  ('bvn_search',            'bvn',  'BVN Verification',      'Confirm who owns a Bank Verification Number — full BVN record by the 11-digit BVN.',                       'VERIFIED',     'bvn',          350, true),
  ('bvn_pro',               'bvn',  'BVN Verification PRO',  'Extended BVN search with more identity details than the basic search.',                                     'PRO',          'bvn',          200, true),
  ('bvn_premium_slip',      'bvn',  'BVN Premium Slip',      'Print the BVN premium slip.',                                                                                'PREMIUM',      'bvn',          500, true),
  ('bvn_by_phone',          'bvn',  'BVN Retrieval',         'Request a BVN search using your registered phone number.',                                                   'RETRIEVAL',    'phone',       1400, true),
  ('bvn_modification',      'bvn',  'BVN Modification Support','Request BVN record modification support.',                                                                 'ASSISTANCE',   'bvn',         2500, true),
  -- IPE
  ('nin_ipe_clearance',     'ipe',  'IPE Clearance',         'Clear stuck NIN enrolment tracking IDs.',                                                                     'CLEARANCE',    'tracking_id', 4500, true),
  ('ipe_modification',      'ipe',  'MOD IPE Clearance',     'MOD category IPE clearance.',                                                                                'CLEARANCE',    'tracking_id', 1500, true),
  -- CAC
  ('cac_business_name',     'cac',  'CAC Business Name Registration','Register a business name with the Corporate Affairs Commission.',                                  'GOVT RECORD', 'cac',        18000, true),
  ('cac_company_ltd',       'cac',  'CAC Limited Company Registration','Register a limited liability company with the CAC.',                                              'LLC CORPORATE','cac',        45000, true),
  ('cac_organization_registration','cac','CAC Organization Registration','Register an organization or trustee body with the CAC. Price is confirmed on request.',         'ORGANIZATION', 'cac',            0, true),
  -- Exam
  ('jamb_pin_profile',      'exam', 'JAMB Profile & PIN',    'Generate a JAMB profile code and ePIN.',                                                                     'OFFICIAL PIN', 'jamb',        8500, true),
  ('neco_token',            'exam', 'NECO Token',            'Get your NECO result checker token.',                                                                        'RESULT TOKEN', 'jamb',        3500, true),
  ('waec_result_checker',   'exam', 'WAEC Result Checker',   'Get your WAEC result checker token.',                                                                       'RESULT TOKEN', 'jamb',        5500, true),
  ('nabteb_token',          'exam', 'NABTEB Token',          'Get your NABTEB result checker token.',                                                                      'RESULT TOKEN', 'jamb',        2500, true),
  ('nbais_token',           'exam', 'NBAIS Token',           'Get your NBAIS result checker token.',                                                                       'RESULT TOKEN', 'jamb',        2500, true)
on conflict (code) do update set
  category    = excluded.category,
  badge       = excluded.badge,
  field_kind  = excluded.field_kind,
  active      = excluded.active;

-- Backfill the category of any service that predates the column.
update public.verify_services set category = 'nin' where category is null or category = '';
update public.verify_services set category = 'bvn' where code in ('bvn_search','bvn_pro','bvn_premium_slip','bvn_by_phone','bvn_modification');
update public.verify_services set category = 'ipe' where code in ('nin_ipe_clearance','ipe_modification');
update public.verify_services set category = 'cac' where code in ('cac_business_name','cac_company_ltd','cac_organization_registration');
update public.verify_services set category = 'exam' where code in ('jamb_pin_profile','neco_token','waec_result_checker','nabteb_token','nbais_token');
update public.verify_services set category = 'nin' where code in ('nin_search','nin_search_v3','nin_search_v4','nin_search_v5','nin_by_phone','nin_by_phone_v3','nin_standard_slip','nin_premium_slip','nin_validation','nin_demographics','nin_modification');

-- Services that are no longer offered stay switched off.
update public.verify_services set active = false
where code in ('cac_status_report','cac_rebrand','cac_scuml','puk_sim_retrieval','vnin_nibss');

-- The legacy service_catalog table is not used by the customer pages any more
-- (verify.html reads verify_services). Retire the entries we no longer offer
-- so the two catalogs cannot disagree.
do $$
begin
  if to_regclass('public.service_catalog') is not null then
    update public.service_catalog set active = false
    where code in ('cac_rebrand','cac_scuml');
  end if;
end
$$;


-- ─── 5. PAYMENTS: virtual accounts + idempotent server-side credit ───────
-- Rows in payment_accounts are written ONLY by the service role from the
-- Edge Functions. Customers can read their own row and nothing else.
create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  account_reference text not null,
  contract_code text,
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  status text not null default 'active',
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, account_reference),
  unique (user_id, provider)
);

alter table public.payment_accounts enable row level security;

drop policy if exists "owners read their funding account" on public.payment_accounts;
create policy "owners read their funding account"
  on public.payment_accounts
  for select
  using (auth.uid() = user_id);
-- No insert/update/delete policies: only the service role writes these rows.

-- Idempotency key: one provider transaction can never produce two credits.
alter table public.wallet_transactions add column if not exists provider text;
alter table public.wallet_transactions add column if not exists provider_reference text;

create unique index if not exists wallet_tx_provider_ref_key
  on public.wallet_transactions (provider, provider_reference)
  where provider_reference is not null;

-- Atomic, idempotent wallet credit. Service role only (the Edge Functions).
-- Returns: {"status":"credited","balance":n} or {"status":"duplicate"}.
create or replace function public.credit_wallet_verified(
  p_user_id uuid,
  p_amount numeric,
  p_reference text,
  p_description text,
  p_provider text,
  p_provider_reference text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
  v_before numeric;
  v_after numeric;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not permitted';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid amount';
  end if;

  -- Idempotency: was this provider transaction already credited?
  select wt.reference into v_existing
  from wallet_transactions wt
  where wt.provider = p_provider
    and wt.provider_reference = p_provider_reference
  limit 1;
  if v_existing is not null then
    return json_build_object('status', 'duplicate', 'reference', v_existing);
  end if;

  insert into wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  -- Serialize concurrent credits for this wallet.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  select balance into v_before from wallets where user_id = p_user_id for update;
  v_after := v_before + p_amount;

  insert into wallet_transactions
    (user_id, type, amount, balance_before, balance_after, reference,
     status, description, provider, provider_reference, credited, credited_at)
  values
    (p_user_id, 'funding', p_amount, v_before, v_after, p_reference,
     'completed', p_description, p_provider, p_provider_reference, true, now());

  update wallets
  set balance = v_after
  where user_id = p_user_id;

  return json_build_object('status', 'credited', 'balance', v_after);
exception
  when unique_violation then
    return json_build_object('status', 'duplicate');
end;
$$;

revoke execute on function public.credit_wallet_verified(uuid, numeric, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.credit_wallet_verified(uuid, numeric, text, text, text, text) to service_role;

-- ✅ DONE.
--
-- After running this file:
--   • The verification form submit works (extra_details / category exist).
--   • All 25 services are live in verify_services with database pricing.
--   • Anonymous visitors can no longer credit or debit a wallet.
--   • The portal can read a real virtual account as soon as Monnify assigns one.
--
-- The Edge Functions still need Monnify credentials before virtual accounts
-- are actually issued — see README-PAYMENT-AUTOMATION.md.
