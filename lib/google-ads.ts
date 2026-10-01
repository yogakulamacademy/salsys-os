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

  getGoogleAccessTokenForOrganizationConnection,

} from '@/lib/integrations/google-connection';





const GOOGLE_ADS_SCOPE =

  'https://www.googleapis.com/auth/adwords';



const GOOGLE_ADS_API_VERSION =

  'v25';



const GOOGLE_ADS_BASE =

  `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;



const UPSERT_CHUNK_SIZE =

  500;





type GoogleAdsSearchResult = {

  customer?: {

    currencyCode?: string;

  };



  campaign?: {

    id?: string;

    name?: string;

    status?: string;

    advertisingChannelType?: string;

  };



  adGroup?: {

    id?: string;

    name?: string;

    status?: string;

  };



  adGroupCriterion?: {

    criterionId?: string;

    status?: string;

    keyword?: {

      text?: string;

      matchType?: string;

    };

  };



  searchTermView?: {

    searchTerm?: string;

    status?: string;

  };



  geographicView?: {

    countryCriterionId?: string;

    locationType?: string;

  };



  geoTargetConstant?: {

    id?: string;

    name?: string;

    canonicalName?: string;

    countryCode?: string;

    targetType?: string;

    status?: string;

  };



  segments?: {

    date?: string;

    device?: string;

  };



  metrics?: {

    impressions?: string | number;

    clicks?: string | number;

    interactions?: string | number;

    costMicros?: string | number;

    conversions?: string | number;

    conversionsValue?: string | number;

    allConversions?: string | number;

    allConversionsValue?: string | number;

  };

};





type SearchStreamBatch = {

  results?: GoogleAdsSearchResult[];

  requestId?: string;

};





type SearchStreamPayload =

  | SearchStreamBatch[]

  | {

      error?: {

        message?: string;

        status?: string;

        details?: unknown;

      };

    };





export type GoogleAdsSyncCounts = {

  campaignRows: number;

  adGroupRows: number;

  keywordRows: number;

  searchTermRows: number;

  geoRows: number;

  deviceRows: number;

  totalRows: number;

  requestIds: string[];

};





type SyncGoogleAdsOptions = {

  startDate: string;

  endDate: string;

  syncRunId?: string;

};


export type GoogleAdsRuntime = {

  organizationId: string;

  connectionId: string;

  assetId: string;

  customerId: string;

  assetName?:
    | string
    | null;

  authSource:
    'google_oauth';

  accessToken?: string;

};





function requireEnv(

  name: string

) {

  const value =

    process.env[name]?.trim();



  if (!value) {

    throw new Error(

      `${name} is not configured.`

    );

  }



  return value;

}





function normalizeCustomerId(

  value: string

) {

  return value

    .replaceAll(

      '-',

      ''

    )

    .trim();

}





export function getGoogleAdsCustomerId() {

  return normalizeCustomerId(

    requireEnv(

      'GOOGLE_ADS_CUSTOMER_ID'

    )

  );

}





export function getGoogleAdsLoginCustomerId() {

  const value =

    process.env

      .GOOGLE_ADS_LOGIN_CUSTOMER_ID

      ?.trim();



  if (!value) {

    return undefined;

  }



  return normalizeCustomerId(

    value

  );

}





export function createGoogleAdsAdminClient():

SupabaseClient {

  const url =

    process.env

      .NEXT_PUBLIC_SUPABASE_URL

      ?.trim() ||

    process.env

      .SUPABASE_URL

      ?.trim();



  const key =

    process.env

      .SUPABASE_SECRET_KEY

      ?.trim() ||

    process.env

      .SUPABASE_SERVICE_ROLE_KEY

      ?.trim();



  if (

    !url ||

    !key

  ) {

    throw new Error(

      'Supabase admin environment variables are not configured.'

    );

  }



  return createClient(

    url,

    key,

    {

      auth: {

        persistSession:

          false,

        autoRefreshToken:

          false,

      },

    }

  );

}





export async function resolveGoogleAdsRuntimes(
  options: {
    organizationId?: string;
    assetId?: string;
  } = {}
): Promise<GoogleAdsRuntime[]> {

  const supabase =
    createGoogleAdsAdminClient();

  let query =
    supabase
      .from(
        'integration_assets'
      )
      .select(
        'id,organization_id,connection_id,external_id,name'
      )
      .eq(
        'asset_type',
        'google_ads_customer'
      )
      .eq(
        'is_selected',
        true
      );

  if (
    options.organizationId
  ) {
    query =
      query.eq(
        'organization_id',
        options.organizationId
      );
  }

  if (
    options.assetId
  ) {
    query =
      query.eq(
        'id',
        options.assetId
      );
  }

  const {
    data:
      selectedRows,
    error:
      assetError,
  } =
    await query.order(
      'discovered_at',
      {
        ascending:
          true,
      }
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
      organization_id:
        | string
        | null;
      connection_id:
        string;
      external_id:
        string;
      name:
        | string
        | null;
    }>;

  return selected.map(
    (asset) => {

      if (
        !asset.organization_id
      ) {
        throw new Error(
          `Selected Google Ads asset ${asset.id} is not assigned to an organization.`
        );
      }

      return {
        organizationId:
          asset.organization_id,
        connectionId:
          asset.connection_id,
        assetId:
          asset.id,
        customerId:
          normalizeCustomerId(
            asset.external_id
          ),
        assetName:
          asset.name,
        authSource:
          'google_oauth' as const,
      };

    }
  );

}


export async function resolveGoogleAdsRuntime(
  options: {
    organizationId?: string;
    assetId?: string;
  } = {}
): Promise<GoogleAdsRuntime> {

  const runtimes =
    await resolveGoogleAdsRuntimes(
      options
    );

  if (
    runtimes.length ===
    0
  ) {
    throw new Error(
      'No selected Google Ads customer is configured in Account integrations.'
    );
  }

  if (
    runtimes.length >
    1
  ) {
    throw new Error(
      'More than one Google Ads customer is selected. Specify an organization or integration asset.'
    );
  }

  return runtimes[0]!;

}


class VercelOidcSubjectTokenSupplier

implements SubjectTokenSupplier {

  async getSubjectToken():

  Promise<string> {

    return getVercelOidcToken();

  }

}





async function getGoogleAdsAccessToken() {

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

    GOOGLE_ADS_SCOPE,

  ];



  const tokenResponse =

    await client

      .getAccessToken();



  const token =

    tokenResponse.token;



  if (!token) {

    throw new Error(

      'Google Ads access token was not returned.'

    );

  }



  return token;

}





async function queryGoogleAds(

  accessToken: string,

  customerId: string,

  query: string

) {

  const headers:

    Record<string, string> = {

      Authorization:

        `Bearer ${accessToken}`,

      'Content-Type':

        'application/json',

    };



  const loginCustomerId =

    getGoogleAdsLoginCustomerId();



  if (loginCustomerId) {

    headers[

      'login-customer-id'

    ] =

      loginCustomerId;

  }



  /*

   * Developer tokens were sunset in September 2026.

   * API access is now attached to the Google Cloud project,

   * so no developer-token header is sent here.

   */



  const response =

    await fetch(

      `${GOOGLE_ADS_BASE}/customers/${customerId}/googleAds:searchStream`,

      {

        method:

          'POST',



        headers,



        body:

          JSON.stringify({

            query,

          }),



        cache:

          'no-store',

      }

    );



  const rawText =

    await response.text();



  let payload:

    SearchStreamPayload;



  try {

    payload =

      rawText

        ? JSON.parse(

            rawText

          )

        : [];

  } catch {

    throw new Error(

      `Google Ads API returned non-JSON data (HTTP ${response.status}).`

    );

  }



  if (

    !response.ok

  ) {

    const errorPayload =

      !Array.isArray(

        payload

      )

        ? payload

        : {};



    throw new Error(

      errorPayload.error

        ?.message ||

      rawText ||

      `Google Ads API request failed with HTTP ${response.status}.`

    );

  }



  if (

    !Array.isArray(

      payload

    )

  ) {

    throw new Error(

      payload.error

        ?.message ||

      'Unexpected Google Ads API response.'

    );

  }



  const results:

    GoogleAdsSearchResult[] =

      [];



  const requestIds:

    string[] =

      [];



  for (

    const batch of

    payload

  ) {

    if (

      Array.isArray(

        batch.results

      )

    ) {

      results.push(

        ...batch.results

      );

    }



    if (

      batch.requestId

    ) {

      requestIds.push(

        batch.requestId

      );

    }

  }



  const responseRequestId =

    response.headers.get(

      'request-id'

    );



  if (

    responseRequestId

  ) {

    requestIds.push(

      responseRequestId

    );

  }



  return {

    results,

    requestIds:

      [

        ...new Set(

          requestIds

        ),

      ],

  };

}





function intValue(

  value:

    | string

    | number

    | null

    | undefined

) {

  if (

    value == null ||

    value === ''

  ) {

    return '0';

  }



  return String(

    value

  );

}





function numberValue(

  value:

    | string

    | number

    | null

    | undefined

) {

  const number =

    Number(

      value ??

      0

    );



  return Number.isFinite(

    number

  )

    ? number

    : 0;

}





function stringValue(

  value:

    | string

    | number

    | null

    | undefined

) {

  if (

    value == null

  ) {

    return '';

  }



  return String(

    value

  );

}





async function clearRange(

  supabase: SupabaseClient,

  table: string,

  organizationId: string,

  customerId: string,

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
        'organization_id',
        organizationId
      )

      .eq(

        'customer_id',

        customerId

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

  rows:

    Record<

      string,

      unknown

    >[],

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

    index <

    rows.length;

    index +=

    UPSERT_CHUNK_SIZE

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





function dateFilter(

  startDate: string,

  endDate: string

) {

  return (

    `segments.date BETWEEN '${startDate}' AND '${endDate}'`

  );

}





async function resolveGeoNames(

  accessToken: string,

  customerId: string,

  ids: string[]

) {

  const map =

    new Map<

      string,

      string

    >();



  const uniqueIds =

    [

      ...new Set(

        ids.filter(

          Boolean

        )

      ),

    ];



  const chunkSize =

    100;



  for (

    let index = 0;

    index <

    uniqueIds.length;

    index +=

    chunkSize

  ) {

    const chunk =

      uniqueIds.slice(

        index,

        index +

        chunkSize

      );



    if (

      chunk.length ===

      0

    ) {

      continue;

    }



    const resources =

      chunk

        .map(

          (

            id

          ) =>

            `'geoTargetConstants/${id}'`

        )

        .join(

          ', '

        );



    const query =

      `

        SELECT

          geo_target_constant.id,

          geo_target_constant.name,

          geo_target_constant.canonical_name,

          geo_target_constant.country_code,

          geo_target_constant.target_type

        FROM geo_target_constant

        WHERE

          geo_target_constant.resource_name

          IN (${resources})

      `;



    const {

      results,

    } =

      await queryGoogleAds(

        accessToken,

        customerId,

        query

      );



    for (

      const row of

      results

    ) {

      const geo =

        row.geoTargetConstant;



      const id =

        stringValue(

          geo?.id

        );



      if (

        !id

      ) {

        continue;

      }



      map.set(

        id,

        geo?.name ||

        geo?.canonicalName ||

        id

      );

    }

  }



  return map;

}





export async function syncGoogleAdsToSupabase(

  {
    startDate,
    endDate,
    syncRunId,
  }: SyncGoogleAdsOptions,

  runtime?: GoogleAdsRuntime

): Promise<GoogleAdsSyncCounts> {

  const resolvedRuntime =
    runtime ??
    await resolveGoogleAdsRuntime();

  const customerId =
    resolvedRuntime.customerId;

  const accessToken =
    resolvedRuntime.accessToken ??
    await getGoogleAccessTokenForOrganizationConnection(
      resolvedRuntime.connectionId,
      resolvedRuntime.organizationId
    );



  const filter =

    dateFilter(

      startDate,

      endDate

    );





  /*

   * Fetch everything before deleting cached rows.

   * If Google fails, the previous cache stays intact.

   */

  const [

    campaignResponse,

    adGroupResponse,

    keywordResponse,

    searchTermResponse,

    geoResponse,

    deviceResponse,

  ] =

    await Promise.all([

      queryGoogleAds(

        accessToken,

        customerId,

        `

          SELECT

            segments.date,

            customer.currency_code,

            campaign.id,

            campaign.name,

            campaign.status,

            campaign.advertising_channel_type,

            metrics.impressions,

            metrics.clicks,

            metrics.interactions,

            metrics.cost_micros,

            metrics.conversions,

            metrics.conversions_value,

            metrics.all_conversions,

            metrics.all_conversions_value

          FROM campaign

          WHERE ${filter}

        `

      ),



      queryGoogleAds(

        accessToken,

        customerId,

        `

          SELECT

            segments.date,

            customer.currency_code,

            campaign.id,

            campaign.name,

            ad_group.id,

            ad_group.name,

            ad_group.status,

            metrics.impressions,

            metrics.clicks,

            metrics.interactions,

            metrics.cost_micros,

            metrics.conversions,

            metrics.conversions_value,

            metrics.all_conversions,

            metrics.all_conversions_value

          FROM ad_group

          WHERE ${filter}

        `

      ),



      queryGoogleAds(

        accessToken,

        customerId,

        `

          SELECT

            segments.date,

            customer.currency_code,

            campaign.id,

            campaign.name,

            ad_group.id,

            ad_group.name,

            ad_group_criterion.criterion_id,

            ad_group_criterion.status,

            ad_group_criterion.keyword.text,

            ad_group_criterion.keyword.match_type,

            metrics.impressions,

            metrics.clicks,

            metrics.cost_micros,

            metrics.conversions,

            metrics.conversions_value

          FROM keyword_view

          WHERE

            ${filter}

            AND ad_group_criterion.type = 'KEYWORD'

        `

      ),



      /*

       * search_term_view covers search-term reporting at ad-group

       * level. Performance Max search terms are handled separately

       * by campaign_search_term_view and can be added in a later phase.

       */

      queryGoogleAds(

        accessToken,

        customerId,

        `

          SELECT

            segments.date,

            customer.currency_code,

            campaign.id,

            campaign.name,

            ad_group.id,

            ad_group.name,

            search_term_view.search_term,

            search_term_view.status,

            metrics.impressions,

            metrics.clicks,

            metrics.cost_micros,

            metrics.conversions,

            metrics.conversions_value

          FROM search_term_view

          WHERE ${filter}

        `

      ),



      queryGoogleAds(

        accessToken,

        customerId,

        `

          SELECT

            segments.date,

            customer.currency_code,

            geographic_view.country_criterion_id,

            geographic_view.location_type,

            metrics.impressions,

            metrics.clicks,

            metrics.cost_micros,

            metrics.conversions,

            metrics.conversions_value

          FROM geographic_view

          WHERE ${filter}

        `

      ),



      queryGoogleAds(

        accessToken,

        customerId,

        `

          SELECT

            segments.date,

            segments.device,

            customer.currency_code,

            metrics.impressions,

            metrics.clicks,

            metrics.cost_micros,

            metrics.conversions,

            metrics.conversions_value

          FROM customer

          WHERE ${filter}

        `

      ),

    ]);





  const geoIds =

    geoResponse.results

      .map(

        (

          row

        ) =>

          stringValue(

            row

              .geographicView

              ?.countryCriterionId

          )

      )

      .filter(

        Boolean

      );



  const geoNames =

    await resolveGeoNames(

      accessToken,

      customerId,

      geoIds

    );





  const campaignRows =

    campaignResponse.results

      .map(

        (

          row

        ) => ({

          organization_id:
            resolvedRuntime.organizationId,

          customer_id:

            customerId,



          date:

            row.segments

              ?.date,



          campaign_id:

            stringValue(

              row.campaign

                ?.id

            ),



          campaign_name:

            row.campaign

              ?.name ??

            null,



          campaign_status:

            row.campaign

              ?.status ??

            null,



          advertising_channel_type:

            row.campaign

              ?.advertisingChannelType ??

            null,



          currency_code:

            row.customer

              ?.currencyCode ??

            null,



          impressions:

            intValue(

              row.metrics

                ?.impressions

            ),



          clicks:

            intValue(

              row.metrics

                ?.clicks

            ),



          interactions:

            intValue(

              row.metrics

                ?.interactions

            ),



          cost_micros:

            intValue(

              row.metrics

                ?.costMicros

            ),



          conversions:

            numberValue(

              row.metrics

                ?.conversions

            ),



          conversions_value:

            numberValue(

              row.metrics

                ?.conversionsValue

            ),



          all_conversions:

            numberValue(

              row.metrics

                ?.allConversions

            ),



          all_conversions_value:

            numberValue(

              row.metrics

                ?.allConversionsValue

            ),



          sync_run_id:

            syncRunId ??

            null,

        })

      )

      .filter(

        (

          row

        ) =>

          Boolean(

            row.date &&

            row.campaign_id

          )

      );





  const adGroupRows =

    adGroupResponse.results

      .map(

        (

          row

        ) => ({

          organization_id:
            resolvedRuntime.organizationId,

          customer_id:

            customerId,



          date:

            row.segments

              ?.date,



          campaign_id:

            stringValue(

              row.campaign

                ?.id

            ),



          campaign_name:

            row.campaign

              ?.name ??

            null,



          ad_group_id:

            stringValue(

              row.adGroup

                ?.id

            ),



          ad_group_name:

            row.adGroup

              ?.name ??

            null,



          ad_group_status:

            row.adGroup

              ?.status ??

            null,



          currency_code:

            row.customer

              ?.currencyCode ??

            null,



          impressions:

            intValue(

              row.metrics

                ?.impressions

            ),



          clicks:

            intValue(

              row.metrics

                ?.clicks

            ),



          interactions:

            intValue(

              row.metrics

                ?.interactions

            ),



          cost_micros:

            intValue(

              row.metrics

                ?.costMicros

            ),



          conversions:

            numberValue(

              row.metrics

                ?.conversions

            ),



          conversions_value:

            numberValue(

              row.metrics

                ?.conversionsValue

            ),



          all_conversions:

            numberValue(

              row.metrics

                ?.allConversions

            ),



          all_conversions_value:

            numberValue(

              row.metrics

                ?.allConversionsValue

            ),



          sync_run_id:

            syncRunId ??

            null,

        })

      )

      .filter(

        (

          row

        ) =>

          Boolean(

            row.date &&

            row.campaign_id &&

            row.ad_group_id

          )

      );





  const keywordRows =

    keywordResponse.results

      .map(

        (

          row

        ) => ({

          organization_id:
            resolvedRuntime.organizationId,

          customer_id:

            customerId,



          date:

            row.segments

              ?.date,



          campaign_id:

            stringValue(

              row.campaign

                ?.id

            ),



          campaign_name:

            row.campaign

              ?.name ??

            null,



          ad_group_id:

            stringValue(

              row.adGroup

                ?.id

            ),



          ad_group_name:

            row.adGroup

              ?.name ??

            null,



          criterion_id:

            stringValue(

              row.adGroupCriterion

                ?.criterionId

            ),



          keyword_text:

            row.adGroupCriterion

              ?.keyword

              ?.text ??

            null,



          match_type:

            row.adGroupCriterion

              ?.keyword

              ?.matchType ??

            null,



          criterion_status:

            row.adGroupCriterion

              ?.status ??

            null,



          currency_code:

            row.customer

              ?.currencyCode ??

            null,



          impressions:

            intValue(

              row.metrics

                ?.impressions

            ),



          clicks:

            intValue(

              row.metrics

                ?.clicks

            ),



          cost_micros:

            intValue(

              row.metrics

                ?.costMicros

            ),



          conversions:

            numberValue(

              row.metrics

                ?.conversions

            ),



          conversions_value:

            numberValue(

              row.metrics

                ?.conversionsValue

            ),



          sync_run_id:

            syncRunId ??

            null,

        })

      )

      .filter(

        (

          row

        ) =>

          Boolean(

            row.date &&

            row.campaign_id &&

            row.ad_group_id &&

            row.criterion_id

          )

      );





  const searchTermRows =

    searchTermResponse.results

      .map(

        (

          row

        ) => ({

          organization_id:
            resolvedRuntime.organizationId,

          customer_id:

            customerId,



          date:

            row.segments

              ?.date,



          campaign_id:

            stringValue(

              row.campaign

                ?.id

            ),



          campaign_name:

            row.campaign

              ?.name ??

            null,



          ad_group_id:

            stringValue(

              row.adGroup

                ?.id

            ),



          ad_group_name:

            row.adGroup

              ?.name ??

            null,



          search_term:

            row.searchTermView

              ?.searchTerm ??

            '',



          search_term_status:

            row.searchTermView

              ?.status ??

            null,



          currency_code:

            row.customer

              ?.currencyCode ??

            null,



          impressions:

            intValue(

              row.metrics

                ?.impressions

            ),



          clicks:

            intValue(

              row.metrics

                ?.clicks

            ),



          cost_micros:

            intValue(

              row.metrics

                ?.costMicros

            ),



          conversions:

            numberValue(

              row.metrics

                ?.conversions

            ),



          conversions_value:

            numberValue(

              row.metrics

                ?.conversionsValue

            ),



          sync_run_id:

            syncRunId ??

            null,

        })

      )

      .filter(

        (

          row

        ) =>

          Boolean(

            row.date &&

            row.campaign_id &&

            row.ad_group_id &&

            row.search_term

          )

      );





  const geoRows =

    geoResponse.results

      .map(

        (

          row

        ) => {

          const criterionId =

            stringValue(

              row

                .geographicView

                ?.countryCriterionId

            );



          return {

            organization_id:
              resolvedRuntime.organizationId,

            customer_id:

              customerId,



            date:

              row.segments

                ?.date,



            country_criterion_id:

              criterionId,



            country_name:

              geoNames.get(

                criterionId

              ) ??

              null,



            location_type:

              row.geographicView

                ?.locationType ??

              'UNKNOWN',



            currency_code:

              row.customer

                ?.currencyCode ??

              null,



            impressions:

              intValue(

                row.metrics

                  ?.impressions

              ),



            clicks:

              intValue(

                row.metrics

                  ?.clicks

              ),



            cost_micros:

              intValue(

                row.metrics

                  ?.costMicros

              ),



            conversions:

              numberValue(

                row.metrics

                  ?.conversions

              ),



            conversions_value:

              numberValue(

                row.metrics

                  ?.conversionsValue

              ),



            sync_run_id:

              syncRunId ??

              null,

          };

        }

      )

      .filter(

        (

          row

        ) =>

          Boolean(

            row.date &&

            row.country_criterion_id

          )

      );





  const deviceRows =

    deviceResponse.results

      .map(

        (

          row

        ) => ({

          organization_id:
            resolvedRuntime.organizationId,

          customer_id:

            customerId,



          date:

            row.segments

              ?.date,



          device:

            row.segments

              ?.device ??

            'UNKNOWN',



          currency_code:

            row.customer

              ?.currencyCode ??

            null,



          impressions:

            intValue(

              row.metrics

                ?.impressions

            ),



          clicks:

            intValue(

              row.metrics

                ?.clicks

            ),



          cost_micros:

            intValue(

              row.metrics

                ?.costMicros

            ),



          conversions:

            numberValue(

              row.metrics

                ?.conversions

            ),



          conversions_value:

            numberValue(

              row.metrics

                ?.conversionsValue

            ),



          sync_run_id:

            syncRunId ??

            null,

        })

      )

      .filter(

        (

          row

        ) =>

          Boolean(

            row.date &&

            row.device

          )

      );





  const supabase =

    createGoogleAdsAdminClient();





  /*

   * Replace only the requested date range.

   */

  const tables = [

    'google_ads_campaign_daily',

    'google_ads_ad_group_daily',

    'google_ads_keyword_daily',

    'google_ads_search_term_daily',

    'google_ads_geo_daily',

    'google_ads_device_daily',

  ];



  for (

    const table of

    tables

  ) {

    await clearRange(

      supabase,

      table,

      resolvedRuntime.organizationId,

      customerId,

      startDate,

      endDate

    );

  }





  await upsertInChunks(

    supabase,

    'google_ads_campaign_daily',

    campaignRows,

    'organization_id,customer_id,date,campaign_id'

  );



  await upsertInChunks(

    supabase,

    'google_ads_ad_group_daily',

    adGroupRows,

    'organization_id,customer_id,date,campaign_id,ad_group_id'

  );



  await upsertInChunks(

    supabase,

    'google_ads_keyword_daily',

    keywordRows,

    'organization_id,customer_id,date,campaign_id,ad_group_id,criterion_id'

  );



  await upsertInChunks(

    supabase,

    'google_ads_search_term_daily',

    searchTermRows,

    'organization_id,customer_id,date,campaign_id,ad_group_id,search_term'

  );



  await upsertInChunks(

    supabase,

    'google_ads_geo_daily',

    geoRows,

    'organization_id,customer_id,date,country_criterion_id,location_type'

  );



  await upsertInChunks(

    supabase,

    'google_ads_device_daily',

    deviceRows,

    'organization_id,customer_id,date,device'

  );





  const requestIds =

    [

      ...new Set([

        ...campaignResponse.requestIds,

        ...adGroupResponse.requestIds,

        ...keywordResponse.requestIds,

        ...searchTermResponse.requestIds,

        ...geoResponse.requestIds,

        ...deviceResponse.requestIds,

      ]),

    ];





  const counts = {

    campaignRows:

      campaignRows.length,



    adGroupRows:

      adGroupRows.length,



    keywordRows:

      keywordRows.length,



    searchTermRows:

      searchTermRows.length,



    geoRows:

      geoRows.length,



    deviceRows:

      deviceRows.length,



    totalRows:

      campaignRows.length +

      adGroupRows.length +

      keywordRows.length +

      searchTermRows.length +

      geoRows.length +

      deviceRows.length,



    requestIds,

  };





  return counts;

}
