import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireCurrentOrganizationId } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const privateHeaders = { 'Cache-Control': 'private, no-store' };
const PRESENCE_TTL_MS = 60_000;
const MAX_NOTE_LENGTH = 4000;
const MAX_MENTIONS = 10;

type JsonRecord = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function getSessionContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('AUTH_REQUIRED');
  }

  const organizationId = await requireCurrentOrganizationId(supabase, user.id);
  return { supabase, user, organizationId };
}

async function assertLeadAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  leadId: string,
) {
  const { data: allowed, error } = await supabase.rpc('can_access_lead', {
    p_lead_id: leadId,
  });

  if (error || allowed !== true) {
    throw new Error('LEAD_DENIED');
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id,organization_id,owner_user_id,current_stage')
    .eq('id', leadId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (leadError || !lead) {
    throw new Error('LEAD_DENIED');
  }

  return lead;
}

async function getCanManageAssignments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  userId: string,
) {
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();

  if (membership && ['owner', 'admin'].includes(String(membership.role ?? ''))) {
    return true;
  }

  const { data: workspace } = await supabase
    .from('workspace_memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('workspace_code', 'sales')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();

  return workspace?.role === 'manager';
}

async function getTeamMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
) {
  const { data: memberships, error } = await supabase
    .from('organization_members')
    .select('user_id,role')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .in('role', ['owner', 'admin', 'admissions']);

  if (error) return [];

  const ids = Array.from(new Set((memberships ?? []).map((row) => String(row.user_id))));
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,full_name,active')
    .in('id', ids)
    .eq('active', true);

  const profileMap = new Map(
    (profiles ?? []).map((row) => [String(row.id), textValue(row.full_name) || 'CRM User']),
  );

  return (memberships ?? [])
    .map((row) => ({
      id: String(row.user_id),
      name: profileMap.get(String(row.user_id)) ?? 'CRM User',
      role: String(row.role ?? 'member'),
    }))
    .filter((row) => profileMap.has(row.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getPresence(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  leadId: string,
) {
  const cutoff = new Date(Date.now() - PRESENCE_TTL_MS).toISOString();
  const { data: rows } = await supabase
    .from('conversation_presence')
    .select('user_id,last_seen_at')
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .gte('last_seen_at', cutoff)
    .order('last_seen_at', { ascending: false });

  const ids = Array.from(new Set((rows ?? []).map((row) => String(row.user_id))));
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,full_name')
    .in('id', ids);

  const names = new Map(
    (profiles ?? []).map((row) => [String(row.id), textValue(row.full_name) || 'CRM User']),
  );

  return (rows ?? []).map((row) => ({
    userId: String(row.user_id),
    name: names.get(String(row.user_id)) ?? 'CRM User',
    lastSeenAt: String(row.last_seen_at),
  }));
}

async function getWorkload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  canManage: boolean,
) {
  if (!canManage) return [];

  const end = new Date();
  const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase.rpc('get_team_performance_snapshot', {
    p_organization_id: organizationId,
    p_start_date: dateOnly(start),
    p_end_date: dateOnly(end),
  });

  if (error) return [];
  const payload = asRecord(data);

  return asArray(payload.employees)
    .map((value) => {
      const row = asRecord(value);
      return {
        userId: textValue(row.user_id),
        name: textValue(row.employee_name) || 'CRM User',
        role: textValue(row.role) || 'member',
        actionLoad: numberValue(row.current_action_load),
        assigned: numberValue(row.current_assigned_total),
        needsReply: numberValue(row.needs_reply_now),
        overdue: numberValue(row.overdue_leads_now),
        highIntent: numberValue(row.high_intent_now),
        paymentPending: numberValue(row.payment_pending_now),
      };
    })
    .filter((row) => row.userId)
    .sort((a, b) => a.actionLoad - b.actionLoad || a.name.localeCompare(b.name));
}

export async function GET(request: NextRequest) {
  try {
    const leadId = request.nextUrl.searchParams.get('lead')?.trim() ?? '';
    if (!leadId) return json({ ok: false, error: 'Lead is required.' }, 400);

    const { supabase, user, organizationId } = await getSessionContext();
    const lead = await assertLeadAccess(supabase, organizationId, leadId);
    const canManageAssignments = await getCanManageAssignments(
      supabase,
      organizationId,
      user.id,
    );

    const [teamMembers, presence, slaResult, mentionsResult, workload] = await Promise.all([
      getTeamMembers(supabase, organizationId),
      getPresence(supabase, organizationId, leadId),
      supabase
        .from('conversation_sla_settings')
        .select('warning_minutes,breach_minutes,updated_at')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      supabase
        .from('conversation_mentions')
        .select('id,created_at,read_at,mentioned_by_user_id')
        .eq('organization_id', organizationId)
        .eq('lead_id', leadId)
        .eq('mentioned_user_id', user.id)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(20),
      getWorkload(supabase, organizationId, canManageAssignments),
    ]);

    const sla = slaResult.data ?? {
      warning_minutes: 60,
      breach_minutes: 240,
      updated_at: null,
    };

    return json({
      ok: true,
      data: {
        currentUserId: user.id,
        organizationId,
        lead: {
          id: lead.id,
          ownerUserId: lead.owner_user_id ?? null,
          stage: lead.current_stage ?? 'new',
        },
        canManageAssignments,
        teamMembers,
        presence,
        sla: {
          warningMinutes: Number(sla.warning_minutes ?? 60),
          breachMinutes: Number(sla.breach_minutes ?? 240),
          updatedAt: sla.updated_at ?? null,
        },
        unreadMentions: mentionsResult.data?.length ?? 0,
        workload,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (message === 'AUTH_REQUIRED') return json({ ok: false, error: 'Authentication required.' }, 401);
    if (message === 'LEAD_DENIED') return json({ ok: false, error: 'Lead not found or access denied.' }, 403);
    console.error('Conversation collaboration GET failed', error);
    return json({ ok: false, error: 'Collaboration data is temporarily unavailable.' }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return json({ ok: false, error: 'Invalid request origin.' }, 403);
  }

  try {
    const body = (await request.json().catch(() => null)) as JsonRecord | null;
    const action = textValue(body?.action);
    const leadId = textValue(body?.leadId);
    if (!leadId) return json({ ok: false, error: 'Lead is required.' }, 400);

    const { supabase, user, organizationId } = await getSessionContext();
    await assertLeadAccess(supabase, organizationId, leadId);

    if (action === 'heartbeat') {
      const { error } = await supabase.from('conversation_presence').upsert(
        {
          organization_id: organizationId,
          lead_id: leadId,
          user_id: user.id,
          surface: 'conversations',
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,lead_id,user_id' },
      );
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true, presence: await getPresence(supabase, organizationId, leadId) });
    }

    if (action === 'mark_mentions_read') {
      const { error } = await supabase
        .from('conversation_mentions')
        .update({ read_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('lead_id', leadId)
        .eq('mentioned_user_id', user.id)
        .is('read_at', null);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'update_sla') {
      const canManage = await getCanManageAssignments(supabase, organizationId, user.id);
      if (!canManage) return json({ ok: false, error: 'Manager access required.' }, 403);

      const warningMinutes = Math.round(numberValue(body?.warningMinutes));
      const breachMinutes = Math.round(numberValue(body?.breachMinutes));
      if (warningMinutes < 5 || warningMinutes > 1440 || breachMinutes <= warningMinutes || breachMinutes > 10080) {
        return json({ ok: false, error: 'Choose valid SLA thresholds; breach must be after warning.' }, 400);
      }

      const { error } = await supabase.from('conversation_sla_settings').upsert(
        {
          organization_id: organizationId,
          warning_minutes: warningMinutes,
          breach_minutes: breachMinutes,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' },
      );
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'add_note') {
      const note = textValue(body?.note);
      const mentionedUserIds = Array.from(
        new Set(
          asArray(body?.mentionedUserIds)
            .map((value) => textValue(value))
            .filter(Boolean),
        ),
      ).slice(0, MAX_MENTIONS);

      if (!note) return json({ ok: false, error: 'Write an internal note before saving.' }, 400);
      if (note.length > MAX_NOTE_LENGTH) return json({ ok: false, error: `Internal notes are limited to ${MAX_NOTE_LENGTH} characters.` }, 400);

      const { data: canWork, error: canWorkError } = await supabase.rpc('can_work_lead', {
        p_lead_id: leadId,
      });
      if (canWorkError || canWork !== true) {
        return json({ ok: false, error: 'Lead not found or access denied.' }, 403);
      }

      const teamMembers = await getTeamMembers(supabase, organizationId);
      const allowedIds = new Set(teamMembers.map((member) => member.id));
      const validMentionIds = mentionedUserIds.filter(
        (id) => id !== user.id && allowedIds.has(id),
      );

      const admin = createAdminClient();
      const { data: activity, error: activityError } = await admin
        .from('activities')
        .insert({
          lead_id: leadId,
          activity_type: 'internal_note',
          actor_type: 'human',
          actor_id: user.id,
          title: validMentionIds.length > 0 ? 'Internal note with mention' : 'Internal note',
          details: note,
          metadata: {
            source: 'conversation_collaboration',
            visibility: 'internal',
            mentioned_user_ids: validMentionIds,
          },
        })
        .select('id,created_at')
        .single();

      if (activityError || !activity) {
        return json({ ok: false, error: 'Unable to save the internal note.' }, 500);
      }

      if (validMentionIds.length > 0) {
        const { error: mentionError } = await admin.from('conversation_mentions').insert(
          validMentionIds.map((mentionedUserId) => ({
            organization_id: organizationId,
            lead_id: leadId,
            activity_id: activity.id,
            mentioned_user_id: mentionedUserId,
            mentioned_by_user_id: user.id,
          })),
        );

        if (mentionError) {
          console.error('Conversation mention insert failed', mentionError);
        }
      }

      return json({ ok: true, activity });
    }

    return json({ ok: false, error: 'Unsupported collaboration action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN';
    if (message === 'AUTH_REQUIRED') return json({ ok: false, error: 'Authentication required.' }, 401);
    if (message === 'LEAD_DENIED') return json({ ok: false, error: 'Lead not found or access denied.' }, 403);
    console.error('Conversation collaboration POST failed', error);
    return json({ ok: false, error: 'Unable to update collaboration state.' }, 500);
  }
}