update public.tracking_contract_releases
set status='ready',updated_at=now()
where version='v1';
