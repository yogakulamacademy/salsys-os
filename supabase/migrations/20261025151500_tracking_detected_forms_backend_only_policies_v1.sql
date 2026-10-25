create policy tracking_forms_deny_select
on public.tracking_forms
for select
to anon, authenticated
using (false);

create policy tracking_forms_deny_insert
on public.tracking_forms
for insert
to anon, authenticated
with check (false);

create policy tracking_forms_deny_update
on public.tracking_forms
for update
to anon, authenticated
using (false)
with check (false);

create policy tracking_forms_deny_delete
on public.tracking_forms
for delete
to anon, authenticated
using (false);

comment on table public.tracking_forms is
  'Backend-only tenant-scoped registry of forms detected by the Universal Tracking SDK. Browser/admin access is mediated by Salsys API routes; direct anon/authenticated table access is explicitly denied.';
