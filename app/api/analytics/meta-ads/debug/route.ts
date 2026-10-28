import { NextRequest, NextResponse } from 'next/server';

import {
  bearerMatchesAnySecret,
  secretMatches,
} from '@/lib/security/machine-bearer-auth';

export const dynamic = 'force-dynamic';

function cleanAccountId(value: string) {
  return value.replace(/^act_/i, '').trim();
}

function isAuthorized(request: NextRequest) {
  const manualSecret = process.env.META_ADS_SYNC_SECRET?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();
  const headerSecret = request.headers.get('x-meta-ads-sync-secret')?.trim();
  const authorization = request.headers.get('authorization')?.trim();
  const bearerSecrets = [manualSecret, cronSecret].filter(
    (value): value is string => Boolean(value),
  );

  return (
    secretMatches(headerSecret, manualSecret) ||
    bearerMatchesAnySecret(authorization, bearerSecrets)
  );
}

type MetaGraphPayload = {
  data?: unknown[];
  paging?: { next?: string };
  error?: unknown;
  [key: string]: unknown;
};

async function metaGet(url: URL, accessToken: string) {
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();

  let json: MetaGraphPayload | null = null;

  try {
    json = text ? (JSON.parse(text) as MetaGraphPayload) : null;
  } catch {
    json = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    json,
  };
}

export async function GET(request: NextRequest) {
  /*
   * This endpoint can expose account/campaign diagnostics obtained with a
   * privileged Meta token. It is therefore service/operator-only and must
   * never be public merely because it is a read-only debug route.
   */
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const rawAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();
  const apiVersion = process.env.META_API_VERSION?.trim() || 'v26.0';

  if (!rawAccountId || !accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Meta environment variables are not configured.',
        env: {
          adAccountConfigured: Boolean(rawAccountId),
          tokenConfigured: Boolean(accessToken),
          apiVersion,
        },
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  const accountId = cleanAccountId(rawAccountId);
  const adAccountResource = `act_${accountId}`;
  const since = request.nextUrl.searchParams.get('since') || '2026-01-01';
  const until = request.nextUrl.searchParams.get('until') || '2026-09-25';

  const accessibleAccountsUrl = new URL(
    `https://graph.facebook.com/${apiVersion}/me/adaccounts`,
  );
  accessibleAccountsUrl.searchParams.set(
    'fields',
    [
      'id',
      'account_id',
      'name',
      'account_status',
      'currency',
      'timezone_name',
    ].join(','),
  );
  accessibleAccountsUrl.searchParams.set('limit', '100');

  const accountUrl = new URL(
    `https://graph.facebook.com/${apiVersion}/${adAccountResource}`,
  );
  accountUrl.searchParams.set(
    'fields',
    [
      'id',
      'account_id',
      'name',
      'account_status',
      'currency',
      'timezone_name',
      'timezone_offset_hours_utc',
      'amount_spent',
    ].join(','),
  );

  const campaignsUrl = new URL(
    `https://graph.facebook.com/${apiVersion}/${adAccountResource}/campaigns`,
  );
  campaignsUrl.searchParams.set(
    'fields',
    [
      'id',
      'name',
      'status',
      'effective_status',
      'objective',
      'created_time',
      'updated_time',
      'start_time',
      'stop_time',
    ].join(','),
  );
  campaignsUrl.searchParams.set('limit', '100');

  const insightsUrl = new URL(
    `https://graph.facebook.com/${apiVersion}/${adAccountResource}/insights`,
  );
  insightsUrl.searchParams.set(
    'fields',
    [
      'campaign_id',
      'campaign_name',
      'date_start',
      'date_stop',
      'spend',
      'impressions',
      'reach',
      'clicks',
      'inline_link_clicks',
    ].join(','),
  );
  insightsUrl.searchParams.set('level', 'campaign');
  insightsUrl.searchParams.set('time_increment', '1');
  insightsUrl.searchParams.set('time_range', JSON.stringify({ since, until }));
  insightsUrl.searchParams.set('limit', '100');

  const [
    accessibleAccountsResult,
    accountResult,
    campaignsResult,
    insightsResult,
  ] = await Promise.all([
    metaGet(accessibleAccountsUrl, accessToken),
    metaGet(accountUrl, accessToken),
    metaGet(campaignsUrl, accessToken),
    metaGet(insightsUrl, accessToken),
  ]);

  const accessibleAccounts = Array.isArray(accessibleAccountsResult.json?.data)
    ? accessibleAccountsResult.json.data
    : [];
  const campaigns = Array.isArray(campaignsResult.json?.data)
    ? campaignsResult.json.data
    : [];
  const insights = Array.isArray(insightsResult.json?.data)
    ? insightsResult.json.data
    : [];

  const configuredAccountVisible = accessibleAccounts.some((value) => {
    const account =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};

    return (
      String(account.account_id ?? '') === accountId ||
      String(account.id ?? '') === adAccountResource
    );
  });

  return NextResponse.json(
    {
      ok: accountResult.ok && campaignsResult.ok && insightsResult.ok,
      diagnosis: {
        configuredAccount: adAccountResource,
        configuredAccountVisibleToToken: configuredAccountVisible,
        accessibleAdAccounts: accessibleAccounts.length,
        campaignsVisible: campaigns.length,
        insightRowsVisible: insights.length,
      },
      env: {
        adAccountId: adAccountResource,
        apiVersion,
        tokenConfigured: true,
      },
      requestedRange: { since, until },
      accessibleAccounts: {
        httpStatus: accessibleAccountsResult.status,
        count: accessibleAccounts.length,
        accounts: accessibleAccounts,
        error: accessibleAccountsResult.json?.error ?? null,
      },
      account: {
        httpStatus: accountResult.status,
        data: accountResult.ok ? accountResult.json : null,
        error: accountResult.json?.error ?? null,
      },
      campaigns: {
        httpStatus: campaignsResult.status,
        count: campaigns.length,
        sample: campaigns.slice(0, 10),
        pagingAvailable: Boolean(campaignsResult.json?.paging?.next),
        error: campaignsResult.json?.error ?? null,
      },
      insights: {
        httpStatus: insightsResult.status,
        count: insights.length,
        sample: insights.slice(0, 10),
        pagingAvailable: Boolean(insightsResult.json?.paging?.next),
        error: insightsResult.json?.error ?? null,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
