import {
  NextRequest,
  NextResponse,
} from 'next/server';


export const dynamic =
  'force-dynamic';


function cleanAccountId(
  value: string
) {
  return value
    .replace(
      /^act_/i,
      ''
    )
    .trim();
}


async function metaGet(
  url: URL,
  accessToken: string
) {
  url.searchParams.set(
    'access_token',
    accessToken
  );

  const response =
    await fetch(
      url,
      {
        cache:
          'no-store',
      }
    );

  const text =
    await response.text();

  let json:
    any = null;

  try {
    json =
      text
        ? JSON.parse(
            text
          )
        : null;
  } catch {
    json = {
      raw:
        text,
    };
  }

  return {
    ok:
      response.ok,

    status:
      response.status,

    json,
  };
}


export async function GET(
  request: NextRequest
) {
  const rawAccountId =
    process.env
      .META_AD_ACCOUNT_ID
      ?.trim();

  const accessToken =
    process.env
      .META_ACCESS_TOKEN
      ?.trim();

  const apiVersion =
    process.env
      .META_API_VERSION
      ?.trim() ||
    'v26.0';


  if (
    !rawAccountId ||
    !accessToken
  ) {
    return NextResponse.json(
      {
        ok:
          false,

        error:
          'Meta environment variables are not configured.',

        env: {
          adAccountConfigured:
            Boolean(
              rawAccountId
            ),

          tokenConfigured:
            Boolean(
              accessToken
            ),

          apiVersion,
        },
      },
      {
        status:
          500,
      }
    );
  }


  const accountId =
    cleanAccountId(
      rawAccountId
    );

  const adAccountResource =
    `act_${accountId}`;

  const since =
    request.nextUrl
      .searchParams
      .get(
        'since'
      ) ||
    '2026-01-01';

  const until =
    request.nextUrl
      .searchParams
      .get(
        'until'
      ) ||
    '2026-09-25';


  // ----------------------------------------------------------
  // 1. Which ad accounts can this exact token see?
  // ----------------------------------------------------------

  const accessibleAccountsUrl =
    new URL(
      `https://graph.facebook.com/${apiVersion}/me/adaccounts`
    );

  accessibleAccountsUrl
    .searchParams
    .set(
      'fields',
      [
        'id',
        'account_id',
        'name',
        'account_status',
        'currency',
        'timezone_name',
      ].join(
        ','
      )
    );

  accessibleAccountsUrl
    .searchParams
    .set(
      'limit',
      '100'
    );


  // ----------------------------------------------------------
  // 2. Read the configured account
  // business field intentionally removed.
  // ----------------------------------------------------------

  const accountUrl =
    new URL(
      `https://graph.facebook.com/${apiVersion}/${adAccountResource}`
    );

  accountUrl
    .searchParams
    .set(
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
      ].join(
        ','
      )
    );


  // ----------------------------------------------------------
  // 3. Campaigns
  // ----------------------------------------------------------

  const campaignsUrl =
    new URL(
      `https://graph.facebook.com/${apiVersion}/${adAccountResource}/campaigns`
    );

  campaignsUrl
    .searchParams
    .set(
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
      ].join(
        ','
      )
    );

  campaignsUrl
    .searchParams
    .set(
      'limit',
      '100'
    );


  // ----------------------------------------------------------
  // 4. Campaign-level insights
  // ----------------------------------------------------------

  const insightsUrl =
    new URL(
      `https://graph.facebook.com/${apiVersion}/${adAccountResource}/insights`
    );

  insightsUrl
    .searchParams
    .set(
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
      ].join(
        ','
      )
    );

  insightsUrl
    .searchParams
    .set(
      'level',
      'campaign'
    );

  insightsUrl
    .searchParams
    .set(
      'time_increment',
      '1'
    );

  insightsUrl
    .searchParams
    .set(
      'time_range',
      JSON.stringify({
        since,
        until,
      })
    );

  insightsUrl
    .searchParams
    .set(
      'limit',
      '100'
    );


  const [
    accessibleAccountsResult,
    accountResult,
    campaignsResult,
    insightsResult,
  ] =
    await Promise.all([
      metaGet(
        accessibleAccountsUrl,
        accessToken
      ),

      metaGet(
        accountUrl,
        accessToken
      ),

      metaGet(
        campaignsUrl,
        accessToken
      ),

      metaGet(
        insightsUrl,
        accessToken
      ),
    ]);


  const accessibleAccounts =
    Array.isArray(
      accessibleAccountsResult
        .json
        ?.data
    )
      ? accessibleAccountsResult
          .json
          .data
      : [];


  const configuredAccountVisible =
    accessibleAccounts
      .some(
        (
          account:
            any
        ) =>
          String(
            account.account_id ??
            ''
          ) ===
            accountId ||
          String(
            account.id ??
            ''
          ) ===
            adAccountResource
      );


  const campaigns =
    Array.isArray(
      campaignsResult
        .json
        ?.data
    )
      ? campaignsResult
          .json
          .data
      : [];


  const insights =
    Array.isArray(
      insightsResult
        .json
        ?.data
    )
      ? insightsResult
          .json
          .data
      : [];


  return NextResponse.json({
    ok:
      accountResult.ok &&
      campaignsResult.ok &&
      insightsResult.ok,

    diagnosis: {
      configuredAccount:
        adAccountResource,

      configuredAccountVisibleToToken:
        configuredAccountVisible,

      accessibleAdAccounts:
        accessibleAccounts.length,

      campaignsVisible:
        campaigns.length,

      insightRowsVisible:
        insights.length,
    },

    env: {
      adAccountId:
        adAccountResource,

      apiVersion,

      tokenConfigured:
        true,
    },

    requestedRange: {
      since,
      until,
    },

    accessibleAccounts: {
      httpStatus:
        accessibleAccountsResult
          .status,

      count:
        accessibleAccounts.length,

      accounts:
        accessibleAccounts,

      error:
        accessibleAccountsResult
          .json
          ?.error ??
        null,
    },

    account: {
      httpStatus:
        accountResult.status,

      data:
        accountResult.ok
          ? accountResult.json
          : null,

      error:
        accountResult
          .json
          ?.error ??
        null,
    },

    campaigns: {
      httpStatus:
        campaignsResult.status,

      count:
        campaigns.length,

      sample:
        campaigns.slice(
          0,
          10
        ),

      pagingAvailable:
        Boolean(
          campaignsResult
            .json
            ?.paging
            ?.next
        ),

      error:
        campaignsResult
          .json
          ?.error ??
        null,
    },

    insights: {
      httpStatus:
        insightsResult.status,

      count:
        insights.length,

      sample:
        insights.slice(
          0,
          10
        ),

      pagingAvailable:
        Boolean(
          insightsResult
            .json
            ?.paging
            ?.next
        ),

      error:
        insightsResult
          .json
          ?.error ??
        null,
    },
  });
}