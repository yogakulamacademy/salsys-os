begin;

-- PA-1 post-deploy advisor closeout.
-- These indexes cover the three foreign-key columns Supabase flagged after
-- person_merge_audit_v1 was deployed. They do not change merge semantics.

create index if not exists idx_person_merge_audit_v1_initiating_conflict_id
  on public.person_merge_audit_v1 (initiating_conflict_id);

create index if not exists idx_person_merge_audit_v1_source_person_id
  on public.person_merge_audit_v1 (source_person_id);

create index if not exists idx_person_merge_audit_v1_target_person_id
  on public.person_merge_audit_v1 (target_person_id);

commit;
