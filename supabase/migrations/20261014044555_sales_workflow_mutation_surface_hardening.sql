begin;

-- =============================================================================
-- 062_sales_workflow_mutation_surface_hardening.sql
--
-- W5C-2: close broad direct authenticated writes to Sales workflow tables.
-- Canonical workflow mutations already run through SECURITY DEFINER RPCs:
--   - set_lead_stage
--   - create_followup_task / complete_followup_task / snooze_followup_task
--   - log_lead_interaction
--   - assign_lead_owner
--   - attach_whatsapp_outbound_message_id
--
-- Keep authenticated reads under RLS. Keep the one legacy direct activity insert
-- required by manual payment recording, but narrow it to a real payment owned by
-- an organization owner/admin. The existing BEFORE INSERT trigger fills actor_id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ACTIVITIES
-- -----------------------------------------------------------------------------

-- Activity timeline reads must follow the canonical lead-access boundary.
drop policy if exists activities_read on public.activities;
create policy activities_read
on public.activities
for select
to authenticated
using (
  public.can_access_lead(lead_id)
);

-- No direct authenticated mutation of existing audit events.
revoke update, delete on table public.activities
  from anon, authenticated;

drop policy if exists activities_update on public.activities;
drop policy if exists activities_delete on public.activities;

-- Keep only the legacy manual-payment activity insert used by the current app.
-- All other activity rows are emitted inside authorized SECURITY DEFINER RPCs.
drop policy if exists activities_insert on public.activities;
create policy activities_insert
on public.activities
for insert
to authenticated
with check (
  auth.uid() is not null
  and actor_type::text = 'human'
  and actor_id = auth.uid()::text
  and activity_type in ('payment_recorded', 'refund_recorded')
  and exists (
    select 1
    from public.leads l
    join public.payments p
      on p.lead_id = l.id
     and p.organization_id = l.organization_id
    where l.id = activities.lead_id
      and p.id::text = coalesce(activities.metadata ->> 'payment_id', '')
      and public.has_organization_role(
        l.organization_id,
        array['owner', 'admin']::text[]
      )
      and (
        (
          activities.activity_type = 'refund_recorded'
          and p.payment_kind::text = 'refund'
        )
        or
        (
          activities.activity_type = 'payment_recorded'
          and p.payment_kind::text <> 'refund'
        )
      )
  )
);

-- -----------------------------------------------------------------------------
-- LEAD STAGE HISTORY
-- -----------------------------------------------------------------------------

-- Stage history is an audit trail and must be written only through set_lead_stage.
revoke insert, update, delete on table public.lead_stage_history
  from anon, authenticated;

drop policy if exists lead_stage_history_insert on public.lead_stage_history;
drop policy if exists lead_stage_history_update on public.lead_stage_history;
drop policy if exists lead_stage_history_delete on public.lead_stage_history;

-- -----------------------------------------------------------------------------
-- FOLLOW-UP TASKS
-- -----------------------------------------------------------------------------

-- Task state changes must go through the follow-up/assignment RPCs so lead
-- authorization, next_followup_at recalculation, assignment sync, and auditing
-- cannot be bypassed with direct PostgREST table writes.
revoke insert, update, delete on table public.tasks
  from anon, authenticated;

drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;

-- -----------------------------------------------------------------------------
-- CONVERSATIONS
-- -----------------------------------------------------------------------------

-- Conversation lifecycle is managed by log_lead_interaction and authorized
-- assignment functions. Direct authenticated writes would bypass those invariants.
revoke insert, update, delete on table public.conversations
  from anon, authenticated;

drop policy if exists conversations_insert on public.conversations;
drop policy if exists conversations_update on public.conversations;
drop policy if exists conversations_delete on public.conversations;

-- -----------------------------------------------------------------------------
-- MESSAGES
-- -----------------------------------------------------------------------------

-- Message creation/status linkage must use the authorized messaging RPC path.
-- Service-role webhook ingestion remains unaffected by authenticated revocations.
revoke insert, update, delete on table public.messages
  from anon, authenticated;

drop policy if exists messages_insert on public.messages;
drop policy if exists messages_update on public.messages;
drop policy if exists messages_delete on public.messages;

commit;
