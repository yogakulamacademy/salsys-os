-- R2-P2 privacy hardening: align Popular navigation paths with Events by Page.
-- This is a narrowing-only change to the existing path normalizer.
-- No raw-event writes, RLS changes, event collection, tenant data or new grants.
-- Existing public slash routes and .php/.html/.htm routes remain supported.
create or replace function public.native_safe_page_path_v2(p_path text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when (
      coalesce(p_path, '') ~ '^/[a-zA-Z0-9/_-]{0,120}$'
      or coalesce(p_path, '') ~ '^/[a-zA-Z0-9/_-]{1,120}\.(php|html?)$'
    )
    and p_path !~ '[0-9]{6,}'
    and p_path !~* '[a-f0-9]{16,}'
    and p_path !~ '/[0-9]{4,}(/|\.|$)'
    -- An allowed URL shape is not necessarily a public route. Disallow
    -- named customer, session, account, payment, and administration surfaces.
    and p_path !~* '(^|/)(account|profile|users?|students?|private|admin|dashboard|settings|session|token|reset-password|payments?|orders?|checkout|leads?|api|auth)(/|[.]|$)'
    then p_path
    else '/other'
  end;
$$;

-- Preserve original helper's no-direct-API-execution boundary.
revoke all on function public.native_safe_page_path_v2(text)
  from public, anon, authenticated;

-- Pure synthetic input checks; no table reads, writes or test customer data.
do $$
declare
  p text;
begin
  foreach p in array array[
    '/courses/200-hour-ytt.php', '/enroll.php', '/contact.php',
    '/courses/private-session.php', '/courses/200-hour-ytt.html',
    '/programs/yoga'
  ] loop
    if public.native_safe_page_path_v2(p) is distinct from p then
      raise exception 'R2-P2 public route regression';
    end if;
  end loop;
  foreach p in array array[
    '/account/billing.php', '/profile', '/students/dashboard',
    '/private', '/ADMIN/index.html', '/session/reset',
    '/token', '/payments/receipt', '/checkout.php',
    '/orders/confirmation', '/api/events', '/auth',
    '/courses/200-hour-ytt.php?email=demo',
    '/courses/123456789', '/courses/abcedf1234567890abcd'
  ] loop
    if public.native_safe_page_path_v2(p) is distinct from '/other' then
      raise exception 'R2-P2 private route leaked';
    end if;
  end loop;
end;
$$;
