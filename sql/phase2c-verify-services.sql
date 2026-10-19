-- ═══════════════════════════════════════════════════════════════
--  MAI GORO — Phase 2c: BVN & NIN lookup requests
--  Run AFTER (or together with) sql/phase2b-pins.sql in the
--  Supabase SQL Editor — it reuses that file's admins list and
--  is_admin() security helper.
--
--  Flow: customer picks a lookup, enters the BVN/NIN/phone and
--  pays by bank transfer → the admin runs the lookup in their
--  own reseller panel and pastes the result → the customer sees
--  it in their Portal. Money/security mirror the pins tables.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Lookup services (what customers can request) ───────────
create table if not exists public.verify_services (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,       -- internal code, e.g. 'bvn_search'
  name        text not null,              -- shown to customers
  description text,                       -- shown on the service card
  field_kind  text not null default 'bvn' -- 'bvn' | 'nin' | 'phone' → which input the form asks for
              check (field_kind in ('bvn','nin','phone')),
  price       numeric not null check (price >= 0),   -- what the CUSTOMER pays (your cost + margin)
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.verify_services enable row level security;

drop policy if exists "verify services readable" on public.verify_services;
create policy "verify services readable"
  on public.verify_services for select
  using (active = true or public.is_admin());

-- ─── 2. Lookup requests ────────────────────────────────────────
create table if not exists public.verify_requests (
  id             uuid primary key default gen_random_uuid(),
  request_code   text unique,                 -- customer-facing VR-XXXXXX
  user_id        uuid not null references auth.users(id) on delete cascade,
  user_email     text not null,
  service_id     uuid references public.verify_services(id) on delete set null,
  service_name   text not null default '',    -- filled automatically (trigger)
  lookup_value   text not null,               -- the BVN / NIN / phone entered
  price          numeric not null default 0,  -- unit price, from trigger
  amount         numeric not null default 0,  -- total = price (server-computed)
  transfer_reference text,
  customer_note  text,
  customer_name  text,
  customer_phone text,
  status         text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  result_text    text,                        -- the admin pastes the lookup result here
  admin_note     text,                        -- reason shown when rejected
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  reviewed_at    timestamptz
);

alter table public.verify_requests enable row level security;

create index if not exists verify_requests_user_idx
  on public.verify_requests (user_id, created_at desc);
create index if not exists verify_requests_status_idx
  on public.verify_requests (status, created_at desc);

-- ─── 3. Price-integrity trigger (same idea as the pins file) ───
create or replace function public.set_request_amount()
returns trigger
language plpgsql
as $$
declare
  s_name text;
  s_price numeric;
begin
  select name, price into s_name, s_price
  from public.verify_services where id = new.service_id;

  if s_name is null then
    raise exception 'Unknown service';
  end if;

  new.service_name := s_name;
  new.price := s_price;
  new.amount := s_price;   -- one lookup per request
  return new;
end;
$$;

drop trigger if exists verify_requests_set_amount on public.verify_requests;
create trigger verify_requests_set_amount
  before insert or update of service_id on public.verify_requests
  for each row execute function public.set_request_amount();

-- ─── 4. Row Level Security ─────────────────────────────────────
drop policy if exists "customers create own requests" on public.verify_requests;
create policy "customers create own requests"
  on public.verify_requests for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and result_text is null
    and admin_note is null
    and reviewed_at is null
  );

drop policy if exists "own requests readable" on public.verify_requests;
create policy "own requests readable"
  on public.verify_requests for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "admins review requests" on public.verify_requests;
create policy "admins review requests"
  on public.verify_requests for update
  using (public.is_admin())
  with check (public.is_admin());

-- ─── 5. Starter services (★ EDIT prices: your cost + margin) ───
-- Benchmarks (a typical reseller panel): BVN search ₦150,
-- BVN search PRO ₦200, BVN retrieval ₦1,000, NIN search ₦150,
-- NIN by phone ₦150 → we add ~₦150–200 margin per lookup.
insert into public.verify_services (code, name, description, field_kind, price) values
  ('bvn_search',   'BVN Verification',  'Confirm who owns a Bank Verification Number — full BVN record by the 11-digit BVN.',      'bvn',   300),
  ('bvn_pro',      'BVN Verification PRO',  'Extended BVN search with more identity details than the basic search.',               'bvn',   400),
  ('bvn_by_phone', 'BVN Retrieval',     'Retrieve BVN records by searching with the registered phone number.',                    'phone', 1150),
  ('nin_search',   'NIN Verification',  'Verify a National Identity Number — full NIN record by the 11-digit NIN.',               'nin',   300),
  ('nin_by_phone', 'NIN by Phone',      'Search a NIN record using the registered phone number instead of the NIN itself.',       'phone', 300)
on conflict (code) do nothing;

-- ✅ DONE. Website side: verify.html + admin/verify-requests.html
-- • Customers request at  verify.html  (linked from their Portal)
-- • You deliver at        Admin → 🔍 Verifications
-- • Results appear in     Portal → My Verifications
