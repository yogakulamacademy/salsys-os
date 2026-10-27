alter table public.person_identifiers
  add constraint person_identifiers_organization_id_fkey
  foreign key (organization_id) references public.organizations(id)
  on delete restrict not valid;

alter table public.person_leads
  add constraint person_leads_organization_id_fkey
  foreign key (organization_id) references public.organizations(id)
  on delete restrict not valid;

alter table public.person_sessions
  add constraint person_sessions_organization_id_fkey
  foreign key (organization_id) references public.organizations(id)
  on delete restrict not valid;

alter table public.raw_event_processing
  add constraint raw_event_processing_organization_id_fkey
  foreign key (organization_id) references public.organizations(id)
  on delete restrict not valid;

alter table public.raw_event_replay_audit
  add constraint raw_event_replay_audit_organization_id_fkey
  foreign key (organization_id) references public.organizations(id)
  on delete restrict not valid;

alter table public.workspace_memberships
  add constraint workspace_memberships_organization_id_fkey
  foreign key (organization_id) references public.organizations(id)
  on delete cascade not valid;

alter table public.person_identifiers validate constraint person_identifiers_organization_id_fkey;
alter table public.person_leads validate constraint person_leads_organization_id_fkey;
alter table public.person_sessions validate constraint person_sessions_organization_id_fkey;
alter table public.raw_event_processing validate constraint raw_event_processing_organization_id_fkey;
alter table public.raw_event_replay_audit validate constraint raw_event_replay_audit_organization_id_fkey;
alter table public.workspace_memberships validate constraint workspace_memberships_organization_id_fkey;