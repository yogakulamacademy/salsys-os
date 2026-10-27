-- Promote the verified V2 implementations behind the existing RPC names.
-- The original implementations are retained as service-only fallback functions,
-- so the application contract and call sites do not change.

alter function public.get_seo_content_intelligence(uuid)
  rename to get_seo_content_intelligence_legacy_v1;

revoke all on function public.get_seo_content_intelligence_legacy_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_seo_content_intelligence_legacy_v1(uuid)
  to service_role;

create function public.get_seo_content_intelligence(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  begin
    return public.get_seo_content_intelligence_v2(p_organization_id);
  exception when others then
    return public.get_seo_content_intelligence_legacy_v1(p_organization_id);
  end;
end;
$function$;

revoke all on function public.get_seo_content_intelligence(uuid)
  from public, anon;
grant execute on function public.get_seo_content_intelligence(uuid)
  to authenticated, service_role;

comment on function public.get_seo_content_intelligence(uuid) is
  'Stable SEO content intelligence API. Uses V2 reusable tenant-scoped read model with retained legacy fallback.';

alter function public.get_seo_revenue_intelligence(uuid)
  rename to get_seo_revenue_intelligence_legacy_v1;

revoke all on function public.get_seo_revenue_intelligence_legacy_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.get_seo_revenue_intelligence_legacy_v1(uuid)
  to service_role;

create function public.get_seo_revenue_intelligence(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if p_organization_id is null then
    raise exception 'Organization ID is required';
  end if;

  if not public.is_organization_member(p_organization_id) then
    raise exception 'Not authorized for organization %', p_organization_id;
  end if;

  begin
    return public.get_seo_revenue_intelligence_v2(p_organization_id);
  exception when others then
    return public.get_seo_revenue_intelligence_legacy_v1(p_organization_id);
  end;
end;
$function$;

revoke all on function public.get_seo_revenue_intelligence(uuid)
  from public, anon;
grant execute on function public.get_seo_revenue_intelligence(uuid)
  to authenticated, service_role;

comment on function public.get_seo_revenue_intelligence(uuid) is
  'Stable SEO revenue intelligence API. Uses V2 reusable tenant-scoped read model with retained legacy fallback.';
