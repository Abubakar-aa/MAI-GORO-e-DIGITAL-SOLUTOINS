-- ═══════════════════════════════════════════════════════════════
--  MAI GORO — Phase 2c: Standard Verification & Identity Services
--  Updated with latest Nigerian Verifier Standards (UnifyVerifier & Dotaverify)
--  Includes: NIN Slips, BVN Lookups, IPE Clearance, CAC, & JAMB/Exam
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Lookup services (Catalog) ─────────────────────────────
create table if not exists public.verify_services (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                  -- e.g. 'nin_standard_slip'
  category    text not null default 'nin',           -- 'nin' | 'bvn' | 'cac' | 'ipe' | 'exam'
  name        text not null,                         -- shown to customers
  description text,                                  -- shown on the service card
  badge       text default 'INSTANT',                -- 'INSTANT' | 'OFFICIAL' | 'CLEARANCE' | 'CAC GOVT'
  field_kind  text not null default 'nin',           -- 'nin' | 'bvn' | 'phone' | 'tracking_id' | 'demographics' | 'cac' | 'jamb'
  price       numeric not null check (price >= 0),   -- customer price in NGN
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- In case table already exists without category or badge:
alter table public.verify_services add column if not exists category text not null default 'nin';
alter table public.verify_services add column if not exists badge text default 'INSTANT';

-- Update field_kind constraint if already exists
alter table public.verify_services drop constraint if exists verify_services_field_kind_check;
alter table public.verify_services add constraint verify_services_field_kind_check
  check (field_kind in ('bvn','nin','phone','tracking_id','demographics','cac','jamb'));

alter table public.verify_services enable row level security;

drop policy if exists "verify services readable" on public.verify_services;
create policy "verify services readable"
  on public.verify_services for select
  using (active = true or public.is_admin());

-- ─── 2. Verification requests ──────────────────────────────────
create table if not exists public.verify_requests (
  id                  uuid primary key default gen_random_uuid(),
  request_code        text unique,                 -- customer-facing VR-XXXXXX
  user_id             uuid not null references auth.users(id) on delete cascade,
  user_email          text not null,
  service_id          uuid references public.verify_services(id) on delete set null,
  service_name        text not null default '',    -- filled automatically (trigger)
  category            text not null default 'nin',
  lookup_value        text not null,               -- the BVN / NIN / Phone / Tracking ID / Business Name entered
  extra_details       text,                        -- additional fields (e.g. CAC options, DOB)
  price               numeric not null default 0,
  amount              numeric not null default 0,
  transfer_reference  text,
  customer_note       text,
  customer_name       text,
  customer_phone      text,
  status              text not null default 'pending'
                      check (status in ('pending','approved','rejected')),
  result_text         text,                        -- the admin or API outputs verified record / slip URL
  admin_note          text,                        -- reason shown when rejected or clarification needed
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  reviewed_at         timestamptz
);

alter table public.verify_requests add column if not exists category text not null default 'nin';
alter table public.verify_requests add column if not exists extra_details text;

alter table public.verify_requests enable row level security;

create index if not exists verify_requests_user_idx
  on public.verify_requests (user_id, created_at desc);
create index if not exists verify_requests_status_idx
  on public.verify_requests (status, created_at desc);

-- ─── 3. Trigger for Auto Amount & Service Name ─────────────────
create or replace function public.set_request_amount()
returns trigger
language plpgsql
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
  new.category := coalesce(s_cat, 'nin');
  new.price := s_price;
  new.amount := s_price;
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

-- ─── 5. Comprehensive Standard Verifier Services Seed Catalog ──
insert into public.verify_services (code, category, name, description, badge, field_kind, price) values
  -- NIN Suite
  ('nin_standard_slip', 'nin',  'NIN Standard Slip (PDF)',       'Instant NIMC standard identity slip with QR code and full details.',          'INSTANT SLIP',  'nin',          400),
  ('nin_premium_slip',  'nin',  'NIN Premium Slip (Card Style)',  'High-resolution full color card-format slip ready for PVC card printing.',     'PREMIUM CARD', 'nin',          600),
  ('nin_regular_slip',  'nin',  'NIN Regular Slip',              'Official basic black & white NIN verification slip.',                         'INSTANT SLIP',  'nin',          300),
  ('nin_by_phone',      'nin',  'NIN Search by Phone Number',    'Retrieve registered NIN details using the linked phone number.',              'LOOKUP',       'phone',        450),
  ('nin_demographics',  'nin',  'NIN Search by Demographics',    'Search and retrieve lost NIN using Full Name, Date of Birth, and State.',      'ADVANCED',     'demographics', 1200),
  ('vnin_nibss',        'nin',  'vNIN to NIBSS Integration',     'Virtual NIN verification and validation via official NIBSS framework.',       'NIBSS SYNC',   'nin',          600),

  -- BVN Suite
  ('bvn_verification',  'bvn',  'BVN Verification & Match',      'Instant financial verification confirming BVN owner, linked phone and names.','VERIFIED MATCH','bvn',          350),
  ('bvn_retrieval',     'bvn',  'BVN Retrieval by Phone / Bank', 'Find and retrieve lost BVN record using registered phone and account details.','RETRIEVAL',     'phone',        1400),
  ('bvn_modification',  'bvn',  'BVN Data Modification Support', 'Guided assistance for correcting BVN Name, Date of Birth, or Phone records.',  'ASSISTANCE',   'bvn',          2500),

  -- IPE & Validation Suite
  ('nin_ipe_clearance', 'ipe',  'NIN IPE Clearance (Tracking ID)','Clear In-Processing Error (IPE) to force generate stuck NIN from enrollment.', 'CLEARANCE',    'tracking_id',  4500),
  ('nin_validation',    'ipe',  'NIN Validation & Bank Link',    'Re-validate NIN records with NIMC central database for banking & SIM unbarring.', 'VALIDATION', 'nin',          800),

  -- CAC Corporate Services
  ('cac_business_name', 'cac',  'CAC Business Name Registration','Full business name reservation, document processing, and official certificate.','GOVT RECORD',  'cac',         18000),
  ('cac_company_ltd',   'cac',  'CAC Limited Company (LLC)',     'Complete Incorporation of Limited Liability Company with Status Report & Tax.','LLC CORPORATE','cac',         45000),
  ('cac_status_report', 'cac',  'CAC Status Report & Search',    'Official CAC status report, company search, and certified true copies.',       'CAC REPORT',   'cac',          3500),

  -- Exam & Telecom Utilities
  ('jamb_pin_profile',  'exam', 'JAMB Profile Code & UTME PIN',  'Instant generation of JAMB Profile Code and purchase of official UTME PIN.',   'OFFICIAL PIN',  'jamb',         8500),
  ('puk_sim_retrieval', 'exam', 'SIM PUK Code Retrieval',        'Fast recovery of blocked SIM PUK code across MTN, Airtel, Glo, and 9mobile.',   'SIM RECOVER',  'phone',         500)
on conflict (code) do update set
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  badge = excluded.badge,
  field_kind = excluded.field_kind,
  price = excluded.price;
