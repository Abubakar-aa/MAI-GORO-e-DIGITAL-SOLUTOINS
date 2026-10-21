-- MAI GORO — NIN lookup variants shown in the provider reference screenshot.
-- Run after phase2c-verify-services.sql. Prices are Mai Goro customer prices,
-- copied from the existing NIN lookup and phone lookup rows; provider cost is
-- not configured or exposed by this customer-facing catalog.

insert into public.verify_services (code, category, name, description, badge, field_kind, price, active)
select service.code, 'nin', service.name, service.description, service.badge, service.field_kind, price_source.price, true
from (values
  ('nin_search', 'NIN Search',
   'Returns the full name, date of birth, and other details for a supplied NIN when valid.', 'LOOKUP', 'nin', 'nin_regular_slip'),
  ('nin_search_v3', 'NIN Verification V3',
   'Returns NIN details. Available for Improved Slip and Premium Slip only.', 'LOOKUP V3', 'nin', 'nin_regular_slip'),
  ('nin_search_v4', 'NIN Search V4',
   'Returns NIN details. Available for Regular, Improved, Premium and vNIN Verification slips.', 'LOOKUP V4', 'nin', 'nin_regular_slip'),
  ('nin_search_v5', 'NIN Verification V5',
   'Returns NIN details. Available for Regular, Improved, Premium and vNIN slips.', 'LOOKUP V5', 'nin', 'nin_regular_slip'),
  ('nin_by_phone_v3', 'Phone Number Search V3',
   'Returns NIN details matching the supplied phone number. Available for Improved Slip and Premium Slip only.', 'PHONE LOOKUP V3', 'phone', 'nin_by_phone')
) as service(code, name, description, badge, field_kind, price_source_code)
join public.verify_services as price_source on price_source.code = service.price_source_code
on conflict (code) do update set
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  badge = excluded.badge,
  field_kind = excluded.field_kind,
  active = true;

-- The base phone search already exists as nin_by_phone. Refresh its customer-facing
-- wording without changing its existing price or activation state.
update public.verify_services
set name = 'Phone Number Search',
    description = 'Returns the full name, date of birth, and other details of the NIN matching the supplied phone number.'
where code = 'nin_by_phone';

-- Demography Search V1 is omitted because the provider reports it as unavailable.
