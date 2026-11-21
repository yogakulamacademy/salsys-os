-- Speed (owner-approved 21 Nov 2026): read rules on lead-related tables called
-- can_access_lead(lead_id) for every row (~5 lookups each). They now check
-- "the lead is one this user can read", using the leads read rule (which is
-- evaluated once per query and gives the same result as can_access_lead for
-- every lead and user). Only SELECT policies change; write rules keep
-- can_access_lead. Everything else in each rule is kept as it was.
do $$
declare
  p record;
  new_qual text;
  v_roles text;
begin
  for p in
    select schemaname, tablename, policyname, permissive, roles as role_list, qual
    from pg_policies
    where schemaname = 'public' and cmd = 'SELECT' and qual like '%can_access_lead(%'
  loop
    new_qual := regexp_replace(
      p.qual,
      'can_access_lead\(([a-z_]+(\.[a-z_]+)?)\)',
      '(\1 IN (SELECT visible_lead.id FROM public.leads visible_lead))',
      'g'
    );
    if new_qual = p.qual or new_qual like '%can_access_lead(%' then
      raise exception 'Could not rewrite % on %', p.policyname, p.tablename;
    end if;
    select string_agg(quote_ident(r), ', ') into v_roles from unnest(p.role_list) r;
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    execute format('create policy %I on %I.%I as %s for select to %s using (%s)',
      p.policyname, p.schemaname, p.tablename, p.permissive, v_roles, new_qual);
  end loop;
end $$;
