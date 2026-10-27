begin;

-- PH-0 performance hardening: avoid re-evaluating auth.uid() for every row
-- while preserving the existing lead-access and ownership semantics exactly.
alter policy "Users can create own inbox snooze"
on public.lead_inbox_snoozes
to authenticated
with check (((user_id = (select auth.uid())) AND can_access_lead(lead_id)));

alter policy "Users can delete own inbox snooze"
on public.lead_inbox_snoozes
to authenticated
using (((user_id = (select auth.uid())) AND can_access_lead(lead_id)));

alter policy "Users can read own inbox snooze"
on public.lead_inbox_snoozes
to authenticated
using (((user_id = (select auth.uid())) AND can_access_lead(lead_id)));

alter policy "Users can update own inbox snooze"
on public.lead_inbox_snoozes
to authenticated
using (((user_id = (select auth.uid())) AND can_access_lead(lead_id)))
with check (((user_id = (select auth.uid())) AND can_access_lead(lead_id)));

commit;
