-- ═══════════════════════════════════════════════════════════════════════════
-- MAI GORO — PHASE 7: payment automation infrastructure (Monnify)
-- Run AFTER phase3-security-fixes.sql and phase6-verify-services-full-catalog.sql.
--
-- Safe to re-run (idempotent creates). The wallet stays on the manual flow
-- until the Edge Functions in supabase/functions/ are deployed AND end-to-end
-- tested — nothing here changes the customer experience on its own.
--
-- Prerequisite notes for the SQL editor:
--   * wallets(user_id) must be unique: phase3-wallet-api.sql should already
--     carry a unique key on wallets(user_id). If `on conflict (user_id)`
--     errors, add: create unique index wallets_user_id_key on wallets (user_id);
--   * if wallets has extra NOT NULL columns without defaults and the first
--     insert errors, tell me the column list and I will adjust this file.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Dedicated funding accounts (one per customer per provider). Rows are
--    written ONLY by the service role from the Edge Functions; customers can
--    only read their own row.
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

create policy "owners read their funding account"
  on public.payment_accounts
  for select
  using (auth.uid() = user_id);
-- No insert/update/delete policies on purpose: only the service role writes.

-- 2. Idempotency key on the wallet ledger: one provider transaction can never
--    produce two credits.
alter table public.wallet_transactions add column if not exists provider text;
alter table public.wallet_transactions add column if not exists provider_reference text;

create unique index if not exists wallet_tx_provider_ref_key
  on public.wallet_transactions (provider, provider_reference)
  where provider_reference is not null;

-- 3. Atomic, idempotent wallet credit. Callable ONLY by the service role
--    (the Edge Functions), never by the dashboard or admin panel.
--    Returns: {"status":"credited","balance":n} or {"status":"duplicate"}.
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
  -- service_role tokens only (checked against the caller's JWT role claim)
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

  -- Make sure the customer has a wallet row
  insert into wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  -- Serialize concurrent credits for this wallet
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  select balance into v_before from wallets where user_id = p_user_id for update;
  v_after := v_before + p_amount;

  insert into wallet_transactions
    (user_id, type, amount, balance_before, balance_after, reference,
     status, description, provider, provider_reference)
  values
    (p_user_id, 'funding', p_amount, v_before, v_after, p_reference,
     'approved', p_description, p_provider, p_provider_reference);

  update wallets
    set balance = v_after
    where user_id = p_user_id;

  return json_build_object('status', 'credited', 'balance', v_after);
exception
  when unique_violation then
    return json_build_object('status', 'duplicate');
end;
$$;
