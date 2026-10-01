import { getVercelOidcToken } from '@vercel/oidc';

import {

  IdentityPoolClient,

  type SubjectTokenSupplier,

} from 'google-auth-library';

import {

  createClient,

  type SupabaseClient,

} from '@supabase/supabase-js';



import {

  getGoogleAccessTokenForConnection,

} from '@/lib/integrations/google-connection';



const GSC_SCOPE =

  'https://www.googleapis.com/auth/webmasters.readonly';



const SEARCH_ANALYTICS_BASE =

  'https://www.googleapis.com/webmasters/v3/sites';



const SEARCH_TYPE = 'web';

const PAGE_SIZE = 25000;

const UPSERT_CHUNK_SIZE = 500;



type GscApiRow = {

  keys?: string[];

  clicks?: number;

  impressions?: number;

  ctr?: number;

  position?: number;

};



type GscApiResponse = {

  rows?: GscApiRow[];

  error?: {

    message?: string;

  };

};



type GscQueryOptions = {

  startDate: string;

  endDate: string;

  dimensions: string[];

};



export type GscSyncCounts = {

  dailyRows: number;

  queryRows: number;

  pageRows: number;

  countryRows: number;

  deviceRows: number;

  searchAppearanceRows: number;

  totalRows: number;

};



type SyncGscOptions = {

  startDate: string;

  endDate: string;

  syncRunId?: string;

};



export type GscRuntime = {

  siteUrl: string;

  authSource:
    | 'google_oauth'
    | 'legacy_wif';

  accessToken?: string;

  fallbackReason?:
    | string
    | null;

};



function requireEnv(name: string) {

  const value =

    process.env[name]?.trim();



  if (!value) {

    throw new Error(

      `${name} is not configured.`

    );

  }



  return value;

}



export function getGscSiteUrl() {

  return requireEnv(

    'GSC_SITE_URL'

  );

}



export function createGscAdminClient():

SupabaseClient {

  const url =

    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||

    process.env.SUPABASE_URL?.trim();



  const key =

    process.env.SUPABASE_SECRET_KEY?.trim() ||

    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();



  if (!url || !key) {

    throw new Error(

      'Supabase admin environment variables are not configured.'

    );

  }



  return createClient(

    url,

    key,

    {

      auth: {

        persistSession: false,

        autoRefreshToken: false,

      },

    }

  );

}



export async function resolveGscRuntime():

Promise<GscRuntime> {

  const supabase =

    createGscAdminClient();



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
          'id,connection_id,external_id,name'
        )

        .eq(
          'asset_type',
          'search_console_site'
        )

        .eq(
          'is_selected',
          true
        )

        .limit(
          2
        );



    if (
      assetError
    ) {

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

        connection_id:
          string;

        external_id:
          string;

        name:
          | string
          | null;

      }>;



    if (
      selected.length >
      1
    ) {

      throw new Error(
        'More than one Search Console site is selected. Keep only one selected Search Console site.'
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
            'id,provider,status'
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
          'The selected Search Console site is not attached to an active Google connection.'
        );

      }



      const accessToken =

        await getGoogleAccessTokenForConnection(
          connection.id
        );



      return {

        siteUrl:
          asset.external_id,

        authSource:
          'google_oauth',

        accessToken,

        fallbackReason:
          null,

      };

    }



    integrationReason =
      'No selected Search Console site was found in Account integrations.';



  } catch (
    error
  ) {

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

  const legacySiteUrl =

    process.env
      .GSC_SITE_URL
      ?.trim();



  if (
    legacySiteUrl
  ) {

    return {

      siteUrl:
        legacySiteUrl,

      authSource:
        'legacy_wif',

      fallbackReason:
        integrationReason,

    };

  }



  throw new Error(

    integrationReason ||
      'No Search Console integration or legacy GSC_SITE_URL is configured.'

  );

}



class VercelOidcSubjectTokenSupplier

implements SubjectTokenSupplier {

  async getSubjectToken():

  Promise<string> {

    return getVercelOidcToken();

  }

}



async function getLegacyGoogleAccessToken() {

  const projectNumber =

    requireEnv(

      'GCP_PROJECT_NUMBER'

    );



  const serviceAccountEmail =

    requireEnv(

      'GCP_SERVICE_ACCOUNT_EMAIL'

    );



  const poolId =

    requireEnv(

      'GCP_WORKLOAD_IDENTITY_POOL_ID'

    );



  const providerId =

    requireEnv(

      'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID'

    );



  const audience =

    `//iam.googleapis.com/projects/${projectNumber}` +

    `/locations/global/workloadIdentityPools/${poolId}` +

    `/providers/${providerId}`;



  const impersonationUrl =

    'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' +

    `${encodeURIComponent(

      serviceAccountEmail

    )}:generateAccessToken`;



  const client =

    new IdentityPoolClient({

      audience,

      subject_token_type:

        'urn:ietf:params:oauth:token-type:jwt',

      token_url:

        'https://sts.googleapis.com/v1/token',

      subject_token_supplier:

        new VercelOidcSubjectTokenSupplier(),

      service_account_impersonation_url:

        impersonationUrl,

    });



  client.scopes = [

    GSC_SCOPE,

  ];



  const tokenResponse =

    await client

      .getAccessToken();



  const token =

    tokenResponse.token;



  if (!token) {

    throw new Error(

      'Google access token was not returned.'

    );

  }



  return token;

}



async function querySearchAnalytics(

  accessToken: string,

  siteUrl: string,

  options: GscQueryOptions

) {

  const allRows:

    GscApiRow[] = [];



  let startRow = 0;



  while (true) {

    const response =

      await fetch(

        `${SEARCH_ANALYTICS_BASE}/${encodeURIComponent(

          siteUrl

        )}/searchAnalytics/query`,

        {

          method:

            'POST',



          headers: {

            Authorization:

              `Bearer ${accessToken}`,

            'Content-Type':

              'application/json',

          },



          body:

            JSON.stringify({

              startDate:

                options.startDate,

              endDate:

                options.endDate,

              dimensions:

                options.dimensions,

              type:

                SEARCH_TYPE,

              dataState:

                'final',

              rowLimit:

                PAGE_SIZE,

              startRow,

            }),



          cache:

            'no-store',

        }

      );



    const rawText =

      await response.text();



    let payload:

      GscApiResponse = {};



    if (rawText) {

      try {

        payload =

          JSON.parse(

            rawText

          );

      } catch {

        payload = {};

      }

    }



    if (!response.ok) {

      throw new Error(

        payload.error?.message ||

        rawText ||

        `Search Console API request failed with HTTP ${response.status}.`

      );

    }



    const rows =

      Array.isArray(

        payload.rows

      )

        ? payload.rows

        : [];



    allRows.push(

      ...rows

    );



    if (

      rows.length <

      PAGE_SIZE

    ) {

      break;

    }



    startRow +=

      PAGE_SIZE;



    if (

      startRow >=

      1_000_000

    ) {

      break;

    }

  }



  return allRows;

}



type SearchAppearanceDailyRow = {

  date: string;

  row: GscApiRow;

};



function addUtcDays(

  isoDateValue: string,

  days: number

) {

  const date =

    new Date(

      `${isoDateValue}T00:00:00Z`

    );



  date.setUTCDate(

    date.getUTCDate() +

    days

  );



  return date

    .toISOString()

    .slice(

      0,

      10

    );

}



async function fetchSearchAppearanceDaily(

  accessToken: string,

  siteUrl: string,

  startDate: string,

  endDate: string

):

Promise<SearchAppearanceDailyRow[]> {

  const allRows:

    SearchAppearanceDailyRow[] = [];



  let currentDate =

    startDate;



  while (

    currentDate <=

    endDate

  ) {

    /*

     * Search Console does not allow searchAppearance to be

     * grouped together with another dimension such as date.

     * Query one day at a time so the database can still retain

     * a daily search-appearance breakdown.

     */

    const rows =

      await querySearchAnalytics(

        accessToken,

        siteUrl,

        {

          startDate:

            currentDate,

          endDate:

            currentDate,

          dimensions: [

            'searchAppearance',

          ],

        }

      );



    for (

      const row of

      rows

    ) {

      allRows.push({

        date:

          currentDate,

        row,

      });

    }



    currentDate =

      addUtcDays(

        currentDate,

        1

      );

  }



  return allRows;

}



async function clearRange(

  supabase: SupabaseClient,

  table: string,

  siteUrl: string,

  startDate: string,

  endDate: string

) {

  const {

    error,

  } =

    await supabase

      .from(

        table

      )

      .delete()

      .eq(

        'site_url',

        siteUrl

      )

      .eq(

        'search_type',

        SEARCH_TYPE

      )

      .gte(

        'date',

        startDate

      )

      .lte(

        'date',

        endDate

      );



  if (error) {

    throw new Error(

      `Unable to clear ${table}: ${error.message}`

    );

  }

}



async function upsertInChunks(

  supabase: SupabaseClient,

  table: string,

  rows: Record<string, unknown>[],

  onConflict: string

) {

  if (

    rows.length ===

    0

  ) {

    return;

  }



  for (

    let index = 0;

    index < rows.length;

    index += UPSERT_CHUNK_SIZE

  ) {

    const chunk =

      rows.slice(

        index,

        index +

        UPSERT_CHUNK_SIZE

      );



    const {

      error,

    } =

      await supabase

        .from(

          table

        )

        .upsert(

          chunk,

          {

            onConflict,

          }

        );



    if (error) {

      throw new Error(

        `Unable to upsert ${table}: ${error.message}`

      );

    }

  }

}



function numberValue(

  value:

    number |

    null |

    undefined

) {

  const number =

    Number(

      value ?? 0

    );



  return Number.isFinite(

    number

  )

    ? number

    : 0;

}



function baseMetrics(

  row: GscApiRow

) {

  return {

    clicks:

      Math.round(

        numberValue(

          row.clicks

        )

      ),

    impressions:

      Math.round(

        numberValue(

          row.impressions

        )

      ),

    ctr:

      numberValue(

        row.ctr

      ),

    avg_position:

      numberValue(

        row.position

      ),

  };

}



function dimensionValue(

  row: GscApiRow,

  index: number,

  fallback: string

) {

  const value =

    row.keys?.[

      index

    ];



  return value &&

    value.trim()

      ? value

      : fallback;

}



export async function syncGscToSupabase({

  startDate,

  endDate,

  syncRunId,

}: SyncGscOptions,

runtime?: GscRuntime):

Promise<GscSyncCounts> {

  const resolvedRuntime =

    runtime ??

    await resolveGscRuntime();



  const siteUrl =

    resolvedRuntime.siteUrl;



  let accessToken:
    string;



  if (
    resolvedRuntime.authSource ===
      'google_oauth'
  ) {

    if (
      !resolvedRuntime.accessToken
    ) {

      throw new Error(
        'Google OAuth access token is unavailable.'
      );

    }



    accessToken =
      resolvedRuntime.accessToken;



  } else {

    accessToken =

      await getLegacyGoogleAccessToken();

  }



  /*

   * Fetch every report before deleting anything.

   * If Google fails, current cached data stays intact.

   */

  const [

    dailyApiRows,

    queryApiRows,

    pageApiRows,

    countryApiRows,

    deviceApiRows,

    appearanceApiRows,

  ] =

    await Promise.all([

      querySearchAnalytics(

        accessToken,

        siteUrl,

        {

          startDate,

          endDate,

          dimensions: [

            'date',

          ],

        }

      ),



      querySearchAnalytics(

        accessToken,

        siteUrl,

        {

          startDate,

          endDate,

          dimensions: [

            'date',

            'query',

          ],

        }

      ),



      querySearchAnalytics(

        accessToken,

        siteUrl,

        {

          startDate,

          endDate,

          dimensions: [

            'date',

            'page',

          ],

        }

      ),



      querySearchAnalytics(

        accessToken,

        siteUrl,

        {

          startDate,

          endDate,

          dimensions: [

            'date',

            'country',

          ],

        }

      ),



      querySearchAnalytics(

        accessToken,

        siteUrl,

        {

          startDate,

          endDate,

          dimensions: [

            'date',

            'device',

          ],

        }

      ),



      fetchSearchAppearanceDaily(

        accessToken,

        siteUrl,

        startDate,

        endDate

      ),

    ]);



  const dailyRows =

    dailyApiRows.map(

      (row) => ({

        site_url:

          siteUrl,

        date:

          dimensionValue(

            row,

            0,

            startDate

          ),

        search_type:

          SEARCH_TYPE,

        ...baseMetrics(

          row

        ),

        sync_run_id:

          syncRunId ??

          null,

      })

    );



  const queryRows =

    queryApiRows.map(

      (row) => ({

        site_url:

          siteUrl,

        date:

          dimensionValue(

            row,

            0,

            startDate

          ),

        search_type:

          SEARCH_TYPE,

        query:

          dimensionValue(

            row,

            1,

            '(not set)'

          ),

        ...baseMetrics(

          row

        ),

        sync_run_id:

          syncRunId ??

          null,

      })

    );



  const pageRows =

    pageApiRows.map(

      (row) => ({

        site_url:

          siteUrl,

        date:

          dimensionValue(

            row,

            0,

            startDate

          ),

        search_type:

          SEARCH_TYPE,

        page:

          dimensionValue(

            row,

            1,

            '(not set)'

          ),

        ...baseMetrics(

          row

        ),

        sync_run_id:

          syncRunId ??

          null,

      })

    );



  const countryRows =

    countryApiRows.map(

      (row) => ({

        site_url:

          siteUrl,

        date:

          dimensionValue(

            row,

            0,

            startDate

          ),

        search_type:

          SEARCH_TYPE,

        country:

          dimensionValue(

            row,

            1,

            '(not set)'

          ),

        ...baseMetrics(

          row

        ),

        sync_run_id:

          syncRunId ??

          null,

      })

    );



  const deviceRows =

    deviceApiRows.map(

      (row) => ({

        site_url:

          siteUrl,

        date:

          dimensionValue(

            row,

            0,

            startDate

          ),

        search_type:

          SEARCH_TYPE,

        device:

          dimensionValue(

            row,

            1,

            '(not set)'

          ),

        ...baseMetrics(

          row

        ),

        sync_run_id:

          syncRunId ??

          null,

      })

    );



  const searchAppearanceRows =

    appearanceApiRows.map(

      ({

        date,

        row,

      }) => ({

        site_url:

          siteUrl,

        date,

        search_type:

          SEARCH_TYPE,

        search_appearance:

          dimensionValue(

            row,

            0,

            '(not set)'

          ),

        ...baseMetrics(

          row

        ),

        sync_run_id:

          syncRunId ??

          null,

      })

    );



  const supabase =

    createGscAdminClient();



  const tables = [

    'gsc_daily',

    'gsc_query_daily',

    'gsc_page_daily',

    'gsc_country_daily',

    'gsc_device_daily',

    'gsc_search_appearance_daily',

  ];



  for (

    const table of

    tables

  ) {

    await clearRange(

      supabase,

      table,

      siteUrl,

      startDate,

      endDate

    );

  }



  await upsertInChunks(

    supabase,

    'gsc_daily',

    dailyRows,

    'site_url,date,search_type'

  );



  await upsertInChunks(

    supabase,

    'gsc_query_daily',

    queryRows,

    'site_url,date,search_type,query'

  );



  await upsertInChunks(

    supabase,

    'gsc_page_daily',

    pageRows,

    'site_url,date,search_type,page'

  );



  await upsertInChunks(

    supabase,

    'gsc_country_daily',

    countryRows,

    'site_url,date,search_type,country'

  );



  await upsertInChunks(

    supabase,

    'gsc_device_daily',

    deviceRows,

    'site_url,date,search_type,device'

  );



  await upsertInChunks(

    supabase,

    'gsc_search_appearance_daily',

    searchAppearanceRows,

    'site_url,date,search_type,search_appearance'

  );



  const totalRows =

    dailyRows.length +

    queryRows.length +

    pageRows.length +

    countryRows.length +

    deviceRows.length +

    searchAppearanceRows.length;



  return {

    dailyRows:

      dailyRows.length,

    queryRows:

      queryRows.length,

    pageRows:

      pageRows.length,

    countryRows:

      countryRows.length,

    deviceRows:

      deviceRows.length,

    searchAppearanceRows:

      searchAppearanceRows.length,

    totalRows,

  };

}
