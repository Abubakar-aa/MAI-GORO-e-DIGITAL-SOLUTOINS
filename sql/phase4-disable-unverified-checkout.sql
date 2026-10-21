-- MAI GORO Phase 4: stop browser callers from treating unverified work as paid/completed.
-- Apply in Supabase SQL Editor after the existing wallet/service migrations.
-- This deliberately disables the current browser-callable charge RPC until a trusted
-- provider backend is implemented. It does not change balances or existing records.

do $$
begin
  if to_regprocedure('public.charge_wallet(uuid,numeric,text,text,jsonb,jsonb,text)') is not null then
    execute 'revoke execute on function public.charge_wallet(uuid,numeric,text,text,jsonb,jsonb,text) from public, anon, authenticated';
    execute 'grant execute on function public.charge_wallet(uuid,numeric,text,text,jsonb,jsonb,text) to service_role';
  end if;
end
$$;

-- Keep service request creation on the pending-review path only.
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
