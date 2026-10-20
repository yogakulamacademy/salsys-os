-- Instagram Operations V1
--
-- Adds a fail-closed, tenant-bound automation layer for Instagram messaging.
-- Instagram is not WhatsApp: ordinary DMs are user-initiated and the standard
-- API reply window is 24 hours. Comment private replies are a separate one-time
-- capability and are limited to a recent comment. These tables/functions model
-- those constraints explicitly instead of treating Instagram as a broadcast
-- channel.

create table if not exists public.instagram_channel_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  automation_enabled boolean not null default false,
  dm_automation_enabled boolean not null default false,
  comment_private_reply_enabled boolean not null default false,
  provider_send_enabled boolean not null default false,
  requires_human_approval boolean not null default true,
  pilot_mode_enabled boolean not null default true,
  pilot_max_messages integer not null default 1,
  pilot_sent_count integer not null default 0,
  max_automated_messages_per_user_24h integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_channel_policies_pilot_max check (pilot_max_messages between 1 and 20),
  constraint instagram_channel_policies_pilot_count check (pilot_sent_count >= 0),
  constraint instagram_channel_policies_frequency check (max_automated_messages_per_user_24h between 1 and 20)
);

create table if not exists public.instagram_channel_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instagram_user_id text not null,
  suppressed boolean not null default false,
  suppression_reason text,
  suppressed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, instagram_user_id),
  constraint instagram_channel_preferences_user_nonempty check (length(trim(instagram_user_id)) between 1 and 200)
);

create table if not exists public.instagram_quick_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  shortcut text not null,
  body text not null,
  category text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_quick_replies_title_nonempty check (length(trim(title)) between 1 and 120),
  constraint instagram_quick_replies_shortcut_check check (shortcut ~ '^/[a-z0-9_-]{1,40}$'),
  constraint instagram_quick_replies_body_nonempty check (length(trim(body)) between 1 and 1000),
  unique (organization_id, shortcut)
);

create table if not exists public.instagram_automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  match_mode text not null default 'contains_any',
  keywords text[] not null default '{}'::text[],
  response_text text not null,
  public_reply_text text,
  active boolean not null default false,
  priority integer not null default 100,
  requires_human_approval boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_automation_rules_name_nonempty check (length(trim(name)) between 1 and 140),
  constraint instagram_automation_rules_trigger_check check (trigger_type in ('dm_keyword','comment_keyword','story_reply','story_mention','postback','referral')),
  constraint instagram_automation_rules_match_check check (match_mode in ('contains_any','exact_any','any')),
  constraint instagram_automation_rules_response_nonempty check (length(trim(response_text)) between 1 and 1000),
  constraint instagram_automation_rules_public_reply_length check (public_reply_text is null or length(trim(public_reply_text)) between 1 and 2200),
  constraint instagram_automation_rules_priority check (priority between 1 and 10000)
);

create index if not exists instagram_automation_rules_active_idx
  on public.instagram_automation_rules (organization_id, active, trigger_type, priority, created_at);

create table if not exists public.instagram_comment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  raw_event_id uuid references public.raw_events(id) on delete set null,
  instagram_account_id text not null,
  comment_id text not null,
  media_id text,
  author_instagram_user_id text,
  author_username text,
  body text,
  occurred_at timestamptz not null,
  private_reply_sent_at timestamptz,
  private_reply_message_id text,
  private_reply_recipient_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_comment_events_account_nonempty check (length(trim(instagram_account_id)) between 1 and 200),
  constraint instagram_comment_events_comment_nonempty check (length(trim(comment_id)) between 1 and 240),
  constraint instagram_comment_events_metadata_object check (jsonb_typeof(metadata)='object'),
  unique (organization_id, instagram_account_id, comment_id)
);

create index if not exists instagram_comment_events_recent_idx
  on public.instagram_comment_events (organization_id, occurred_at desc);

create table if not exists public.instagram_pilot_allowlist (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_type text not null,
  target_value text not null,
  label text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint instagram_pilot_allowlist_type_check check (target_type in ('instagram_user_id','comment_id')),
  constraint instagram_pilot_allowlist_value_nonempty check (length(trim(target_value)) between 1 and 240),
  unique (organization_id, target_type, target_value)
);

create table if not exists public.instagram_automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid not null references public.instagram_automation_rules(id) on delete cascade,
  raw_event_id uuid references public.raw_events(id) on delete set null,
  source_event_id text not null,
  trigger_type text not null,
  lead_id uuid references public.leads(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  instagram_account_id text not null,
  instagram_user_id text,
  comment_id text,
  response_text text not null,
  status text not null default 'pending_approval',
  human_approved boolean not null default false,
  approved_by uuid,
  approved_at timestamptz,
  scheduled_at timestamptz not null default now(),
  attempted_at timestamptz,
  sent_at timestamptz,
  policy_checked_at timestamptz,
  policy_snapshot jsonb not null default '{}'::jsonb,
  block_reasons jsonb not null default '[]'::jsonb,
  provider_message_id text,
  provider_recipient_id text,
  provider_response jsonb not null default '{}'::jsonb,
  provider_error text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_automation_runs_trigger_check check (trigger_type in ('dm_keyword','comment_keyword','story_reply','story_mention','postback','referral')),
  constraint instagram_automation_runs_status_check check (status in ('pending_approval','approved','queued','running','sent','blocked','failed','cancelled')),
  constraint instagram_automation_runs_account_nonempty check (length(trim(instagram_account_id)) between 1 and 200),
  constraint instagram_automation_runs_response_nonempty check (length(trim(response_text)) between 1 and 1000),
  constraint instagram_automation_runs_policy_object check (jsonb_typeof(policy_snapshot)='object'),
  constraint instagram_automation_runs_block_array check (jsonb_typeof(block_reasons)='array'),
  constraint instagram_automation_runs_provider_object check (jsonb_typeof(provider_response)='object'),
  unique (organization_id, idempotency_key)
);

create index if not exists instagram_automation_runs_runner_idx
  on public.instagram_automation_runs (status, scheduled_at, created_at)
  where status in ('approved','queued');
create index if not exists instagram_automation_runs_user_idx
  on public.instagram_automation_runs (organization_id, instagram_user_id, sent_at desc);

alter table public.instagram_channel_policies enable row level security;
alter table public.instagram_channel_preferences enable row level security;
alter table public.instagram_quick_replies enable row level security;
alter table public.instagram_automation_rules enable row level security;
alter table public.instagram_comment_events enable row level security;
alter table public.instagram_pilot_allowlist enable row level security;
alter table public.instagram_automation_runs enable row level security;

create policy instagram_channel_policies_select_members on public.instagram_channel_policies for select using (public.is_organization_member(organization_id));
create policy instagram_channel_policies_manage_admins on public.instagram_channel_policies for all using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id));
create policy instagram_channel_preferences_select_members on public.instagram_channel_preferences for select using (public.is_organization_member(organization_id));
create policy instagram_channel_preferences_manage_admins on public.instagram_channel_preferences for all using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id));
create policy instagram_quick_replies_select_members on public.instagram_quick_replies for select using (public.is_organization_member(organization_id));
create policy instagram_quick_replies_manage_admins on public.instagram_quick_replies for all using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id));
create policy instagram_automation_rules_select_members on public.instagram_automation_rules for select using (public.is_organization_member(organization_id));
create policy instagram_automation_rules_manage_admins on public.instagram_automation_rules for all using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id));
create policy instagram_comment_events_select_members on public.instagram_comment_events for select using (public.is_organization_member(organization_id));
create policy instagram_pilot_allowlist_select_members on public.instagram_pilot_allowlist for select using (public.is_organization_member(organization_id));
create policy instagram_pilot_allowlist_manage_admins on public.instagram_pilot_allowlist for all using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id));
create policy instagram_automation_runs_select_members on public.instagram_automation_runs for select using (public.is_organization_member(organization_id));
create policy instagram_automation_runs_manage_admins on public.instagram_automation_runs for all using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id));

create trigger instagram_channel_policies_set_updated_at before update on public.instagram_channel_policies for each row execute function public.set_updated_at();
create trigger instagram_channel_preferences_set_updated_at before update on public.instagram_channel_preferences for each row execute function public.set_updated_at();
create trigger instagram_quick_replies_set_updated_at before update on public.instagram_quick_replies for each row execute function public.set_updated_at();
create trigger instagram_automation_rules_set_updated_at before update on public.instagram_automation_rules for each row execute function public.set_updated_at();
create trigger instagram_comment_events_set_updated_at before update on public.instagram_comment_events for each row execute function public.set_updated_at();
create trigger instagram_automation_runs_set_updated_at before update on public.instagram_automation_runs for each row execute function public.set_updated_at();

create or replace function public.evaluate_instagram_dm_send_policy_v1(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_now timestamptz default now(),
  p_automated boolean default true,
  p_human_approved boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_policy public.instagram_channel_policies%rowtype;
  v_conversation public.conversations%rowtype;
  v_user_id text;
  v_last_inbound timestamptz;
  v_window_expires timestamptz;
  v_sent_count integer := 0;
  v_reasons jsonb := '[]'::jsonb;
begin
  select * into v_conversation from public.conversations c
  where c.id=p_conversation_id and c.organization_id=p_organization_id and c.channel='instagram'::public.contact_channel;

  if v_conversation.id is null then
    return jsonb_build_object('ok',true,'allowed',false,'reasons',jsonb_build_array('instagram_conversation_not_found'));
  end if;

  v_user_id := nullif(btrim(coalesce(v_conversation.metadata->>'instagram_user_id','')),'');
  if v_user_id is null then v_reasons := v_reasons || jsonb_build_array('instagram_user_id_missing'); end if;

  if not exists (
    select 1 from public.integration_connections ic
    where ic.organization_id=p_organization_id and ic.provider='instagram' and ic.status='connected'
      and ic.external_account_id=v_conversation.external_account_id
      and 'instagram_business_manage_messages'=any(coalesce(ic.scopes,'{}'::text[]))
      and (ic.token_expires_at is null or ic.token_expires_at > p_now)
  ) then
    v_reasons := v_reasons || jsonb_build_array('instagram_messaging_connection_unavailable');
  end if;

  select max(coalesce(m.received_at,m.created_at)) into v_last_inbound
  from public.messages m
  where m.organization_id=p_organization_id and m.conversation_id=p_conversation_id and m.direction='inbound'::public.message_direction;

  if v_last_inbound is null then
    v_reasons := v_reasons || jsonb_build_array('instagram_user_initiation_missing');
  else
    v_window_expires := v_last_inbound + interval '24 hours';
    if p_now >= v_window_expires then v_reasons := v_reasons || jsonb_build_array('instagram_24h_window_closed'); end if;
  end if;

  if v_user_id is not null and exists (
    select 1 from public.instagram_channel_preferences p
    where p.organization_id=p_organization_id and p.instagram_user_id=v_user_id and p.suppressed=true
  ) then
    v_reasons := v_reasons || jsonb_build_array('instagram_recipient_suppressed');
  end if;

  if p_automated then
    select * into v_policy from public.instagram_channel_policies p where p.organization_id=p_organization_id;
    if v_policy.organization_id is null then
      v_reasons := v_reasons || jsonb_build_array('instagram_policy_missing');
    else
      if v_policy.automation_enabled is not true then v_reasons := v_reasons || jsonb_build_array('instagram_automation_disabled'); end if;
      if v_policy.dm_automation_enabled is not true then v_reasons := v_reasons || jsonb_build_array('instagram_dm_automation_disabled'); end if;
      if v_policy.provider_send_enabled is not true then v_reasons := v_reasons || jsonb_build_array('instagram_provider_send_disabled'); end if;
      if v_policy.requires_human_approval and p_human_approved is not true then v_reasons := v_reasons || jsonb_build_array('human_approval_required'); end if;

      if v_user_id is not null then
        select count(*)::integer into v_sent_count from public.instagram_automation_runs r
        where r.organization_id=p_organization_id and r.instagram_user_id=v_user_id and r.status='sent' and r.sent_at >= p_now - interval '24 hours';
        if v_sent_count >= v_policy.max_automated_messages_per_user_24h then
          v_reasons := v_reasons || jsonb_build_array('instagram_frequency_limited');
        end if;

        if v_policy.pilot_mode_enabled then
          if v_policy.pilot_sent_count >= v_policy.pilot_max_messages then
            v_reasons := v_reasons || jsonb_build_array('instagram_pilot_cap_reached');
          elsif not exists (
            select 1 from public.instagram_pilot_allowlist a
            where a.organization_id=p_organization_id and a.target_type='instagram_user_id' and a.target_value=v_user_id and a.active=true
          ) then
            v_reasons := v_reasons || jsonb_build_array('instagram_pilot_recipient_not_allowlisted');
          end if;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'allowed',jsonb_array_length(v_reasons)=0,
    'reasons',v_reasons,
    'instagram_user_id',v_user_id,
    'last_inbound_at',v_last_inbound,
    'window_expires_at',v_window_expires,
    'automated',p_automated
  );
end;
$$;

create or replace function public.evaluate_instagram_comment_private_reply_policy_v1(
  p_organization_id uuid,
  p_comment_id text,
  p_now timestamptz default now(),
  p_human_approved boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_policy public.instagram_channel_policies%rowtype;
  v_comment public.instagram_comment_events%rowtype;
  v_reasons jsonb := '[]'::jsonb;
begin
  select * into v_comment from public.instagram_comment_events c
  where c.organization_id=p_organization_id and c.comment_id=p_comment_id
  order by c.occurred_at desc limit 1;

  if v_comment.id is null then
    return jsonb_build_object('ok',true,'allowed',false,'reasons',jsonb_build_array('instagram_comment_not_found'));
  end if;

  select * into v_policy from public.instagram_channel_policies p where p.organization_id=p_organization_id;
  if v_policy.organization_id is null then
    v_reasons := v_reasons || jsonb_build_array('instagram_policy_missing');
  else
    if v_policy.automation_enabled is not true then v_reasons := v_reasons || jsonb_build_array('instagram_automation_disabled'); end if;
    if v_policy.comment_private_reply_enabled is not true then v_reasons := v_reasons || jsonb_build_array('instagram_comment_private_reply_disabled'); end if;
    if v_policy.provider_send_enabled is not true then v_reasons := v_reasons || jsonb_build_array('instagram_provider_send_disabled'); end if;
    if v_policy.requires_human_approval and p_human_approved is not true then v_reasons := v_reasons || jsonb_build_array('human_approval_required'); end if;
    if v_policy.pilot_mode_enabled then
      if v_policy.pilot_sent_count >= v_policy.pilot_max_messages then
        v_reasons := v_reasons || jsonb_build_array('instagram_pilot_cap_reached');
      elsif not exists (
        select 1 from public.instagram_pilot_allowlist a
        where a.organization_id=p_organization_id and a.target_type='comment_id' and a.target_value=p_comment_id and a.active=true
      ) then
        v_reasons := v_reasons || jsonb_build_array('instagram_pilot_comment_not_allowlisted');
      end if;
    end if;
  end if;

  if p_now >= v_comment.occurred_at + interval '7 days' then v_reasons := v_reasons || jsonb_build_array('instagram_comment_reply_window_closed'); end if;
  if v_comment.private_reply_sent_at is not null then v_reasons := v_reasons || jsonb_build_array('instagram_comment_private_reply_already_sent'); end if;

  if not exists (
    select 1 from public.integration_connections ic
    where ic.organization_id=p_organization_id and ic.provider='instagram' and ic.status='connected'
      and ic.external_account_id=v_comment.instagram_account_id
      and 'instagram_business_manage_comments'=any(coalesce(ic.scopes,'{}'::text[]))
      and (ic.token_expires_at is null or ic.token_expires_at > p_now)
  ) then
    v_reasons := v_reasons || jsonb_build_array('instagram_comments_permission_unavailable');
  end if;

  return jsonb_build_object(
    'ok',true,
    'allowed',jsonb_array_length(v_reasons)=0,
    'reasons',v_reasons,
    'instagram_account_id',v_comment.instagram_account_id,
    'comment_id',v_comment.comment_id,
    'window_expires_at',v_comment.occurred_at + interval '7 days'
  );
end;
$$;

create or replace function public.claim_instagram_automation_run_v1(
  p_organization_id uuid,
  p_run_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run public.instagram_automation_runs%rowtype;
  v_policy jsonb;
  v_allowed boolean := false;
begin
  select * into v_run from public.instagram_automation_runs r
  where r.id=p_run_id and r.organization_id=p_organization_id
  for update;

  if v_run.id is null then return jsonb_build_object('ok',false,'error','instagram_automation_run_not_found'); end if;
  if v_run.status not in ('approved','queued') then return jsonb_build_object('ok',true,'claimed',false,'reason','instagram_run_not_claimable','status',v_run.status); end if;
  if v_run.provider_message_id is not null or v_run.sent_at is not null then return jsonb_build_object('ok',true,'claimed',false,'reason','instagram_run_already_sent'); end if;
  if v_run.scheduled_at > p_now then return jsonb_build_object('ok',true,'claimed',false,'reason','instagram_run_not_due'); end if;

  if v_run.trigger_type='comment_keyword' then
    v_policy := public.evaluate_instagram_comment_private_reply_policy_v1(p_organization_id,v_run.comment_id,p_now,v_run.human_approved);
  else
    v_policy := public.evaluate_instagram_dm_send_policy_v1(p_organization_id,v_run.conversation_id,p_now,true,v_run.human_approved);
  end if;

  v_allowed := coalesce((v_policy->>'allowed')::boolean,false);
  update public.instagram_automation_runs
  set policy_checked_at=p_now, policy_snapshot=v_policy, block_reasons=coalesce(v_policy->'reasons','[]'::jsonb)
  where id=v_run.id;

  if not v_allowed then
    return jsonb_build_object('ok',true,'claimed',false,'reason','instagram_policy_blocked','policy',v_policy);
  end if;

  update public.instagram_automation_runs set status='running',attempted_at=p_now where id=v_run.id;
  return jsonb_build_object(
    'ok',true,'claimed',true,'run_id',v_run.id,'trigger_type',v_run.trigger_type,
    'instagram_account_id',v_run.instagram_account_id,'instagram_user_id',v_run.instagram_user_id,
    'comment_id',v_run.comment_id,'conversation_id',v_run.conversation_id,'lead_id',v_run.lead_id,
    'response_text',v_run.response_text,'policy',v_policy
  );
end;
$$;

create or replace function public.finalize_instagram_automation_run_v1(
  p_organization_id uuid,
  p_run_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_provider_recipient_id text default null,
  p_provider_response jsonb default '{}'::jsonb,
  p_provider_error text default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run public.instagram_automation_runs%rowtype;
  v_policy public.instagram_channel_policies%rowtype;
begin
  select * into v_run from public.instagram_automation_runs r
  where r.id=p_run_id and r.organization_id=p_organization_id
  for update;
  if v_run.id is null then return jsonb_build_object('ok',false,'error','instagram_automation_run_not_found'); end if;

  if p_success then
    if nullif(btrim(coalesce(p_provider_message_id,'')),'') is null then
      return jsonb_build_object('ok',false,'error','provider_message_id_required');
    end if;
    update public.instagram_automation_runs set
      status='sent',sent_at=p_now,provider_message_id=p_provider_message_id,
      provider_recipient_id=nullif(btrim(coalesce(p_provider_recipient_id,'')),''),
      provider_response=coalesce(p_provider_response,'{}'::jsonb),provider_error=null
    where id=v_run.id;

    if v_run.trigger_type='comment_keyword' and v_run.comment_id is not null then
      update public.instagram_comment_events set
        private_reply_sent_at=p_now,private_reply_message_id=p_provider_message_id,
        private_reply_recipient_id=nullif(btrim(coalesce(p_provider_recipient_id,'')),'')
      where organization_id=p_organization_id and comment_id=v_run.comment_id and instagram_account_id=v_run.instagram_account_id;
    end if;

    update public.instagram_channel_policies p set pilot_sent_count=p.pilot_sent_count+1
    where p.organization_id=p_organization_id and p.pilot_mode_enabled=true;

    select * into v_policy from public.instagram_channel_policies p where p.organization_id=p_organization_id;
    if v_policy.organization_id is not null and v_policy.pilot_mode_enabled and v_policy.pilot_sent_count >= v_policy.pilot_max_messages then
      update public.instagram_channel_policies set provider_send_enabled=false where organization_id=p_organization_id;
    end if;
  else
    update public.instagram_automation_runs set status='failed',provider_response=coalesce(p_provider_response,'{}'::jsonb),provider_error=left(coalesce(p_provider_error,'Instagram provider send failed'),1000)
    where id=v_run.id;
  end if;

  return jsonb_build_object('ok',true,'status',case when p_success then 'sent' else 'failed' end,'run_id',v_run.id);
end;
$$;

create or replace function public.reconcile_instagram_private_reply_lead_v1(
  p_organization_id uuid,
  p_instagram_account_id text,
  p_instagram_user_id text,
  p_lead_id uuid,
  p_conversation_id uuid
)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
begin
  update public.instagram_automation_runs r
  set lead_id=coalesce(r.lead_id,p_lead_id),conversation_id=coalesce(r.conversation_id,p_conversation_id),instagram_user_id=coalesce(r.instagram_user_id,p_instagram_user_id)
  where r.organization_id=p_organization_id and r.instagram_account_id=p_instagram_account_id
    and r.provider_recipient_id=p_instagram_user_id and r.trigger_type='comment_keyword' and r.status='sent';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace view public.v_instagram_reachability_v1 as
select
  c.organization_id,c.id as conversation_id,c.lead_id,c.external_account_id,
  nullif(btrim(coalesce(c.metadata->>'instagram_user_id','')),'') as instagram_user_id,
  max(coalesce(m.received_at,m.created_at)) filter (where m.direction='inbound'::public.message_direction) as last_inbound_at,
  (max(coalesce(m.received_at,m.created_at)) filter (where m.direction='inbound'::public.message_direction) + interval '24 hours') as window_expires_at,
  ((max(coalesce(m.received_at,m.created_at)) filter (where m.direction='inbound'::public.message_direction) + interval '24 hours') > now()) as reachable_now
from public.conversations c
left join public.messages m on m.organization_id=c.organization_id and m.conversation_id=c.id
where c.channel='instagram'::public.contact_channel
group by c.organization_id,c.id,c.lead_id,c.external_account_id,c.metadata;

create or replace view public.v_instagram_automation_performance_v1 as
select
  r.organization_id,r.rule_id,max(rule.name) as rule_name,max(rule.trigger_type) as trigger_type,
  count(*) as run_count,
  count(*) filter (where r.status='pending_approval') as pending_approval_count,
  count(*) filter (where r.status='sent') as sent_count,
  count(*) filter (where r.status='failed') as failed_count,
  count(*) filter (where r.status='blocked') as blocked_count,
  max(r.sent_at) as last_sent_at
from public.instagram_automation_runs r
join public.instagram_automation_rules rule on rule.id=r.rule_id and rule.organization_id=r.organization_id
group by r.organization_id,r.rule_id;

grant select on public.v_instagram_reachability_v1 to authenticated,service_role;
grant select on public.v_instagram_automation_performance_v1 to authenticated,service_role;
grant select,insert,update,delete on public.instagram_channel_policies to authenticated,service_role;
grant select,insert,update,delete on public.instagram_channel_preferences to authenticated,service_role;
grant select,insert,update,delete on public.instagram_quick_replies to authenticated,service_role;
grant select,insert,update,delete on public.instagram_automation_rules to authenticated,service_role;
grant select on public.instagram_comment_events to authenticated,service_role;
grant insert,update,delete on public.instagram_comment_events to service_role;
grant select,insert,update,delete on public.instagram_pilot_allowlist to authenticated,service_role;
grant select,insert,update,delete on public.instagram_automation_runs to authenticated,service_role;

revoke all on function public.evaluate_instagram_dm_send_policy_v1(uuid,uuid,timestamptz,boolean,boolean) from public,anon,authenticated;
revoke all on function public.evaluate_instagram_comment_private_reply_policy_v1(uuid,text,timestamptz,boolean) from public,anon,authenticated;
revoke all on function public.claim_instagram_automation_run_v1(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.finalize_instagram_automation_run_v1(uuid,uuid,boolean,text,text,jsonb,text,timestamptz) from public,anon,authenticated;
revoke all on function public.reconcile_instagram_private_reply_lead_v1(uuid,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.evaluate_instagram_dm_send_policy_v1(uuid,uuid,timestamptz,boolean,boolean) to service_role;
grant execute on function public.evaluate_instagram_comment_private_reply_policy_v1(uuid,text,timestamptz,boolean) to service_role;
grant execute on function public.claim_instagram_automation_run_v1(uuid,uuid,timestamptz) to service_role;
grant execute on function public.finalize_instagram_automation_run_v1(uuid,uuid,boolean,text,text,jsonb,text,timestamptz) to service_role;
grant execute on function public.reconcile_instagram_private_reply_lead_v1(uuid,text,text,uuid,uuid) to service_role;
