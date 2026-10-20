-- ═══════════════════════════════════════════════════════════════
--  MAI GORO — Phase 3 Security & Ledger Integrity Fixes
--  Run in Supabase SQL Editor AFTER phase2b/2c/3 files.
--
--  Fixes four confirmed vulnerabilities:
--  1. credit_wallet was SECURITY DEFINER with no caller check —
--     ANY anonymous user could credit ANY wallet via the public API.
--  2. No unique constraint on funding references — duplicate
--     credits were possible (same reference credited repeatedly).
--  3. service_requests allowed users to insert rows with
--     hand-picked prices directly, bypassing charging.
--  4. verify_services / service_catalog had no admin write policy,
--     so service catalog management was impossible via RLS.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Idempotent, admin-only credit_wallet ────────────────────
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
begin
  -- Authorization: wallet crediting is restricted to administrators.
  -- (Future automated provider webhooks will call a dedicated RPC
  --  guarded by a server-only secret, not this one.)
  if not public.is_admin() then
    raise exception 'Only administrators can credit wallets';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit amount must be positive';
  end if;

  -- Idempotency: if this reference was already credited for this
  -- user, do nothing (prevents double-crediting on retries).
  if p_reference is not null then
    if exists (
      select 1 from public.wallet_transactions
      where user_id  = p_user_id
        and type     = 'funding'
        and reference = p_reference
        and status   = 'completed'
    ) then
      return;
    end if;
  end if;

  select balance into v_balance_before
  from public.wallets
  where user_id = p_user_id
  for update;

  -- Ensure the wallet row exists (legacy users)
  if v_balance_before is null then
    insert into public.wallets (user_id, balance) values (p_user_id, 0);
    select balance into v_balance_before from public.wallets
    where user_id = p_user_id for update;
  end if;

  v_balance_after := v_balance_before + p_amount;

  update public.wallets
  set balance = v_balance_after, updated_at = now()
  where user_id = p_user_id;

  insert into public.wallet_transactions (
    user_id, type, amount, balance_before, balance_after,
    reference, status, description
  ) values (
    p_user_id, 'funding', p_amount, v_balance_before, v_balance_after,
    p_reference, 'completed', p_description
  );

  -- Mark matching pending funding rows as completed for a clean audit trail
  if p_reference is not null then
    update public.wallet_transactions
    set status = 'completed'
    where user_id  = p_user_id
      and type     = 'funding'
      and reference = p_reference
      and status   = 'pending'
      and reference is not null
      and id <> (select id from public.wallet_transactions
                 where user_id = p_user_id
                   and type = 'funding'
                   and reference = p_reference
                   and status = 'completed'
                 order by created_at desc limit 1);
  end if;
end;
$$;

revoke execute on function public.credit_wallet(uuid, numeric, text, text) from public;
grant  execute on function public.credit_wallet(uuid, numeric, text, text) to authenticated;

-- ─── 2. Hard duplicate-credit prevention (DB-level) ─────────────
-- One completed funding credit per (user, reference) — the last
-- line of defence even if application logic regresses.
create unique index if not exists wallet_tx_completed_credit_key
  on public.wallet_transactions (user_id, reference)
  where type = 'funding'
    and status = 'completed'
    and reference is not null;

-- ─── 3. service_requests: stop price-tampering via direct inserts ─
drop policy if exists "svc req insert" on public.service_requests;
create policy "svc req insert (server-side only)"
  on public.service_requests
  for insert
  with check (false);
-- charge_wallet (SECURITY DEFINER) and admin are unaffected; direct
-- user inserts of priced rows are no longer possible.

-- ─── 4. Admin write access to service catalogs ───────────────────
drop policy if exists "catalog admin write" on public.service_catalog;
create policy "catalog admin write"
    on public.service_catalog
    for all
    using (public.is_admin())
    with check (public.is_admin());

drop policy if exists "verify services admin write" on public.verify_services;
create policy "verify services admin write"
  on public.verify_services
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── 5. Hide internal pricing from the public ────────────────────
-- service_catalog carries api_cost (our resale margin). Only
-- authenticated customers should read it; verify.html is gated by
-- auth anyway.
drop policy if exists "catalog public read" on public.service_catalog;
create policy "catalog authenticate read"
  on public.service_catalog
  for select
  to authenticated
  using (active = true or public.is_admin());

-- ✅ DONE. Reload JWT/RLS cache in the Supabase dashboard if policies
-- appear stale (Settings → API → restart or just wait ~60s).
