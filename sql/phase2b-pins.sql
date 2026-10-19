-- ═══════════════════════════════════════════════════════════════
--  MAI GORO — Phase 2b: Exam Pin Sales (manual bank transfer flow)
-- ═══════════════════════════════════════════════════════════════
--  HOW TO RUN:
--  1. Open Supabase Dashboard → your project → SQL Editor
--  2. Paste this ENTIRE file and press Run
--  3. Edit the admins line below (step 4) with YOUR email
--  No other setup needed. The website picks everything up live.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Admins list ────────────────────────────────────────────
-- Anyone whose email is listed here can approve/reject pin orders.
create table if not exists public.admins (
  email text primary key,
  created_at timestamptz not null default now()
);

-- ⚠️ STEP 4 — replace the email below with the email you use to
--    log into the Mai Goro admin panel, then run this file.
insert into public.admins (email) values ('maigoroedigitalsolution@gmail.com')
on conflict (email) do nothing;

-- ─── 2. Products (what customers can buy) ──────────────────────
create table if not exists public.pin_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- e.g. "NECO Token"
  exam text not null,                 -- e.g. "NECO", "WAEC", "JAMB"
  price numeric not null check (price >= 0),   -- unit price in Naira
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── 3. Orders ─────────────────────────────────────────────────
create table if not exists public.pin_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  product_id uuid references public.pin_products(id) on delete set null,
  product_name text not null default '',
  quantity int not null check (quantity between 1 and 100),
  amount numeric not null default 0,          -- filled automatically (see trigger)
  transfer_reference text,                    -- what the customer typed after paying
  customer_note text,
  status text not null default 'pending'
        check (status in ('pending','approved','rejected')),
  delivered_codes text,                       -- pin(s) given on approval
  admin_note text,                            -- reason shown when rejected
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists pin_orders_user_idx on public.pin_orders (user_id, created_at desc);
create index if not exists pin_orders_status_idx on public.pin_orders (status, created_at desc);

-- 3b. Trackable order reference + customer contact snapshot
--     (order_code shows the customer MG-XXXXXX everywhere; name/phone
--     help the admin reach the buyer without opening Supabase)
alter table public.pin_orders add column if not exists order_code text;
alter table public.pin_orders add column if not exists customer_name text;
alter table public.pin_orders add column if not exists customer_phone text;
create unique index if not exists pin_orders_code_key on public.pin_orders (order_code);

-- ─── 4. Price-integrity trigger ────────────────────────────────
-- The amount and product name are computed on the server, so a
-- tampered browser cannot fake a cheaper price.
create or replace function public.set_order_amount()
returns trigger
language plpgsql
as $$
declare
  p_name text;
  p_price numeric;
begin
  select name, price into p_name, p_price
  from public.pin_products where id = new.product_id;

  if p_name is null then
    raise exception 'Unknown product';
  end if;

  new.product_name := p_name;
  new.amount := p_price * new.quantity;
  return new;
end;
$$;

drop trigger if exists pin_orders_set_amount on public.pin_orders;
create trigger pin_orders_set_amount
  before insert or update of product_id, quantity on public.pin_orders
  for each row execute function public.set_order_amount();

-- ─── 5. Admin helper ───────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ─── 6. Row Level Security ─────────────────────────────────────
alter table public.admins     enable row level security;
alter table public.pin_products enable row level security;
alter table public.pin_orders enable row level security;

-- admins: only admins can see the list (used by is_admin + dashboard)
drop policy if exists "admins read own list" on public.admins;
create policy "admins read own list"
  on public.admins for select
  using (public.is_admin());

-- products: everyone (even visitors) can see active ones; admins see all
drop policy if exists "active products readable" on public.pin_products;
create policy "active products readable"
  on public.pin_products for select
  using (active = true or public.is_admin());

drop policy if exists "admins manage products" on public.pin_products;
create policy "admins manage products"
  on public.pin_products for all
  using (public.is_admin())
  with check (public.is_admin());

-- orders: customers create their own pending orders and read them;
-- only admins can review/update. Customers can NEVER change status.
drop policy if exists "customers create own orders" on public.pin_orders;
create policy "customers create own orders"
  on public.pin_orders for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and delivered_codes is null
    and admin_note is null
    and reviewed_at is null
  );

drop policy if exists "own orders readable" on public.pin_orders;
create policy "own orders readable"
  on public.pin_orders for select
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "admins review orders" on public.pin_orders;
create policy "admins review orders"
  on public.pin_orders for update
  using (public.is_admin())
  with check (public.is_admin());

-- ─── 7. Starter products (edit prices to yours) ────────────────
-- One product per exam type — add more exam types later by
-- inserting a new row here (or from the Table Editor).
create unique index if not exists pin_products_exam_key
  on public.pin_products (exam);

-- ★ EDIT the prices to YOUR reseller prices before running.
insert into public.pin_products (name, exam, price) values
  ('WAEC Result PIN',      'WAEC',   900),
  ('NECO Token',           'NECO',   800),
  ('NABTEB Result PIN',    'NABTEB', 800),
  ('NBAIS Result PIN',     'NBAIS',  800)
on conflict (exam) do nothing;

-- ✅ DONE. Website side needs nothing else.
-- • Customers buy at  buy-pins.html  (linked from their Portal)
-- • You approve at   Admin Dashboard → 🎫 Pin Orders page (pin-orders.html)
-- • Customers receive their pins in  Portal → My Pin Orders
