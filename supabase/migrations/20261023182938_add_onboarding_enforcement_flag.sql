alter table public.organization_onboarding
  add column if not exists enforce_on_sign_in boolean not null default false;

comment on column public.organization_onboarding.enforce_on_sign_in is
  'Explicit opt-in for redirecting organization admins/owners into onboarding after sign-in. Defaults false so existing tenants are unaffected.';
