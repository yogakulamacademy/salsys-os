create unique index if not exists integration_connections_one_connected_provider_per_org
on public.integration_connections (organization_id, provider)
where status = 'connected';
