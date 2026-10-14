create or replace function public.can_mutate_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select
    auth.role() = 'service_role'
    or (
      auth.role() = 'authenticated'
      and p_organization_id is not null
      and public.session_is_bound_to_organization(p_organization_id)
      and exists (
        select 1
        from public.organization_members om
        where om.organization_id = p_organization_id
          and om.user_id = auth.uid()
          and om.active = true
      )
    );
$$;

revoke all on function public.can_mutate_organization(uuid) from public, anon;
grant execute on function public.can_mutate_organization(uuid) to authenticated, service_role;

alter policy activities_insert on public.activities
  with check (
    auth.uid() is not null
    and actor_type::text = 'human'::text
    and actor_id = auth.uid()::text
    and activity_type = any (array['payment_recorded'::text, 'refund_recorded'::text])
    and exists (
      select 1
      from public.leads l
      join public.payments p
        on p.lead_id = l.id
       and p.organization_id = l.organization_id
      where l.id = activities.lead_id
        and p.id::text = coalesce(activities.metadata ->> 'payment_id'::text, ''::text)
        and public.can_mutate_organization(l.organization_id)
        and public.has_organization_role(l.organization_id, array['owner'::text, 'admin'::text])
        and (
          (activities.activity_type = 'refund_recorded'::text and p.payment_kind::text = 'refund'::text)
          or (activities.activity_type = 'payment_recorded'::text and p.payment_kind::text <> 'refund'::text)
        )
    )
  );

alter policy course_batch_admin_events_insert on public.course_batch_admin_events
  with check (
    public.can_write_crm()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and actor_user_id = auth.uid()
    and exists (
      select 1 from public.course_batches cb
      where cb.id = course_batch_admin_events.batch_id
        and cb.organization_id = course_batch_admin_events.organization_id
    )
  );

alter policy course_batches_delete on public.course_batches
  using (
    public.can_write_crm()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and exists (
      select 1 from public.courses c
      where c.id = course_batches.course_id
        and c.organization_id = course_batches.organization_id
    )
  );

alter policy course_batches_insert on public.course_batches
  with check (
    public.can_write_crm()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and exists (
      select 1 from public.courses c
      where c.id = course_batches.course_id
        and c.organization_id = course_batches.organization_id
    )
  );

alter policy course_batches_update on public.course_batches
  using (
    public.can_write_crm()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and exists (
      select 1 from public.courses c
      where c.id = course_batches.course_id
        and c.organization_id = course_batches.organization_id
    )
  )
  with check (
    public.can_write_crm()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and exists (
      select 1 from public.courses c
      where c.id = course_batches.course_id
        and c.organization_id = course_batches.organization_id
    )
  );

alter policy courses_delete on public.courses
  using (public.can_write_crm() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));

alter policy courses_insert on public.courses
  with check (public.can_write_crm() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));

alter policy courses_update on public.courses
  using (public.can_write_crm() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id))
  with check (public.can_write_crm() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));

alter policy enrollments_delete on public.enrollments
  using (
    public.is_crm_admin()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and exists (select 1 from public.leads l where l.id=enrollments.lead_id and l.organization_id=enrollments.organization_id)
  );

alter policy enrollments_insert on public.enrollments
  with check (
    public.is_crm_admin()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and exists (select 1 from public.leads l where l.id=enrollments.lead_id and l.organization_id=enrollments.organization_id)
    and (course_id is null or exists (select 1 from public.courses c where c.id=enrollments.course_id and c.organization_id=enrollments.organization_id))
    and (batch_id is null or exists (select 1 from public.course_batches cb where cb.id=enrollments.batch_id and cb.organization_id=enrollments.organization_id))
  );

alter policy enrollments_update on public.enrollments
  using (
    public.is_crm_admin()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and exists (select 1 from public.leads l where l.id=enrollments.lead_id and l.organization_id=enrollments.organization_id)
  )
  with check (
    public.is_crm_admin()
    and public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and exists (select 1 from public.leads l where l.id=enrollments.lead_id and l.organization_id=enrollments.organization_id)
    and (course_id is null or exists (select 1 from public.courses c where c.id=enrollments.course_id and c.organization_id=enrollments.organization_id))
    and (batch_id is null or exists (select 1 from public.course_batches cb where cb.id=enrollments.batch_id and cb.organization_id=enrollments.organization_id))
  );

alter policy lead_attribution_delete on public.lead_attribution
  using (
    public.can_write_crm()
    and exists (select 1 from public.leads l where l.id=lead_attribution.lead_id and public.can_mutate_organization(l.organization_id) and public.is_organization_member(l.organization_id))
  );

alter policy lead_attribution_insert on public.lead_attribution
  with check (
    public.can_write_crm()
    and exists (select 1 from public.leads l where l.id=lead_attribution.lead_id and public.can_mutate_organization(l.organization_id) and public.is_organization_member(l.organization_id))
  );

alter policy lead_attribution_update on public.lead_attribution
  using (
    public.can_write_crm()
    and exists (select 1 from public.leads l where l.id=lead_attribution.lead_id and public.can_mutate_organization(l.organization_id) and public.is_organization_member(l.organization_id))
  )
  with check (
    public.can_write_crm()
    and exists (select 1 from public.leads l where l.id=lead_attribution.lead_id and public.can_mutate_organization(l.organization_id) and public.is_organization_member(l.organization_id))
  );

alter policy lead_contacts_delete on public.lead_contacts
  using (
    public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id)
    and exists (select 1 from public.leads l where l.id=lead_contacts.lead_id and l.organization_id=lead_contacts.organization_id)
  );

alter policy lead_contacts_insert on public.lead_contacts
  with check (
    public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id)
    and exists (select 1 from public.leads l where l.id=lead_contacts.lead_id and l.organization_id=lead_contacts.organization_id)
  );

alter policy lead_contacts_update on public.lead_contacts
  using (
    public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id)
    and exists (select 1 from public.leads l where l.id=lead_contacts.lead_id and l.organization_id=lead_contacts.organization_id)
  )
  with check (
    public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id)
    and exists (select 1 from public.leads l where l.id=lead_contacts.lead_id and l.organization_id=lead_contacts.organization_id)
  );

alter policy leads_delete on public.leads
  using (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));

alter policy leads_insert on public.leads
  with check (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));

alter policy leads_update on public.leads
  using (
    public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and (public.can_view_all_leads() or (public.is_crm_employee() and owner_user_id=auth.uid()))
  )
  with check (
    public.can_mutate_organization(organization_id)
    and public.is_organization_member(organization_id)
    and (public.can_view_all_leads() or (public.is_crm_employee() and owner_user_id=auth.uid()))
  );

alter policy payments_delete on public.payments
  using (
    public.can_mutate_organization(organization_id)
    and public.has_organization_role(organization_id,array['owner'::text,'admin'::text])
    and exists (select 1 from public.leads l where l.id=payments.lead_id and l.organization_id=payments.organization_id)
    and (enrollment_id is null or exists (select 1 from public.enrollments e where e.id=payments.enrollment_id and e.organization_id=payments.organization_id and e.lead_id=payments.lead_id))
  );

alter policy payments_insert on public.payments
  with check (
    public.can_mutate_organization(organization_id)
    and public.has_organization_role(organization_id,array['owner'::text,'admin'::text])
    and exists (select 1 from public.leads l where l.id=payments.lead_id and l.organization_id=payments.organization_id)
    and (enrollment_id is null or exists (select 1 from public.enrollments e where e.id=payments.enrollment_id and e.organization_id=payments.organization_id and e.lead_id=payments.lead_id))
  );

alter policy payments_update on public.payments
  using (
    public.can_mutate_organization(organization_id)
    and public.has_organization_role(organization_id,array['owner'::text,'admin'::text])
    and exists (select 1 from public.leads l where l.id=payments.lead_id and l.organization_id=payments.organization_id)
    and (enrollment_id is null or exists (select 1 from public.enrollments e where e.id=payments.enrollment_id and e.organization_id=payments.organization_id and e.lead_id=payments.lead_id))
  )
  with check (
    public.can_mutate_organization(organization_id)
    and public.has_organization_role(organization_id,array['owner'::text,'admin'::text])
    and exists (select 1 from public.leads l where l.id=payments.lead_id and l.organization_id=payments.organization_id)
    and (enrollment_id is null or exists (select 1 from public.enrollments e where e.id=payments.enrollment_id and e.organization_id=payments.organization_id and e.lead_id=payments.lead_id))
  );

alter policy person_identifiers_delete on public.person_identifiers
  using (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));
alter policy person_identifiers_insert on public.person_identifiers
  with check (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));
alter policy person_identifiers_update on public.person_identifiers
  using (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id))
  with check (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));

alter policy person_leads_delete on public.person_leads
  using (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));
alter policy person_leads_insert on public.person_leads
  with check (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));
alter policy person_leads_update on public.person_leads
  using (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id))
  with check (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));

alter policy person_sessions_delete on public.person_sessions
  using (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));
alter policy person_sessions_insert on public.person_sessions
  with check (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));
alter policy person_sessions_update on public.person_sessions
  using (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id))
  with check (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));

alter policy persons_delete on public.persons
  using (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));
alter policy persons_insert on public.persons
  with check (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));
alter policy persons_update on public.persons
  using (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id))
  with check (public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id));

alter policy touchpoints_delete on public.touchpoints
  using (
    public.is_crm_admin() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id)
    and (lead_id is null or exists (select 1 from public.leads l where l.id=touchpoints.lead_id and l.organization_id=touchpoints.organization_id))
  );
alter policy touchpoints_insert on public.touchpoints
  with check (
    lead_id is not null and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
    and exists (select 1 from public.leads l where l.id=touchpoints.lead_id and l.organization_id=touchpoints.organization_id)
  );
alter policy touchpoints_update on public.touchpoints
  using (
    lead_id is not null and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
    and exists (select 1 from public.leads l where l.id=touchpoints.lead_id and l.organization_id=touchpoints.organization_id)
  )
  with check (
    lead_id is not null and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id)
    and public.can_access_lead(lead_id)
    and exists (select 1 from public.leads l where l.id=touchpoints.lead_id and l.organization_id=touchpoints.organization_id)
  );

alter policy web_sessions_delete on public.web_sessions
  using (
    public.can_write_crm() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id)
    and (lead_id is null or exists (select 1 from public.leads l where l.id=web_sessions.lead_id and l.organization_id=web_sessions.organization_id))
  );
alter policy web_sessions_insert on public.web_sessions
  with check (
    public.can_write_crm() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id)
    and (lead_id is null or exists (select 1 from public.leads l where l.id=web_sessions.lead_id and l.organization_id=web_sessions.organization_id))
  );
alter policy web_sessions_update on public.web_sessions
  using (
    public.can_write_crm() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id)
    and (lead_id is null or exists (select 1 from public.leads l where l.id=web_sessions.lead_id and l.organization_id=web_sessions.organization_id))
  )
  with check (
    public.can_write_crm() and public.can_mutate_organization(organization_id) and public.is_organization_member(organization_id)
    and (lead_id is null or exists (select 1 from public.leads l where l.id=web_sessions.lead_id and l.organization_id=web_sessions.organization_id))
  );
