import 'server-only';

import { getInstagramRuntimeForOrganization } from '@/lib/integrations/instagram-connection';
import { createAdminClient } from '@/lib/supabase/admin';

const INSTAGRAM_GRAPH_VERSION = 'v26.0';
const GENERIC_INSTAGRAM_LEAD_NAME = 'Instagram Lead';
const PROFILE_LOOKUP_TIMEOUT_MS = 4_000;
const PROFILE_SYNC_CONCURRENCY = 8;

type InstagramProfile = {
  name: string | null;
  username: string | null;
};

type GenericLeadRow = {
  id: string;
};

type InstagramIdentityRow = {
  lead_id: string;
  value: string | null;
  normalized_value: string | null;
  metadata: Record<string, unknown> | null;
};

type InstagramConversationRow = {
  lead_id: string;
  external_account_id: string | null;
};

export type InstagramProfileSyncSummary = {
  organizations: number;
  scanned: number;
  enriched: number;
  skipped: number;
  failed: number;
};

function cleanText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function fetchInstagramMessagingProfile(
  accessToken: string,
  instagramUserId: string,
): Promise<InstagramProfile | null> {
  const url = new URL(
    `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(instagramUserId)}`,
  );
  url.searchParams.set('fields', 'name,username');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(PROFILE_LOOKUP_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as Record<string, unknown>;
    const name = cleanText(payload.name);
    const username = cleanText(payload.username);

    if (!name && !username) return null;

    return { name, username };
  } catch {
    return null;
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;

  const runners = Array.from(
    { length: Math.min(Math.max(limit, 1), items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index]);
      }
    },
  );

  await Promise.all(runners);
}

async function syncOrganizationInstagramLeadNames(
  organizationId: string,
  limit: number,
) {
  const admin = createAdminClient();

  const { data: rawLeads, error: leadsError } = await admin
    .from('leads')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('lead_creation_channel', 'instagram')
    .eq('display_name', GENERIC_INSTAGRAM_LEAD_NAME)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (leadsError) throw leadsError;

  const leads = (rawLeads ?? []) as GenericLeadRow[];
  if (!leads.length) {
    return { scanned: 0, enriched: 0, skipped: 0, failed: 0 };
  }

  const leadIds = leads.map((lead) => lead.id);
  const [contactsResult, conversationsResult] = await Promise.all([
    admin
      .from('lead_contacts')
      .select('lead_id,value,normalized_value,metadata')
      .eq('organization_id', organizationId)
      .eq('contact_type', 'instagram_user_id')
      .in('lead_id', leadIds),
    admin
      .from('conversations')
      .select('lead_id,external_account_id')
      .eq('organization_id', organizationId)
      .eq('channel', 'instagram')
      .in('lead_id', leadIds),
  ]);

  if (contactsResult.error) throw contactsResult.error;
  if (conversationsResult.error) throw conversationsResult.error;

  const identities = (contactsResult.data ?? []) as unknown as InstagramIdentityRow[];
  const conversations = (conversationsResult.data ?? []) as InstagramConversationRow[];

  const identityByLead = new Map(identities.map((row) => [row.lead_id, row]));
  const accountByLead = new Map<string, string>();

  for (const conversation of conversations) {
    const accountId = cleanText(conversation.external_account_id);
    if (accountId && !accountByLead.has(conversation.lead_id)) {
      accountByLead.set(conversation.lead_id, accountId);
    }
  }

  const runtimeCache = new Map<
    string,
    Promise<Awaited<ReturnType<typeof getInstagramRuntimeForOrganization>> | null>
  >();

  let enriched = 0;
  let skipped = 0;
  let failed = 0;

  await runWithConcurrency(leads, PROFILE_SYNC_CONCURRENCY, async (lead) => {
    const identity = identityByLead.get(lead.id);
    const instagramUserId = cleanText(identity?.normalized_value) || cleanText(identity?.value);
    const metadataAccountId = cleanText(identity?.metadata?.instagram_account_id);
    const accountId = metadataAccountId || accountByLead.get(lead.id) || null;

    if (!instagramUserId || !accountId) {
      skipped += 1;
      return;
    }

    const cacheKey = `${organizationId}:${accountId}`;
    let runtimePromise = runtimeCache.get(cacheKey);

    if (!runtimePromise) {
      runtimePromise = getInstagramRuntimeForOrganization(organizationId, accountId).catch(() => null);
      runtimeCache.set(cacheKey, runtimePromise);
    }

    const runtime = await runtimePromise;
    if (!runtime) {
      failed += 1;
      return;
    }

    const profile = await fetchInstagramMessagingProfile(runtime.accessToken, instagramUserId);
    const displayName = profile?.name || profile?.username || null;

    if (!displayName || displayName === GENERIC_INSTAGRAM_LEAD_NAME) {
      skipped += 1;
      return;
    }

    const { data: updatedRows, error: updateError } = await admin
      .from('leads')
      .update({ display_name: displayName })
      .eq('organization_id', organizationId)
      .eq('id', lead.id)
      .eq('display_name', GENERIC_INSTAGRAM_LEAD_NAME)
      .select('id');

    if (updateError) {
      failed += 1;
      return;
    }

    if ((updatedRows ?? []).length > 0) {
      enriched += 1;
    } else {
      skipped += 1;
    }
  });

  return {
    scanned: leads.length,
    enriched,
    skipped,
    failed,
  };
}

export async function syncInstagramGenericLeadNames(limitPerOrganization = 50) {
  const admin = createAdminClient();
  const safeLimit = Math.min(Math.max(Math.trunc(limitPerOrganization), 1), 100);

  const { data: rawConnections, error } = await admin
    .from('integration_connections')
    .select('organization_id')
    .eq('provider', 'instagram')
    .eq('status', 'connected');

  if (error) throw error;

  const organizationIds = Array.from(
    new Set(
      (rawConnections ?? [])
        .map((row) => cleanText(row.organization_id))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const summary: InstagramProfileSyncSummary = {
    organizations: organizationIds.length,
    scanned: 0,
    enriched: 0,
    skipped: 0,
    failed: 0,
  };

  for (const organizationId of organizationIds) {
    try {
      const result = await syncOrganizationInstagramLeadNames(organizationId, safeLimit);
      summary.scanned += result.scanned;
      summary.enriched += result.enriched;
      summary.skipped += result.skipped;
      summary.failed += result.failed;
    } catch (error) {
      summary.failed += 1;
      console.error('Instagram profile name sync failed for an organization.', error);
    }
  }

  return summary;
}
