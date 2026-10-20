-- ═══════════════════════════════════════════════════════════════
--  MAI GORO — Phase 3: Wallet + Instant API Verification
--  Run AFTER phase2b-pins.sql and phase2c-verify-services.sql
--
--  Flow:
--  1. Register → BVN verified via API (instant)
--  2. Fund Wallet → bank transfer → admin confirms → wallet credited
--  3. Verify/Buy → check wallet → call API → instant result → deduct
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Wallets ─────────────────────────────────────────────────
create table if not exists public.wallets (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  balance   numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.wallets enable row level security;

drop policy if exists "wallet own" on public.wallets;
create policy "wallet own" on public.wallets
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "wallet update admin" on public.wallets;
create policy "wallet update admin" on public.wallets
  for update using (public.is_admin()) with check (public.is_admin());

-- ─── 2. Wallet Transactions ─────────────────────────────────────
create table if not exists public.wallet_transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  type            text not null check (type in ('funding','service','refund','bonus')),
  amount          numeric(12,2) not null,
  balance_before  numeric(12,2) not null,
  balance_after   numeric(12,2) not null,
  reference       text,                    -- bank transfer ref for funding
  service_code    text,                    -- service identifier for service deductions
  status          text not null default 'pending' check (status in ('pending','completed','failed')),
  description     text,
  created_at      timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;

create index if not exists wallet_tx_user_idx on public.wallet_transactions (user_id, created_at desc);

drop policy if exists "wallet tx own" on public.wallet_transactions;
create policy "wallet tx own" on public.wallet_transactions
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "wallet tx insert funding" on public.wallet_transactions;
create policy "wallet tx insert funding" on public.wallet_transactions
  for insert with check (
    auth.uid() = user_id
    and type = 'funding'
    and status = 'pending'
  );

drop policy if exists "wallet tx admin update" on public.wallet_transactions;
create policy "wallet tx admin update" on public.wallet_transactions
  for update using (public.is_admin()) with check (public.is_admin());

-- ─── 3. Service Definitions (what user can buy) ─────────────────
create table if not exists public.service_catalog (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,       -- 'nin_verify', 'bvn_verify', 'pin_neco', etc.
  name          text not null,
  category      text not null,              -- 'nin', 'bvn', 'ipe', 'cac', 'pin', 'exam'
  price         numeric(10,2) not null,     -- customer pays this
  api_cost      numeric(10,2) not null,     -- our cost from provider (for margin calc)
  api_endpoint  text,                       -- e.g. '/v1/nin/verify'
  api_method    text default 'POST',
  active        boolean default true,
  description   text,
  created_at    timestamptz default now()
);

alter table public.service_catalog enable row level security;

drop policy if exists "catalog public read" on public.service_catalog;
create policy "catalog public read" on public.service_catalog
  for select using (active = true or public.is_admin());

-- ─── 4. Service Requests (instant API calls) ────────────────────
create table if not exists public.service_requests (
  id                uuid primary key default gen_random_uuid(),
  request_code      text unique,            -- VR-XXXXXX
  user_id           uuid not null references auth.users(id) on delete cascade,
  service_id        uuid references public.service_catalog(id) on delete set null,
  service_code      text not null,          -- denormalized for fast lookups
  service_name      text not null,
  price             numeric(10,2) not null,
  input_params      jsonb not null,         -- what user submitted (nin, bvn, phone, etc.)
  api_response      jsonb,                  -- raw API response
  result_summary    text,                   -- human-readable result
  status            text not null default 'completed' check (status in ('pending','completed','failed')),
  created_at        timestamptz not null default now()
);

alter table public.service_requests enable row level security;

create index if not exists svc_req_user_idx on public.service_requests (user_id, created_at desc);

drop policy if exists "svc req own" on public.service_requests;
create policy "svc req own" on public.service_requests
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "svc req insert" on public.service_requests;
create policy "svc req insert" on public.service_requests
  for insert with check (auth.uid() = user_id);

-- ─── 5. Trigger: auto-create wallet on user signup ──────────────
create or replace function public.create_wallet_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.wallets (user_id, balance) values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_wallet on auth.users;
create trigger on_auth_user_created_wallet
  after insert on auth.users
  for each row execute function public.create_wallet_on_signup();

-- ─── 6. Function: charge wallet for service ─────────────────────
create or replace function public.charge_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_service_code text,
  p_service_name text,
  p_input_params jsonb,
  p_api_response jsonb,
  p_result_summary text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_balance_before numeric;
  v_balance_after numeric;
  v_wallet_id uuid;
  v_request_code text;
  v_request_id uuid;
begin
  if auth.uid() is distinct from p_user_id and not public.is_admin() then
    raise exception 'Not authorized to charge this wallet';
  end if;

  -- Older accounts may predate the wallet-creation trigger.
  insert into public.wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  -- Get current balance (lock row)
  select balance into v_balance_before
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_balance_before is null then
    raise exception 'Wallet balance could not be loaded';
  end if;

  if v_balance_before < p_amount then
    raise exception 'Insufficient wallet balance';
  end if;

  v_balance_after := v_balance_before - p_amount;

  -- Update wallet
  update public.wallets
  set balance = v_balance_after, updated_at = now()
  where user_id = p_user_id;

  -- Create transaction record
  insert into public.wallet_transactions (
    user_id, type, amount, balance_before, balance_after,
    service_code, status, description
  ) values (
    p_user_id, 'service', p_amount, v_balance_before, v_balance_after,
    p_service_code, 'completed', 'Paid for ' || p_service_name
  );

  -- Generate request code
  v_request_code := 'VR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  -- Create service request record
  insert into public.service_requests (
    request_code, user_id, service_code, service_name, price,
    input_params, api_response, result_summary, status
  ) values (
    v_request_code, p_user_id, p_service_code, p_service_name, p_amount,
    p_input_params, p_api_response, p_result_summary, 'completed'
  ) returning id into v_request_id;

  return v_request_id;
end;
$$;

-- ─── 6b. Function: credit wallet for funding approval ───────────
create or replace function public.credit_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_reference text,
  p_description text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_balance_before numeric;
  v_balance_after numeric;
begin
  -- Get current balance (lock row)
  select balance into v_balance_before
  from public.wallets
  where user_id = p_user_id
  for update;

  v_balance_after := v_balance_before + p_amount;

  -- Update wallet
  update public.wallets
  set balance = v_balance_after, updated_at = now()
  where user_id = p_user_id;

  -- Update funding transaction
  update public.wallet_transactions
  set status = 'completed',
      balance_before = v_balance_before,
      balance_after = v_balance_after,
      description = p_description
  where user_id = p_user_id
    and type = 'funding'
    and reference = p_reference
    and status = 'pending';
end;
$$;

-- ─── 7. Seed Service Catalog (edit prices to yours) ─────────────
insert into public.service_catalog (code, name, category, price, api_cost, api_endpoint, description) values
  -- NIN Services
  ('nin_verify',   'NIN Verification',       'nin', 300,  150, '/v1/nin/verify',       'Verify NIN with full demographic data'),
  ('nin_slip',     'NIN Standard Slip',      'nin', 400,  200, '/v1/nin/slip',         'Generate official NIN slip (PDF/PVC)'),
  ('nin_premium',  'NIN Premium Slip',       'nin', 800,  500, '/v1/nin/premium-slip', 'Premium slip with enhanced security features'),
  ('nin_mod',      'NIN Modification',       'nin', 5000, 3000, '/v1/nin/modify',       'Modify NIN details (DOB, Name, Phone)'),
  ('nin_val',      'NIN Validation',         'nin', 200,  100, '/v1/nin/validate',     'Validate NIN registration status'),
  ('nin_demo',     'Demographic Search',     'nin', 300,  150, '/v1/nin/demographic',  'Search NIN by name, DOB, state, LGA'),

  -- BVN Services
  ('bvn_verify',   'BVN Verification',       'bvn', 300,  150, '/v1/bvn/verify',       'Verify BVN ownership and details'),
  ('bvn_slip',     'BVN Premium Slip',       'bvn', 500,  250, '/v1/bvn/premium-slip', 'BVN verification slip with QR'),
  ('bvn_retr',     'BVN Retrieval',          'bvn', 1000, 500, '/v1/bvn/retrieve',     'Retrieve BVN by registered phone'),
  ('bvn_mod',      'BVN Modification',       'bvn', 8000, 5000, '/v1/bvn/modify',       'Modify BVN details (DOB, Name, Phone)'),

  -- IPE Clearance
  ('ipe_clear',    'IPE Clearance',          'ipe', 1000, 500, '/v1/ipe/clear',        'Clear stuck NIN tracking ID'),
  ('ipe_mod',      'MOD IPE Clearance',      'ipe', 1500, 800, '/v1/ipe/mod',          'Modified IPE for complex cases'),

  -- CAC Corporate
  ('cac_reg',      'CAC Business Name Reg',  'cac', 15000, 8000, '/v1/cac/register',   'Register new business name'),
  ('cac_rebrand',  'CAC Rebranding',         'cac', 20000, 12000, '/v1/cac/rebrand',   'Rebrand existing company'),
  ('cac_scuml',    'SCUML Application',      'cac', 30000, 20000, '/v1/cac/scuml',     'Apply for SCUML certificate'),

  -- Exam Pins
  ('pin_neco',     'NECO Token',             'pin', 3500, 3000, '/v1/pin/neco',       'NECO result checker pin'),
  ('pin_waec',     'WAEC Result Checker',    'pin', 5500, 4800, '/v1/pin/waec',       'WAEC result checker pin'),
  ('pin_nabteb',   'NABTEB Token',           'pin', 2500, 2000, '/v1/pin/nabteb',     'NABTEB result checker pin'),
  ('pin_nbais',    'NBAIS Token',            'pin', 2500, 2000, '/v1/pin/nbais',      'NBAIS result checker pin')
on conflict (code) do nothing;

-- ✅ DONE.
-- Next steps:
-- 1. Create fund-wallet.html (user submits bank transfer ref)
-- 2. Create wallet.html (balance + transaction history)
-- 3. Create verify.html that uses wallet + API
-- 4. Admin wallet-funding approval page
-- 5. Configure API key in verify.js for naijaverify.com