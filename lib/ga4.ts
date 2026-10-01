import { getVercelOidcToken } from '@vercel/oidc';



import {

  IdentityPoolClient,

  type ExternalAccountSupplierContext,

  type SubjectTokenSupplier,

} from 'google-auth-library';



import {

  createClient,

  type SupabaseClient,

} from '@supabase/supabase-js';


import {
  getGoogleAccessTokenForConnection,
} from '@/lib/integrations/google-connection';





type Ga4DimensionValue = {

  value?: string | null;

};



type Ga4MetricValue = {

  value?: string | null;

};



type Ga4Row = {

  dimensionValues?: Ga4DimensionValue[];

  metricValues?: Ga4MetricValue[];

};



type Ga4RunReportResponse = {

  rows?: Ga4Row[];

  rowCount?: number | string | null;

  error?: {
    message?: string;
    status?: string;
    code?: number;
  };

};



type SyncRange = {

  startDate: string;

  endDate: string;

};


export type Ga4Runtime = {
  propertyId: string;
  authSource:
    | 'google_oauth'
    | 'legacy_wif';
  accessToken?: string;
  fallbackReason?: string | null;
};



export type Ga4SyncCounts = {

  overviewRows: number;

  sourceRows: number;

  landingPageRows: number;

  campaignRows: number;

  countryRows: number;

  totalRows: number;

};





function requiredEnv(name: string) {

  const value = process.env[name]?.trim();



  if (!value) {

    throw new Error(

      `Missing required environment variable: ${name}`

    );

  }



  return value;

}





function legacyGa4Config() {

  return {

    propertyId: requiredEnv('GA4_PROPERTY_ID'),

    projectNumber: requiredEnv('GCP_PROJECT_NUMBER'),

    serviceAccountEmail: requiredEnv('GCP_SERVICE_ACCOUNT_EMAIL'),

    poolId: requiredEnv('GCP_WORKLOAD_IDENTITY_POOL_ID'),

    providerId: requiredEnv('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID'),

  };

}





export function createGa4AdminClient() {

  const supabaseUrl = (

    process.env.NEXT_PUBLIC_SUPABASE_URL ||

    process.env.SUPABASE_URL ||

    ''

  ).trim();



  const secretKey = (

    process.env.SUPABASE_SECRET_KEY ||

    ''

  ).trim();



  if (!supabaseUrl) {

    throw new Error(

      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.'

    );

  }



  if (!secretKey) {

    throw new Error(

      'Missing SUPABASE_SECRET_KEY.'

    );

  }



  return createClient(

    supabaseUrl,

    secretKey,

    {

      auth: {

        persistSession: false,

        autoRefreshToken: false,

      },

    }

  );

}





export async function resolveGa4Runtime():
Promise<Ga4Runtime> {
  const supabase =
    createGa4AdminClient();

  let integrationReason:
    string | null =
    null;

  try {
    const {
      data:
        selectedRows,
      error:
        assetError,
    } =
      await supabase
        .from(
          'integration_assets'
        )
        .select(
          'id, connection_id, external_id, name'
        )
        .eq(
          'asset_type',
          'ga4_property'
        )
        .eq(
          'is_selected',
          true
        )
        .limit(2);

    if (assetError) {
      throw new Error(
        assetError.message
      );
    }

    const selected =
      (
        selectedRows ??
        []
      ) as Array<{
        id: string;
        connection_id: string;
        external_id: string;
        name:
          | string
          | null;
      }>;

    if (
      selected.length >
      1
    ) {
      throw new Error(
        'More than one GA4 property is selected. Keep only one selected GA4 property.'
      );
    }

    if (
      selected.length ===
      1
    ) {
      const asset =
        selected[0];

      const {
        data:
          connectionRow,
        error:
          connectionError,
      } =
        await supabase
          .from(
            'integration_connections'
          )
          .select(
            'id, provider, status'
          )
          .eq(
            'id',
            asset.connection_id
          )
          .maybeSingle();

      if (
        connectionError
      ) {
        throw new Error(
          connectionError.message
        );
      }

      const connection =
        connectionRow as
          | {
              id: string;
              provider: string;
              status: string;
            }
          | null;

      if (
        !connection ||
        connection.provider !==
          'google' ||
        connection.status !==
          'connected'
      ) {
        throw new Error(
          'The selected GA4 property is not attached to an active Google connection.'
        );
      }

      const accessToken =
        await getGoogleAccessTokenForConnection(
          connection.id
        );

      return {
        propertyId:
          asset.external_id,
        authSource:
          'google_oauth',
        accessToken,
        fallbackReason:
          null,
      };
    }

    integrationReason =
      'No selected GA4 property was found in Account integrations.';

  } catch (error) {
    integrationReason =
      error instanceof Error
        ? error.message
        : 'Google account integration could not be resolved.';
  }

  /*
   * Safe migration fallback:
   * keep the existing Vercel OIDC / WIF path available
   * until the OAuth-backed production sync has been verified.
   */
  const legacyPropertyId =
    process.env
      .GA4_PROPERTY_ID
      ?.trim();

  if (legacyPropertyId) {
    return {
      propertyId:
        legacyPropertyId,
      authSource:
        'legacy_wif',
      fallbackReason:
        integrationReason,
    };
  }

  throw new Error(
    integrationReason ||
      'No GA4 integration or legacy GA4_PROPERTY_ID is configured.'
  );
}



class VercelSubjectTokenSupplier

implements SubjectTokenSupplier {

  async getSubjectToken(

    _context: ExternalAccountSupplierContext

  ): Promise<string> {

    const token = await getVercelOidcToken();



    if (!token) {

      throw new Error(

        'Vercel OIDC token is unavailable. Run this endpoint on a Vercel deployment with OIDC enabled.'

      );

    }



    return token;

  }

}





export function createGa4AuthClient() {

  const config = legacyGa4Config();



  const audience =

    `//iam.googleapis.com/projects/${config.projectNumber}` +

    `/locations/global/workloadIdentityPools/${config.poolId}` +

    `/providers/${config.providerId}`;



  const impersonationUrl =

    'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' +

    `${encodeURIComponent(config.serviceAccountEmail)}:generateAccessToken`;



  const client = new IdentityPoolClient({

    audience,

    subject_token_type:

      'urn:ietf:params:oauth:token-type:jwt',

    token_url:

      'https://sts.googleapis.com/v1/token',

    subject_token_supplier:

      new VercelSubjectTokenSupplier(),

    service_account_impersonation_url:

      impersonationUrl,

    scopes: [

      'https://www.googleapis.com/auth/analytics.readonly',

    ],

  });



  client.scopes = [

    'https://www.googleapis.com/auth/analytics.readonly',

  ];



  return client;

}





async function requestGa4Report(
  runtime: Ga4Runtime,
  url: string,
  data: Record<string, unknown>
): Promise<Ga4RunReportResponse> {
  if (
    runtime.authSource ===
      'google_oauth'
  ) {
    if (
      !runtime.accessToken
    ) {
      throw new Error(
        'Google OAuth access token is unavailable.'
      );
    }

    const response =
      await fetch(
        url,
        {
          method:
            'POST',

          headers: {
            Authorization:
              `Bearer ${runtime.accessToken}`,

            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify(
              data
            ),

          cache:
            'no-store',
        }
      );

    const payload =
      (
        await response.json()
      ) as Ga4RunReportResponse;

    if (
      !response.ok
    ) {
      throw new Error(
        payload.error
          ?.message ||
          `GA4 Data API request failed (${response.status}).`
      );
    }

    return payload;
  }

  const authClient =
    createGa4AuthClient();

  const response =
    await authClient
      .request<Ga4RunReportResponse>({
        url,
        method:
          'POST',
        data,
      });

  return response.data;
}



async function runReport(
  dimensions: string[],
  metrics: string[],
  range: SyncRange,
  runtime: Ga4Runtime
): Promise<Ga4Row[]> {
  const url =
    `https://analyticsdata.googleapis.com/v1beta/properties/${runtime.propertyId}:runReport`;

  const allRows: Ga4Row[] = [];
  const limit = 100000;

  let offset = 0;

  while (true) {
    const payload =
      await requestGa4Report(
        runtime,
        url,
        {
          dateRanges: [
            {
              startDate:
                range.startDate,

              endDate:
                range.endDate,
            },
          ],

          dimensions:
            dimensions.map(
              (name) => ({
                name,
              })
            ),

          metrics:
            metrics.map(
              (name) => ({
                name,
              })
            ),

          limit,
          offset,

          keepEmptyRows:
            false,
        }
      );

    const rows =
      payload.rows ?? [];

    allRows.push(
      ...rows
    );

    const rowCount =
      toNumber(
        payload.rowCount
      );

    offset +=
      rows.length;

    if (
      rows.length === 0 ||
      offset >= rowCount
    ) {
      break;
    }

    if (
      offset >=
      1000000
    ) {
      throw new Error(
        'GA4 report exceeded the 1,000,000-row safety limit.'
      );
    }
  }

  return allRows;
}





function dimension(

  row: Ga4Row,

  index: number

) {

  const value =

    row.dimensionValues?.[index]?.value;



  return (

    value &&

    value.trim()

  )

    ? value.trim()

    : '(not set)';

}





function metric(

  row: Ga4Row,

  index: number

) {

  return toNumber(

    row.metricValues?.[index]?.value

  );

}





function toNumber(

  value:

    | number

    | string

    | null

    | undefined

) {

  const number =

    Number(value ?? 0);



  return Number.isFinite(number)

    ? number

    : 0;

}





function ga4DateToIso(

  value: string

) {

  const clean =

    value.replace(

      /\D/g,

      ''

    );



  if (clean.length !== 8) {

    throw new Error(

      `Unexpected GA4 date value: ${value}`

    );

  }



  return (

    `${clean.slice(0, 4)}-` +

    `${clean.slice(4, 6)}-` +

    `${clean.slice(6, 8)}`

  );

}





async function clearRange(

  supabase: SupabaseClient,

  table: string,

  propertyId: string,

  range: SyncRange

) {

  const { error } =

    await supabase

      .from(table)

      .delete()

      .eq(

        'property_id',

        propertyId

      )

      .gte(

        'analytics_date',

        range.startDate

      )

      .lte(

        'analytics_date',

        range.endDate

      );



  if (error) {

    throw new Error(

      `Unable to clear ${table}: ${error.message}`

    );

  }

}





async function upsertChunks(

  supabase: SupabaseClient,

  table: string,

  rows: Record<string, unknown>[],

  onConflict: string

) {

  if (rows.length === 0) {

    return;

  }



  const chunkSize = 500;



  for (

    let index = 0;

    index < rows.length;

    index += chunkSize

  ) {

    const chunk =

      rows.slice(

        index,

        index + chunkSize

      );



    const { error } =

      await supabase

        .from(table)

        .upsert(

          chunk,

          {

            onConflict,

            ignoreDuplicates: false,

          }

        );



    if (error) {

      throw new Error(

        `Unable to write ${table}: ${error.message}`

      );

    }

  }

}





export async function syncGa4ToSupabase(

  range: SyncRange,

  runtime?: Ga4Runtime

): Promise<Ga4SyncCounts> {

  const resolvedRuntime =
    runtime ??
    await resolveGa4Runtime();

  const config = {
    propertyId:
      resolvedRuntime.propertyId,
  };

  const supabase = createGa4AdminClient();



  const [

    overviewReport,

    sourceReport,

    landingReport,

    campaignReport,

    countryReport,

  ] =

    await Promise.all([

      runReport(

        ['date'],

        [

          'sessions',

          'totalUsers',

          'activeUsers',

          'newUsers',

          'screenPageViews',

          'engagedSessions',

          'engagementRate',

          'averageSessionDuration',

          'keyEvents',

        ],

        range,

        resolvedRuntime

      ),



      runReport(

        [

          'date',

          'sessionSource',

          'sessionMedium',

        ],

        [

          'sessions',

          'totalUsers',

          'newUsers',

          'engagedSessions',

          'keyEvents',

        ],

        range,

        resolvedRuntime

      ),



      runReport(

        [

          'date',

          'landingPagePlusQueryString',

        ],

        [

          'sessions',

          'totalUsers',

          'newUsers',

          'engagedSessions',

          'keyEvents',

        ],

        range,

        resolvedRuntime

      ),



      runReport(

        [

          'date',

          'sessionCampaignName',

          'sessionSource',

          'sessionMedium',

        ],

        [

          'sessions',

          'totalUsers',

          'engagedSessions',

          'keyEvents',

        ],

        range,

        resolvedRuntime

      ),



      runReport(

        [

          'date',

          'country',

        ],

        [

          'sessions',

          'totalUsers',

          'newUsers',

          'engagedSessions',

          'keyEvents',

        ],

        range,

        resolvedRuntime

      ),

    ]);



  const now =

    new Date().toISOString();



  const overviewRows =

    overviewReport.map(

      (row) => ({

        property_id:

          config.propertyId,

        analytics_date:

          ga4DateToIso(

            dimension(row, 0)

          ),

        sessions:

          metric(row, 0),

        total_users:

          metric(row, 1),

        active_users:

          metric(row, 2),

        new_users:

          metric(row, 3),

        page_views:

          metric(row, 4),

        engaged_sessions:

          metric(row, 5),

        engagement_rate:

          metric(row, 6),

        average_session_duration:

          metric(row, 7),

        key_events:

          metric(row, 8),

        updated_at:

          now,

      })

    );



  const sourceRows =

    sourceReport.map(

      (row) => ({

        property_id:

          config.propertyId,

        analytics_date:

          ga4DateToIso(

            dimension(row, 0)

          ),

        source:

          dimension(row, 1),

        medium:

          dimension(row, 2),

        sessions:

          metric(row, 0),

        total_users:

          metric(row, 1),

        new_users:

          metric(row, 2),

        engaged_sessions:

          metric(row, 3),

        key_events:

          metric(row, 4),

        updated_at:

          now,

      })

    );



  const landingPageRows =

    landingReport.map(

      (row) => ({

        property_id:

          config.propertyId,

        analytics_date:

          ga4DateToIso(

            dimension(row, 0)

          ),

        landing_page:

          dimension(row, 1),

        sessions:

          metric(row, 0),

        total_users:

          metric(row, 1),

        new_users:

          metric(row, 2),

        engaged_sessions:

          metric(row, 3),

        key_events:

          metric(row, 4),

        updated_at:

          now,

      })

    );



  const campaignRows =

    campaignReport.map(

      (row) => ({

        property_id:

          config.propertyId,

        analytics_date:

          ga4DateToIso(

            dimension(row, 0)

          ),

        campaign:

          dimension(row, 1),

        source:

          dimension(row, 2),

        medium:

          dimension(row, 3),

        sessions:

          metric(row, 0),

        total_users:

          metric(row, 1),

        engaged_sessions:

          metric(row, 2),

        key_events:

          metric(row, 3),

        updated_at:

          now,

      })

    );



  const countryRows =

    countryReport.map(

      (row) => ({

        property_id:

          config.propertyId,

        analytics_date:

          ga4DateToIso(

            dimension(row, 0)

          ),

        country:

          dimension(row, 1),

        sessions:

          metric(row, 0),

        total_users:

          metric(row, 1),

        new_users:

          metric(row, 2),

        engaged_sessions:

          metric(row, 3),

        key_events:

          metric(row, 4),

        updated_at:

          now,

      })

    );



  await clearRange(

    supabase,

    'ga4_daily',

    config.propertyId,

    range

  );



  await clearRange(

    supabase,

    'ga4_source_medium_daily',

    config.propertyId,

    range

  );



  await clearRange(

    supabase,

    'ga4_landing_page_daily',

    config.propertyId,

    range

  );



  await clearRange(

    supabase,

    'ga4_campaign_daily',

    config.propertyId,

    range

  );



  await clearRange(

    supabase,

    'ga4_country_daily',

    config.propertyId,

    range

  );



  await upsertChunks(

    supabase,

    'ga4_daily',

    overviewRows,

    'property_id,analytics_date'

  );



  await upsertChunks(

    supabase,

    'ga4_source_medium_daily',

    sourceRows,

    'property_id,analytics_date,source,medium'

  );



  await upsertChunks(

    supabase,

    'ga4_landing_page_daily',

    landingPageRows,

    'property_id,analytics_date,landing_page'

  );



  await upsertChunks(

    supabase,

    'ga4_campaign_daily',

    campaignRows,

    'property_id,analytics_date,campaign,source,medium'

  );



  await upsertChunks(

    supabase,

    'ga4_country_daily',

    countryRows,

    'property_id,analytics_date,country'

  );



  return {

    overviewRows:

      overviewRows.length,

    sourceRows:

      sourceRows.length,

    landingPageRows:

      landingPageRows.length,

    campaignRows:

      campaignRows.length,

    countryRows:

      countryRows.length,

    totalRows:

      overviewRows.length +

      sourceRows.length +

      landingPageRows.length +

      campaignRows.length +

      countryRows.length,

  };

}
