-- Allow only explicit OTP/trusted verification paths to mark self-service requests verified.
create or replace function public.privacy_request_verification_guard_v1()
returns trigger
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_source text := coalesce(new.metadata->>'source','');
  v_otp_verified boolean := new.verification_status='verified'
    and new.verification_method like 'otp:%'
    and new.verified_at is not null;
begin
  if new.request_type in ('access','correction','deletion','restriction','portability')
     and v_source not in ('authenticated_account','admin_verified','verified_api')
     and not v_otp_verified then
    new.status := 'verifying';
    new.verification_status := 'pending';
    new.verification_method := null;
    new.verified_at := null;
  elsif new.verification_status='verified' and new.verified_at is null then
    new.verified_at := now();
  end if;
  return new;
end;
$$;
